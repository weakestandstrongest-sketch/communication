"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ConversationList } from "@/components/chat/conversation-list";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/cn";

/** Two panes on desktop (list + conversation); one screen at a time on phones. */
export function TalkLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inConversation = pathname !== "/talk";
  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(300px,360px)_1fr]">
      <section className={cn("min-h-dvh pb-tabbar lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-separator lg:bg-surface lg:pb-0", inConversation && "hidden lg:block")}>
        <PageHeader title="トーク" large />
        <ConversationList />
      </section>
      <section className={cn("min-w-0", !inConversation && "hidden lg:flex")}>{children}</section>
    </div>
  );
}
