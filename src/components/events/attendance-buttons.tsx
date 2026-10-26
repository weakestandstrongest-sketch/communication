"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, HelpCircle, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { qk, useAttendance } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import type { AttendanceStatus, AttendanceSummary, EventRow } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const OPTIONS: Array<{ value: AttendanceStatus; label: string; icon: typeof Check; active: string }> = [
  { value: "going", label: "参加", icon: Check, active: "bg-success text-white" },
  { value: "maybe", label: "未定", icon: HelpCircle, active: "bg-warning text-white" },
  { value: "not_going", label: "不参加", icon: X, active: "bg-label-2 text-surface" },
];

export function attendanceClosedReason(event: EventRow): string | null {
  if (!event.rsvp_enabled) return "この予定は出欠確認がありません";
  if (event.canceled_at) return "この予定は中止されました";
  if (event.rsvp_deadline && new Date(event.rsvp_deadline).getTime() <= Date.now()) return "回答期限を過ぎました";
  if (new Date(event.ends_at ?? event.starts_at).getTime() < Date.now() - 86400000) return "終了した予定です";
  return null;
}

export function AttendanceButtons({ event, compact, comment }: { event: EventRow; compact?: boolean; comment?: string }) {
  const { data } = useAttendance(event.id);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [saving, setSaving] = useState<AttendanceStatus | null>(null);
  const closed = attendanceClosedReason(event);
  const mine = data?.mine?.status ?? null;

  const choose = async (status: AttendanceStatus) => {
    if (closed || saving) return;
    setSaving(status);
    const prev = queryClient.getQueryData<AttendanceSummary>(qk.attendance(event.id));
    if (prev) {
      const counts = { going: prev.going, maybe: prev.maybe, not_going: prev.not_going };
      if (prev.mine) counts[prev.mine.status] -= 1;
      counts[status] += 1;
      queryClient.setQueryData<AttendanceSummary>(qk.attendance(event.id), {
        ...prev,
        ...counts,
        mine: { status, comment: comment ?? prev.mine?.comment ?? "" },
      });
    }
    const { error } = await getSupabase().rpc("set_attendance", {
      p_event_id: event.id,
      p_status: status,
      p_comment: comment ?? data?.mine?.comment ?? "",
    });
    setSaving(null);
    if (error) {
      if (prev) queryClient.setQueryData(qk.attendance(event.id), prev);
      toast.show(errorMessage(error), "error");
      return;
    }
    toast.show(`「${OPTIONS.find((o) => o.value === status)!.label}」で回答しました`);
    void queryClient.invalidateQueries({ queryKey: qk.attendance(event.id) });
    void queryClient.invalidateQueries({ queryKey: qk.myAttendance });
  };

  if (!event.rsvp_enabled) return null;
  return (
    <div>
      <div role="radiogroup" aria-label="出欠" className={cn("grid grid-cols-3", compact ? "gap-1.5" : "gap-2")}>
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const selected = mine === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={Boolean(closed)}
              onClick={() => choose(o.value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all active:scale-[0.97] disabled:opacity-50",
                compact ? "h-9 text-[13px]" : "h-12 text-[15px]",
                selected ? o.active : "bg-surface-3 text-label",
                saving === o.value && "opacity-70",
              )}
            >
              <Icon className={compact ? "size-4" : "size-[18px]"} aria-hidden />
              {o.label}
              {data && !compact && <span className="text-[12px] opacity-75 tabular">{data[o.value]}</span>}
            </button>
          );
        })}
      </div>
      {closed && !compact && <p className="mt-2 text-center text-[12px] text-label-3">{closed}</p>}
    </div>
  );
}
