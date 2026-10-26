"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "tinted";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-contrast hover:bg-accent-strong active:opacity-90 disabled:opacity-40",
  secondary: "bg-surface-3 text-label hover:brightness-[0.97] active:brightness-95 disabled:opacity-40",
  tinted: "bg-accent-soft text-accent hover:brightness-[0.97] active:brightness-95 disabled:opacity-40",
  ghost: "text-accent hover:bg-accent-soft active:bg-accent-soft disabled:opacity-40",
  danger: "bg-danger-soft text-danger hover:brightness-[0.97] active:brightness-95 disabled:opacity-40",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-full gap-1.5",
  md: "h-11 px-4 text-[15px] rounded-xl gap-2",
  lg: "h-[52px] px-5 text-[17px] rounded-2xl gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-[background,filter,opacity,transform] duration-150 active:scale-[0.98]",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md";
  tone?: "default" | "accent";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", tone = "default", className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-40",
        size === "md" ? "size-10" : "size-8",
        tone === "accent" ? "text-accent hover:bg-accent-soft" : "text-label-2 hover:bg-surface-3 active:bg-surface-3",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
