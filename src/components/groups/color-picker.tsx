"use client";

import { Check } from "lucide-react";
import { GROUP_COLORS, groupColor } from "@/lib/colors";
import { cn } from "@/lib/cn";

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label="テーマカラー" className="flex flex-wrap gap-2.5">
      {GROUP_COLORS.map((c) => {
        const info = groupColor(c);
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={info.label}
            onClick={() => onChange(c)}
            className={cn("flex size-10 items-center justify-center rounded-full transition-transform active:scale-90", value === c && "ring-2 ring-offset-2 ring-offset-surface")}
            style={{ background: info.bg, ["--tw-ring-color" as string]: info.bg }}
          >
            {value === c && <Check className="size-5 text-white" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}
