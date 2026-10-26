"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, BellOff, MessageCirclePlus, MoreHorizontal, Pin, PinOff, Bell, Search } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, useConversations, usePeople } from "@/lib/queries";
import { formatListTime } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import type { ConversationSummary } from "@/lib/types";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import { CountBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/empty-state";
import { ActionSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { NewDirectSheet } from "./new-direct-sheet";
import { LongPressLink } from "@/components/ui/long-press";

export function conversationTitle(c: Pick<ConversationSummary, "kind" | "group_name" | "peer_name">) {
  return c.kind === "group" ? (c.group_name ?? "グループ") : (c.peer_name ?? "トーク");
}

export function lastMessagePreview(c: ConversationSummary, myId: string, people: Map<string, { name: string }>) {
  if (!c.last_message_kind) return "メッセージはまだありません";
  if (c.last_message_deleted) return "メッセージが削除されました";
  const sender =
    c.last_message_kind === "system" || c.kind === "direct"
      ? ""
      : c.last_message_sender_id === myId
        ? "あなた: "
        : `${people.get(c.last_message_sender_id ?? "")?.name ?? c.last_message_sender_name ?? ""}: `;
  const body = (() => {
    switch (c.last_message_kind) {
      case "image":
        return c.last_message_body ? c.last_message_body : "写真を送信しました";
      case "file":
        return c.last_message_body ? c.last_message_body : "ファイルを送信しました";
      case "poll":
        return `📊 投票「${c.last_message_body}」`;
      case "event":
        return `📅 予定「${c.last_message_body}」`;
      case "announcement":
        return `📣 お知らせ「${c.last_message_body}」`;
      case "album":
        return `🖼 アルバム「${c.last_message_body}」`;
      default:
        return c.last_message_body ?? "";
    }
  })();
  return sender + body.replace(/\s+/g, " ");
}

export function ConversationList() {
  const userId = useUserId();
  const pathname = usePathname();
  const people = usePeople();
  const { data, isLoading, error, refetch } = useConversations();
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<ConversationSummary | null>(null);
  const [newDm, setNewDm] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data ?? [];
    if (!q) return list;
    return list.filter((c) =>
      [conversationTitle(c), c.last_message_body ?? "", c.group_name ?? ""].some((s) => s.toLowerCase().includes(q)),
    );
  }, [data, query]);

  const update = async (c: ConversationSummary, patch: { pinned?: boolean; muted?: boolean }) => {
    queryClient.setQueryData<ConversationSummary[]>(qk.conversations, (old) =>
      old?.map((x) => (x.id === c.id ? { ...x, ...patch } : x)),
    );
    const { error } = await getSupabase()
      .from("conversation_members")
      .update(patch)
      .eq("conversation_id", c.id)
      .eq("user_id", userId);
    if (error) toast.show(errorMessage(error), "error");
    else toast.show(
      patch.pinned !== undefined ? (patch.pinned ? "ピン留めしました" : "ピン留めを外しました") : patch.muted ? "通知をオフにしました" : "通知をオンにしました",
    );
    void queryClient.invalidateQueries({ queryKey: qk.conversations });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-2 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label-3" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="トークを検索"
            aria-label="トークを検索"
            className="h-10 w-full rounded-xl bg-surface-3 pr-3 pl-9 text-[16px] outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent/40"
          />
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={<MessageCirclePlus />}
          title="トークはまだありません"
          description="グループを作成するか、招待リンクから参加するとグループトークが始まります。"
          action={
            <Link href="/groups" className="inline-flex h-11 items-center rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-contrast">
              グループへ
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <p className="px-6 py-10 text-center text-[14px] text-label-3">「{query}」に一致するトークはありません</p>
      ) : (
        <ul className="flex-1 pb-4">
          {filtered.map((c) => {
            const active = pathname === `/talk/${c.id}`;
            const unread = Number(c.unread_count);
            const mentions = Number(c.mention_count);
            return (
              <li key={c.id} className="group relative">
                <LongPressLink
                  onLongPress={() => setMenuFor(c)}
                  href={`/talk/${c.id}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 transition-colors active:bg-surface-3",
                    active ? "bg-accent-soft" : "hover:bg-surface-2",
                  )}
                  aria-label={`${conversationTitle(c)}${unread ? `、未読${unread}件` : ""}`}
                >
                  {c.kind === "group" ? (
                    <GroupAvatar name={c.group_name} color={c.group_color} size={52} />
                  ) : (
                    <Avatar name={c.peer_name} src={c.peer_avatar_url} id={c.peer_id} size={52} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[16px] font-semibold">{conversationTitle(c)}</span>
                      {c.kind === "group" && <span className="shrink-0 text-[13px] text-label-3 tabular">{Number(c.member_count)}</span>}
                      {c.pinned && <Pin className="size-3.5 shrink-0 rotate-45 text-label-3" aria-label="ピン留め" />}
                      {c.muted && <BellOff className="size-3.5 shrink-0 text-label-3" aria-label="通知オフ" />}
                      <span className="ml-auto shrink-0 pl-2 text-[12px] text-label-3 tabular">
                        {c.last_message_at ? formatListTime(c.last_message_at) : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={cn("line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug break-anywhere", unread ? "text-label-2" : "text-label-3")}>
                        {lastMessagePreview(c, userId, people)}
                      </p>
                      {mentions > 0 && (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-white" aria-label="メンションあり">
                          <AtSign className="size-3" />
                        </span>
                      )}
                      <CountBadge count={unread} muted={c.muted} />
                    </div>
                  </div>
                </LongPressLink>
                <button
                  type="button"
                  onClick={() => setMenuFor(c)}
                  aria-label={`${conversationTitle(c)}のメニュー`}
                  className="absolute top-1/2 right-2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-label-2 shadow-[var(--shadow-card)] group-hover:flex focus:flex"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-4 pb-4 lg:pb-4">
        <Button variant="tinted" size="md" block icon={<MessageCirclePlus className="size-4" />} onClick={() => setNewDm(true)}>
          メンバーと個別トーク
        </Button>
      </div>

      <ActionSheet
        open={Boolean(menuFor)}
        onClose={() => setMenuFor(null)}
        title={menuFor ? conversationTitle(menuFor) : ""}
        actions={
          menuFor
            ? [
                {
                  label: menuFor.pinned ? "ピン留めを外す" : "ピン留め",
                  icon: menuFor.pinned ? <PinOff /> : <Pin />,
                  onSelect: () => update(menuFor, { pinned: !menuFor.pinned }),
                },
                {
                  label: menuFor.muted ? "通知をオンにする" : "通知をオフにする",
                  icon: menuFor.muted ? <Bell /> : <BellOff />,
                  onSelect: () => update(menuFor, { muted: !menuFor.muted }),
                },
              ]
            : []
        }
      />
      <NewDirectSheet open={newDm} onClose={() => setNewDm(false)} />
    </div>
  );
}
