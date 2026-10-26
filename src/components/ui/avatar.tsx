"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { groupColor, personColor } from "@/lib/colors";

const SIZE: Record<number, string> = {
  20: "size-5 text-[9px]",
  24: "size-6 text-[10px]",
  28: "size-7 text-[11px]",
  32: "size-8 text-[12px]",
  36: "size-9 text-[13px]",
  40: "size-10 text-[14px]",
  44: "size-11 text-[15px]",
  48: "size-12 text-[17px]",
  52: "size-[52px] text-[19px]",
  56: "size-14 text-[20px]",
  72: "size-[72px] text-[26px]",
  88: "size-[88px] text-[32px]",
};

function initial(name: string | null | undefined) {
  const t = (name ?? "").trim();
  return t ? Array.from(t)[0].toUpperCase() : "?";
}

export function Avatar({
  name,
  src,
  id,
  size = 40,
  online,
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  id?: string | null;
  size?: keyof typeof SIZE;
  online?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Google avatars, already small
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn("rounded-full bg-surface-3 object-cover", SIZE[size])}
        />
      ) : (
        <span
          aria-hidden
          className={cn("inline-flex items-center justify-center rounded-full font-semibold text-white", SIZE[size])}
          style={{ background: personColor(id ?? name) }}
        >
          {initial(name)}
        </span>
      )}
      {online && (
        <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface bg-success" aria-label="オンライン" />
      )}
    </span>
  );
}

export function GroupAvatar({
  name,
  color,
  size = 40,
  className,
}: {
  name: string | null | undefined;
  color?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const c = groupColor(color);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[30%] font-bold", SIZE[size], className)}
      style={{ background: c.bg, color: c.fg }}
    >
      {initial(name)}
    </span>
  );
}

export function GroupTag({ name, color, className }: { name: string; color?: string | null; className?: string }) {
  const c = groupColor(color);
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 truncate text-[12px] font-medium text-label-2", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: c.bg }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}
