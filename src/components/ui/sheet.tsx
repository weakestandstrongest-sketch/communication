"use client";

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

let openCount = 0;

/**
 * Bottom sheet on phones, centered dialog on larger screens.
 * Accessible: role="dialog", aria-modal, Escape to close, focus moved in and restored.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  hideHeader,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  hideHeader?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    openRef.current = open;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openCount += 1;
    document.documentElement.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button:not([data-sheet-close])");
      (el ?? panel.current)?.focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === "Tab" && panel.current) {
        const focusables = panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      openCount -= 1;
      if (openCount <= 0) {
        openCount = 0;
        document.documentElement.style.overflow = "";
      }
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // Activity may hide the route while a sheet is open: close it so it never reappears stale.
  useLayoutEffect(
    () => () => {
      if (openRef.current) onCloseRef.current();
    },
    [],
  );

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/35" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-surface shadow-[var(--shadow-float)] outline-none",
          "animate-sheet-up sm:animate-pop-in sm:rounded-[22px]",
          size === "sm" && "sm:max-w-sm",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl",
        )}
      >
        {!hideHeader && (
          <div className="relative flex min-h-14 shrink-0 items-center justify-center px-14">
            <div className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-label-4 sm:hidden" aria-hidden />
            {title && (
              <h2 id={titleId} className="truncate text-[17px] font-semibold">
                {title}
              </h2>
            )}
            <button
              type="button"
              data-sheet-close
              onClick={onClose}
              aria-label="閉じる"
              className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface-3 text-label-2"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="shrink-0 border-t border-separator px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
        {!footer && <div className="pb-safe shrink-0" />}
      </div>
    </div>,
    document.body,
  );
}

/** Action sheet (list of actions) */
export function ActionSheet({
  open,
  onClose,
  title,
  actions,
  header,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  header?: ReactNode;
  actions: Array<{ label: string; icon?: ReactNode; onSelect: () => void; destructive?: boolean; hidden?: boolean }>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} size="sm">
      {header}
      <ul className="px-2 pb-3">
        {actions
          .filter((a) => !a.hidden)
          .map((a) => (
            <li key={a.label}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  a.onSelect();
                }}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-[16px] active:bg-surface-3 hover:bg-surface-2",
                  a.destructive ? "text-danger" : "text-label",
                )}
              >
                {a.icon && <span className="[&>svg]:size-5">{a.icon}</span>}
                {a.label}
              </button>
            </li>
          ))}
      </ul>
    </Sheet>
  );
}
