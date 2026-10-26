"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck } from "lucide-react";
import { isToday } from "date-fns";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, useMyGroups, useNotifications } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatAgo } from "@/lib/format";
import type { NotificationRow } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/form";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/empty-state";
import { GroupTag } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { NotificationIcon } from "@/components/notifications/notification-icon";
import { cn } from "@/lib/cn";

export default function NotificationsPage() {
  const myId = useUserId();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useNotifications();
  const { data: groups } = useMyGroups();
  const [filter, setFilter] = useState<"unread" | "all">("all");
  const groupById = useMemo(() => new Map((groups ?? []).map((g) => [g.id, g])), [groups]);

  const list = (data ?? []).filter((n) => filter === "all" || !n.read_at);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  const today = list.filter((n) => isToday(new Date(n.created_at)));
  const earlier = list.filter((n) => !isToday(new Date(n.created_at)));

  const markRead = (ids: string[]) => {
    const now = new Date().toISOString();
    queryClient.setQueryData<NotificationRow[]>(qk.notifications, (old) => old?.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
    return getSupabase().from("notifications").update({ read_at: now }).in("id", ids).eq("user_id", myId);
  };

  const open = (n: NotificationRow) => {
    if (!n.read_at) void markRead([n.id]);
    router.push(n.link);
  };

  const markAll = async () => {
    const ids = (data ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const { error } = await getSupabase().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", myId).is("read_at", null);
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("すべて既読にしました");
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  };

  const section = (title: string, items: NotificationRow[]) =>
    items.length > 0 && (
      <section aria-label={title}>
        <h2 className="mb-2 px-1 text-[13px] font-semibold text-label-2">{title}</h2>
        <Card className="overflow-hidden">
          <ul className="divide-y divide-separator">
            {items.map((n) => {
              const g = n.group_id ? groupById.get(n.group_id) : undefined;
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2 active:bg-surface-3", !n.read_at && "bg-accent-soft/40")}>
                    <NotificationIcon kind={n.kind} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px] leading-snug break-anywhere", !n.read_at ? "font-semibold" : "text-label-2")}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-[13px] leading-snug text-label-3 break-anywhere">{n.body}</span>}
                      <span className="mt-1 flex items-center gap-2 text-[12px] text-label-3">
                        {g && <GroupTag name={g.name} color={g.color} />}
                        {formatAgo(n.created_at)}
                      </span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-accent" aria-label="未読" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
    );

  return (
    <>
      <PageHeader
        title="通知"
        back="/"
        actions={
          unread > 0 && (
            <Button variant="ghost" size="sm" icon={<CheckCheck className="size-4" />} onClick={markAll}>
              すべて既読
            </Button>
          )
        }
      />
      <PageBody className="space-y-5">
        <Segmented label="表示" value={filter} onChange={setFilter} options={[{ value: "all", label: "すべて" }, { value: "unread", label: "未読", count: unread }]} />
        {isLoading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<BellRing />}
            title={filter === "unread" ? "未読の通知はありません" : "通知はまだありません"}
            description="新しい投票、予定、お知らせ、メンションがあるとここに届きます。"
            action={
              <Link href="/settings#push" className="text-[14px] font-semibold text-accent">
                端末への通知を設定する
              </Link>
            }
          />
        ) : (
          <>
            {section("今日", today)}
            {section("これまで", earlier)}
          </>
        )}
      </PageBody>
    </>
  );
}
