"use client";

import { useRef, useState, type ReactNode } from "react";
import { Camera, Trash2 } from "lucide-react";
import { uploadSquareImage } from "@/lib/media";
import { errorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Pick → crop to a square → upload. `onUploaded` receives the new storage path (the caller saves it
 * on the profile or group). `preview` is the current avatar rendered by the caller.
 */
export function PhotoPicker({
  prefix,
  preview,
  hasPhoto,
  onUploaded,
  onRemove,
  label = "写真を変更",
}: {
  prefix: string;
  preview: ReactNode;
  hasPhoto: boolean;
  onUploaded: (path: string) => Promise<void>;
  onRemove?: () => Promise<void>;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadSquareImage(prefix, file);
      await onUploaded(path);
    } catch (e) {
      toast.show(errorMessage(e, "画像を設定できませんでした"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={label}
        className="group relative shrink-0 rounded-full"
        disabled={busy}
      >
        {preview}
        <span className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-accent text-accent-contrast ring-2 ring-bg">
          <Camera className="size-3.5" aria-hidden />
        </span>
      </button>
      <div className="flex flex-col items-start gap-1.5">
        <Button variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>
          {label}
        </Button>
        {hasPhoto && onRemove && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRemove();
              } catch (e) {
                toast.show(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
            className="flex items-center gap-1 text-[13px] text-label-3"
          >
            <Trash2 className="size-3.5" aria-hidden />
            写真を削除
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => (void pick(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  );
}
