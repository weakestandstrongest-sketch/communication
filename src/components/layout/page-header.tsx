"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Sticky translucent header. `large` shows an iOS-style large title on phones.
 * `back` renders a back button (href or history back).
 */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  large,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  large?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const backButton =
    back === true ? (
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
        className="-ml-2 flex h-10 items-center pr-2 text-accent"
        aria-label="戻る"
      >
        <ChevronLeft className="size-7" strokeWidth={2.2} />
      </button>
    ) : back ? (
      <Link href={back} className="-ml-2 flex h-10 items-center pr-2 text-accent" aria-label="戻る">
        <ChevronLeft className="size-7" strokeWidth={2.2} />
      </Link>
    ) : null;

  return (
    <header className={cn("glass hairline-b sticky top-0 z-30 pt-safe", className)}>
      <div className="mx-auto flex h-12 max-w-3xl items-center gap-1 px-4">
        {backButton}
        <div className={cn("min-w-0 flex-1", large && "lg:block")}>
          {!large && (
            <div className={cn(back ? "text-center lg:text-left" : "")}>
              <h1 className="truncate text-[17px] font-semibold">{title}</h1>
              {subtitle && <p className="-mt-0.5 truncate text-[12px] text-label-3">{subtitle}</p>}
            </div>
          )}
          {large && <h1 className="hidden truncate text-[17px] font-semibold lg:block">{title}</h1>}
        </div>
        <div className={cn("flex shrink-0 items-center gap-0.5", back && !actions && "w-8")}>{actions}</div>
      </div>
      {large && (
        <div className="mx-auto max-w-3xl px-4 pb-2 lg:hidden">
          <h1 className="font-[family-name:var(--font-display)] text-[32px] leading-tight font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-label-3">{subtitle}</p>}
        </div>
      )}
    </header>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-3xl px-4 pt-4 pb-tabbar lg:pb-10", className)}>{children}</div>;
}
