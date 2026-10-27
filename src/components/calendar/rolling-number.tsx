"use client";

import { useEffect, useState } from "react";

/** A number that rolls vertically when it changes (like an odometer). dir: 1 = rolls up (next), -1 = rolls down. */
export function RollingNumber({ value, dir, className }: { value: number; dir: 1 | -1; className?: string }) {
  const [state, setState] = useState<{ cur: number; prev: number | null }>({ cur: value, prev: null });
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setState({ cur: value, prev: last });
  }
  useEffect(() => {
    if (state.prev === null) return;
    const t = setTimeout(() => setState((s) => ({ ...s, prev: null })), 460);
    return () => clearTimeout(t);
  }, [state.prev, state.cur]);

  return (
    <span className={`relative inline-flex overflow-hidden leading-[1.1] tabular ${className ?? ""}`} style={{ ["--dir" as string]: dir }} aria-label={`${value}`}>
      <span key={state.cur} className={state.prev === null ? "" : "animate-roll-in"} aria-hidden>
        {state.cur}
      </span>
      {state.prev !== null && (
        <span key={`p${state.prev}`} className="animate-roll-out absolute inset-0" aria-hidden>
          {state.prev}
        </span>
      )}
    </span>
  );
}
