"use client";

import Link from "next/link";
import { Plus, Ticket, Users } from "lucide-react";
import { useAllMembers, useMyGroups } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { ROLE_LABEL } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { GroupAvatar } from "@/components/ui/avatar";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/empty-state";
import { ChevronRight } from "lucide-react";

export default function GroupsPage() {
  const { data: groups, isLoading, error, refetch } = useMyGroups();
  const { data: members } = useAllMembers();
  return (
    <>
      <PageHeader title="グループ" large />
      <PageBody className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <Link href="/groups/new" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-semibold text-accent-contrast">
            <Plus className="size-4" aria-hidden />
            グループを作成
          </Link>
          <Link href="/groups/join" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent-soft text-[15px] font-semibold text-accent">
            <Ticket className="size-4" aria-hidden />
            招待コードで参加
          </Link>
        </div>
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : !groups?.length ? (
          <EmptyState icon={<Users />} title="まだグループに参加していません" description="グループを作成するか、メンバーから共有された招待リンク・招待コードで参加しましょう。" />
        ) : (
          <ul className="space-y-2.5">
            {groups.map((g) => {
              const count = members?.filter((m) => m.group_id === g.id).length ?? 0;
              return (
                <li key={g.id}>
                  <Link href={`/groups/${g.id}`} className="block">
                    <Card className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 active:bg-surface-3">
                      <GroupAvatar name={g.name} color={g.color} icon={g.icon_path} size={52} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-semibold">{g.name}</p>
                        <p className="truncate text-[13px] text-label-3">
                          メンバー {count}人 ・ {ROLE_LABEL[g.my_role]}
                        </p>
                        {g.description && <p className="mt-0.5 truncate text-[13px] text-label-2">{g.description}</p>}
                      </div>
                      <ChevronRight className="size-4 text-label-4" aria-hidden />
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
