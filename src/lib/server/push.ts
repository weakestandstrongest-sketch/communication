import "server-only";
import webpush from "web-push";
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Admin = SupabaseClient<Database>;

export type PushPayload = { title: string; body: string; url: string; tag: string };

let configured: boolean | null = null;

export function pushConfigured() {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  configured = Boolean(pub && priv);
  if (configured) webpush.setVapidDetails(subject, pub!, priv!);
  return configured;
}

export function verifySecret(header: string | null): boolean {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sends payloads to every subscription of the given users; prunes expired subscriptions. */
export async function deliver(admin: Admin, messages: Array<{ userId: string; payload: PushPayload }>) {
  const userIds = Array.from(new Set(messages.map((m) => m.userId)));
  if (!userIds.length) return { sent: 0, failed: 0, removed: 0 };
  const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
  const byUser = new Map<string, NonNullable<typeof subs>>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  let sent = 0;
  let failed = 0;
  const expired: string[] = [];
  const succeeded: string[] = [];
  const failedIds: string[] = [];
  const jobs = messages.flatMap(({ userId, payload }) =>
    (byUser.get(userId) ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: "high", topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
        );
        sent++;
        succeeded.push(s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        failed++;
        if (status === 404 || status === 410) expired.push(s.id);
        else failedIds.push(s.id);
      }
    }),
  );
  // Small groups: a bounded number of requests, run concurrently in chunks.
  for (let i = 0; i < jobs.length; i += 20) await Promise.all(jobs.slice(i, i + 20));

  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  if (succeeded.length) await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).in("id", succeeded);
  if (failedIds.length) {
    const { data: rows } = await admin.from("push_subscriptions").select("id, failure_count").in("id", failedIds);
    for (const r of rows ?? []) {
      // Give up on endpoints that keep failing.
      if (r.failure_count >= 9) await admin.from("push_subscriptions").delete().eq("id", r.id);
      else await admin.from("push_subscriptions").update({ failure_count: r.failure_count + 1 }).eq("id", r.id);
    }
  }
  return { sent, failed, removed: expired.length };
}

const PREF_FOR_KIND: Record<string, "polls" | "events" | "announcements" | "mentions" | "reminders" | null> = {
  poll_new: "polls",
  poll_deadline: "reminders",
  event_new: "events",
  attendance_request: "events",
  event_updated: "events",
  event_canceled: "events",
  event_upcoming: "reminders",
  attendance_deadline: "reminders",
  announcement: "announcements",
  mention: "mentions",
  reply: "mentions",
  feedback_reply: "mentions",
  feedback_new: null,
  member_joined: null,
};

async function loadPrefs(admin: Admin, userIds: string[]) {
  const [{ data: prefs }, { data: settings }] = await Promise.all([
    admin.from("notification_preferences").select("*").in("user_id", userIds),
    admin.from("user_settings").select("user_id, push_preview").in("user_id", userIds),
  ]);
  const prefMap = new Map((prefs ?? []).map((p) => [`${p.user_id}:${p.group_id}`, p]));
  const preview = new Map((settings ?? []).map((s) => [s.user_id, s.push_preview]));
  return { prefMap, preview };
}

export async function dispatchNotifications(admin: Admin, ids: string[]) {
  const { data: rows } = await admin.from("notifications").select("*").in("id", ids.slice(0, 1000)).eq("push", true).is("read_at", null);
  if (!rows?.length) return { sent: 0, failed: 0, removed: 0 };
  const { prefMap, preview } = await loadPrefs(admin, Array.from(new Set(rows.map((r) => r.user_id))));
  const messages = rows.flatMap((n) => {
    const pref = PREF_FOR_KIND[n.kind];
    if (pref === null) return [];
    const p = n.group_id ? prefMap.get(`${n.user_id}:${n.group_id}`) : undefined;
    if (pref && p && p[pref] === false) return [];
    const showBody = preview.get(n.user_id) ?? true;
    return [
      {
        userId: n.user_id,
        payload: {
          title: n.title,
          body: showBody ? n.body : "詳しくはアプリで確認してください",
          url: n.link,
          tag: `${n.kind}:${n.ref_id ?? n.id}`,
        },
      },
    ];
  });
  return deliver(admin, messages);
}

const ACTIVE_WINDOW_MS = 20_000;

export async function dispatchMessage(admin: Admin, messageId: string) {
  const { data: m } = await admin.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (!m || m.deleted_at || !m.sender_id) return { sent: 0, failed: 0, removed: 0 };
  const [{ data: conv }, { data: members }, { data: sender }] = await Promise.all([
    admin.from("conversations").select("id, kind, group_id, groups(name), teams(name)").eq("id", m.conversation_id).single(),
    admin.from("conversation_members").select("user_id, muted, last_read_at").eq("conversation_id", m.conversation_id),
    admin.from("profiles").select("display_name").eq("id", m.sender_id).single(),
  ]);
  if (!conv || !members) return { sent: 0, failed: 0, removed: 0 };

  let replyAuthor: string | null = null;
  if (m.reply_to_id) {
    const { data: parent } = await admin.from("messages").select("sender_id").eq("id", m.reply_to_id).maybeSingle();
    replyAuthor = parent?.sender_id ?? null;
  }
  const recipients = members.filter((x) => x.user_id !== m.sender_id);
  const { prefMap, preview } = await loadPrefs(admin, recipients.map((r) => r.user_id));
  const senderName = sender?.display_name ?? "メンバー";
  const teamName = (conv.teams as { name: string } | null)?.name ?? null;
  const groupName = (conv.groups as { name: string } | null)?.name ?? null;
  const isGroupLike = conv.kind === "group" || conv.kind === "team";
  const text =
    m.kind === "image" ? (m.body ? `📷 ${m.body}` : "写真を送信しました") : m.kind === "file" ? (m.body ? `📎 ${m.body}` : "ファイルを送信しました") : m.body;
  const now = Date.now();

  const messages = recipients.flatMap((r) => {
    // The member is looking at this conversation right now.
    if (new Date(r.last_read_at).getTime() > now - ACTIVE_WINDOW_MS) return [];
    const direct = m.mentions.includes(r.user_id) || replyAuthor === r.user_id;
    const p = conv.group_id ? prefMap.get(`${r.user_id}:${conv.group_id}`) : undefined;
    if (direct) {
      if (p && p.mentions === false) return [];
    } else {
      if (r.muted) return [];
      if (p && p.messages === false) return [];
    }
    const showBody = preview.get(r.user_id) ?? true;
    const prefix = direct ? (m.mentions.includes(r.user_id) ? "あなたへのメンション: " : "返信: ") : "";
    return [
      {
        userId: r.user_id,
        payload: {
          title: conv.kind === "team" ? `${teamName ?? "パート・バンド"}（${groupName ?? "グループ"}）` : conv.kind === "group" ? (groupName ?? "グループ") : senderName,
          body: showBody
            ? `${isGroupLike ? `${senderName}: ` : ""}${prefix}${text}`.slice(0, 180)
            : direct
              ? `${senderName}さんからメッセージがあります`
              : "新しいメッセージがあります",
          url: `/talk/${conv.id}`,
          tag: `conv:${conv.id}`,
        },
      },
    ];
  });
  return deliver(admin, messages);
}
