import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]", className)}>{children}</div>;
}

export function SectionHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between px-1 pb-2", className)}>
      <h2 className="text-[13px] font-semibold tracking-wide text-label-2">{title}</h2>
      {action}
    </div>
  );
}

/** iOS "inset grouped" list container */
export function ListGroup({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]", className)}>
      <ul className="divide-y divide-separator">{children}</ul>
    </div>
  );
}

export function ListRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron = Boolean(href),
  destructive,
  className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[16px]", destructive ? "text-danger" : "text-label")}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-label-3">{subtitle}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center gap-2 text-[15px] text-label-3">{trailing}</span>}
      {chevron && <ChevronRight className="size-4 shrink-0 text-label-4" aria-hidden />}
    </>
  );
  const base = cn("flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left", className);
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(base, "transition-colors active:bg-surface-3 hover:bg-surface-2")}>
          {content}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cn(base, "transition-colors active:bg-surface-3 hover:bg-surface-2")}>
          {content}
        </button>
      ) : (
        <div className={base}>{content}</div>
      )}
    </li>
  );
}
