import { cn } from "@/lib/cn";

const BUBBLE =
  "M 512 190 C 700 190 840 320 840 490 C 840 660 700 790 512 790 C 470 790 432 783 398 770 C 360 800 316 816 268 820 C 300 790 318 760 326 726 C 262 684 184 604 184 490 C 184 320 324 190 512 190 Z";

/** Jam logo mark: a speech bubble holding a saxophone-bell J, with its peach outline offset like a shadow. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center overflow-hidden rounded-[28%] bg-[#0b0b0d] ring-1 ring-white/10", className)} aria-hidden>
      <svg viewBox="0 0 1024 1024" className="size-full">
        {/* the bubble's outline, offset down-right like a shadow */}
        <path d={BUBBLE} transform="translate(20 22)" fill="none" stroke="#F0C9B4" strokeWidth="18" strokeLinejoin="round" />
        <path
          d={BUBBLE}
          fill="#F5F3EE"
        />
        <path d="M 570 330 L 570 530 C 570 612 480 638 448 586" fill="none" stroke="#111" strokeWidth="64" strokeLinecap="round" />
        <circle cx="448" cy="330" r="22" fill="#E8874A" />
        <circle cx="448" cy="396" r="22" fill="#E8874A" />
        <circle cx="448" cy="462" r="22" fill="#E8874A" />
      </svg>
    </span>
  );
}
