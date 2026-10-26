"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { GroupAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["invite-preview", code],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("preview_invite", { p_code: code });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const join = async () => {
    setJoining(true);
    const { data: groupId, error } = await getSupabase().rpc("join_group", { p_code: code });
    setJoining(false);
    if (error || !groupId) return toast.show(errorMessage(error), "error");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.groups }),
      queryClient.invalidateQueries({ queryKey: qk.members }),
      queryClient.invalidateQueries({ queryKey: qk.conversations }),
      queryClient.invalidateQueries({ queryKey: qk.polls }),
      queryClient.invalidateQueries({ queryKey: qk.events }),
      queryClient.invalidateQueries({ queryKey: qk.announcements }),
    ]);
    toast.show("グループに参加しました");
    router.replace(`/groups/${groupId}`);
  };

  return (
    <>
      <PageHeader title="グループへの招待" back="/groups" />
      <PageBody>
        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : error || !data ? (
          <EmptyState
            title="招待が見つかりません"
            description={error ? errorMessage(error) : "招待コードが間違っているか、無効になっています。グループの管理者に新しい招待リンクを確認してください。"}
            action={
              <Link href="/groups/join" className="inline-flex h-11 items-center rounded-xl bg-accent-soft px-5 text-[15px] font-semibold text-accent">
                コードを入力し直す
              </Link>
            }
          />
        ) : (
          <Card className="mx-auto max-w-sm px-6 py-8 text-center">
            <div className="flex justify-center">
              <GroupAvatar name={data.name} color={data.color} size={88} />
            </div>
            <h2 className="mt-4 text-[22px] font-bold">{data.name}</h2>
            <p className="mt-1 text-[14px] text-label-3">メンバー {Number(data.member_count)}人</p>
            {data.description && <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-wrap text-label-2">{data.description}</p>}
            <div className="mt-6">
              {data.already_member ? (
                <Link href={`/groups/${data.group_id}`} className="flex h-[52px] items-center justify-center rounded-2xl bg-accent-soft text-[16px] font-semibold text-accent">
                  参加済みです ・ グループを開く
                </Link>
              ) : (
                <Button block size="lg" loading={joining} onClick={join}>
                  このグループに参加する
                </Button>
              )}
            </div>
          </Card>
        )}
      </PageBody>
    </>
  );
}
