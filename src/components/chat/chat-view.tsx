"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  Bell,
  BellOff,
  ChevronLeft,
  Copy,
  CornerUpLeft,
  Eye,
  Images,
  Info,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  Users,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import {
  discardMessage,
  findMessage,
  loadLatest,
  loadOlder,
  retryMessage,
  useConversationMessages,
  type ChatMessage,
} from "@/lib/chat-store";
import { qk, useConversationMembers, useConversations, useMyGroups, usePeople, type PersonInfo } from "@/lib/queries";
import { formatAgo, formatDaySeparator } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { removeMedia } from "@/lib/media";
import type { Attachment, ConversationSummary } from "@/lib/types";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import { ActionSheet, Sheet } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { ImageViewer, type ViewerItem } from "@/components/media/image-viewer";
import { SignedImage } from "@/components/media/signed-image";
import { useMedia } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";
import { conversationTitle } from "./conversation-list";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "✅"];
const GROUP_WINDOW_MS = 5 * 60_000;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function previewText(m: ChatMessage) {
  if (m.deleted_at) return "削除されたメッセージ";
  if (m.body) return m.body.replace(/\s+/g, " ");
  if (m.kind === "image") return "写真";
  if (m.kind === "file") return "ファイル";
  return "メッセージ";
}

/** Keeps the chat pinned to the visible viewport when the iOS keyboard opens. */
function useVisualViewportFit(ref: React.RefObject<HTMLDivElement | null>, onResize: () => void) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      if (!mq.matches) {
        el.style.height = "";
        el.style.transform = "";
        return;
      }
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
      onResize();
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    mq.addEventListener("change", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      mq.removeEventListener("change", update);
    };
  }, [ref, onResize]);
}

export function ChatView({ conversationId }: { conversationId: string }) {
  const myId = useUserId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const people = usePeople();
  const { data: conversations, isLoading: convLoading } = useConversations();
  const { data: groups } = useMyGroups();
  const summary = conversations?.find((c) => c.id === conversationId);
  const state = useConversationMessages(conversationId);
  const { data: members } = useConversationMembers(conversationId);

  const groupId = summary?.group_id ?? null;
  const myRole = groups?.find((g) => g.id === groupId)?.my_role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const isDirect = summary?.kind === "direct";
  const storagePrefix = groupId ? `g/${groupId}/chat/${conversationId}/` : `dm/${conversationId}/`;

  const container = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [readersFor, setReadersFor] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null);
  const [info, setInfo] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [online, setOnline] = useState<Set<string>>(new Set());
  const typingChannel = useRef<ReturnType<ReturnType<typeof getSupabase>["channel"]> | null>(null);
  const lastTypingSent = useRef(0);

  // Unread divider position is captured once, when the conversation opens.
  const [initialLastRead, setInitialLastRead] = useState<string | null>(null);
  const [prevConversation, setPrevConversation] = useState(conversationId);
  if (prevConversation !== conversationId) {
    setPrevConversation(conversationId);
    setInitialLastRead(null);
  }
  if (initialLastRead === null && summary) setInitialLastRead(summary.last_read_at);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottom.current = true;
    setShowJump(false);
    setNewBelow(0);
  }, []);

  const keepBottom = useCallback(() => {
    if (atBottom.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, []);
  useVisualViewportFit(container, keepBottom);

  // Always refresh the latest page when the conversation is opened.
  useEffect(() => {
    void loadLatest(conversationId);
  }, [conversationId]);

  // ---------------------------------------------------------------------------
  // Read receipts, typing indicators and presence
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = getSupabase();
    const db = supabase
      .channel(`conv-db:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conversationId}` },
        (p) => {
          const row = p.new as { user_id: string; last_read_at: string; muted: boolean; pinned: boolean };
          queryClient.setQueryData<Array<{ user_id: string; last_read_at: string; muted: boolean; pinned: boolean }>>(
            qk.conversationMembers(conversationId),
            (old) => old?.map((m) => (m.user_id === row.user_id ? { ...m, last_read_at: row.last_read_at } : m)),
          );
        },
      )
      .subscribe();

    const live = supabase.channel(`conv:${conversationId}`, { config: { private: true, presence: { key: myId } } });
    live
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const uid = (payload as { user_id?: string }).user_id;
        if (uid && uid !== myId) setTyping((t) => ({ ...t, [uid]: Date.now() }));
      })
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(live.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await live.track({ at: Date.now() });
      });
    typingChannel.current = live;
    return () => {
      typingChannel.current = null;
      void supabase.removeChannel(db);
      void supabase.removeChannel(live);
    };
  }, [conversationId, myId, queryClient]);

  // Expire typing indicators.
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setTyping((prev) => Object.fromEntries(Object.entries(prev).filter(([, at]) => now - at < 4000)));
    }, 1000);
    return () => clearTimeout(t);
  }, [typing]);

  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = now;
    void typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { user_id: myId } });
  }, [myId]);

  // ---------------------------------------------------------------------------
  // Mark as read while the conversation is open and the page is visible (like LINE)
  // ---------------------------------------------------------------------------
  const lastMarked = useRef<string | null>(null);
  const markRead = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const last = state.messages.findLast((m) => !m.local);
    if (!last || lastMarked.current === last.id) return;
    lastMarked.current = last.id;
    queryClient.setQueryData<ConversationSummary[]>(qk.conversations, (old) =>
      old?.map((c) => (c.id === conversationId ? { ...c, unread_count: 0, mention_count: 0, last_read_at: new Date().toISOString() } : c)),
    );
    const { error } = await getSupabase().rpc("mark_conversation_read", { p_conversation_id: conversationId });
    if (error) lastMarked.current = null;
    else void queryClient.invalidateQueries({ queryKey: qk.notifications });
  }, [conversationId, queryClient, state.messages]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const t = setTimeout(() => void markRead(), 150);
    const onVis = () => void markRead();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [markRead, state.status]);

  // ---------------------------------------------------------------------------
  // Scrolling: initial position, new messages, preserving position on prepend
  // ---------------------------------------------------------------------------
  const initialScrollDone = useRef(false);
  const prevFirstId = useRef<string | null>(null);
  const prevLastId = useRef<string | null>(null);
  const prevHeight = useRef(0);

  useLayoutEffect(() => {
    initialScrollDone.current = false;
    prevFirstId.current = null;
    prevLastId.current = null;
  }, [conversationId]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || state.status !== "ready") return;
    const msgs = state.messages;
    const first = msgs[0]?.id ?? null;
    const last = msgs[msgs.length - 1];

    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      const divider = el.querySelector<HTMLElement>("[data-unread-divider]");
      if (divider && divider.offsetTop < el.scrollHeight - el.clientHeight) {
        el.scrollTop = Math.max(0, divider.offsetTop - 80);
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      } else {
        el.scrollTop = el.scrollHeight;
        atBottom.current = true;
      }
    } else if (prevFirstId.current && first !== prevFirstId.current && last?.id === prevLastId.current) {
      // Older messages were prepended: keep the visible message in place.
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (last && last.id !== prevLastId.current) {
      const fromMe = last.sender_id === myId;
      if (fromMe || atBottom.current) {
        el.scrollTop = el.scrollHeight;
        atBottom.current = true;
      } else {
        setNewBelow((n) => n + 1);
        setShowJump(true);
      }
    }
    prevFirstId.current = first;
    prevLastId.current = last?.id ?? null;
    prevHeight.current = el.scrollHeight;
  }, [state.messages, state.status, myId]);

  // Load older messages when the top sentinel becomes visible.
  useEffect(() => {
    const el = topSentinel.current;
    const root = scroller.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && initialScrollDone.current) {
          prevHeight.current = root.scrollHeight;
          void loadOlder(conversationId);
        }
      },
      { root, rootMargin: "400px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [conversationId, state.status]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottom.current = bottom;
    if (bottom) {
      if (showJump) setShowJump(false);
      if (newBelow) setNewBelow(0);
      void markRead();
    } else if (!showJump && el.scrollHeight - el.scrollTop - el.clientHeight > 600) {
      setShowJump(true);
    }
    prevHeight.current = el.scrollHeight;
  };

  const jumpTo = useCallback(
    async (id: string) => {
      for (let i = 0; i < 10; i++) {
        const node = document.getElementById(`m-${id}`);
        if (node) {
          node.scrollIntoView({ block: "center", behavior: "smooth" });
          setHighlight(id);
          setTimeout(() => setHighlight(null), 1600);
          return;
        }
        if (!findMessage(conversationId, id)) await loadOlder(conversationId);
        await new Promise((r) => requestAnimationFrame(r));
      }
      toast.show("元のメッセージが見つかりませんでした", "info");
    },
    [conversationId, toast],
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const react = useCallback(
    async (m: ChatMessage, emoji: string) => {
      const { error } = await getSupabase().rpc("toggle_reaction", { p_message_id: m.id, p_emoji: emoji });
      if (error) toast.show(errorMessage(error), "error");
    },
    [toast],
  );

  const remove = async (m: ChatMessage) => {
    const ok = await confirm({
      title: "メッセージを削除しますか？",
      message: "削除したメッセージはメンバー全員の画面から消え、元に戻せません。",
      confirmLabel: "削除",
      destructive: true,
    });
    if (!ok) return;
    const { data, error } = await getSupabase().rpc("delete_message", { p_message_id: m.id });
    if (error) return toast.show(errorMessage(error), "error");
    await removeMedia((data as string[]) ?? []).catch(() => undefined);
    toast.show("メッセージを削除しました");
  };

  const openImages = useCallback((m: ChatMessage, index: number) => {
    const imgs = ((m.attachments as unknown as Attachment[]) ?? []).filter((a) => a.mime.startsWith("image/"));
    setViewer({
      items: imgs.map((a) => ({ path: a.path, thumb_path: a.thumb_path, name: a.name, created_at: m.created_at })),
      index,
    });
  }, [setViewer]);

  const onReply = useCallback(
    (m: ChatMessage) => {
      setEditing(null);
      setReplyTo(m);
    },
    [setEditing, setReplyTo],
  );
  const onRetry = useCallback((m: ChatMessage) => retryMessage(conversationId, storagePrefix, m.client_id), [conversationId, storagePrefix]);
  const onDiscard = useCallback((m: ChatMessage) => discardMessage(conversationId, m.client_id), [conversationId]);

  const updateMembership = async (patch: { muted?: boolean; pinned?: boolean }) => {
    const { error } = await getSupabase().from("conversation_members").update(patch).eq("conversation_id", conversationId).eq("user_id", myId);
    if (error) return toast.show(errorMessage(error), "error");
    void queryClient.invalidateQueries({ queryKey: qk.conversations });
    toast.show(patch.muted !== undefined ? (patch.muted ? "通知をオフにしました" : "通知をオンにしました") : patch.pinned ? "ピン留めしました" : "ピン留めを外しました");
  };

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const others = useMemo(() => (members ?? []).filter((m) => m.user_id !== myId), [members, myId]);
  const memberPeople = useMemo(
    () => (members ?? []).map((m) => people.get(m.user_id)).filter(Boolean) as PersonInfo[],
    [members, people],
  );
  const mentionNames = useMemo(() => memberPeople.map((p) => p.name), [memberPeople]);

  const readCount = useCallback(
    (m: ChatMessage) => others.filter((o) => o.last_read_at >= m.created_at).length,
    [others],
  );

  const msgs = state.messages;
  // The first message that arrived after the conversation was last read.
  const unreadDividerId = useMemo(
    () =>
      initialLastRead === null
        ? null
        : (msgs.find((m) => !m.local && m.sender_id !== myId && m.kind !== "system" && m.created_at > initialLastRead)?.id ?? null),
    [msgs, initialLastRead, myId],
  );

  const typingNames = Object.keys(typing)
    .map((id) => people.get(id)?.name)
    .filter(Boolean) as string[];
  const onlineOthers = Array.from(online).filter((id) => id !== myId);

  if (!convLoading && conversations && !summary) {
    return (
      <div className="flex h-dvh flex-col">
        <ChatHeader title="トーク" />
        <EmptyState title="トークが見つかりません" description="退会したグループのトークか、アクセス権がありません。" />
      </div>
    );
  }

  const title = summary ? conversationTitle(summary) : "";
  const subtitle = typingNames.length
    ? `${typingNames.slice(0, 2).join("、")}${typingNames.length > 2 ? "ほか" : ""}さんが入力中…`
    : isDirect
      ? onlineOthers.length
        ? "オンライン"
        : summary?.peer_id && people.get(summary.peer_id)?.lastSeen
          ? `最終アクティブ ${formatAgo(people.get(summary.peer_id)!.lastSeen!)}`
          : ""
      : `メンバー ${members?.length ?? summary?.member_count ?? ""}人${onlineOthers.length ? ` ・ ${onlineOthers.length}人がオンライン` : ""}`;


  return (
    <div
      ref={container}
      className="fixed inset-x-0 top-0 z-30 flex h-dvh flex-col bg-chat-bg lg:static lg:z-auto lg:h-dvh"
    >
      <ChatHeader
        title={title}
        subtitle={subtitle}
        typing={typingNames.length > 0}
        avatar={
          summary &&
          (summary.kind === "group" ? (
            <GroupAvatar name={summary.group_name} color={summary.group_color} size={36} />
          ) : (
            <Avatar name={summary.peer_name} src={summary.peer_avatar_url} id={summary.peer_id} size={36} online={onlineOthers.length > 0} />
          ))
        }
        onInfo={() => setInfo(true)}
      />

      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`${title}のメッセージ`}
      >
        <div ref={topSentinel} className="h-1" />
        {state.status === "loading" || (state.status === "idle" && !msgs.length) ? (
          <div className="flex h-full items-center justify-center text-label-3">
            <Spinner className="size-6" />
          </div>
        ) : state.status === "error" ? (
          <ErrorState message={state.error ?? "メッセージを読み込めませんでした"} onRetry={() => void loadLatest(conversationId)} />
        ) : (
          <>
            {state.loadingOlder && (
              <div className="flex justify-center py-3 text-label-3">
                <Spinner className="size-5" />
              </div>
            )}
            {!state.hasMore && (
              <p className="py-6 text-center text-[12px] text-label-3">
                {msgs.length ? "これより前のメッセージはありません" : ""}
              </p>
            )}
            {!msgs.length && (
              <EmptyState
                title="メッセージはまだありません"
                description={isDirect ? "最初のメッセージを送ってみましょう。" : "グループのみんなにあいさつしてみましょう 👋"}
              />
            )}
            {msgs.map((m, i) => {
              const prev = msgs[i - 1];
              const next = msgs[i + 1];
              const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
              const sameSender = (a?: ChatMessage, b?: ChatMessage) =>
                Boolean(
                  a && b && a.sender_id === b.sender_id && a.kind !== "system" && b.kind !== "system" &&
                    Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < GROUP_WINDOW_MS &&
                    dayKey(a.created_at) === dayKey(b.created_at),
                );
              const showUnread = m.id === unreadDividerId;
              const reply = m.reply_to_id ? findMessage(conversationId, m.reply_to_id) : undefined;
              return (
                <div key={m.local ? `local-${m.client_id}` : m.id}>
                  {newDay && (
                    <div className="sticky top-1 z-[2] my-3 flex justify-center">
                      <span className="rounded-full bg-surface px-3 py-1 text-[12px] font-semibold text-label-2 shadow-[var(--shadow-card)]">
                        {formatDaySeparator(m.created_at)}
                      </span>
                    </div>
                  )}
                  {showUnread && (
                    <div data-unread-divider className="my-3 flex items-center gap-3 px-4" role="separator">
                      <span className="h-px flex-1 bg-accent/40" />
                      <span className="text-[12px] font-semibold text-accent">ここから未読</span>
                      <span className="h-px flex-1 bg-accent/40" />
                    </div>
                  )}
                  <MessageItem
                    message={m}
                    mine={m.sender_id === myId}
                    sender={m.sender_id ? people.get(m.sender_id) : undefined}
                    showSender={!isDirect}
                    groupedWithPrev={!newDay && !showUnread && sameSender(prev, m) && !(m.kind !== "text" && m.kind !== "image" && m.kind !== "file")}
                    groupedWithNext={sameSender(m, next) && !(next && dayKey(next.created_at) !== dayKey(m.created_at))}
                    isDirect={isDirect}
                    readCount={m.sender_id === myId ? readCount(m) : 0}
                    memberCount={members?.length ?? 0}
                    myId={myId}
                    replyTo={
                      m.reply_to_id
                        ? {
                            sender: reply?.sender_id ? (people.get(reply.sender_id)?.name ?? "メンバー") : "メッセージ",
                            text: reply ? previewText(reply) : "以前のメッセージ",
                          }
                        : null
                    }
                    mentionNames={mentionNames}
                    highlighted={highlight === m.id}
                    onActions={setActionsFor}
                    onReply={onReply}
                    onReact={react}
                    onOpenImages={openImages}
                    onJumpTo={jumpTo}
                    onRetry={onRetry}
                    onDiscard={onDiscard}
                    people={people}
                  />
                </div>
              );
            })}
          </>
        )}
        {typingNames.length > 0 && (
          <div className="mt-2 flex items-center gap-2 px-5 text-[12px] text-label-3" aria-live="polite">
            <span className="flex gap-0.5" aria-hidden>
              <span className="size-1.5 animate-bounce rounded-full bg-label-3 [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-label-3 [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-label-3" />
            </span>
            {typingNames[0]}さんが入力中
          </div>
        )}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-10 flex h-10 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-semibold text-accent shadow-[var(--shadow-float)]"
          aria-label={newBelow ? `新着メッセージ${newBelow}件へ移動` : "最新のメッセージへ移動"}
        >
          {newBelow > 0 && <span>新着 {newBelow}</span>}
          <ArrowDown className="size-4" />
        </button>
      )}

      <Composer
        conversationId={conversationId}
        storagePrefix={storagePrefix}
        groupId={groupId}
        members={memberPeople}
        myId={myId}
        replyTo={
          replyTo
            ? { message: replyTo, senderName: replyTo.sender_id === myId ? "自分" : (people.get(replyTo.sender_id ?? "")?.name ?? "メンバー") }
            : null
        }
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        onTyping={sendTyping}
        onSent={() => requestAnimationFrame(() => scrollToBottom())}
      />

      <ActionSheet
        open={Boolean(actionsFor)}
        onClose={() => setActionsFor(null)}
        header={
          actionsFor && (
            <div className="flex justify-between gap-1 px-4 pb-3" role="group" aria-label="リアクション">
              {QUICK_REACTIONS.map((e) => {
                const mine = ((actionsFor.reactions as Record<string, string[]>)[e] ?? []).includes(myId);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      const m = actionsFor;
                      setActionsFor(null);
                      void react(m, e);
                    }}
                    aria-label={`${e}でリアクション`}
                    aria-pressed={mine}
                    className={cn("flex size-10 items-center justify-center rounded-full text-[22px] transition-transform active:scale-90", mine ? "bg-accent-soft" : "bg-surface-2")}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          )
        }
        actions={
          actionsFor
            ? [
                { label: "返信", icon: <CornerUpLeft />, onSelect: () => onReply(actionsFor) },
                {
                  label: "コピー",
                  icon: <Copy />,
                  hidden: !actionsFor.body,
                  onSelect: () =>
                    void navigator.clipboard
                      .writeText(actionsFor.body)
                      .then(() => toast.show("コピーしました"))
                      .catch(() => toast.show("コピーできませんでした", "error")),
                },
                {
                  label: "既読メンバー",
                  icon: <Eye />,
                  hidden: actionsFor.sender_id !== myId || isDirect,
                  onSelect: () => setReadersFor(actionsFor),
                },
                {
                  label: "編集",
                  icon: <Pencil />,
                  hidden: actionsFor.sender_id !== myId || !["text", "image", "file"].includes(actionsFor.kind) || !actionsFor.body,
                  onSelect: () => {
                    setReplyTo(null);
                    setEditing(actionsFor);
                  },
                },
                {
                  label: "削除",
                  icon: <Trash2 />,
                  destructive: true,
                  hidden: !(actionsFor.sender_id === myId || (isAdmin && !isDirect)),
                  onSelect: () => void remove(actionsFor),
                },
              ]
            : []
        }
      />

      <Sheet open={Boolean(readersFor)} onClose={() => setReadersFor(null)} title="既読メンバー" size="sm">
        {readersFor && (
          <ReaderList
            readers={others.filter((o) => o.last_read_at >= readersFor.created_at).map((o) => people.get(o.user_id)).filter(Boolean) as PersonInfo[]}
            unread={others.filter((o) => o.last_read_at < readersFor.created_at).map((o) => people.get(o.user_id)).filter(Boolean) as PersonInfo[]}
          />
        )}
      </Sheet>

      <ConversationInfo
        open={info}
        onClose={() => setInfo(false)}
        summary={summary}
        conversationId={conversationId}
        members={memberPeople}
        online={online}
        onToggle={updateMembership}
        onOpenImage={(items, index) => setViewer({ items, index })}
      />

      <ImageViewer items={viewer?.items ?? []} index={viewer ? viewer.index : null} onClose={() => setViewer(null)} />
    </div>
  );
}

function ChatHeader({
  title,
  subtitle,
  avatar,
  typing,
  onInfo,
}: {
  title: string;
  subtitle?: string;
  avatar?: React.ReactNode;
  typing?: boolean;
  onInfo?: () => void;
}) {
  return (
    <header className="glass hairline-b z-20 shrink-0 pt-safe">
      <div className="flex h-14 items-center gap-2 px-2">
        <Link href="/talk" className="flex h-11 items-center pr-1 text-accent lg:hidden" aria-label="トーク一覧に戻る">
          <ChevronLeft className="size-7" strokeWidth={2.2} />
        </Link>
        {avatar && <span className="lg:ml-2">{avatar}</span>}
        <div className="min-w-0 flex-1 pl-1">
          <h1 className="truncate text-[16px] leading-tight font-semibold">{title}</h1>
          {subtitle && <p className={cn("truncate text-[12px]", typing ? "text-accent" : "text-label-3")}>{subtitle}</p>}
        </div>
        {onInfo && (
          <button type="button" onClick={onInfo} aria-label="トーク情報" className="flex size-11 items-center justify-center rounded-full text-accent hover:bg-accent-soft">
            <Info className="size-[22px]" />
          </button>
        )}
      </div>
    </header>
  );
}

function ReaderList({ readers, unread }: { readers: PersonInfo[]; unread: PersonInfo[] }) {
  return (
    <div className="space-y-4 px-4 pb-6">
      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-label-2">既読 {readers.length}人</h3>
        <ul className="space-y-2">
          {readers.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 text-[15px]">
              <Avatar name={p.name} src={p.avatar} id={p.id} size={32} />
              {p.name}
            </li>
          ))}
        </ul>
      </section>
      {unread.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-label-2">未読 {unread.length}人</h3>
          <ul className="space-y-2">
            {unread.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 text-[15px] text-label-2">
                <Avatar name={p.name} src={p.avatar} id={p.id} size={32} />
                {p.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ConversationInfo({
  open,
  onClose,
  summary,
  conversationId,
  members,
  online,
  onToggle,
  onOpenImage,
}: {
  open: boolean;
  onClose: () => void;
  summary: ConversationSummary | undefined;
  conversationId: string;
  members: PersonInfo[];
  online: Set<string>;
  onToggle: (patch: { muted?: boolean; pinned?: boolean }) => void;
  onOpenImage: (items: ViewerItem[], index: number) => void;
}) {
  const { data: media } = useMedia(`conversation:${conversationId}`);
  const photos = (media ?? []).filter((m) => m.mime_type.startsWith("image/"));
  if (!summary) return null;
  return (
    <Sheet open={open} onClose={onClose} title="トーク情報">
      <div className="space-y-5 px-4 pb-6">
        <div className="flex flex-col items-center pt-2 text-center">
          {summary.kind === "group" ? (
            <GroupAvatar name={summary.group_name} color={summary.group_color} size={72} />
          ) : (
            <Avatar name={summary.peer_name} src={summary.peer_avatar_url} id={summary.peer_id} size={72} />
          )}
          <p className="mt-2 text-[18px] font-semibold">{conversationTitle(summary)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onToggle({ muted: !summary.muted })} className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2 py-3 text-[12px] font-medium">
            {summary.muted ? <Bell className="size-5 text-accent" /> : <BellOff className="size-5 text-accent" />}
            {summary.muted ? "通知オン" : "通知オフ"}
          </button>
          <button type="button" onClick={() => onToggle({ pinned: !summary.pinned })} className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2 py-3 text-[12px] font-medium">
            {summary.pinned ? <PinOff className="size-5 text-accent" /> : <Pin className="size-5 text-accent" />}
            {summary.pinned ? "ピン解除" : "ピン留め"}
          </button>
          {summary.group_id ? (
            <Link href={`/groups/${summary.group_id}`} onClick={onClose} className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2 py-3 text-[12px] font-medium">
              <Users className="size-5 text-accent" />
              グループ
            </Link>
          ) : (
            <span className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2 py-3 text-[12px] font-medium text-label-3">
              <Users className="size-5" />
              個別トーク
            </span>
          )}
        </div>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-label-2">
            <Images className="size-4" aria-hidden />
            写真 {photos.length ? `(${photos.length})` : ""}
          </h3>
          {photos.length ? (
            <div className="grid grid-cols-4 gap-1 overflow-hidden rounded-xl">
              {photos.slice(0, 12).map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  aria-label="写真を表示"
                  onClick={() =>
                    onOpenImage(
                      photos.map((x) => ({ path: x.storage_path, thumb_path: x.thumb_path, name: x.file_name, created_at: x.created_at })),
                      i,
                    )
                  }
                >
                  <SignedImage path={p.thumb_path ?? p.storage_path} className="aspect-square" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-label-3">共有された写真はまだありません</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-label-2">メンバー {members.length}人</h3>
          <ul className="space-y-2">
            {members.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 text-[15px]">
                <Avatar name={p.name} src={p.avatar} id={p.id} size={32} online={online.has(p.id)} />
                <span className="flex-1 truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
