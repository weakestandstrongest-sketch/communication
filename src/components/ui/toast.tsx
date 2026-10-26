"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone; action?: { label: string; onClick: () => void } };

const ToastContext = createContext<{
  show: (message: string, tone?: ToastTone, action?: ToastItem["action"]) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const show = useCallback((message: string, tone: ToastTone = "success", action?: ToastItem["action"]) => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, message, tone, action }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === "error" ? 5000 : 2800);
  }, []);
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "glass pointer-events-auto flex max-w-md animate-pop-in items-center gap-2.5 rounded-2xl px-4 py-3 text-[14px] font-medium shadow-[var(--shadow-float)]",
            )}
          >
            {t.tone === "success" && <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />}
            {t.tone === "error" && <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden />}
            {t.tone === "info" && <Info className="size-5 shrink-0 text-accent" aria-hidden />}
            <span className="min-w-0">{t.message}</span>
            {t.action && (
              <button type="button" onClick={t.action.onClick} className="ml-1 shrink-0 font-semibold text-accent">
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
