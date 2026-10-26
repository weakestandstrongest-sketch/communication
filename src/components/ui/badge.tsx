import { cn } from "@/lib/cn";

export function CountBadge({ count, muted, className, max = 99 }: { count: number; muted?: boolean; className?: string; max?: number }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-bold tabular",
        muted ? "bg-label-4 text-white" : "bg-danger text-white",
        className,
      )}
      aria-label={`${count}件`}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-label-2",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Pill({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold", TONES[tone], className)}>
      {children}
    </span>
  );
}
