"use client";

import Link from "next/link";
import { CalendarDays, Check, ChevronRight, Clock, Images, MapPin, Megaphone, Vote } from "lucide-react";
import { isPollClosed, useAlbum, useAnnouncement, useEvent, useMedia, usePoll, usePollResults } from "@/lib/queries";
import { formatDeadline, formatEventRange, relativeDay } from "@/lib/format";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "@/lib/types";
import { Pill } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/empty-state";
import { SignedImage } from "@/components/media/signed-image";
import { AttendanceButtons } from "@/components/events/attendance-buttons";
import { cn } from "@/lib/cn";

function CardShell({ href, label, icon, children, tone = "accent" }: {
  href: string;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "accent" | "danger";
}) {
  return (
    <div className="w-[min(300px,72vw)] overflow-hidden rounded-[20px] bg-surface text-label shadow-[var(--shadow-card)] ring-1 ring-separator">
      <div className={cn("flex items-center gap-1.5 px-4 pt-3 text-[12px] font-semibold", tone === "danger" ? "text-danger" : "text-accent")}>
        {icon}
        {label}
      </div>
      {children}
      <Link
        href={href}
        className="flex h-11 items-center justify-center gap-1 border-t border-separator text-[14px] font-semibold text-accent hover:bg-surface-2"
      >
        詳細を見る
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

function Unavailable({ what }: { what: string }) {
  return (
    <div className="w-[min(300px,72vw)] rounded-[20px] bg-surface-2 px-4 py-3 text-[13px] text-label-3 ring-1 ring-separator">
      この{what}は削除されました
    </div>
  );
}

function CardLoading() {
  return (
    <div className="w-[min(300px,72vw)] space-y-2 rounded-[20px] bg-surface p-4 ring-1 ring-separator">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function PollCard({ pollId }: { pollId: string }) {
  const { data: poll, isLoading } = usePoll(pollId);
  const { data: results } = usePollResults(poll ? pollId : null);
  if (isLoading) return <CardLoading />;
  if (!poll) return <Unavailable what="投票" />;
  const closed = isPollClosed(poll);
  const total = results?.response_count ?? poll.response_count;
  const eligible = results?.eligible_count ?? 0;
  return (
    <CardShell href={`/polls/${poll.id}`} label="投票" icon={<Vote className="size-3.5" aria-hidden />}>
      <div className="px-4 pt-1 pb-3">
        <p className="text-[16px] leading-snug font-semibold break-anywhere">{poll.title}</p>
        <ul className="mt-2.5 space-y-1.5">
          {poll.options.slice(0, 4).map((o) => {
            const r = results?.options.find((x) => x.id === o.id);
            const mine = results?.my_option_ids.includes(o.id);
            const pct = results?.visible && total ? Math.round(((r?.count ?? 0) / total) * 100) : null;
            return (
              <li key={o.id} className="relative overflow-hidden rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
                {pct !== null && <span aria-hidden className="absolute inset-y-0 left-0 bg-accent/12" style={{ width: `${pct}%` }} />}
                <span className="relative flex items-center gap-2">
                  {mine && <Check className="size-3.5 shrink-0 text-accent" aria-label="あなたの回答" />}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {pct !== null && <span className="shrink-0 text-label-3 tabular">{pct}%</span>}
                </span>
              </li>
            );
          })}
          {poll.options.length > 4 && <li className="px-1 text-[12px] text-label-3">ほか{poll.options.length - 4}件の選択肢</li>}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-label-3">
          <span className="whitespace-nowrap tabular">
            {total}
            {eligible ? `/${eligible}` : ""}人が回答
          </span>
          <span aria-hidden>・</span>
          <span className="whitespace-nowrap">{closed ? "締切済み" : formatDeadline(poll.deadline)}</span>
          <span className="ml-auto">
            {results?.responded ? (
              <Pill tone="success">回答済み</Pill>
            ) : closed ? (
              <Pill>終了</Pill>
            ) : (
              <Pill tone="danger">未回答</Pill>
            )}
          </span>
        </div>
        {eligible > 0 && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (total / eligible) * 100)}%` }} />
          </div>
        )}
      </div>
    </CardShell>
  );
}

export function EventCard({ eventId }: { eventId: string }) {
  const { data: event, isLoading } = useEvent(eventId);
  if (isLoading) return <CardLoading />;
  if (!event) return <Unavailable what="予定" />;
  const canceled = Boolean(event.canceled_at);
  return (
    <CardShell href={`/events/${event.id}`} label={event.rsvp_enabled ? "出欠確認" : "予定"} icon={<CalendarDays className="size-3.5" aria-hidden />}>
      {event.image_path && <SignedImage path={event.image_path} className="mt-2 aspect-[2/1] w-full" />}
      <div className="px-4 pt-1 pb-3">
        <div className="flex items-start gap-2">
          <p className={cn("min-w-0 flex-1 text-[16px] leading-snug font-semibold break-anywhere", canceled && "line-through opacity-60")}>
            {event.title}
          </p>
          {canceled ? <Pill tone="danger">中止</Pill> : <Pill tone="accent">{relativeDay(event.starts_at)}</Pill>}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-label-2">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          {formatEventRange(event.starts_at, event.ends_at, event.all_day)}
        </p>
        {event.location && (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-label-2">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{event.location}</span>
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-label-3">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[event.category] }} aria-hidden />
            {CATEGORY_LABEL[event.category]}
          </span>
          {event.rsvp_enabled && (
            <span className="ml-auto whitespace-nowrap tabular">
              参加 {event.going_count} ・ 未定 {event.maybe_count} ・ 不参加 {event.not_going_count}
            </span>
          )}
        </p>
        {event.rsvp_enabled && !canceled && (
          <div className="mt-3">
            <AttendanceButtons event={event} compact />
          </div>
        )}
      </div>
    </CardShell>
  );
}

export function AnnouncementCard({ announcementId }: { announcementId: string }) {
  const { data: a, isLoading } = useAnnouncement(announcementId);
  if (isLoading) return <CardLoading />;
  if (!a) return <Unavailable what="お知らせ" />;
  return (
    <CardShell
      href={`/announcements/${a.id}`}
      label={a.important ? "重要なお知らせ" : "お知らせ"}
      icon={<Megaphone className="size-3.5" aria-hidden />}
      tone={a.important ? "danger" : "accent"}
    >
      <div className="px-4 pt-1 pb-3">
        <p className="text-[16px] leading-snug font-semibold break-anywhere">{a.title}</p>
        {a.body && <p className="mt-1.5 line-clamp-4 text-[14px] leading-relaxed whitespace-pre-wrap text-label-2 break-anywhere">{a.body}</p>}
      </div>
    </CardShell>
  );
}

export function AlbumCard({ albumId }: { albumId: string }) {
  const { data: album, isLoading } = useAlbum(albumId);
  const { data: media } = useMedia(`album:${albumId}`);
  if (isLoading) return <CardLoading />;
  if (!album) return <Unavailable what="アルバム" />;
  const thumbs = (media ?? []).slice(0, 3);
  return (
    <CardShell href={`/groups/${album.group_id}/albums/${album.id}`} label="アルバム" icon={<Images className="size-3.5" aria-hidden />}>
      <div className="px-4 pt-1 pb-3">
        <p className="text-[16px] font-semibold break-anywhere">{album.title}</p>
        {thumbs.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
            {thumbs.map((m) => (
              <SignedImage key={m.id} path={m.thumb_path ?? m.storage_path} className="aspect-square" />
            ))}
          </div>
        )}
        <p className="mt-2 text-[12px] text-label-3">{media?.length ?? 0}枚の写真</p>
      </div>
    </CardShell>
  );
}
