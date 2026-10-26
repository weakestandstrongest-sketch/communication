"use client";

import { useState } from "react";
import type { MediaItem } from "@/lib/types";
import { usePeople } from "@/lib/queries";
import { SignedImage } from "./signed-image";
import { ImageViewer } from "./image-viewer";
import { useLongPress } from "@/lib/use-long-press";

/** Responsive photo grid (thumbnails only) with a full-screen viewer. */
export function PhotoGrid({ items, onLongPress }: { items: MediaItem[]; onLongPress?: (m: MediaItem) => void }) {
  const [index, setIndex] = useState<number | null>(null);
  const people = usePeople();
  const photos = items.filter((m) => m.mime_type.startsWith("image/"));
  return (
    <>
      <ul className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-[var(--radius-card)] sm:grid-cols-4 lg:grid-cols-5">
        {photos.map((m, i) => (
          <li key={m.id}>
            <PhotoTile item={m} label={`写真 ${i + 1}`} onOpen={() => setIndex(i)} onLongPress={onLongPress ? () => onLongPress(m) : undefined} />
          </li>
        ))}
      </ul>
      <ImageViewer
        items={photos.map((m) => ({
          path: m.storage_path,
          thumb_path: m.thumb_path,
          name: m.file_name,
          created_at: m.created_at,
          caption: m.uploader_id ? `${people.get(m.uploader_id)?.name ?? "メンバー"}` : undefined,
        }))}
        index={index}
        onClose={() => setIndex(null)}
      />
    </>
  );
}

function PhotoTile({ item, label, onOpen, onLongPress }: { item: MediaItem; label: string; onOpen: () => void; onLongPress?: () => void }) {
  const press = useLongPress(() => onLongPress?.());
  return (
    <button type="button" onClick={onOpen} {...(onLongPress ? press : {})} className="block w-full" aria-label={label}>
      <SignedImage path={item.thumb_path ?? item.storage_path} className="aspect-square" />
    </button>
  );
}
