import { VenetianMask } from "lucide-react";
import { cn } from "@/lib/cn";
import { aliasInitial } from "@/lib/feedback";

const TONES = ["#6b7280", "#2f7fe0", "#139a9a", "#2c9a55", "#d99a10", "#e46f2a", "#d9466f", "#8656d1"];

/** 匿名のアイコン。alias を渡すと呼び名の頭文字、なければ仮面。 */
export function AnonAvatar({ alias, size = 40, className }: { alias?: number; size?: 32 | 40 | 44; className?: string }) {
  const dim = size === 32 ? "size-8 text-[13px]" : size === 44 ? "size-11 text-[16px]" : "size-10 text-[15px]";
  if (alias === undefined || alias === 0) {
    return (
      <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full bg-label text-bg", dim, className)}>
        {alias === 0 ? <span className="font-bold">主</span> : <VenetianMask className="size-[55%]" strokeWidth={1.8} />}
      </span>
    );
  }
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white", dim, className)} style={{ background: TONES[alias % TONES.length] }}>
      {aliasInitial(alias)}
    </span>
  );
}
