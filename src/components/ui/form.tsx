"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block px-1 text-[13px] font-semibold text-label-2">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="px-1 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="px-1 text-[12px] text-label-3">{hint}</p>
      )}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-transparent bg-surface-2 px-3.5 text-[16px] text-label placeholder:text-label-3 outline-none transition-colors focus:border-accent focus:bg-surface aria-[invalid=true]:border-danger disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputBase, "h-12", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(inputBase, "min-h-24 resize-y py-3 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(inputBase, "h-12 appearance-none bg-[length:12px] pr-9", className)} {...rest}>
      {children}
    </select>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-h-12 items-center gap-3 px-4 py-2.5", disabled && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-[16px] text-label">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] leading-snug text-label-3">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-success" : "bg-surface-3 ring-1 ring-separator ring-inset",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-transform duration-200",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; count?: number }>;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 rounded-xl bg-surface-3 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-8 flex-1 items-center justify-center gap-1 rounded-[9px] px-2 text-[13px] font-semibold whitespace-nowrap transition-all",
            value === o.value ? "bg-surface text-label shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-label-2",
          )}
        >
          {o.label}
          {o.count ? <span className="text-[11px] text-danger tabular">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Horizontally scrolling filter chips */
export function Chips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; count?: number }>;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-colors",
            value === o.value ? "bg-label text-surface" : "bg-surface text-label-2 shadow-[var(--shadow-card)]",
          )}
        >
          {o.label}
          {o.count ? (
            <span
              className={cn(
                "min-w-5 rounded-full px-1.5 text-[11px] leading-5 tabular",
                value === o.value ? "bg-surface/20" : "bg-danger text-white",
              )}
            >
              {o.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
