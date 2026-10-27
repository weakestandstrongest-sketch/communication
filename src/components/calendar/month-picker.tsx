"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const ITEM = 44; // px per row
const VISIBLE = 5; // rows in view

/**
 * iOS-style scroll wheel. Rows snap to the centre band; rows further from the centre tilt away and fade.
 * The tilt is written straight to the DOM on scroll, so scrolling never re-renders.
 */
function Wheel({ items, index, onChange, label }: { items: string[]; index: number; onChange: (i: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const current = useRef(index);
  const changeRef = useRef(onChange);
  useEffect(() => {
    changeRef.current = onChange;
  });

  const paint = () => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop;
    for (let i = 0; i < el.children.length; i++) {
      const row = el.children[i] as HTMLElement;
      const d = (i * ITEM - top) / ITEM;
      const a = Math.min(Math.abs(d), 2.6);
      row.style.transform = `perspective(400px) rotateX(${-d * 20}deg) scale(${1 - a * 0.06})`;
      row.style.opacity = String(1 - a * 0.3);
    }
    const i = Math.max(0, Math.min(items.length - 1, Math.round(top / ITEM)));
    if (i !== current.current) {
      current.current = i;
      navigator.vibrate?.(4);
      changeRef.current(i);
    }
  };

  // Start on the given row (only when the wheel mounts: afterwards the wheel is the source of truth).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = index * ITEM;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const go = (i: number) => ref.current?.scrollTo({ top: i * ITEM, behavior: "smooth" });

  return (
    <div className="relative flex-1">
      <div
        ref={ref}
        onScroll={() => requestAnimationFrame(paint)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            go(Math.max(0, Math.min(items.length - 1, current.current + (e.key === "ArrowDown" ? 1 : -1))));
          }
        }}
        tabIndex={0}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${label}-${index}`}
        className="scrollbar-none relative z-[1] snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none"
        style={{ height: ITEM * VISIBLE, paddingBlock: (ITEM * (VISIBLE - 1)) / 2 }}
      >
        {items.map((label_, i) => (
          <div
            key={label_}
            id={`${label}-${i}`}
            role="option"
            aria-selected={i === index}
            onClick={() => go(i)}
            className="flex snap-center items-center justify-center text-[22px] font-semibold tabular will-change-transform"
            style={{ height: ITEM }}
          >
            {label_}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sheet with year and month wheels; the button jumps the calendar there. Mount it when opening, so it starts on `value`. */
export function MonthPicker({ open, value, onClose, onPick }: { open: boolean; value: Date; onClose: () => void; onPick: (d: Date) => void }) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => now - 10 + i);
  const [year, setYear] = useState(value.getFullYear());
  const [month, setMonth] = useState(value.getMonth());

  return (
    <Sheet open={open} onClose={onClose} title="年月を選択" size="sm">
      <div className="px-4 pb-6">
        <div className="relative flex gap-2">
          {/* the centre band the rows snap to */}
          <div className="pointer-events-none absolute inset-x-0 rounded-xl bg-surface-3" style={{ top: ITEM * 2, height: ITEM }} aria-hidden />
          <Wheel
            label="年"
            items={years.map((y) => `${y}年`)}
            index={Math.max(0, years.indexOf(year))}
            onChange={(i) => setYear(years[i])}
          />
          <Wheel label="月" items={Array.from({ length: 12 }, (_, i) => `${i + 1}月`)} index={month} onChange={setMonth} />
        </div>
        <Button
          block
          size="lg"
          className="mt-5"
          onClick={() => {
            onPick(new Date(year, month, 1));
            onClose();
          }}
        >
          {year}年{month + 1}月へ移動
        </Button>
      </div>
    </Sheet>
  );
}
