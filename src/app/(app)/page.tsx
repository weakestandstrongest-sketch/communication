"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Bell,
  CalendarCheck2,
  CalendarDays,
  ChevronRight,
  Megaphone,
  MessageCircle,
  PartyPopper,
  Plus,
  Ticket,
  Vote,
} from "lucide-react";
import {
  isPollClosed,
  needsAttendance,
  useAnnouncementReads,
  useAnnouncements,
  useConversations,
  useEvents,
  useMyAttendance,
  useMyGroups,
  useMyProfile,
  useNotifications,
  usePeople,
  usePolls,
  useUnreadNotificationCount,
} from "@/lib/queries";
import { useUserId } from "@/lib/auth";
import { formatAgo, formatDeadline, formatEventRange, formatListTime, relativeDay } from "@/lib/format";
import { ATTENDANCE_LABEL, CATEGORY_COLOR, type AttendanceStatus } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Avatar, GroupAvatar, GroupTag } from "@/components/ui/avatar";
import { CountBadge, Pill } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { conversationTitle, lastMessagePreview } from "@/components/chat/conversation-list";
import { NotificationIcon } from "@/components/notifications/notification-icon";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/use-now";

type ActionItem = {
  key: string;
  href: string;
  icon: React.ReactNode;
  title: string;
  group: { name: string; color: string };
  detail: string;
  urgent: boolean;
  sort: number;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "こんばんは";
  if (h < 11) return "おはようございます";
  if (h < 18) return "こんにちは";
  return "こんばんは";
}

export default function HomePage() {
  const myId = useUserId();
  const { data: me } = useMyProfile();
  const { data: groups, isLoading: groupsLoading } = useMyGroups();
  const { data: polls } = usePolls();
  const { data: events } = useEvents();
  const { data: myAttendance } = useMyAttendance();
  const { data: announcements } = useAnnouncements();
  const { data: reads } = useAnnouncementReads();
  const { data: conversations } = useConversations();
  const { data: notifications } = useNotifications();
  const unreadNotifications = useUnreadNotificationCount();
  const people = usePeople();
  const now = useNow();

  const groupById = useMemo(() => new Map((groups ?? []).map((g) => [g.id, g])), [groups]);

  const actions = useMemo(() => {
    const items: ActionItem[] = [];
    for (const p of polls ?? []) {
      if (p.responded || isPollClosed(p)) continue;
      const due = p.deadline ? new Date(p.deadline).getTime() : Infinity;
      items.push({
        key: `poll-${p.id}`,
        href: `/polls/${p.id}`,
        icon: <Vote className="size-[18px]" />,
        title: p.title,
        group: { name: p.group_name, color: p.group_color },
        detail: p.deadline ? `投票 ・ ${formatDeadline(p.deadline)}` : "投票 ・ 締切なし",
        urgent: due - now < 86400000,
        sort: due,
      });
    }
    for (const e of events ?? []) {
      if (!needsAttendance(e, myAttendance)) continue;
      const g = groupById.get(e.group_id);
      const due = new Date(e.rsvp_deadline ?? e.starts_at).getTime();
      items.push({
        key: `event-${e.id}`,
        href: `/events/${e.id}`,
        icon: <CalendarCheck2 className="size-[18px]" />,
        title: e.title,
        group: { name: g?.name ?? "", color: g?.color ?? "indigo" },
        detail: `出欠確認 ・ ${relativeDay(e.starts_at)}${e.rsvp_deadline ? ` ・ 期限${formatDeadline(e.rsvp_deadline).replace("あと", "まであと")}` : ""}`,
        urgent: due - now < 86400000 * 2,
        sort: due,
      });
    }
    for (const a of announcements ?? []) {
      if (!a.important || reads?.has(a.id) || a.author_id === myId) continue;
      if (now - new Date(a.created_at).getTime() > 30 * 86400000) continue;
      const g = groupById.get(a.group_id);
      items.push({
        key: `ann-${a.id}`,
        href: `/announcements/${a.id}`,
        icon: <Megaphone className="size-[18px]" />,
        title: a.title,
        group: { name: g?.name ?? "", color: g?.color ?? "indigo" },
        detail: `重要なお知らせ ・ ${formatAgo(a.created_at)}`,
        urgent: true,
        sort: 0,
      });
    }
    return items.sort((a, b) => a.sort - b.sort);
  }, [polls, events, myAttendance, announcements, reads, groupById, myId, now]);

  const unreadConversations = (conversations ?? []).filter((c) => Number(c.unread_count) > 0).slice(0, 5);
  const upcoming = (events ?? [])
    .filter((e) => !e.canceled_at && new Date(e.ends_at ?? e.starts_at).getTime() >= now)
    .slice(0, 5);
  const pinned = (announcements ?? []).filter((a) => a.pinned).slice(0, 3);
  const recent = (notifications ?? []).slice(0, 6);

  return (
    <>
      <PageHeader
        title="ホーム"
        subtitle={me ? `${greeting()}、${me.display_name}さん` : undefined}
        large
        actions={
          <Link href="/notifications" aria-label={`通知${unreadNotifications ? `（未読${unreadNotifications}件）` : ""}`} className="relative flex size-10 items-center justify-center rounded-full text-accent hover:bg-accent-soft lg:hidden">
            <Bell className="size-[22px]" />
            {unreadNotifications > 0 && <CountBadge count={unreadNotifications} className="absolute top-0.5 right-0 h-[18px] min-w-[18px] text-[10px]" />}
          </Link>
        }
      />
      <PageBody className="space-y-7">
        {groupsLoading ? (
          <ListSkeleton rows={4} />
        ) : !groups?.length ? (
          <Onboarding />
        ) : (
          <>
            <section aria-labelledby="todo-heading">
              <SectionHeader
                title={
                  <span id="todo-heading" className="flex items-center gap-1.5">
                    対応が必要
                    {actions.length > 0 && <CountBadge count={actions.length} />}
                  </span>
                }
              />
              {actions.length === 0 ? (
                <Card className="flex items-center gap-3 px-4 py-4">
                  <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
                    <PartyPopper className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold">すべて対応済みです</p>
                    <p className="text-[13px] text-label-3">未回答の投票や出欠確認はありません</p>
                  </div>
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-separator">
                    {actions.slice(0, 8).map((a) => (
                      <li key={a.key}>
                        <Link href={a.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3">
                          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", a.urgent ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent")}>
                            {a.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold">{a.title}</span>
                            <span className="mt-0.5 flex items-center gap-2 text-[12px] text-label-3">
                              <GroupTag name={a.group.name} color={a.group.color} className="max-w-[45%]" />
                              <span className={cn("truncate", a.urgent && "font-semibold text-danger")}>{a.detail}</span>
                            </span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-label-4" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {actions.length > 8 && <p className="border-t border-separator px-4 py-2.5 text-center text-[13px] text-label-3">ほか{actions.length - 8}件</p>}
                </Card>
              )}
            </section>

            {pinned.length > 0 && (
              <section aria-label="ピン留めされたお知らせ">
                <SectionHeader title="お知らせ" action={<Link href="/groups" className="text-[13px] font-semibold text-accent">すべて</Link>} />
                <div className="space-y-2">
                  {pinned.map((a) => {
                    const g = groupById.get(a.group_id);
                    const unread = !reads?.has(a.id);
                    return (
                      <Link key={a.id} href={`/announcements/${a.id}`} className="block">
                        <Card className={cn("px-4 py-3.5 transition-colors hover:bg-surface-2", a.important && "ring-1 ring-danger/30")}>
                          <div className="flex items-center gap-2">
                            <Megaphone className={cn("size-4 shrink-0", a.important ? "text-danger" : "text-accent")} aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{a.title}</span>
                            {unread && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="未読" />}
                          </div>
                          {a.body && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-label-2">{a.body}</p>}
                          <div className="mt-1.5 flex items-center gap-2">
                            {g && <GroupTag name={g.name} color={g.color} />}
                            <span className="text-[12px] text-label-3">{formatAgo(a.created_at)}</span>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            <section aria-label="未読メッセージ">
              <SectionHeader title="未読メッセージ" action={<Link href="/talk" className="text-[13px] font-semibold text-accent">トークへ</Link>} />
              {unreadConversations.length === 0 ? (
                <Card className="flex items-center gap-3 px-4 py-3.5 text-[14px] text-label-3">
                  <MessageCircle className="size-5" aria-hidden />
                  未読のメッセージはありません
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-separator">
                    {unreadConversations.map((c) => (
                      <li key={c.id}>
                        <Link href={`/talk/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 active:bg-surface-3">
                          {c.kind === "group" ? (
                            <GroupAvatar name={c.group_name} color={c.group_color} size={40} />
                          ) : (
                            <Avatar name={c.peer_name} src={c.peer_avatar_url} id={c.peer_id} size={40} />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-semibold">{conversationTitle(c)}</span>
                              <span className="ml-auto shrink-0 text-[12px] text-label-3">{c.last_message_at ? formatListTime(c.last_message_at) : ""}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[13px] text-label-2">{lastMessagePreview(c, myId, people)}</span>
                              <CountBadge count={Number(c.unread_count)} muted={c.muted} className="ml-auto" />
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>

            <section aria-label="今後の予定">
              <SectionHeader title="今後の予定" action={<Link href="/calendar" className="text-[13px] font-semibold text-accent">カレンダー</Link>} />
              {upcoming.length === 0 ? (
                <Card className="flex items-center gap-3 px-4 py-3.5 text-[14px] text-label-3">
                  <CalendarDays className="size-5" aria-hidden />
                  予定はありません
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-separator">
                    {upcoming.map((e) => {
                      const g = groupById.get(e.group_id);
                      const status = myAttendance?.get(e.id) as AttendanceStatus | undefined;
                      return (
                        <li key={e.id}>
                          <Link href={`/events/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 active:bg-surface-3">
                            <span className="w-1 self-stretch rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-semibold">{e.title}</span>
                              <span className="block truncate text-[12px] text-label-3">{formatEventRange(e.starts_at, e.ends_at, e.all_day)}</span>
                              {g && <GroupTag name={g.name} color={g.color} className="mt-0.5" />}
                            </span>
                            {e.rsvp_enabled &&
                              (status ? (
                                <Pill tone={status === "going" ? "success" : status === "maybe" ? "warning" : "neutral"}>{ATTENDANCE_LABEL[status]}</Pill>
                              ) : (
                                <Pill tone="danger">未回答</Pill>
                              ))}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </section>

            <section aria-label="最近のアクティビティ">
              <SectionHeader title="最近のアクティビティ" action={<Link href="/notifications" className="text-[13px] font-semibold text-accent">すべて</Link>} />
              {recent.length === 0 ? (
                <Card className="px-4 py-3.5 text-[14px] text-label-3">まだアクティビティはありません</Card>
              ) : (
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-separator">
                    {recent.map((n) => (
                      <li key={n.id}>
                        <Link href={n.link} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2 active:bg-surface-3">
                          <NotificationIcon kind={n.kind} />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-[14px] leading-snug", !n.read_at && "font-semibold")}>{n.title}</span>
                            <span className="mt-0.5 block truncate text-[12px] text-label-3">
                              {n.body} ・ {formatAgo(n.created_at)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </>
        )}
      </PageBody>
    </>
  );
}

function Onboarding() {
  return (
    <Card className="overflow-hidden">
      <EmptyState
        icon={<PartyPopper />}
        title="つどいへようこそ"
        description="まずはグループを作成するか、招待リンク・招待コードでグループに参加しましょう。"
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/groups/new" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-contrast">
              <Plus className="size-4" aria-hidden />
              グループを作成
            </Link>
            <Link href="/groups/join" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-soft px-5 text-[15px] font-semibold text-accent">
              <Ticket className="size-4" aria-hidden />
              招待コードで参加
            </Link>
          </div>
        }
      />
    </Card>
  );
}

