"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, MoreHorizontal } from "lucide-react";
import { formatAgo } from "@/lib/format";
import { toggleLike, type FeedbackPost } from "@/lib/feedback";
import { errorMessage } from "@/lib/errors";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { AnonAvatar } from "./anon-avatar";

export function LikeButton({ liked, count, onToggle, label = "いいね" }: { liked: boolean; count: number; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={liked}
      aria-label={`${label} ${count}件${liked ? "、いいね済み" : ""}`}
      className={cn("flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] tabular transition-transform active:scale-90", liked ? "text-danger" : "text-label-3")}
    >
      <Heart className={cn("size-[19px] transition-transform", liked && "scale-110 fill-current")} aria-hidden />
      {count > 0 && count}
    </button>
  );
}

/** A post in the feed (Threads / X style). Tapping it opens the thread. */
export function PostCard({ post, groupId, onMenu }: { post: FeedbackPost; groupId: string; onMenu?: (p: FeedbackPost) => void }) {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const href = `/groups/${groupId}/feedback/${post.id}`;
  return (
    <article
      onClick={() => router.push(href)}
      className="flex cursor-pointer gap-3 border-b border-separator px-4 py-3.5 transition-colors active:bg-surface"
      aria-label="匿名の意見"
    >
      <AnonAvatar className={post.mine ? "ring-2 ring-offset-2 ring-label ring-offset-bg" : ""} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="font-bold">匿名</span>
          {post.mine && <span className="rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-semibold text-label-2">あなた</span>}
          <span className="text-label-3">・ {formatAgo(post.created_at)}</span>
          {onMenu && (
            <button
              type="button"
              aria-label="メニュー"
              onClick={(e) => {
                e.stopPropagation();
                onMenu(post);
              }}
              className="-mr-2 ml-auto flex size-8 items-center justify-center rounded-full text-label-3 hover:bg-surface"
            >
              <MoreHorizontal className="size-[18px]" />
            </button>
          )}
        </div>
        {post.topic && (
          <Link href={`/groups/${groupId}/feedback?topic=${encodeURIComponent(post.topic)}`} onClick={(e) => e.stopPropagation()} className="mt-1 inline-block rounded-full bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-label-2">
            ♪ {post.topic}
          </Link>
        )}
        <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap break-anywhere">{post.body}</p>
        <div className="-ml-2.5 mt-1.5 flex items-center gap-1">
          <LikeButton
            liked={post.liked}
            count={post.like_count}
            onToggle={() => void toggleLike(client, "post", post.id, post.liked).catch((e) => toast.show(errorMessage(e), "error"))}
          />
          <span className="flex h-9 items-center gap-1.5 px-2.5 text-[13px] text-label-3 tabular" aria-label={`返信 ${post.reply_count}件`}>
            <MessageCircle className="size-[19px]" aria-hidden />
            {post.reply_count > 0 && post.reply_count}
          </span>
        </div>
      </div>
    </article>
  );
}
