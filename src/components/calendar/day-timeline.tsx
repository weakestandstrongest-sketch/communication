"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, differenceInMinutes, endOfDay, format, isSameDay, isToday, startOfDay, startOfWeek } from "date-fns";
import { ja } from "date-fns/locale";
import { Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, MapPin, Plus, Vote, X } from "lucide-react";
import { holidayName } from "@/lib/holidays";
import { formatTime } from "@/lib/format";
import { useSwipe } from "@/lib/use-swipe";
import { useNow } from "@/lib/use-now";
import { ATTENDANCE_LABEL, CATEGORY_COLOR, type AttendanceStatus, type EventRow, type PollListItem } from "@/lib/types";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CATEGORY_ICON } from "./event-style";

type Entry =
  | { kind: "event"; at: Date; end: Date; event: EventRow }
  | { kind: "poll"; at: Date; end: Date; poll: PollListItem };

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

/** 空き時間の表示: 45分 / 2時間 / 2時間45分 */
function gapLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h ? `${h}時間` : ""}${m ? `${m}分` : ""}`;
}

export function DayTimeline({
  date,
  dir,
  byDay,
  polls,
  pending,
  myAttendance,
  groupName,
  onSelect,
  onMoveDay,
  onMoveWeek,
  onAdd,
}: {
  date: Date;
  dir: 1 | -1;
  byDay: Map<string, EventRow[]>;
  polls: PollListItem[];
  pending: Array<{ key: string; href: string; label: string; sub: string; kind: "poll" | "event"; urgent: boolean }>;
  myAttendance: Map<string, AttendanceStatus> | undefined;
  groupName: (groupId: string | null) => string;
  onSelect: (d: Date) => void;
  onMoveDay: (delta: 1 | -1) => void;
  onMoveWeek: (delta: 1 | -1) => void;
  onAdd: () => void;
}) {
  const now = useNow();
  const [todoOpen, setTodoOpen] = useState(true);
  const weekSwipe = useSwipe(onMoveWeek);
  const daySwipe = useSwipe(onMoveDay);
  const weekStart = startOfWeek(date);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const dayEvents = useMemo(() => byDay.get(date.toDateString()) ?? [], [byDay, date]);
  const allDay = dayEvents.filter((e) => e.all_day);
  const entries = useMemo(() => {
    const list: Entry[] = [];
    for (const e of dayEvents) {
      if (e.all_day) continue;
      const at = new Date(e.starts_at);
      // Events that started on an earlier day begin at the top of this one.
      const from = at < startOfDay(date) ? startOfDay(date) : at;
      const to = e.ends_at ? new Date(e.ends_at) : new Date(at.getTime() + 3600_000);
      list.push({ kind: "event", at: from, end: to > endOfDay(date) ? endOfDay(date) : to, event: e });
    }
    for (const p of polls) {
      if (!p.deadline || p.responded || p.is_closed) continue;
      const at = new Date(p.deadline);
      if (isSameDay(at, date)) list.push({ kind: "poll", at, end: at, poll: p });
    }
    return list.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [dayEvents, polls, date]);

  const today = isToday(date);
  const holiday = holidayName(date);
  const nowLineIndex = today ? entries.findIndex((en) => en.at.getTime() > now) : -1;
  const nowLabel = format(now, "H:mm");
  const nowLine = (
    <div className="flex items-center gap-3" aria-label={`現在 ${nowLabel}`}>
      <span className="w-12 text-right text-[12px] font-bold text-danger tabular">{nowLabel}</span>
      <span className="size-2 rounded-full bg-danger" />
      <span className="h-px flex-1 bg-danger" />
    </div>
  );

  const rows: React.ReactNode[] = [];
  entries.forEach((en, i) => {
    const prev = entries[i - 1];
    if (today && nowLineIndex === i) rows.push(<div key="now" className="py-2">{nowLine}</div>);
    // Free time between this and the previous entry.
    if (prev && prev.kind !== "poll" && en.at > prev.end) {
      const gap = differenceInMinutes(en.at, prev.end);
      if (gap >= 15) {
        rows.push(
          <div key={`gap-${i}`} className="flex gap-3">
            <span className="w-12" />
            <span className="flex w-[60px] justify-center" aria-hidden>
              <span className="h-10 border-l-2 border-dotted border-label-4" />
            </span>
            <span className="self-center text-[12px] text-label-3">空き時間 {gapLabel(gap)}</span>
          </div>,
        );
      }
    }
    if (en.kind === "poll") {
      rows.push(
        <Link key={`poll-${en.poll.id}`} href={`/polls/${en.poll.id}`} className="flex items-center gap-3 py-1.5">
          <span className="w-12 text-right text-[13px] text-label-3 tabular">{formatTime(en.at)}</span>
          <span className="flex w-[60px] justify-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Vote className="size-5" aria-hidden />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-danger">投票の締切・未回答</span>
            <span className="block truncate text-[15px] font-semibold">{en.poll.title}</span>
          </span>
        </Link>,
      );
      return;
    }
    const e = en.event;
    const minutes = Math.max(15, differenceInMinutes(en.end, en.at));
    const height = Math.max(68, Math.min(168, 44 + minutes * 0.8));
    const Icon = CATEGORY_ICON[e.category];
    const color = CATEGORY_COLOR[e.category];
    const status = myAttendance?.get(e.id);
    const range = `${formatTime(en.at)} – ${formatTime(en.end)}（${gapLabel(minutes)}）`;
    rows.push(
      <Link key={e.id} href={`/events/${e.id}`} className="flex gap-3 py-1" aria-label={`${e.title}、${range}`}>
        <span className="w-12 pt-3 text-right text-[13px] text-label-3 tabular">{formatTime(en.at)}</span>
        <span className="flex w-[60px] shrink-0 justify-center">
          <span
            className={cn("flex w-[60px] items-center justify-center rounded-[30px] text-white", e.canceled_at && "opacity-40")}
            style={{ height, background: color }}
          >
            <Icon className="size-6" aria-hidden />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] text-label-3 tabular">{range}</span>
            <span className={cn("block text-[17px] leading-snug font-bold break-anywhere", e.canceled_at && "line-through opacity-50")}>{e.title}</span>
            {e.location && (
              <span className="mt-0.5 flex items-center gap-1 text-[12px] text-label-3">
                <MapPin className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{e.location}</span>
              </span>
            )}
            <span className="mt-0.5 block truncate text-[12px] text-label-3">{groupName(e.group_id)}</span>
          </span>
          {e.canceled_at ? (
            <span className="shrink-0 text-[12px] font-bold text-danger">中止</span>
          ) : e.rsvp_enabled ? (
            <AttendanceMark status={status} />
          ) : null}
        </span>
      </Link>,
    );
  });
  if (today && entries.length > 0 && nowLineIndex === -1) rows.push(<div key="now" className="py-2">{nowLine}</div>);

  const todoCount = pending.length;
  const urgent = pending.filter((p) => p.urgent).length;

  return (
    <div>
      {/* Week strip */}
      <div className="mb-1 flex items-center justify-between px-1">
        <h2 className="font-[family-name:var(--font-display)] text-[26px] font-bold tracking-tight">{format(date, "yyyy年M月", { locale: ja })}</h2>
        <div className="flex items-center">
          <button type="button" onClick={() => onSelect(startOfDay(new Date()))} className="mr-1 h-8 rounded-full bg-surface px-3 text-[13px] font-semibold">
            今日
          </button>
          <IconButton label="前の週" onClick={() => onMoveWeek(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton label="次の週" onClick={() => onMoveWeek(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
        </div>
      </div>
      <div key={format(weekStart, "yyyy-MM-dd")} {...weekSwipe} className="animate-slide-in grid grid-cols-7 overflow-x-clip" style={{ ["--dir" as string]: dir, touchAction: "pan-y" }} role="tablist" aria-label="週の日付">
        {week.map((d) => {
          const list = byDay.get(d.toDateString()) ?? [];
          const sel = isSameDay(d, date);
          const red = d.getDay() === 0 || Boolean(holidayName(d));
          return (
            <button
              key={d.toISOString()}
              type="button"
              role="tab"
              aria-selected={sel}
              aria-label={`${format(d, "M月d日(E)", { locale: ja })}${list.length ? `、予定${list.length}件` : ""}`}
              onClick={() => onSelect(startOfDay(d))}
              className="flex flex-col items-center gap-1.5 py-1.5"
            >
              <span className={cn("text-[11px] font-semibold", red ? "text-danger" : "text-label-3")}>{WEEKDAY[d.getDay()]}</span>
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-[17px] font-bold tabular transition-colors min-[360px]:size-11 min-[360px]:text-[19px]",
                  sel ? "bg-label text-bg" : isToday(d) ? "bg-danger/90 text-white" : red ? "text-danger" : "",
                )}
              >
                {d.getDate()}
              </span>
              <span className="flex h-2 gap-[2px]" aria-hidden>
                {list.slice(0, 4).map((e) => (
                  <span key={e.id} className="size-1.5 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* Day */}
      <section key={date.toDateString()} {...daySwipe} className="animate-slide-in mt-3 overflow-x-clip" style={{ ["--dir" as string]: dir, touchAction: "pan-y" }} aria-label={`${format(date, "M月d日")}のタイムライン`}>
        <div className="mb-3 flex items-baseline gap-2 px-1">
          <h3 className="text-[20px] font-bold">{format(date, "M月d日(E)", { locale: ja })}</h3>
          <span className="text-[13px] text-label-3">{dayEvents.length}件の予定</span>
          {holiday && <span className="text-[12px] font-bold text-danger">{holiday}</span>}
        </div>

        {todoCount > 0 && (
          <div className="mb-4 rounded-[var(--radius-card)] bg-surface px-4 py-3">
            <button type="button" onClick={() => setTodoOpen(!todoOpen)} className="flex w-full items-center gap-2 text-left" aria-expanded={todoOpen}>
              <CheckCheck className="size-5" aria-hidden />
              <span className="text-[16px] font-bold">回答が必要 {todoCount}件</span>
              {urgent > 0 && <span className="ml-auto text-[13px] font-bold text-danger">期限が近い {urgent}</span>}
              <ChevronDown className={cn("size-5 text-label-3 transition-transform", urgent === 0 && "ml-auto", todoOpen && "rotate-180")} aria-hidden />
            </button>
            {todoOpen && (
              <ul className="scrollbar-none -mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1">
                {pending.map((p) => (
                  <li key={p.key} className="w-[84px] shrink-0">
                    <Link href={p.href} className="flex flex-col items-center gap-1.5 text-center">
                      <span className={cn("flex size-14 items-center justify-center rounded-full", p.urgent ? "bg-danger-soft text-danger" : "bg-surface-3")}>
                        {p.kind === "poll" ? <Vote className="size-6" aria-hidden /> : <Check className="size-6" aria-hidden />}
                      </span>
                      <span className="line-clamp-2 text-[11px] leading-tight font-semibold">{p.label}</span>
                      <span className={cn("text-[10px]", p.urgent ? "font-bold text-danger" : "text-label-3")}>{p.sub}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {allDay.length > 0 && (
          <ul className="scrollbar-none mb-4 flex gap-3 overflow-x-auto px-1" aria-label="終日の予定">
            {allDay.map((e) => {
              const Icon = CATEGORY_ICON[e.category];
              return (
                <li key={e.id} className="w-[84px] shrink-0">
                  <Link href={`/events/${e.id}`} className="flex flex-col items-center gap-1.5 text-center">
                    <span className="flex size-14 items-center justify-center rounded-full text-white" style={{ background: CATEGORY_COLOR[e.category] }}>
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-tight font-semibold">{e.title}</span>
                    <span className="text-[10px] text-label-3">終日</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {rows.length > 0 ? (
          <div className="space-y-0.5" role="list" aria-label="予定の流れ">
            {rows.map((r, i) => (
              <div key={i} role="listitem">
                {r}
              </div>
            ))}
          </div>
        ) : allDay.length === 0 ? (
          <div className="flex flex-col items-center rounded-[var(--radius-card)] bg-surface px-6 py-10 text-center">
            <p className="text-[15px] font-semibold">この日の予定はありません</p>
            <p className="mt-1 text-[13px] text-label-3">{today ? "今日は一日、予定がありません。" : "予定を追加してみましょう。"}</p>
            <button type="button" onClick={onAdd} className="mt-4 flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-[14px] font-semibold text-accent-contrast">
              <Plus className="size-4" aria-hidden />
              予定を追加
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AttendanceMark({ status }: { status: AttendanceStatus | undefined }) {
  if (!status) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-danger text-danger" role="img" aria-label="出欠未回答">
        <HelpCircle className="size-4 opacity-0" />
      </span>
    );
  }
  const Icon = status === "going" ? Check : status === "maybe" ? HelpCircle : X;
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-white",
        status === "going" ? "bg-success" : status === "maybe" ? "bg-warning" : "bg-label-3",
      )}
      role="img"
      aria-label={ATTENDANCE_LABEL[status]}
    >
      <Icon className="size-[18px]" strokeWidth={2.6} />
    </span>
  );
}
