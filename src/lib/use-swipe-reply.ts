"use client";

import { useEffect, useRef } from "react";

const THRESHOLD = 60; // px to the left that triggers a reply
const MAX = 110;

/**
 * LINE-style swipe-left-to-reply. The row follows the finger (with resistance past the threshold),
 * a reply icon fades in, and releasing past the threshold calls `onReply`.
 * Styles are written directly to the DOM so a drag never re-renders the message list.
 * The row needs `touch-action: pan-y` so vertical scrolling stays native.
 */
export function useSwipeReply<T extends HTMLElement>(onReply: () => void, enabled: boolean) {
  const row = useRef<T>(null);
  const content = useRef<HTMLDivElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const callback = useRef(onReply);
  useEffect(() => {
    callback.current = onReply;
  });

  useEffect(() => {
    const el = row.current;
    if (!el || !enabled) return;
    let sx = 0;
    let sy = 0;
    let mode: "idle" | "h" | "v" = "idle";
    let armed = false;

    const paint = (x: number, animate: boolean) => {
      const c = content.current;
      const ic = icon.current;
      const transition = animate ? "transform 320ms cubic-bezier(0.3, 1.25, 0.5, 1)" : "none";
      if (c) {
        c.style.transition = transition;
        c.style.transform = x ? `translateX(${x}px)` : "";
      }
      if (ic) {
        const p = Math.min(1, -x / THRESHOLD);
        ic.style.transition = animate ? "opacity 200ms, transform 200ms" : "none";
        ic.style.opacity = String(p);
        ic.style.transform = `scale(${0.5 + 0.5 * p})`;
      }
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      mode = "idle";
      armed = false;
    };
    const onMove = (e: TouchEvent) => {
      if (mode === "v" || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (mode === "idle") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        mode = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.3 ? "h" : "v";
        if (mode === "v") return;
      }
      const d = Math.min(0, dx);
      const x = Math.max(-MAX, d > -THRESHOLD ? d : -THRESHOLD + (d + THRESHOLD) * 0.35);
      paint(x, false);
      const now = d <= -THRESHOLD;
      if (now && !armed) navigator.vibrate?.(8);
      armed = now;
    };
    const onEnd = () => {
      if (mode === "h") {
        if (armed) callback.current();
        paint(0, true);
      }
      mode = "idle";
      armed = false;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);

  return { row, content, icon };
}
