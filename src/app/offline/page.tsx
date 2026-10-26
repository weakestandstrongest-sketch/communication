import type { Metadata } from "next";
import { RetryButton } from "./retry-button";
import { BrandMark } from "@/components/brand";

export const metadata: Metadata = { title: "オフライン" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <BrandMark className="size-16" />
      <h1 className="mt-5 text-[20px] font-bold">インターネットに接続されていません</h1>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-label-2">
        トークや予定の表示・送信にはインターネット接続が必要です。接続を確認してから、もう一度お試しください。
      </p>
      <RetryButton />
    </main>
  );
}
