"use client";

import { useRef } from "react";

/**
 * Long-press (touch) + right-click (mouse) handler. Returns props to spread on an element.
 * A long press suppresses the click that follows it.
 */
export function useLongPress(onLongPress: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onTouchStart: (e: React.TouchEvent) => {
      fired.current = false;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, ms);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (start.current && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) clear();
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      if (!fired.current) onLongPress();
      fired.current = false;
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
    style: { WebkitTouchCallout: "none" } as React.CSSProperties,
  };
}
