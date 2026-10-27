"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, addMonths, addWeeks, differenceInCalendarMonths, format, isValid, parseISO, startOfDay } from "date-fns";
import { ja } from "date-fns/locale";
import { Lock, MapPin, Plus } from "lucide-react";
import { isPollClosed, needsAttendance, useEvents, useMyAttendance, useMyGroups, usePolls } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatTime, toLocalDateInputValue } from "@/lib/format";
import { holidayName } from "@/lib/holidays";
import { useNow } from "@/lib/use-now";
import { ATTENDANCE_LABEL, CATEGORY_COLOR, type AttendanceStatus, type EventRow } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { GroupTag } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/form";
import { ErrorState, ListSkeleton } from "@/components/ui/empty-state";
import { MonthCalendar, type ZoomLevel } from "@/components/calendar/month-calendar";
import { DayTimeline } from "@/components/calendar/day-timeline";
import { cn } from "@/lib/cn";

type Mode = "calendar" | "timeline";

function eventDays(e: EventRow) {
  const start = startOfDay(new Date(e.starts_at));
  const end = startOfDay(new Date(e.ends_at ?? e.starts_at));
  const days: Date[] = [];
  for (let d = start; d <= end && days.length < 62; d = addDays(d, 1)) days.push(d);
  return days;
}

/** 7:00〜24:00 のうち、予定が入っていない時間（分） */
function freeMinutes(day: Date, events: EventRow[]) {
  const from = new Date(day).setHours(7, 0, 0, 0);
  const to = new Date(day).setHours(24, 0, 0, 0);
  const spans = events
    .filter((e) => !e.all_day && !e.canceled_at)
    .map((e) => [Math.max(from, new Date(e.starts_at).getTime()), Math.min(to, new Date(e.ends_at ?? new Date(e.starts_at).getTime() + 3600_000).getTime())] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let busy = 0;
  let cursor = from;
  for (const [a, b] of spans) {
    const s = Math.max(a, cursor);
    if (b > s) {
      busy += b - s;
      cursor = b;
    }
  }
  return Math.round((to - from - busy) / 60000);
}

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}

function CalendarView() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: events, isLoading, error, refetch } = useEvents();
  const { data: groups } = useMyGroups();
  const { data: mine } = useMyAttendance();
  const { data: polls } = usePolls();
  const now = useNow();
  const [mode, setMode] = useState<Mode>("calendar");
  const [zoom, setZoom] = useState<ZoomLevel>(0);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [dir, setDir] = useState<1 | -1>(1);
  const [group, setGroup] = useState("all");

  // `/calendar?date=2026-10-27` (e.g. right after creating an event) opens the calendar on that day.
  // The route stays mounted between visits, so react to the parameter changing, not only to the first render.
  const dateParam = params.get("date");
  const [seenDate, setSeenDate] = useState<string | null>(null);
  if (dateParam && dateParam !== seenDate) {
    setSeenDate(dateParam);
    const d = parseISO(dateParam);
    if (isValid(d)) {
      setMode("calendar");
      setDir(differenceInCalendarMonths(d, cursor) >= 0 ? 1 : -1);
      setCursor(d);
      setSelected(startOfDay(d));
    }
  } else if (!dateParam && seenDate) {
    setSeenDate(null);
  }
  // Drop the parameter once applied, so creating another event on the same day jumps there again.
  useEffect(() => {
    if (dateParam) router.replace("/calendar", { scroll: false });
  }, [dateParam, router]);

  const groupById = useMemo(() => new Map((groups ?? []).map((g) => [g.id, g])), [groups]);
  const filtered = useMemo(
    () => (events ?? []).filter((e) => (group === "all" ? true : group === "personal" ? Boolean(e.personal_user_id) : e.group_id === group)),
    [events, group],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of filtered) {
      for (const d of eventDays(e)) {
        const key = d.toDateString();
        map.set(key, [...(map.get(key) ?? []), e]);
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [filtered]);

  const openPolls = useMemo(() => (polls ?? []).filter((p) => (group === "all" || p.group_id === group) && !p.responded && !isPollClosed(p)), [polls, group]);
  const pending = useMemo(() => {
    const items: Array<{ key: string; href: string; label: string; sub: string; kind: "poll" | "event"; urgent: boolean; sort: number }> = [];
    for (const p of openPolls) {
      const due = p.deadline ? new Date(p.deadline).getTime() : Infinity;
      items.push({
        key: `p-${p.id}`,
        href: `/polls/${p.id}`,
        label: p.title,
        sub: p.deadline ? format(new Date(p.deadline), "M/d H:mm") + "まで" : "投票",
        kind: "poll",
        urgent: due - now < 86400000,
        sort: due,
      });
    }
    for (const e of filtered) {
      if (!needsAttendance(e, mine)) continue;
      const due = new Date(e.rsvp_deadline ?? e.starts_at).getTime();
      items.push({ key: `e-${e.id}`, href: `/events/${e.id}`, label: e.title, sub: `出欠 ${format(new Date(e.starts_at), "M/d")}`, kind: "event", urgent: due - now < 2 * 86400000, sort: due });
    }
    return items.sort((a, b) => a.sort - b.sort);
  }, [openPolls, filtered, mine, now]);

  // --- navigation ---------------------------------------------------------
  const moveMonth = (delta: 1 | -1) => {
    // The selection moves to the same day of the next/previous month (clamped to the month's end).
    const next = addMonths(selected, delta);
    setDir(delta);
    setCursor(next);
    setSelected(next);
  };
  const goToday = () => {
    const t = new Date();
    setDir(differenceInCalendarMonths(t, cursor) >= 0 ? 1 : -1);
    setCursor(t);
    setSelected(startOfDay(t));
  };
  const selectDay = (d: Date) => {
    const diff = differenceInCalendarMonths(d, cursor);
    if (diff !== 0) {
      setDir(diff > 0 ? 1 : -1);
      setCursor(d);
    }
    setSelected(startOfDay(d));
  };
  const moveDay = (delta: 1 | -1) => {
    setDir(delta);
    const next = addDays(selected, delta);
    setSelected(next);
    setCursor(next);
  };
  const moveWeek = (delta: 1 | -1) => {
    setDir(delta);
    const next = addWeeks(selected, delta);
    setSelected(next);
    setCursor(next);
  };
  const addHref = `/events/new?date=${toLocalDateInputValue(selected)}${group !== "all" ? `&group=${group}` : ""}`;

  const selectedEvents = byDay.get(selected.toDateString()) ?? [];
  const free = freeMinutes(selected, selectedEvents);
  const holiday = holidayName(selected);

  return (
    <>
      <PageHeader title="予定" large />
      <PageBody className="space-y-4">
        <Segmented
          label="表示切替"
          value={mode}
          onChange={setMode}
          options={[
            { value: "calendar", label: "カレンダー" },
            { value: "timeline", label: "タイムライン" },
          ]}
        />
        {groups && (
          <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="絞り込み">
            {[{ id: "all", name: "すべて" }, ...groups, { id: "personal", name: "個人" }].map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={group === g.id}
                onClick={() => setGroup(g.id)}
                className={cn("h-8 shrink-0 rounded-full px-3 text-[13px] font-medium", group === g.id ? "bg-label text-bg" : "bg-surface text-label-2")}
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
        ) : mode === "calendar" ? (
          <>
            <MonthCalendar cursor={cursor} dir={dir} zoom={zoom} selected={selected} byDay={byDay} onZoom={setZoom} onSelect={selectDay} onMove={moveMonth} onToday={goToday} />
            <section aria-label={`${format(selected, "M月d日")}の予定`}>
              <div className="mb-2 flex items-baseline gap-2 px-1">
                <h3 className="text-[18px] font-bold">{format(selected, "M月d日(E)", { locale: ja })}</h3>
                {holiday && <span className="text-[12px] font-bold text-danger">{holiday}</span>}
                <span className="ml-auto text-[12px] text-label-3">
                  予定 {selectedEvents.length}件 ・ 空き {Math.floor(free / 60)}時間{free % 60 ? `${free % 60}分` : ""}
                </span>
              </div>
              {selectedEvents.length === 0 ? (
                <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-surface px-4 py-3.5">
                  <span className="text-[14px] text-label-3">この日の予定はありません</span>
                  <Link href={addHref} className="text-[14px] font-semibold">
                    追加
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {selectedEvents.map((e) => (
                    <DayRow key={e.id} event={e} group={e.group_id ? groupById.get(e.group_id) : undefined} status={mine?.get(e.id) as AttendanceStatus | undefined} />
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <DayTimeline
            date={selected}
            dir={dir}
            byDay={byDay}
            polls={openPolls}
            pending={pending}
            myAttendance={mine as Map<string, AttendanceStatus> | undefined}
            groupName={(id) => (id ? (groupById.get(id)?.name ?? "") : "個人の予定")}
            onSelect={selectDay}
            onMoveDay={moveDay}
            onMoveWeek={moveWeek}
            onAdd={() => router.push(addHref)}
          />
        )}
      </PageBody>

      <Link
        href={addHref}
        aria-label="予定を追加"
        className="fixed right-4 bottom-[calc(94px+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[var(--shadow-float)] transition-transform active:scale-95 lg:right-8 lg:bottom-8"
      >
        <Plus className="size-7" strokeWidth={2.4} aria-hidden />
      </Link>
    </>
  );
}

function DayRow({ event: e, group, status }: { event: EventRow; group?: { name: string; color: string }; status?: AttendanceStatus }) {
  const now = useNow();
  return (
    <li>
      <Link href={`/events/${e.id}`} className="flex items-stretch gap-3 rounded-[var(--radius-card)] bg-surface px-3 py-3 transition-colors active:bg-surface-3">
        <span className="w-1 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[15px] font-semibold", e.canceled_at && "line-through opacity-60")}>{e.title}</p>
          <p className="text-[13px] text-label-2 tabular">{e.all_day ? "終日" : `${formatTime(e.starts_at)}${e.ends_at ? `〜${formatTime(e.ends_at)}` : "〜"}`}</p>
          {e.location && (
            <p className="flex items-center gap-1 truncate text-[12px] text-label-3">
              <MapPin className="size-3 shrink-0" aria-hidden />
              {e.location}
            </p>
          )}
          {group ? <GroupTag name={group.name} color={group.color} className="mt-0.5" /> : e.personal_user_id && <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-label-2"><Lock className="size-3" aria-hidden />個人の予定</span>}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-center">
          {e.canceled_at ? (
            <Pill tone="danger">中止</Pill>
          ) : e.rsvp_enabled ? (
            status ? (
              <Pill tone={status === "going" ? "success" : status === "maybe" ? "warning" : "neutral"}>{ATTENDANCE_LABEL[status]}</Pill>
            ) : new Date(e.starts_at).getTime() > now ? (
              <Pill tone="danger">未回答</Pill>
            ) : null
          ) : null}
        </div>
      </Link>
    </li>
  );
}
