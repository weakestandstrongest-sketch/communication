"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { Attachment } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2048;
const THUMB_EDGE = 480;

const ALLOWED = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
  "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "audio/mpeg", "audio/mp4", "video/mp4", "video/quicktime",
]);

export function validateFile(file: File): string | null {
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.has(type)) return `「${file.name}」はアップロードできない形式です`;
  if (file.size > MAX_UPLOAD_BYTES && !type.startsWith("image/")) return `「${file.name}」は20MBを超えています`;
  return null;
}

async function resize(file: Blob, maxEdge: number, quality: number): Promise<{ blob: Blob; width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ? { blob, width, height } : null;
  } catch {
    return null;
  }
}

function extension(name: string, mime: string) {
  const fromName = name.includes(".") ? name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  if (fromName && fromName.length <= 5) return fromName;
  return mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
}

/**
 * Uploads a file under `prefix` (which must end with "/").
 * Images are re-encoded to ≤2048px JPEG plus a 480px thumbnail to save storage and bandwidth.
 */
export async function uploadMedia(prefix: string, file: File, onProgress?: (stage: string) => void): Promise<Attachment> {
  const supabase = getSupabase();
  const id = crypto.randomUUID();
  const isImage = file.type.startsWith("image/") && file.type !== "image/gif";

  if (isImage) {
    onProgress?.("画像を最適化中");
    const full = await resize(file, MAX_IMAGE_EDGE, 0.85);
    const thumb = await resize(file, THUMB_EDGE, 0.75);
    if (full && thumb) {
      if (full.blob.size > MAX_UPLOAD_BYTES) throw new Error("画像サイズが大きすぎます（最大20MB）");
      const path = `${prefix}${id}.jpg`;
      const thumbPath = `${prefix}${id}_thumb.jpg`;
      onProgress?.("アップロード中");
      const up = await supabase.storage.from("media").upload(path, full.blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (up.error) throw up.error;
      const upThumb = await supabase.storage.from("media").upload(thumbPath, thumb.blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (upThumb.error) {
        await supabase.storage.from("media").remove([path]);
        throw upThumb.error;
      }
      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return { path, thumb_path: thumbPath, name, mime: "image/jpeg", size: full.blob.size, width: full.width, height: full.height };
    }
    // Could not decode (e.g. HEIC on a non-Apple browser): fall through to a plain upload.
  }

  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`「${file.name}」は20MBを超えています`);
  const path = `${prefix}${id}.${extension(file.name, file.type)}`;
  onProgress?.("アップロード中");
  const up = await supabase.storage.from("media").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "31536000",
  });
  if (up.error) throw up.error;
  return { path, thumb_path: null, name: file.name.slice(0, 200), mime: file.type || "application/octet-stream", size: file.size, width: null, height: null };
}

export async function removeMedia(paths: string[]) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  await getSupabase().storage.from("media").remove(list);
}

// ---------------------------------------------------------------------------
// Signed URL cache: batches lookups made in the same tick into one request.
// URLs live only in memory (never persisted), and expire after an hour.
// ---------------------------------------------------------------------------
const TTL_SECONDS = 3600;
const cache = new Map<string, { url: string; expires: number }>();
const pending = new Map<string, Array<(url: string | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const batch = Array.from(pending.entries());
  pending.clear();
  const paths = batch.map(([p]) => p);
  const { data } = await getSupabase().storage.from("media").createSignedUrls(paths, TTL_SECONDS);
  const now = Date.now();
  const byPath = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) byPath.set(item.path, item.signedUrl);
  }
  for (const [path, resolvers] of batch) {
    const url = byPath.get(path) ?? null;
    if (url) cache.set(path, { url, expires: now + (TTL_SECONDS - 120) * 1000 });
    resolvers.forEach((r) => r(url));
  }
}

export function getSignedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    const list = pending.get(path) ?? [];
    list.push(resolve);
    pending.set(path, list);
    if (!timer) timer = setTimeout(flush, 16);
  });
}

export function useSignedUrl(path: string | null | undefined) {
  const [state, setState] = useState<{ path: string | null; url: string | null }>(() => {
    const hit = path ? cache.get(path) : undefined;
    return { path: path ?? null, url: hit && hit.expires > Date.now() ? hit.url : null };
  });
  useEffect(() => {
    let active = true;
    if (!path) return;
    getSignedUrl(path).then((url) => {
      if (active) setState({ path, url });
    });
    return () => {
      active = false;
    };
  }, [path]);
  return state.path === path ? state.url : null;
}

export async function downloadUrl(path: string, name: string): Promise<string | null> {
  const { data } = await getSupabase().storage.from("media").createSignedUrl(path, 120, { download: name });
  return data?.signedUrl ?? null;
}

export function clearSignedUrlCache() {
  cache.clear();
}

/**
 * Center-crops an image to a 512px square JPEG and uploads it as a profile photo / group icon.
 * `prefix` is "u/{userId}/" or "g/{groupId}/icon/". Returns the storage path.
 */
export async function uploadSquareImage(prefix: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  if (!bitmap) throw new Error("この画像は読み込めませんでした");
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(512, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できませんでした");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("画像を処理できませんでした");
  const path = `${prefix}${crypto.randomUUID()}.jpg`;
  const { error } = await getSupabase().storage.from("media").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  return path;
}
