"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { downloadUrl, useSignedUrl } from "@/lib/media";
import { formatDateTime } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";

export type ViewerItem = { path: string; thumb_path?: string | null; name?: string; caption?: string; created_at?: string };

/** Full-screen photo viewer with swipe/keyboard navigation. Loads the full-size file only here. */
export function ImageViewer({ items, index, onClose }: { items: ViewerItem[]; index: number | null; onClose: () => void }) {
  const [i, setI] = useState(index ?? 0);
  const [prevIndex, setPrevIndex] = useState(index);
  if (index !== prevIndex) {
    setPrevIndex(index);
    if (index !== null) setI(index);
  }
  const item = index === null ? null : items[i];
  const url = useSignedUrl(item?.path);
  const thumb = useSignedUrl(item?.thumb_path);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(items.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [index, items.length, onClose]);

  if (!item || typeof document === "undefined") return null;

  const save = async () => {
    const link = await downloadUrl(item.path, item.name ?? "photo.jpg");
    if (link) window.location.assign(link);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="写真"
      className="fixed inset-0 z-[70] flex animate-fade-in flex-col bg-black text-white"
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (dx < -50) setI((v) => Math.min(items.length - 1, v + 1));
        if (dx > 50) setI((v) => Math.max(0, v - 1));
        setTouchX(null);
      }}
    >
      <div className="flex items-center justify-between px-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="閉じる" className="flex size-11 items-center justify-center rounded-full hover:bg-white/10">
          <X className="size-6" />
        </button>
        <span className="text-[14px] text-white/80 tabular">
          {items.length > 1 ? `${i + 1} / ${items.length}` : ""}
        </span>
        <button type="button" onClick={save} aria-label="保存" className="flex size-11 items-center justify-center rounded-full hover:bg-white/10">
          <Download className="size-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
        {url || thumb ? <img src={url ?? thumb ?? ""} alt={item.caption ?? ""} className="max-h-full max-w-full object-contain" /> : <Spinner className="size-7" />}
        {i > 0 && (
          <button type="button" aria-label="前の写真" onClick={() => setI(i - 1)} className="absolute left-2 hidden size-11 items-center justify-center rounded-full bg-white/10 sm:flex">
            <ChevronLeft className="size-6" />
          </button>
        )}
        {i < items.length - 1 && (
          <button type="button" aria-label="次の写真" onClick={() => setI(i + 1)} className="absolute right-2 hidden size-11 items-center justify-center rounded-full bg-white/10 sm:flex">
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>
      {(item.caption || item.created_at) && (
        <div className="px-5 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] text-center text-[13px] text-white/75">
          {item.caption}
          {item.caption && item.created_at ? " ・ " : ""}
          {item.created_at ? formatDateTime(item.created_at) : ""}
        </div>
      )}
    </div>,
    document.body,
  );
}
