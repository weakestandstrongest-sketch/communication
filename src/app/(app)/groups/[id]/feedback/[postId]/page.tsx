"use client";

import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle, MoreHorizontal, SendHorizontal } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useMyGroups } from "@/lib/queries";
import { aliasLabel, toggleLike, useFeedbackThread, useInvalidateFeedback, type FeedbackReply } from "@/lib/feedback";
import { formatAgo, formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { PageHeader } from "@/components/layout/page-header";
import { ActionSheet } from "@/components/ui/sheet";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { AnonAvatar } from "@/components/feedback/anon-avatar";
import { LikeButton } from "@/components/feedback/post-card";
import { cn } from "@/lib/cn";

export default function FeedbackThreadPage() {
  const { id, postId } = useParams<{ id: string; postId: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const refresh = useInvalidateFeedback();
  const { data: groups } = useMyGroups();
  const isAdmin = (() => {
    const role = groups?.find((g) => g.id === id)?.my_role;
    return role === "owner" || role === "admin";
  })();
  const { data: thread, isLoading } = useFeedbackThread(postId);
  const [menu, setMenu] = useState<{ kind: "post" | "reply"; id: string; mine: boolean } | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const composing = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  const like = (kind: "post" | "reply", itemId: string, liked: boolean) =>
    void toggleLike(client, kind, itemId, liked).catch((e) => toast.show(errorMessage(e), "error"));

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const { error } = await getSupabase().rpc("create_feedback_reply", { p_post_id: postId, p_body: body });
    setSending(false);
    if (error) return toast.show(errorMessage(error), "error");
    setText("");
    refresh();
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 350);
  };

  const remove = async () => {
    if (!menu) return;
    const target = menu;
    const ok = await confirm({
      title: target.kind === "post" ? "この投稿を削除しますか？" : "この返信を削除しますか？",
      message: target.kind === "post" ? "返信やいいねもすべて削除され、元に戻せません。" : "元に戻せません。",
      confirmLabel: "削除",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await getSupabase().rpc("delete_feedback", { p_kind: target.kind, p_id: target.id });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("削除しました");
    refresh();
    if (target.kind === "post") router.replace(`/groups/${id}/feedback`);
  };

  if (isLoading) return (<><PageHeader title="スレッド" back={`/groups/${id}/feedback`} /><ListSkeleton rows={3} /></>);
  if (!thread) {
    return (
      <>
        <PageHeader title="スレッド" back={`/groups/${id}/feedback`} />
        <EmptyState title="投稿が見つかりません" description="削除されたか、閲覧する権限がありません。" />
      </>
    );
  }
  const { post, replies } = thread;

  return (
    <>
      <PageHeader title="スレッド" back={`/groups/${id}/feedback`} />
      <div className="mx-auto w-full max-w-3xl pb-[calc(88px+env(safe-area-inset-bottom))]">
        <article className="border-b border-separator px-4 pt-4 pb-3" aria-label="元の投稿">
          <div className="flex items-center gap-3">
            <AnonAvatar alias={0} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold">
                スレ主 {post.mine && <span className="ml-1 rounded-full bg-surface-3 px-1.5 py-px align-middle text-[11px] font-semibold text-label-2">あなた</span>}
              </p>
              <p className="text-[12px] text-label-3">{formatDateTime(post.created_at)}</p>
            </div>
            {(post.mine || isAdmin) && (
              <button type="button" aria-label="メニュー" onClick={() => setMenu({ kind: "post", id: post.id, mine: post.mine })} className="flex size-9 items-center justify-center rounded-full text-label-3 hover:bg-surface">
                <MoreHorizontal className="size-5" />
              </button>
            )}
          </div>
          {post.topic && <span className="mt-3 inline-block rounded-full bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-label-2">♪ {post.topic}</span>}
          <p className="mt-2.5 text-[17px] leading-relaxed whitespace-pre-wrap break-anywhere">{post.body}</p>
          <div className="-ml-2.5 mt-3 flex items-center gap-1 border-t border-separator pt-2">
            <LikeButton liked={post.liked} count={post.like_count} onToggle={() => like("post", post.id, post.liked)} />
            <span className="flex h-9 items-center gap-1.5 px-2.5 text-[13px] text-label-3 tabular">
              <MessageCircle className="size-[19px]" aria-hidden />
              {post.reply_count}
            </span>
          </div>
        </article>

        <section aria-label="返信" role="feed">
          {replies.length === 0 ? (
            <p className="px-6 py-12 text-center text-[14px] text-label-3">まだ返信はありません。最初の返信を書いてみましょう。</p>
          ) : (
            replies.map((r: FeedbackReply) => (
              <article key={r.id} className="flex gap-3 border-b border-separator px-4 py-3.5" aria-label={`${aliasLabel(r.alias_no)}の返信`}>
                <AnonAvatar alias={r.alias_no} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px]">
                    <span className={cn("font-bold", r.alias_no === 0 && "rounded-full bg-label px-2 py-px text-[12px] text-bg")}>{aliasLabel(r.alias_no)}</span>
                    {r.mine && <span className="rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-semibold text-label-2">あなた</span>}
                    <span className="text-label-3">・ {formatAgo(r.created_at)}</span>
                    {(r.mine || isAdmin) && (
                      <button type="button" aria-label="メニュー" onClick={() => setMenu({ kind: "reply", id: r.id, mine: r.mine })} className="-mr-2 ml-auto flex size-8 items-center justify-center rounded-full text-label-3 hover:bg-surface">
                        <MoreHorizontal className="size-[18px]" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-anywhere">{r.body}</p>
                  <div className="-ml-2.5 mt-1">
                    <LikeButton liked={r.liked} count={r.like_count} onToggle={() => like("reply", r.id, r.liked)} />
                  </div>
                </div>
              </article>
            ))
          )}
          <div ref={end} />
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-separator bg-bg pb-[max(8px,env(safe-area-inset-bottom))]">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 px-3 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="fb-reply">
            匿名で返信
          </label>
          <textarea
            id="fb-reply"
            value={text}
            rows={1}
            maxLength={600}
            onChange={(e) => setText(e.target.value)}
            onCompositionStart={() => (composing.current = true)}
            onCompositionEnd={() => (composing.current = false)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || composing.current || e.keyCode === 229) return;
              if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="匿名で返信…"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-[20px] bg-surface px-4 py-[9px] text-[16px] leading-[1.35] outline-none placeholder:text-label-3"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            aria-label="返信を送信"
            className={cn("mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full transition-all", text.trim() ? "bg-accent text-accent-contrast" : "bg-surface-3 text-label-4")}
          >
            <SendHorizontal className="size-5" />
          </button>
        </form>
      </div>

      <ActionSheet
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        actions={menu ? [{ label: menu.mine ? "自分の投稿を削除" : "管理者として削除", destructive: true, onSelect: () => void remove() }] : []}
      />
    </>
  );
}
