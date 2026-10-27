"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { unwrap } from "@/lib/queries";

export type FeedbackPost = {
  id: string;
  group_id: string;
  body: string;
  topic: string | null;
  like_count: number;
  reply_count: number;
  created_at: string;
  liked: boolean;
  mine: boolean;
};

export type FeedbackReply = {
  id: string;
  body: string;
  alias_no: number;
  like_count: number;
  created_at: string;
  liked: boolean;
  mine: boolean;
};

export type FeedbackThread = { post: FeedbackPost; replies: FeedbackReply[] };
export type FeedbackSort = "new" | "hot";

const PAGE = 30;

/** 匿名の呼び名。0 = スレ主、1 → 匿名A、2 → 匿名B … */
export function aliasLabel(n: number): string {
  if (n === 0) return "スレ主";
  let s = "";
  let v = n;
  while (v > 0) {
    v -= 1;
    s = String.fromCharCode(65 + (v % 26)) + s;
    v = Math.floor(v / 26);
  }
  return `匿名${s}`;
}

export function aliasInitial(n: number): string {
  return n === 0 ? "主" : aliasLabel(n).slice(2);
}

export function useFeedbackFeed(groupId: string, topic: string | null, sort: FeedbackSort) {
  return useInfiniteQuery({
    queryKey: ["feedback", groupId, topic, sort],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await getSupabase().rpc("list_feedback", {
          p_group_id: groupId,
          p_topic: topic ?? undefined,
          p_sort: sort,
          p_before: pageParam ?? undefined,
          p_limit: PAGE,
        }),
      ) as FeedbackPost[],
    getNextPageParam: (last) => (sort === "new" && last.length === PAGE ? last[last.length - 1].created_at : undefined),
  });
}

export function useFeedbackTopics(groupId: string) {
  return useQuery({
    queryKey: ["feedbackTopics", groupId],
    queryFn: async () => unwrap(await getSupabase().rpc("feedback_topics", { p_group_id: groupId })) as Array<{ topic: string; post_count: number }>,
  });
}

export function useFeedbackThread(postId: string) {
  return useQuery({
    queryKey: ["feedbackThread", postId],
    queryFn: async () => unwrap(await getSupabase().rpc("get_feedback_thread", { p_post_id: postId })) as unknown as FeedbackThread,
  });
}

/** Applies a like toggle immediately in every cached feed / thread, before the server answers. */
export function patchLike(client: QueryClient, kind: "post" | "reply", id: string, liked: boolean) {
  const delta = liked ? 1 : -1;
  const apply = <T extends { id: string; liked: boolean; like_count: number }>(item: T): T =>
    item.id === id ? { ...item, liked, like_count: Math.max(0, item.like_count + delta) } : item;
  if (kind === "post") {
    client.setQueriesData<{ pages: FeedbackPost[][]; pageParams: unknown[] }>({ queryKey: ["feedback"] }, (old) =>
      old ? { ...old, pages: old.pages.map((page) => page.map(apply)) } : old,
    );
  }
  client.setQueriesData<FeedbackThread>({ queryKey: ["feedbackThread"] }, (old) =>
    old ? { post: kind === "post" ? apply(old.post) : old.post, replies: kind === "reply" ? old.replies.map(apply) : old.replies } : old,
  );
}

export async function toggleLike(client: QueryClient, kind: "post" | "reply", id: string, currentlyLiked: boolean) {
  patchLike(client, kind, id, !currentlyLiked);
  const { error } = await getSupabase().rpc("toggle_feedback_like", { p_kind: kind, p_id: id });
  if (error) {
    patchLike(client, kind, id, currentlyLiked);
    throw error;
  }
}

export function useInvalidateFeedback() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["feedback"] });
    void client.invalidateQueries({ queryKey: ["feedbackThread"] });
    void client.invalidateQueries({ queryKey: ["feedbackTopics"] });
  };
}
