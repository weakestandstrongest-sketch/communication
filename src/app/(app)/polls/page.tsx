"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EyeOff, Plus, Vote } from "lucide-react";
import { isPollClosed, useMyGroups, usePolls } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatDeadline } from "@/lib/format";
import type { PollListItem } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Chips } from "@/components/ui/form";
import { GroupTag } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/use-now";

type Filter = "all" | "unanswered" | "answered" | "soon" | "closed";
const SOON_MS = 48 * 3600_000;

function matches(p: PollListItem, f: Filter, now: number) {
  const closed = isPollClosed(p);
  switch (f) {
    case "unanswered":
      return !closed && !p.responded;
    case "answered":
      return p.responded;
    case "soon":
      return !closed && Boolean(p.deadline) && new Date(p.deadline!).getTime() - now < SOON_MS;
    case "closed":
      return closed;
    default:
      return true;
  }
}

export default function PollsPage() {
  const { data, isLoading, error, refetch } = usePolls();
  const { data: groups } = useMyGroups();
  const [filter, setFilter] = useState<Filter>("unanswered");
  const [group, setGroup] = useState<string>("all");
  const now = useNow();

  const scoped = useMemo(() => (data ?? []).filter((p) => group === "all" || p.group_id === group), [data, group]);
  const counts = useMemo(
    () => ({
      unanswered: scoped.filter((p) => matches(p, "unanswered", now)).length,
      soon: scoped.filter((p) => matches(p, "soon", now)).length,
    }),
    [scoped, now],
  );
  const list = useMemo(() => {
    const filtered = scoped.filter((p) => matches(p, filter, now));
    if (filter === "unanswered" || filter === "soon") {
      return filtered.sort((a, b) => (a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity));
    }
    return filtered;
  }, [scoped, filter, now]);

  return (
    <>
      <PageHeader title="投票" large />
      <PageBody className="space-y-4">
        <Chips
          label="投票の絞り込み"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "すべて" },
            { value: "unanswered", label: "未回答", count: counts.unanswered },
            { value: "answered", label: "回答済み" },
            { value: "soon", label: "締切間近", count: counts.soon },
            { value: "closed", label: "終了" },
          ]}
        />
        {groups && groups.length > 1 && (
          <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="グループで絞り込み">
            {[{ id: "all", name: "全グループ", color: "slate" }, ...groups].map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={group === g.id}
                onClick={() => setGroup(g.id)}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3 text-[13px] font-medium",
                  group === g.id ? "bg-accent-soft text-accent" : "text-label-2 hover:bg-surface-3",
                )}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Vote />}
            title={filter === "unanswered" ? "未回答の投票はありません" : "該当する投票はありません"}
            description={filter === "unanswered" ? "新しい投票が作成されるとここに表示されます。" : undefined}
          />
        ) : (
          <ul className="space-y-2.5">
            {list.map((p) => (
              <li key={p.id}>
                <PollRow poll={p} />
              </li>
            ))}
          </ul>
        )}
      </PageBody>

      <Link
        href={group !== "all" ? `/polls/new?group=${group}` : "/polls/new"}
        aria-label="投票を作成"
        className="fixed right-4 bottom-[calc(94px+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[var(--shadow-float)] transition-transform active:scale-95 lg:right-8 lg:bottom-8"
      >
        <Plus className="size-7" strokeWidth={2.4} aria-hidden />
      </Link>
    </>
  );
}

function PollRow({ poll: p }: { poll: PollListItem }) {
  const now = useNow();
  const closed = isPollClosed(p);
  const soon = !closed && p.deadline && new Date(p.deadline).getTime() - now < SOON_MS;
  const eligible = Number(p.eligible_count);
  return (
    <Link href={`/polls/${p.id}`} className="block">
      <Card className="px-4 py-3.5 transition-colors hover:bg-surface-2 active:bg-surface-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <GroupTag name={p.group_name} color={p.group_color} />
            <p className="mt-1 text-[16px] leading-snug font-semibold break-anywhere">{p.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-label-3">
              <span>{p.creator_name ?? "退会したメンバー"}</span>
              <span>{formatDate(p.created_at)}作成</span>
              {p.anonymous && (
                <span className="inline-flex items-center gap-0.5">
                  <EyeOff className="size-3" aria-hidden />
                  匿名
                </span>
              )}
            </p>
          </div>
          {p.responded ? <Pill tone="success">回答済み</Pill> : closed ? <Pill>終了</Pill> : <Pill tone="danger">未回答</Pill>}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${eligible ? Math.min(100, (p.response_count / eligible) * 100) : 0}%` }} />
          </div>
          <span className="shrink-0 text-[12px] text-label-2 tabular">
            {p.response_count}/{eligible}人
          </span>
          <span className={cn("shrink-0 text-[12px] tabular", soon ? "font-semibold text-danger" : "text-label-3")}>
            {closed ? "締切済み" : formatDeadline(p.deadline)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
