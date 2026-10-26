import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

export const metadata: Metadata = { title: "トーク" };

export default function TalkIndex() {
  return (
    <div className="hidden h-dvh w-full flex-col items-center justify-center gap-3 bg-chat-bg text-label-3 lg:flex">
      <MessageCircle className="size-12" strokeWidth={1.5} aria-hidden />
      <p className="text-[15px]">トークを選択してください</p>
    </div>
  );
}
