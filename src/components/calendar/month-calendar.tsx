"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { holidayName } from "@/lib/holidays";
import { formatTime } from "@/lib/format";
import { useSwipe } from "@/lib/use-swipe";
import { CATEGORY_COLOR, type EventRow } from "@/lib/types";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { RollingNumber } from "./rolling-number";
import { MonthPicker } from "./month-picker";

export type ZoomLevel = 0 | 1 | 2;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const ZOOM_LABEL = ["ドット表示", "予定名を表示", "詳細表示"];
const CELL_HEIGHT: Record<ZoomLevel, string> = { 0: "min-h-[54px]", 1: "min-h-[98px]", 2: "min-h-[156px]" };
const CHIPS: Record<ZoomLevel, number> = { 0: 0, 1: 3, 2: 5 };

/** Layout position of the selected day's circle inside `wrap`, ignoring transforms (the grid may be mid slide-in). */
function selectedOffset(wrap: HTMLElement) {
  let el = wrap.querySelector<HTMLElement>("[data-sel]");
  let x = 0;
  let y = 0;
  while (el && el !== wrap) {
    x += el.offsetLeft;
    y += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  return el === wrap ? { x, y } : null;
}

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
  onPick,
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
  /** Jump to the first day of a month chosen in the year/month wheel. */
  onPick: (month: Date) => void;
}) {
  const [picking, setPicking] = useState(false);
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
    el.addEventListener("touchmove", onMoveTouch, { passive: true });
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

  // The selection circle travels from the previous day to the new one (across months too):
  // a floating copy flies between the two positions while the real circle in the cell is hidden.
  const flyer = useRef<HTMLSpanElement>(null);
  const lastRect = useRef<{ x: number; y: number } | null>(null);
  const lastKey = useRef("");
  const selKey = selected.toDateString();
  useLayoutEffect(() => {
    const wrap = grid.current;
    const ball = flyer.current;
    const target = wrap?.querySelector<HTMLElement>("[data-sel]");
    if (!wrap || !ball) return;
    const from = lastRect.current;
    const to = selectedOffset(wrap);
    const changed = lastKey.current !== "" && lastKey.current !== `${selKey}|${monthKey}`;
    const monthChanged = changed && !lastKey.current.endsWith(`|${monthKey}`);
    lastKey.current = `${selKey}|${monthKey}`;
    lastRect.current = to;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!changed || !from || !to || !target || reduced || (from.x === to.x && from.y === to.y)) return;

    target.dataset.flying = "";
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const at = (x: number, y: number, sx = 1, sy = sx) => `translate(${x}px, ${y}px) scale(${sx}, ${sy})`;
    // Straight line from the old day to the new one. The circle travels above the grid and carries
    // the new day's number, which fades in as it lands, so the number never disappears under it.
    const frames: Keyframe[] = monthChanged
      ? [
          { transform: at(from.x, from.y), opacity: 1 },
          { transform: at(from.x + dx * 0.5, from.y + dy * 0.5, 0.9), opacity: 0.7, offset: 0.5 },
          { transform: at(to.x, to.y), opacity: 1 },
        ]
      : [
          { transform: at(from.x, from.y), opacity: 1 },
          { transform: at(from.x + dx * 0.5, from.y + dy * 0.5, Math.abs(dx) >= Math.abs(dy) ? 1.18 : 0.88, Math.abs(dx) >= Math.abs(dy) ? 0.88 : 1.18), offset: 0.45 },
          { transform: at(to.x, to.y), opacity: 1 },
        ];
    const timing = { duration: monthChanged ? 520 : 380, easing: monthChanged ? "cubic-bezier(0.55, 0, 0.25, 1)" : "cubic-bezier(0.3, 0.9, 0.3, 1)" };
    const label = ball.firstElementChild as HTMLElement | null;
    if (label) label.textContent = target.textContent;
    const anim = ball.animate(frames, { ...timing, fill: "none" });
    const fade = label?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { ...timing, easing: "linear", fill: "none" });
    const land = () => delete target.dataset.flying;
    anim.onfinish = land;
    anim.oncancel = land;
    return () => {
      anim.cancel();
      fade?.cancel();
    };
  }, [selKey, monthKey]);

  // Keep the resting position fresh while cells grow (zoom) or the screen resizes.
  useEffect(() => {
    const wrap = grid.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      lastRect.current = selectedOffset(wrap) ?? lastRect.current;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-x-2 gap-y-1">
        <h2 className="m-0" aria-label={format(cursor, "yyyy年M月")}>
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={`年月を選ぶ（${format(cursor, "yyyy年M月")}）`}
            className="flex items-end gap-1.5 rounded-2xl text-left transition-transform active:scale-[0.97]"
          >
            <RollingNumber value={monthNumber} dir={dir} className="font-[family-name:var(--font-display)] text-[52px] font-bold tracking-tight" />
            <span className="pb-[9px] text-[24px] leading-none font-bold" aria-hidden>
              月
            </span>
            <span className="flex items-center gap-0.5 pb-[10px] pl-1 text-[15px] leading-none font-semibold text-label-3 tabular" aria-hidden>
              {cursor.getFullYear()}年
              <ChevronDown className="size-4" />
            </span>
          </button>
        </h2>
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
        className="relative overflow-clip rounded-[var(--radius-card)] bg-surface p-1.5 select-none"
        style={{ touchAction: "pan-y" }}
      >
        <span ref={flyer} aria-hidden className="pointer-events-none absolute top-0 left-0 z-[2] flex size-7 items-center justify-center rounded-full bg-label text-[14px] font-bold text-bg tabular opacity-0">
          <span />
        </span>
        <div className="grid grid-cols-7 pb-1" aria-hidden>
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={cn("py-1 text-center text-[10px] font-semibold tracking-wider", i === 0 ? "text-danger" : "text-label-3")}>
              {w}
            </div>
          ))}
        </div>
        <div key={monthKey} className="animate-slide-in relative z-[1] grid grid-cols-7 gap-px" style={{ ["--dir" as string]: dir }} role="grid">
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
                    data-sel={sel ? "" : undefined}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-[14px] tabular",
                      // no color transition on the selected day: the flying circle hands over to it in a single frame
                      !sel && "transition-colors duration-150",
                      // Selected and today styles are exclusive: both set a text color, and the stylesheet order (not the class order) would pick one.
                      !sel && (today ? "bg-danger font-bold text-white" : red ? "text-danger" : ""),
                      sel && "bg-label font-bold text-bg",
                      sel && (today
                        ? "ring-2 ring-danger ring-offset-1 ring-offset-surface data-flying:bg-danger data-flying:text-white data-flying:ring-0"
                        : red ? "data-flying:bg-transparent data-flying:text-danger" : "data-flying:bg-transparent data-flying:text-label"),
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
      {picking && <MonthPicker open value={cursor} onClose={() => setPicking(false)} onPick={onPick} />}
    </div>
  );
}
