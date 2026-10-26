"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useSignedUrl } from "@/lib/media";
import { cn } from "@/lib/cn";

/** Image from private storage. Loads the thumbnail when available. */
export function SignedImage({
  path,
  alt = "",
  className,
  imgClassName,
  width,
  height,
}: {
  path: string | null | undefined;
  alt?: string;
  className?: string;
  imgClassName?: string;
  width?: number | null;
  height?: number | null;
}) {
  const url = useSignedUrl(path);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn("relative block overflow-hidden bg-surface-3", !loaded && "animate-pulse", className)}
      style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      {failed ? (
        <span className="absolute inset-0 flex items-center justify-center text-label-3">
          <ImageOff className="size-5" aria-label="画像を表示できません" />
        </span>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs from private storage
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("size-full object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0", imgClassName)}
        />
      ) : null}
    </span>
  );
}
