"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react";
import { useEvents, useMyAttendance, useMyGroups } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatTime, toLocalDateInputValue } from "@/lib/format";
import { ATTENDANCE_LABEL, CATEGORY_COLOR, type AttendanceStatus, type EventRow } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { GroupTag } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/form";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/use-now";

type View = "month" | "week" | "agenda";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function eventDays(e: EventRow) {
  const start = startOfDay(new Date(e.starts_at));
  const end = startOfDay(new Date(e.ends_at ?? e.starts_at));
  const days: Date[] = [];
  for (let d = start; d <= end && days.length < 62; d = addDays(d, 1)) days.push(d);
  return days;
}

export default function CalendarPage() {
  const { data: events, isLoading, error, refetch } = useEvents();
  const { data: groups } = useMyGroups();
  const { data: mine } = useMyAttendance();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [group, setGroup] = useState("all");

  const groupById = useMemo(() => new Map((groups ?? []).map((g) => [g.id, g])), [groups]);
  const filtered = useMemo(() => (events ?? []).filter((e) => group === "all" || e.group_id === group), [events, group]);
  const byDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of filtered) {
      for (const d of eventDays(e)) {
        const key = d.toDateString();
        map.set(key, [...(map.get(key) ?? []), e]);
      }
    }
    return map;
  }, [filtered]);

  const move = (dir: 1 | -1) => setCursor((c) => (view === "week" ? addWeeks(c, dir) : addMonths(c, dir)));
  const goToday = () => {
    setCursor(new Date());
    setSelected(startOfDay(new Date()));
  };

  const title = view === "week"
    ? `${format(startOfWeek(cursor), "M月d日")} 〜 ${format(endOfWeek(cursor), "M月d日")}`
    : format(cursor, "yyyy年M月", { locale: ja });

  const row = (e: EventRow) => <EventRowItem key={e.id} event={e} group={groupById.get(e.group_id)} status={mine?.get(e.id) as AttendanceStatus | undefined} />;

  return (
    <>
      <PageHeader
        title="カレンダー"
        large
        actions={
          <Link
            href={`/events/new?date=${toLocalDateInputValue(selected)}`}
            className="flex h-9 items-center gap-1 rounded-full bg-accent px-3.5 text-[14px] font-semibold text-accent-contrast"
            aria-label="予定を作成"
          >
            <Plus className="size-4" aria-hidden />
            予定
          </Link>
        }
      />
      <PageBody className="space-y-4">
        <Segmented
          label="表示切替"
          value={view}
          onChange={setView}
          options={[
            { value: "month", label: "月" },
            { value: "week", label: "週" },
            { value: "agenda", label: "リスト" },
          ]}
        />
        {groups && groups.length > 1 && (
          <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="グループで絞り込み">
            {[{ id: "all", name: "全グループ" }, ...groups].map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={group === g.id}
                onClick={() => setGroup(g.id)}
                className={cn("h-8 shrink-0 rounded-full px-3 text-[13px] font-medium", group === g.id ? "bg-accent-soft text-accent" : "text-label-2 hover:bg-surface-3")}
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
        ) : view === "agenda" ? (
          <Agenda events={filtered} renderRow={row} />
        ) : (
          <>
            <div className="flex items-center gap-1">
              <h2 className="flex-1 text-[19px] font-bold">{title}</h2>
              <button type="button" onClick={goToday} className="h-8 rounded-full px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft">
                今日
              </button>
              <IconButton label={view === "week" ? "前の週" : "前の月"} onClick={() => move(-1)} tone="accent">
                <ChevronLeft className="size-5" />
              </IconButton>
              <IconButton label={view === "week" ? "次の週" : "次の月"} onClick={() => move(1)} tone="accent">
                <ChevronRight className="size-5" />
              </IconButton>
            </div>
            {view === "month" ? (
              <MonthGrid cursor={cursor} selected={selected} onSelect={setSelected} byDay={byDay} />
            ) : (
              <WeekList cursor={cursor} byDay={byDay} renderRow={row} />
            )}
            {view === "month" && (
              <section aria-label={`${format(selected, "M月d日")}の予定`}>
                <h3 className="mb-2 px-1 text-[13px] font-semibold text-label-2">{format(selected, "M月d日(E)", { locale: ja })}の予定</h3>
                {(byDay.get(selected.toDateString()) ?? []).length === 0 ? (
                  <Card className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-[14px] text-label-3">予定はありません</span>
                    <Link href={`/events/new?date=${toLocalDateInputValue(selected)}`} className="text-[14px] font-semibold text-accent">
                      追加
                    </Link>
                  </Card>
                ) : (
                  <ul className="space-y-2">{byDay.get(selected.toDateString())!.map(row)}</ul>
                )}
              </section>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

function MonthGrid({
  cursor,
  selected,
  onSelect,
  byDay,
}: {
  cursor: Date;
  selected: Date;
  onSelect: (d: Date) => void;
  byDay: Map<string, EventRow[]>;
}) {
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return (
    <Card className="overflow-hidden p-2">
      <div className="grid grid-cols-7 pb-1" aria-hidden>
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn("py-1 text-center text-[11px] font-semibold", i === 0 ? "text-danger" : i === 6 ? "text-accent" : "text-label-3")}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" role="grid" aria-label={format(cursor, "yyyy年M月")}>
        {days.map((d) => {
          const list = byDay.get(d.toDateString()) ?? [];
          const isSel = isSameDay(d, selected);
          const inMonth = isSameMonth(d, cursor);
          return (
            <button
              key={d.toISOString()}
              type="button"
              role="gridcell"
              aria-selected={isSel}
              aria-label={`${format(d, "M月d日")}${list.length ? `、予定${list.length}件` : ""}`}
              onClick={() => onSelect(d)}
              className={cn(
                "flex min-h-[58px] flex-col items-center rounded-xl pt-1 pb-1.5 transition-colors sm:min-h-[76px]",
                isSel ? "bg-accent-soft" : "hover:bg-surface-2",
                !inMonth && "opacity-35",
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-[14px] tabular",
                  isToday(d) && "bg-accent font-bold text-accent-contrast",
                  !isToday(d) && d.getDay() === 0 && "text-danger",
                  !isToday(d) && d.getDay() === 6 && "text-accent",
                )}
              >
                {d.getDate()}
              </span>
              <span className="mt-1 hidden w-full space-y-0.5 px-0.5 sm:block">
                {list.slice(0, 2).map((e) => (
                  <span
                    key={e.id}
                    className={cn("block truncate rounded px-1 text-left text-[10px] font-medium text-white", e.canceled_at && "line-through opacity-60")}
                    style={{ background: CATEGORY_COLOR[e.category] }}
                  >
                    {e.title}
                  </span>
                ))}
                {list.length > 2 && <span className="block text-[10px] text-label-3">+{list.length - 2}</span>}
              </span>
              <span className="mt-1 flex gap-0.5 sm:hidden" aria-hidden>
                {list.slice(0, 3).map((e) => (
                  <span key={e.id} className="size-1.5 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function WeekList({ cursor, byDay, renderRow }: { cursor: Date; byDay: Map<string, EventRow[]>; renderRow: (e: EventRow) => React.ReactNode }) {
  const start = startOfWeek(cursor);
  return (
    <div className="space-y-3">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
        const list = byDay.get(d.toDateString()) ?? [];
        return (
          <section key={d.toISOString()} aria-label={format(d, "M月d日")}>
            <h3 className={cn("mb-1.5 flex items-center gap-2 px-1 text-[13px] font-semibold", isToday(d) ? "text-accent" : "text-label-2")}>
              {format(d, "M/d(E)", { locale: ja })}
              {isToday(d) && <Pill tone="accent">今日</Pill>}
            </h3>
            {list.length ? <ul className="space-y-2">{list.map(renderRow)}</ul> : <p className="px-1 text-[13px] text-label-4">予定なし</p>}
          </section>
        );
      })}
    </div>
  );
}

function Agenda({ events, renderRow }: { events: EventRow[]; renderRow: (e: EventRow) => React.ReactNode }) {
  const [showPast, setShowPast] = useState(false);
  const now = useNow();
  const list = events.filter((e) => showPast || new Date(e.ends_at ?? e.starts_at).getTime() >= now - 3600_000);
  const sorted = showPast ? [...list].reverse() : list;
  const groups: Array<{ key: string; label: string; items: EventRow[] }> = [];
  for (const e of sorted) {
    const key = format(new Date(e.starts_at), "yyyy-MM");
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, label: format(new Date(e.starts_at), "yyyy年M月"), items: [] }));
    g.items.push(e);
  }
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" onClick={() => setShowPast(!showPast)} className="text-[13px] font-semibold text-accent">
          {showPast ? "今後の予定を表示" : "過去の予定も表示"}
        </button>
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="予定はありません" description="「予定」ボタンから練習や試合、イベントを追加できます。" />
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h3 className="mb-2 px-1 text-[13px] font-semibold text-label-2">{g.label}</h3>
            <ul className="space-y-2">{g.items.map(renderRow)}</ul>
          </section>
        ))
      )}
    </div>
  );
}

function EventRowItem({ event: e, group, status }: { event: EventRow; group?: { name: string; color: string }; status?: AttendanceStatus }) {
  const now = useNow();
  const d = new Date(e.starts_at);
  return (
    <li>
      <Link href={`/events/${e.id}`} className="block">
        <Card className="flex items-stretch gap-3 px-3 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3">
          <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 py-1">
            <span className="text-[11px] text-label-3">{format(d, "M月", { locale: ja })}</span>
            <span className="text-[20px] leading-none font-bold tabular">{d.getDate()}</span>
            <span className="text-[11px] text-label-3">{format(d, "E", { locale: ja })}</span>
          </div>
          <span className="w-1 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-[15px] font-semibold", e.canceled_at && "line-through opacity-60")}>{e.title}</p>
            <p className="text-[13px] text-label-2 tabular">
              {e.all_day ? "終日" : `${formatTime(e.starts_at)}${e.ends_at ? `〜${formatTime(e.ends_at)}` : "〜"}`}
            </p>
            {e.location && (
              <p className="flex items-center gap-1 truncate text-[12px] text-label-3">
                <MapPin className="size-3 shrink-0" aria-hidden />
                {e.location}
              </p>
            )}
            {group && <GroupTag name={group.name} color={group.color} className="mt-0.5" />}
          </div>
          <div className="flex shrink-0 flex-col items-end justify-center gap-1">
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
        </Card>
      </Link>
    </li>
  );
}
