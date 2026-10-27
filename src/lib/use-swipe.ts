"use client";

import { useRef } from "react";

/** Horizontal swipe (single finger). Returns touch handlers; ignores multi-touch (pinch) and mostly-vertical moves. */
export function useSwipe(onSwipe: (direction: 1 | -1) => void, threshold = 56) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      start.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (e.touches.length > 1) start.current = null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s.t < 700) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}
