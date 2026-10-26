"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useLongPress } from "@/lib/use-long-press";

export function LongPressLink({ onLongPress, ...props }: ComponentProps<typeof Link> & { onLongPress: () => void }) {
  const handlers = useLongPress(onLongPress);
  return <Link {...props} {...handlers} style={{ ...handlers.style, ...props.style }} />;
}
