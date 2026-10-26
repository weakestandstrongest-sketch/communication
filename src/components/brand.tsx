import { cn } from "@/lib/cn";

/** つどい logo mark: a speech bubble holding three members. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-[28%] bg-gradient-to-b from-[#4d64e3] to-[#3449c4]", className)} aria-hidden>
      <svg viewBox="0 0 100 100" className="size-[78%]">
        <path
          d="M50 20c-19.3 0-35 12.9-35 28.8 0 9.4 5.5 17.7 14 23 -.7 4.4-3 8.6-6.6 11.6 7.4.4 14.1-2.1 18.9-6.3 2.8.6 5.7.9 8.7.9 19.3 0 35-12.9 35-28.9S69.3 20 50 20z"
          fill="#fff"
        />
        <circle cx="35" cy="49" r="5.2" fill="#3d55d6" />
        <circle cx="50" cy="49" r="5.2" fill="#3d55d6" opacity="0.75" />
        <circle cx="65" cy="49" r="5.2" fill="#3d55d6" opacity="0.5" />
      </svg>
    </span>
  );
}
