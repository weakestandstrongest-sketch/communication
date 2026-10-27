"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { MessageSquareQuote, PenLine, ShieldCheck } from "lucide-react";
import { useMyGroups } from "@/lib/queries";
import { useFeedbackFeed, useFeedbackTopics, useInvalidateFeedback, type FeedbackPost, type FeedbackSort } from "@/lib/feedback";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Segmented } from "@/components/ui/form";
import { ActionSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { PostCard } from "@/components/feedback/post-card";
import { ComposeSheet } from "@/components/feedback/compose-sheet";
import { AnonAvatar } from "@/components/feedback/anon-avatar";
import { cn } from "@/lib/cn";

export default function FeedbackPage() {
  return (
    <Suspense>
      <Feed />
    </Suspense>
  );
}

function Feed() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const topic = params.get("topic");
  const toast = useToast();
  const confirm = useConfirm();
  const refresh = useInvalidateFeedback();
  const { data: groups } = useMyGroups();
  const group = groups?.find((g) => g.id === id);
  const isAdmin = group?.my_role === "owner" || group?.my_role === "admin";
  const [sort, setSort] = useState<FeedbackSort>("new");
  const [compose, setCompose] = useState(false);
  const [menuFor, setMenuFor] = useState<FeedbackPost | null>(null);
  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeedbackFeed(id, topic, sort);
  const { data: topics } = useFeedbackTopics(id);
  const posts = data?.pages.flat() ?? [];

  const setTopic = (t: string | null) => router.replace(t ? `/groups/${id}/feedback?topic=${encodeURIComponent(t)}` : `/groups/${id}/feedback`, { scroll: false });

  const remove = async (p: FeedbackPost) => {
    const ok = await confirm({
      title: p.mine ? "この投稿を削除しますか？" : "この投稿を管理者として削除しますか？",
      message: "返信やいいねもすべて削除され、元に戻せません。",
      confirmLabel: "削除",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await getSupabase().rpc("delete_feedback", { p_kind: "post", p_id: p.id });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("投稿を削除しました");
    refresh();
  };

  return (
    <>
      <PageHeader title="意見箱" subtitle={group?.name} back={`/groups/${id}`} />
      <div className="mx-auto w-full max-w-3xl pb-tabbar lg:pb-10">
        <div className="flex items-start gap-2 px-4 pt-3 pb-1 text-[12px] leading-relaxed text-label-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          投稿者は誰にも（管理者にも）表示されません。曲の感想や練習の改善点など、言いにくいことも気軽に。
        </div>

        <button type="button" onClick={() => setCompose(true)} className="flex w-full items-center gap-3 border-b border-separator px-4 py-3.5 text-left">
          <AnonAvatar />
          <span className="flex-1 text-[15px] text-label-3">いま思っていることを匿名で</span>
          <span className="flex h-8 items-center gap-1 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-accent-contrast">
            <PenLine className="size-3.5" aria-hidden />
            投稿
          </span>
        </button>

        <div className="space-y-2.5 border-b border-separator px-4 py-3">
          <Segmented
            label="並び順"
            value={sort}
            onChange={setSort}
            options={[
              { value: "new", label: "新着" },
              { value: "hot", label: "盛り上がり" },
            ]}
          />
          {(topics?.length ?? 0) > 0 || topic ? (
            <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="お題で絞り込み">
              <button type="button" role="tab" aria-selected={!topic} onClick={() => setTopic(null)} className={cn("h-8 shrink-0 rounded-full px-3 text-[13px] font-medium", !topic ? "bg-label text-bg" : "bg-surface text-label-2")}>
                すべて
              </button>
              {[...(topic && !topics?.some((t) => t.topic === topic) ? [{ topic, post_count: 0 }] : []), ...(topics ?? [])].map((t) => (
                <button
                  key={t.topic}
                  type="button"
                  role="tab"
                  aria-selected={topic === t.topic}
                  onClick={() => setTopic(t.topic)}
                  className={cn("h-8 shrink-0 rounded-full px-3 text-[13px] font-medium", topic === t.topic ? "bg-label text-bg" : "bg-surface text-label-2")}
                >
                  ♪ {t.topic}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<MessageSquareQuote />}
            title={topic ? `「${topic}」の意見はまだありません` : "まだ意見はありません"}
            description="最初の一言を、匿名で投稿してみましょう。"
            action={
              <Button onClick={() => setCompose(true)} icon={<PenLine className="size-4" />}>
                匿名で投稿する
              </Button>
            }
          />
        ) : (
          <>
            <div role="feed" aria-label="匿名の意見">
              {posts.map((p) => (
                <PostCard key={p.id} post={p} groupId={id} onMenu={p.mine || isAdmin ? setMenuFor : undefined} />
              ))}
            </div>
            {hasNextPage && (
              <div className="flex justify-center py-5">
                <Button variant="secondary" size="sm" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                  もっと見る
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <ComposeSheet open={compose} onClose={() => setCompose(false)} groupId={id} initialTopic={topic} onPosted={(postId) => router.push(`/groups/${id}/feedback/${postId}`)} />
      <ActionSheet
        open={Boolean(menuFor)}
        onClose={() => setMenuFor(null)}
        actions={menuFor ? [{ label: menuFor.mine ? "自分の投稿を削除" : "管理者として削除", destructive: true, onSelect: () => void remove(menuFor) }] : []}
      />
    </>
  );
}
