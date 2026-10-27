"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useTeams } from "@/lib/queries";
import { GroupAvatar } from "@/components/ui/avatar";

/** パート・バンド of a group, shown on the group page. */
export function TeamsSection({ groupId }: { groupId: string }) {
  const { data } = useTeams();
  const teams = (data ?? []).filter((t) => t.group_id === groupId).sort((a, b) => Number(b.mine) - Number(a.mine));
  return (
    <section aria-labelledby="teams-heading">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h3 id="teams-heading" className="text-[15px] font-bold">
          パート・バンド
        </h3>
        <span className="text-[12px] text-label-3">{teams.length ? `${teams.length}個` : ""}</span>
      </div>
      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {teams.map((t) => (
          <Link
            key={t.id}
            href={`/groups/${groupId}/teams/${t.id}`}
            className="flex w-[124px] shrink-0 flex-col items-start gap-2 rounded-[var(--radius-card)] bg-surface p-3 active:scale-[0.98]"
          >
            <GroupAvatar name={t.name} color={t.color} size={40} />
            <span className="w-full truncate text-[14px] font-semibold">{t.name}</span>
            <span className="text-[11px] text-label-3">
              {t.member_ids.length}人{t.mine && <span className="ml-1 font-semibold text-label">・参加中</span>}
            </span>
          </Link>
        ))}
        <Link
          href={`/groups/${groupId}/teams/new`}
          className="flex w-[124px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-dashed border-separator-strong p-3 text-[13px] font-semibold text-label-2"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-surface-3">
            <Plus className="size-5" aria-hidden />
          </span>
          作成
        </Link>
      </div>
      {!teams.length && <p className="mt-1 px-1 text-[12px] leading-relaxed text-label-3">パートやバンドごとに、専用のトークと予定を作れます。</p>}
    </section>
  );
}
