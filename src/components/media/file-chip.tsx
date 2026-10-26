"use client";

import { useState } from "react";
import { FileText, Download } from "lucide-react";
import { downloadUrl } from "@/lib/media";
import { formatBytes } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

export function FileChip({ path, name, size, className, disabled }: { path: string; name: string; size: number; className?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (disabled) return;
    setBusy(true);
    const url = await downloadUrl(path, name);
    setBusy(false);
    if (url) window.open(url, "_blank", "noopener");
  };
  return (
    <button
      type="button"
      onClick={open}
      className={cn("flex w-full min-w-0 items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left text-label", className)}
      aria-label={`${name}をダウンロード`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <FileText className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{name}</span>
        <span className="block text-[12px] text-label-3">{formatBytes(size)}</span>
      </span>
      {busy ? <Spinner className="size-4" /> : <Download className="size-4 text-label-3" />}
    </button>
  );
}
