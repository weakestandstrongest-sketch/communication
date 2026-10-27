"use client";

import { Check } from "lucide-react";
import type { MemberWithProfile } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

/** Multi-select list of group members (for building a パート・バンド). */
export function MemberPicker({
  members,
  selected,
  onToggle,
  locked,
}: {
  members: MemberWithProfile[];
  selected: Set<string>;
  onToggle: (userId: string) => void;
  /** Shown as selected and not toggleable (e.g. yourself). */
  locked?: Set<string>;
}) {
  if (!members.length) return <p className="px-1 py-4 text-center text-[13px] text-label-3">追加できるメンバーはいません</p>;
  return (
    <ul className="divide-y divide-separator overflow-hidden rounded-[var(--radius-card)] bg-surface">
      {members.map((m) => {
        const isLocked = locked?.has(m.user_id) ?? false;
        const on = isLocked || selected.has(m.user_id);
        return (
          <li key={m.user_id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={isLocked}
              onClick={() => !isLocked && onToggle(m.user_id)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-3"
            >
              <Avatar name={m.profile?.display_name} src={m.profile?.avatar_url} id={m.user_id} size={36} />
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {m.profile?.display_name ?? "メンバー"}
                {isLocked && <span className="ml-1.5 text-[12px] text-label-3">（あなた）</span>}
              </span>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  on ? "border-label bg-label text-bg" : "border-separator-strong",
                  isLocked && "opacity-50",
                )}
                aria-hidden
              >
                {on && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
