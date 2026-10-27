import { MessageSquareQuote, AtSign, CalendarCheck2, CalendarClock, CalendarX2, CalendarDays, Clock, CornerUpLeft, Megaphone, UserPlus, Vote } from "lucide-react";
import { cn } from "@/lib/cn";

const MAP: Record<string, { icon: typeof Vote; className: string }> = {
  poll_new: { icon: Vote, className: "bg-accent-soft text-accent" },
  poll_deadline: { icon: Clock, className: "bg-warning-soft text-warning" },
  event_new: { icon: CalendarDays, className: "bg-accent-soft text-accent" },
  attendance_request: { icon: CalendarCheck2, className: "bg-accent-soft text-accent" },
  attendance_deadline: { icon: Clock, className: "bg-warning-soft text-warning" },
  event_upcoming: { icon: CalendarClock, className: "bg-success-soft text-success" },
  event_updated: { icon: CalendarDays, className: "bg-warning-soft text-warning" },
  event_canceled: { icon: CalendarX2, className: "bg-danger-soft text-danger" },
  announcement: { icon: Megaphone, className: "bg-danger-soft text-danger" },
  mention: { icon: AtSign, className: "bg-accent-soft text-accent" },
  reply: { icon: CornerUpLeft, className: "bg-accent-soft text-accent" },
  feedback_new: { icon: MessageSquareQuote, className: "bg-accent-soft text-accent" },
  feedback_reply: { icon: MessageSquareQuote, className: "bg-accent-soft text-accent" },
  member_joined: { icon: UserPlus, className: "bg-success-soft text-success" },
};

export function NotificationIcon({ kind, className }: { kind: string; className?: string }) {
  const entry = MAP[kind] ?? MAP.poll_new;
  const Icon = entry.icon;
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", entry.className, className)} aria-hidden>
      <Icon className="size-[18px]" />
    </span>
  );
}
