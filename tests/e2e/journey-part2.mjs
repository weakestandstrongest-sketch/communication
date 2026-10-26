// Second half of the journey: polls, events, attendance, announcements, notifications,
// photos, reactions, failure/retry, access control, narrow screens and push delivery.
import https from "node:https";
import fs from "node:fs";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { APP_URL } from "./session.mjs";

function png(r, g, b, size = 64) {
  // Minimal solid-color PNG (no external deps).
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set([r, g, b], y * (size * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) : crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

export async function runPart2({ browser, A, B, C, X, owner, member, member2, step, shot, groupId, conversationId, admin }) {
  let pollId = "";
  let eventId = "";
  let announcementId = "";

  await step("admin creates a poll that appears in chat and in the poll list", async () => {
    await A.goto(`${APP_URL}/polls/new`);
    await A.getByLabel("グループ", { exact: true }).selectOption(groupId);
    await A.getByLabel("質問").fill("夏合宿の日程はどれがいいですか？");
    await A.getByLabel("選択肢 1", { exact: true }).fill("8月1日〜3日");
    await A.getByLabel("選択肢 2", { exact: true }).fill("8月8日〜10日");
    await A.getByRole("button", { name: "選択肢を追加" }).click();
    await A.getByLabel("選択肢 3", { exact: true }).fill("8月15日〜17日");
    await A.getByRole("button", { name: "明日 21:00" }).click();
    await A.getByRole("button", { name: "投票を作成" }).click();
    await A.waitForURL(/\/polls\/[0-9a-f-]{36}$/);
    pollId = A.url().split("/polls/")[1];
    await A.getByRole("heading", { name: "夏合宿の日程はどれがいいですか？" }).waitFor();
    // The poll card is published in the group conversation.
    await B.goto(`${APP_URL}/talk/${conversationId}`);
    await B.getByRole("log").getByText("夏合宿の日程はどれがいいですか？").first().waitFor({ timeout: 8000 });
    await B.getByText("未回答").first().waitFor();
  });

  await step("unanswered poll is listed under 未回答 and on the home screen", async () => {
    await C.goto(`${APP_URL}/polls`);
    await C.getByRole("tab", { name: /未回答/ }).waitFor();
    await C.getByText("夏合宿の日程はどれがいいですか？").waitFor();
    await shot(C, "07-polls-unanswered");
    await C.goto(APP_URL);
    await C.getByText("対応が必要").waitFor();
    await C.getByRole("link", { name: /夏合宿の日程はどれがいいですか？ テニスサークル Ace 投票/ }).waitFor();
    await shot(C, "08-home-actions");
  });

  await step("members vote and the chat card updates in real time", async () => {
    await C.goto(`${APP_URL}/polls/${pollId}`);
    await C.getByRole("radio", { name: /8月8日〜10日/ }).click();
    await C.getByRole("button", { name: "回答する" }).click();
    await C.getByText("回答済み").first().waitFor();
    await shot(C, "09-poll-voted");
    // B is still on the conversation: the card shows the new response count.
    await B.getByText(/1\/3人が回答/).waitFor({ timeout: 8000 });
    await C.goto(`${APP_URL}/polls`);
    await C.getByRole("tab", { name: "回答済み" }).click();
    await C.getByText("夏合宿の日程はどれがいいですか？").waitFor();
    await C.getByRole("tab", { name: /^未回答/ }).click();
    await C.getByText("未回答の投票はありません").waitFor();
  });

  await step("a member creates an event from the chat composer", async () => {
    await C.goto(`${APP_URL}/talk/${conversationId}`);
    await C.getByRole("button", { name: "添付・作成メニュー" }).click();
    await C.getByRole("button", { name: "予定・出欠確認を作成" }).click();
    const dialog = C.getByRole("dialog", { name: "予定を作成" });
    await dialog.getByLabel("タイトル").fill("練習試合 vs 東和大学");
    await dialog.getByRole("radio", { name: /試合・大会/ }).click();
    await dialog.getByLabel("場所（任意）").fill("市民テニスコート");
    await dialog.getByRole("button", { name: "予定を作成" }).click();
    await C.getByRole("log").getByText("練習試合 vs 東和大学").first().waitFor({ timeout: 8000 });
    const { data } = await admin.from("events").select("id").eq("group_id", groupId).eq("title", "練習試合 vs 東和大学");
    if (data.length !== 1) throw new Error(`expected exactly one event record, got ${data.length}`);
    eventId = data[0].id;
    await shot(C, "10-chat-event-card");
  });

  await step("the event appears once in the calendar for other members", async () => {
    await A.goto(`${APP_URL}/calendar`);
    await A.getByRole("tab", { name: "リスト" }).click();
    await A.getByText("練習試合 vs 東和大学").waitFor();
    if ((await A.getByText("練習試合 vs 東和大学").count()) !== 1) throw new Error("event shown more than once");
    await A.getByRole("tab", { name: "月" }).click();
    await shot(A, "11-calendar-month");
  });

  await step("members confirm attendance from the chat card and the event screen", async () => {
    await B.goto(`${APP_URL}/talk/${conversationId}`);
    const card = B.locator("div").filter({ hasText: "練習試合 vs 東和大学" }).getByRole("radio", { name: /参加/ }).first();
    await card.click();
    await B.getByText("「参加」で回答しました").waitFor();
    await A.goto(`${APP_URL}/events/${eventId}`);
    await A.getByRole("radio", { name: /未定/ }).click();
    await A.getByText("「未定」で回答しました").waitFor();
    await A.getByLabel("出欠コメント").fill("少し遅れます");
    await A.getByRole("button", { name: "保存" }).click();
    await A.getByText("コメントを保存しました").waitFor();
    // C (organizer) sees individual responses and who has not answered.
    await C.goto(`${APP_URL}/events/${eventId}`);
    await C.getByRole("tab", { name: /参加\s*1/ }).waitFor({ timeout: 8000 });
    await C.getByRole("tab", { name: /未回答/ }).click();
    await C.getByText("鈴木 一郎").last().waitFor();
    await C.getByRole("tab", { name: /未定/ }).click();
    await C.getByText("少し遅れます").waitFor();
    await shot(C, "12-event-detail");
  });

  await step("owner posts an important pinned announcement", async () => {
    await A.goto(`${APP_URL}/announcements/new?group=${groupId}`);
    await A.getByLabel("タイトル").fill("大会エントリーの締切について");
    await A.getByLabel("本文").fill("今月末までに参加費 2,000円 を会計まで提出してください。\nよろしくお願いします。");
    await A.getByRole("switch", { name: "重要" }).click();
    await A.getByRole("switch", { name: "ピン留め" }).click();
    await A.getByRole("button", { name: "投稿する" }).click();
    await A.waitForURL(/\/announcements\/[0-9a-f-]{36}$/);
    announcementId = A.url().split("/announcements/")[1];
    await B.goto(APP_URL);
    await B.getByRole("link", { name: /大会エントリーの締切について/ }).first().waitFor({ timeout: 8000 });
    if (await B.screenshot) await shot(B, "13-home-desktop");
    await B.getByRole("link", { name: /大会エントリーの締切について/ }).first().click();
    await B.waitForURL(/\/announcements\//);
    await B.getByText(/今月末までに参加費/).first().waitFor();
    await B.getByText(/既読 2 \/ 3人/).waitFor({ timeout: 8000 });
  });

  await step("in-app notifications are listed and can be marked read", async () => {
    await B.goto(`${APP_URL}/notifications`);
    await B.getByText(/新しい投票: 夏合宿/).waitFor();
    await B.getByText(/出欠確認: 練習試合/).waitFor();
    await B.getByText(/【重要】大会エントリー/).waitFor();
    const own = await A.goto(`${APP_URL}/notifications`).then(() => A.getByText(/新しい投票: 夏合宿/).count());
    if (own !== 0) throw new Error("creator was notified about their own poll");
    await shot(B, "14-notifications");
    await B.getByRole("button", { name: "すべて既読" }).click();
    await B.getByText("すべて既読にしました").waitFor();
    const { count } = await admin.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", member.id).is("read_at", null);
    if (count !== 0) throw new Error(`${count} notifications still unread`);
  });

  await step("photos can be shared in chat and in albums", async () => {
    await A.goto(`${APP_URL}/talk/${conversationId}`);
    await A.locator('input[type=file][accept="image/*"]').first().setInputFiles({ name: "court.png", mimeType: "image/png", buffer: png(40, 160, 120, 300) });
    await A.getByLabel("メッセージ", { exact: true }).fill("コートの写真です");
    await A.getByRole("button", { name: "送信" }).click();
    await B.goto(`${APP_URL}/talk/${conversationId}`);
    await B.getByRole("log").getByText("コートの写真です").waitFor({ timeout: 10000 });
    await B.getByRole("button", { name: "写真を表示" }).last().locator("img").waitFor({ timeout: 10000 });
    await B.goto(`${APP_URL}/groups/${groupId}`);
    await B.getByRole("tab", { name: "アルバム" }).click();
    await B.getByRole("button", { name: "アルバムを作成" }).click();
    await B.getByLabel("タイトル").fill("2026 夏合宿");
    await B.getByRole("button", { name: "作成", exact: true }).click();
    await B.waitForURL(/albums\/[0-9a-f-]{36}$/);
    await B.locator('input[type=file][accept="image/*"]').setInputFiles([
      { name: "a.png", mimeType: "image/png", buffer: png(200, 80, 80) },
      { name: "b.png", mimeType: "image/png", buffer: png(80, 80, 200) },
    ]);
    await B.getByText("2枚の写真を追加しました").waitFor({ timeout: 15000 });
    await C.goto(`${APP_URL}/groups/${groupId}/albums`);
    await C.getByText(/写真 3枚/).waitFor({ timeout: 8000 });
    await shot(C, "15-group-photos");
  });

  await step("reactions and replies work in the conversation", async () => {
    await B.goto(`${APP_URL}/talk/${conversationId}`);
    const target = B.getByRole("log").getByText("こんにちは！今週の練習は木曜18時からです🎾");
    await target.hover();
    await B.locator("#m-" + (await admin.from("messages").select("id").eq("conversation_id", conversationId).like("body", "こんにちは！%").single()).data.id)
      .getByRole("button", { name: "メッセージのメニュー" })
      .click();
    await B.getByRole("button", { name: "👍でリアクション" }).click();
    await A.goto(`${APP_URL}/talk/${conversationId}`);
    await A.getByRole("button", { name: /👍 1人/ }).waitFor({ timeout: 8000 });
    await A.getByRole("log").getByText("了解です！ラケット持っていきます").dblclick();
    await A.getByText("田中 太郎に返信").waitFor();
    await A.getByLabel("メッセージ", { exact: true }).fill("ありがとう！");
    await A.getByRole("button", { name: "送信" }).click();
    await B.getByRole("log").getByText("ありがとう！").waitFor({ timeout: 8000 });
    const replies = await admin.from("notifications").select("kind").eq("user_id", member.id).eq("kind", "reply");
    if (!replies.data.length) throw new Error("reply notification missing");
  });

  await step("a message sent while offline fails visibly and can be resent", async () => {
    await B.context().setOffline(true);
    await B.getByLabel("メッセージ", { exact: true }).fill("オフラインで送信");
    await B.getByLabel("メッセージ", { exact: true }).press("Enter");
    await B.getByText("オフラインのため送信できませんでした").waitFor({ timeout: 8000 });
    await shot(B, "17-offline-failed");
    await B.getByText(/オフラインです|再接続しています/).first().waitFor({ timeout: 8000 });
    await B.context().setOffline(false);
    await B.getByRole("button", { name: "再送信" }).click();
    await A.getByRole("log").getByText("オフラインで送信").waitFor({ timeout: 10000 });
    const { count } = await admin.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", conversationId).eq("body", "オフラインで送信");
    if (count !== 1) throw new Error(`expected exactly one stored message, got ${count}`);
  });

  await step("outsiders cannot open the group's chat, polls, events or photos", async () => {
    for (const [url, text] of [
      [`/talk/${conversationId}`, "トークが見つかりません"],
      [`/polls/${pollId}`, "投票が見つかりません"],
      [`/events/${eventId}`, "予定が見つかりません"],
      [`/groups/${groupId}`, "グループが見つかりません"],
      [`/announcements/${announcementId}`, "お知らせが見つかりません"],
    ]) {
      await X.goto(`${APP_URL}${url}`);
      await X.getByText(text).waitFor({ timeout: 8000 });
    }
    await X.goto(`${APP_URL}/polls`);
    await X.getByRole("tab", { name: "すべて" }).click();
    if (await X.getByText("夏合宿の日程はどれがいいですか？").count()) throw new Error("outsider can see poll");
  });

  await step("members without permission do not get management actions", async () => {
    await C.goto(`${APP_URL}/polls/${pollId}`);
    await C.getByRole("button", { name: "投票のメニュー" }).click();
    await C.getByRole("button", { name: "グループトークに共有" }).waitFor();
    if (await C.getByRole("button", { name: "削除" }).count()) throw new Error("member sees delete for someone else's poll");
    await C.keyboard.press("Escape");
    await C.goto(`${APP_URL}/groups/${groupId}/settings`);
    await C.getByText("このグループのプッシュ通知").waitFor();
    if (await C.getByText("メンバーの権限").count()) throw new Error("member sees admin settings");
  });

  await step("screens fit a narrow 320px iPhone SE width without horizontal scrolling", async () => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const { sessionCookies } = await import("./session.mjs");
    await ctx.addCookies(sessionCookies(member2.session));
    const p = await ctx.newPage();
    const pages = ["/", "/talk", `/talk/${conversationId}`, "/calendar", "/polls", `/polls/${pollId}`, `/events/${eventId}`, `/groups/${groupId}`, "/notifications", "/settings"];
    for (const url of pages) {
      await p.goto(`${APP_URL}${url}`);
      await p.waitForTimeout(900);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) throw new Error(`${url} overflows by ${overflow}px`);
    }
    await p.goto(`${APP_URL}/talk/${conversationId}`);
    await p.waitForTimeout(800);
    await shot(p, "16-chat-320");
    await ctx.close();
  });

  await step("push notifications are delivered by the backend to a subscribed device", async () => {
    // web-push only speaks HTTPS: the app server must trust E2E_PUSH_CERT (NODE_EXTRA_CA_CERTS).
    if (!process.env.E2E_PUSH_CERT || !process.env.E2E_PUSH_KEY) throw new Error("set E2E_PUSH_CERT / E2E_PUSH_KEY to run this step");
    // A mock push service: receives the encrypted Web Push request and decrypts it with the
    // subscription's private key, exactly as a browser would.
    const ece = createRequire(import.meta.url)("http_ece");
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.generateKeys();
    const authSecret = crypto.randomBytes(16);
    const received = [];
    const server = https.createServer({ cert: fs.readFileSync(process.env.E2E_PUSH_CERT), key: fs.readFileSync(process.env.E2E_PUSH_KEY) }, (req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          const body = ece.decrypt(Buffer.concat(chunks), { version: "aes128gcm", privateKey: ecdh, authSecret });
          received.push({ path: req.url, ttl: req.headers.ttl, payload: JSON.parse(body.toString("utf8")) });
        } catch (e) {
          received.push({ error: String(e) });
        }
        res.writeHead(201).end();
      });
    });
    await new Promise((r) => server.listen(4555, "0.0.0.0", r));
    const endpoint = "https://127.0.0.1:4555/push/member2";
    await admin.from("push_subscriptions").delete().eq("user_id", member2.id);
    const { error } = await admin.from("push_subscriptions").insert({
      user_id: member2.id,
      endpoint,
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: authSecret.toString("base64url"),
    });
    if (error) throw new Error(error.message);
    try {
      // Make sure member2 is not "actively viewing" the conversation.
      await admin.from("conversation_members").update({ last_read_at: new Date(Date.now() - 600000).toISOString() }).eq("user_id", member2.id).eq("conversation_id", conversationId);
      await A.goto(`${APP_URL}/talk/${conversationId}`);
      await A.getByLabel("メッセージ", { exact: true }).fill("プッシュ通知のテストです");
      await A.getByRole("button", { name: "送信" }).click();
      const deadline = Date.now() + 15000;
      while (!received.some((r) => r.payload?.body?.includes("プッシュ通知のテストです")) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 300));
      const hit = received.find((r) => r.payload?.body?.includes("プッシュ通知のテストです"));
      if (!hit) throw new Error(`no push received: ${JSON.stringify(received).slice(0, 300)}`);
      if (hit.payload.title !== "テニスサークル Ace" || hit.payload.url !== `/talk/${conversationId}`) throw new Error(`unexpected payload ${JSON.stringify(hit.payload)}`);
      // Muted conversations do not push.
      received.length = 0;
      await admin.from("conversation_members").update({ muted: true }).eq("user_id", member2.id).eq("conversation_id", conversationId);
      await A.getByLabel("メッセージ", { exact: true }).fill("ミュート中のメッセージ");
      await A.getByRole("button", { name: "送信" }).click();
      // An event creation (notification row) still pushes.
      await A.goto(`${APP_URL}/events/new?group=${groupId}`);
      await A.getByLabel("タイトル").fill("ミーティング");
      await A.getByRole("button", { name: "予定を作成" }).click();
      const deadline2 = Date.now() + 15000;
      while (!received.some((r) => r.payload?.title?.includes("ミーティング")) && Date.now() < deadline2) await new Promise((r) => setTimeout(r, 300));
      if (!received.some((r) => r.payload?.title === "出欠確認: ミーティング")) throw new Error(`event push missing: ${JSON.stringify(received)}`);
      if (received.some((r) => r.payload?.body?.includes("ミュート中のメッセージ"))) throw new Error("muted conversation was pushed");
      await admin.from("conversation_members").update({ muted: false }).eq("user_id", member2.id).eq("conversation_id", conversationId);
    } finally {
      server.close();
      await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
  });
}
