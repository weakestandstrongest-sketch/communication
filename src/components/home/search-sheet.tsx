"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, Megaphone, Search, Users, Vote } from "lucide-react";
import { useAllMembers, useAnnouncements, useEvents, useMyGroups, usePolls } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { Input } from "@/components/ui/form";

/** グループ・メンバー・投票・予定・お知らせをまとめて検索（読み込み済みのデータから絞り込み） */
export function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const { data: groups } = useMyGroups();
  const { data: members } = useAllMembers();
  const { data: polls } = usePolls();
  const { data: events } = useEvents();
  const { data: announcements } = useAnnouncements();
  const term = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (!term) return null;
    const has = (s: string | null | undefined) => (s ?? "").toLowerCase().includes(term);
    const seen = new Set<string>();
    return {
      groups: (groups ?? []).filter((g) => has(g.name) || has(g.description)).slice(0, 5),
      people: (members ?? [])
        .filter((m) => m.profile && has(m.profile.display_name) && !seen.has(m.user_id) && seen.add(m.user_id))
        .slice(0, 6),
      polls: (polls ?? []).filter((p) => has(p.title)).slice(0, 5),
      events: (events ?? []).filter((e) => has(e.title) || has(e.location)).slice(0, 5),
      announcements: (announcements ?? []).filter((a) => has(a.title) || has(a.body)).slice(0, 5),
    };
  }, [term, groups, members, polls, events, announcements]);

  const empty = results && Object.values(results).every((list) => list.length === 0);
  const row = "flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2 active:bg-surface-3";
  const heading = "px-3 pt-3 pb-1 text-[12px] font-semibold text-label-3";

  return (
    <Sheet open={open} onClose={onClose} title="検索" size="md">
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-label-3" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="グループ、メンバー、投票、予定、お知らせ" aria-label="検索" type="search" className="pl-10" data-autofocus />
        </div>
      </div>
      <div className="min-h-[40vh] px-2 pb-6" onClick={(e) => (e.target as HTMLElement).closest("a") && onClose()}>
        {!results ? (
          <p className="px-6 py-10 text-center text-[14px] text-label-3">キーワードを入力してください</p>
        ) : empty ? (
          <p className="px-6 py-10 text-center text-[14px] text-label-3">「{q}」に一致するものはありません</p>
        ) : (
          <>
            {results.groups.length > 0 && <h3 className={heading}>グループ</h3>}
            {results.groups.map((g) => (
              <Link key={g.id} href={`/groups/${g.id}`} className={row}>
                <GroupAvatar name={g.name} color={g.color} icon={g.icon_path} size={36} />
                <span className="truncate text-[15px] font-medium">{g.name}</span>
              </Link>
            ))}
            {results.people.length > 0 && <h3 className={heading}>メンバー</h3>}
            {results.people.map((m) => (
              <Link key={m.user_id} href={`/groups/${m.group_id}`} className={row}>
                <Avatar name={m.profile?.display_name} src={m.profile?.avatar_url} id={m.user_id} size={36} />
                <span className="truncate text-[15px] font-medium">{m.profile?.display_name}</span>
                <Users className="ml-auto size-4 text-label-4" aria-hidden />
              </Link>
            ))}
            {results.polls.length > 0 && <h3 className={heading}>投票</h3>}
            {results.polls.map((p) => (
              <Link key={p.id} href={`/polls/${p.id}`} className={row}>
                <Vote className="size-5 shrink-0 text-label-2" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{p.title}</span>
                  <span className="block truncate text-[12px] text-label-3">{p.group_name}</span>
                </span>
              </Link>
            ))}
            {results.events.length > 0 && <h3 className={heading}>予定</h3>}
            {results.events.map((e) => (
              <Link key={e.id} href={`/events/${e.id}`} className={row}>
                <CalendarDays className="size-5 shrink-0 text-label-2" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{e.title}</span>
                  <span className="block truncate text-[12px] text-label-3">{formatDate(e.starts_at, true)}</span>
                </span>
              </Link>
            ))}
            {results.announcements.length > 0 && <h3 className={heading}>お知らせ</h3>}
            {results.announcements.map((a) => (
              <Link key={a.id} href={`/announcements/${a.id}`} className={row}>
                <Megaphone className="size-5 shrink-0 text-label-2" aria-hidden />
                <span className="truncate text-[15px] font-medium">{a.title}</span>
              </Link>
            ))}
          </>
        )}
      </div>
    </Sheet>
  );
}
