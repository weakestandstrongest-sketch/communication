"use client";

import { useEffect, useRef } from "react";
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { holidayName, wafuMonth } from "@/lib/holidays";
import { formatTime } from "@/lib/format";
import { useSwipe } from "@/lib/use-swipe";
import { CATEGORY_COLOR, type EventRow } from "@/lib/types";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { RollingNumber } from "./rolling-number";

export type ZoomLevel = 0 | 1 | 2;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const ZOOM_LABEL = ["ドット表示", "予定名を表示", "詳細表示"];
const CELL_HEIGHT: Record<ZoomLevel, string> = { 0: "min-h-[54px]", 1: "min-h-[98px]", 2: "min-h-[156px]" };
const CHIPS: Record<ZoomLevel, number> = { 0: 0, 1: 3, 2: 5 };

export function MonthCalendar({
  cursor,
  dir,
  zoom,
  selected,
  byDay,
  onZoom,
  onSelect,
  onMove,
  onToday,
}: {
  cursor: Date;
  dir: 1 | -1;
  zoom: ZoomLevel;
  selected: Date;
  byDay: Map<string, EventRow[]>;
  onZoom: (z: ZoomLevel) => void;
  onSelect: (d: Date) => void;
  onMove: (delta: 1 | -1) => void;
  onToday: () => void;
}) {
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const swipe = useSwipe(onMove);
  const grid = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const onZoomRef = useRef(onZoom);
  useEffect(() => {
    zoomRef.current = zoom;
    onZoomRef.current = onZoom;
  });

  // Two-finger pinch (touch) and ctrl+wheel / trackpad pinch (desktop) change the zoom level.
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    let startDist = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const step = (delta: 1 | -1) => {
      const next = Math.max(0, Math.min(2, zoomRef.current + delta)) as ZoomLevel;
      if (next !== zoomRef.current) {
        navigator.vibrate?.(8);
        onZoomRef.current(next);
      }
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) startDist = dist(e.touches);
    };
    const onMoveTouch = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      const ratio = dist(e.touches) / startDist;
      if (ratio > 1.22) {
        step(1);
        startDist = dist(e.touches);
      } else if (ratio < 0.82) {
        step(-1);
        startDist = dist(e.touches);
      }
    };
    const onEnd = () => (startDist = 0);
    let wheelAcc = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) > 40) {
        step(wheelAcc < 0 ? 1 : -1);
        wheelAcc = 0;
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMoveTouch, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMoveTouch);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const monthNumber = cursor.getMonth() + 1;
  const monthKey = format(cursor, "yyyy-MM");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-x-2 gap-y-1">
        <div className="flex items-end gap-2" role="heading" aria-level={2} aria-label={format(cursor, "yyyy年M月")}>
          <RollingNumber value={monthNumber} dir={dir} className="font-[family-name:var(--font-display)] text-[52px] font-bold tracking-tight" />
          <div className="pb-2 leading-tight" aria-hidden>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-label-3">{cursor.getFullYear()}年</p>
            <p className="text-[14px] font-semibold">{wafuMonth(monthNumber)}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-0.5 pb-1.5">
          <IconButton label="縮小" size="sm" disabled={zoom === 0} onClick={() => onZoom(Math.max(0, zoom - 1) as ZoomLevel)}>
            <ZoomOut className="size-[18px]" />
          </IconButton>
          <IconButton label="拡大" size="sm" disabled={zoom === 2} onClick={() => onZoom(Math.min(2, zoom + 1) as ZoomLevel)}>
            <ZoomIn className="size-[18px]" />
          </IconButton>
          <button type="button" onClick={onToday} className="mx-1 h-8 rounded-full bg-surface px-3 text-[13px] font-semibold">
            今日
          </button>
          <IconButton label="前の月" onClick={() => onMove(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton label="次の月" onClick={() => onMove(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
        </div>
      </div>

      <div
        ref={grid}
        {...swipe}
        data-zoom={zoom}
        aria-label={`${format(cursor, "yyyy年M月")}のカレンダー（${ZOOM_LABEL[zoom]}）`}
        className="overflow-x-clip rounded-[var(--radius-card)] bg-surface p-1.5 select-none"
        style={{ touchAction: "pan-y" }}
      >
        <div className="grid grid-cols-7 pb-1" aria-hidden>
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={cn("py-1 text-center text-[10px] font-semibold tracking-wider", i === 0 ? "text-danger" : "text-label-3")}>
              {w}
            </div>
          ))}
        </div>
        <div key={monthKey} className="animate-slide-in grid grid-cols-7 gap-px" style={{ ["--dir" as string]: dir }} role="grid">
          {days.map((d) => {
            const list = byDay.get(d.toDateString()) ?? [];
            const inMonth = isSameMonth(d, cursor);
            const sel = isSameDay(d, selected);
            const today = isToday(d);
            const holiday = holidayName(d);
            const red = d.getDay() === 0 || Boolean(holiday);
            const chips = list.slice(0, CHIPS[zoom]);
            return (
              <button
                key={d.toISOString()}
                type="button"
                role="gridcell"
                aria-selected={sel}
                aria-label={`${format(d, "M月d日")}${holiday ? `、${holiday}` : ""}${list.length ? `、予定${list.length}件` : ""}`}
                onClick={() => onSelect(d)}
                className={cn(
                  "flex flex-col items-stretch rounded-xl px-0.5 pt-1 pb-1.5 transition-[min-height,background] duration-300 ease-out",
                  CELL_HEIGHT[zoom],
                  !inMonth && "opacity-35",
                  sel && zoom > 0 && "bg-surface-3/60",
                )}
              >
                <span className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-[14px] tabular transition-colors",
                      sel ? "bg-label font-bold text-bg" : today ? "bg-danger font-bold text-white" : red ? "text-danger" : "",
                      sel && today && "ring-2 ring-danger ring-offset-1 ring-offset-surface",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {zoom > 0 && holiday && <span className="mt-0.5 max-w-full truncate text-[8.5px] leading-none font-semibold text-danger">{holiday}</span>}
                </span>
                {zoom === 0 ? (
                  <span className="mt-1.5 flex h-2 justify-center gap-0.5" aria-hidden>
                    {list.slice(0, 3).map((e) => (
                      <span key={e.id} className="size-1.5 rounded-full" style={{ background: CATEGORY_COLOR[e.category], opacity: e.canceled_at ? 0.4 : 1 }} />
                    ))}
                  </span>
                ) : (
                  <span className="mt-1 flex min-w-0 flex-col gap-[3px]">
                    {chips.map((e) => (
                      <span
                        key={e.id}
                        className={cn(
                          "block rounded-[5px] py-px pr-1 pl-1.5 text-left text-[9.5px] leading-[14px] font-semibold", zoom === 1 && "truncate",
                          e.canceled_at && "line-through opacity-50",
                        )}
                        style={{ background: `color-mix(in srgb, ${CATEGORY_COLOR[e.category]} 20%, transparent)`, boxShadow: `inset 2.5px 0 0 ${CATEGORY_COLOR[e.category]}` }}
                      >
                        {zoom === 2 && !e.all_day && <span className="block text-[8.5px] leading-[11px] font-medium text-label-2 tabular">{formatTime(e.starts_at)}</span>}
                        <span className={zoom === 2 ? "line-clamp-2 break-anywhere whitespace-normal" : ""}>{e.title}</span>
                      </span>
                    ))}
                    {list.length > chips.length && <span className="px-1 text-left text-[9.5px] font-semibold text-label-3">+{list.length - chips.length}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 px-1 text-center text-[11px] text-label-4">二本指でつまむ・広げると表示を切り替えられます</p>
    </div>
  );
}
