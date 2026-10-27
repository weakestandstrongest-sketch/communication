"use client";

import { memo, type ReactNode } from "react";
import { AlertCircle, Clock3, CornerUpLeft, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-store";
import type { PersonInfo } from "@/lib/queries";
import type { Attachment } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { SignedImage } from "@/components/media/signed-image";
import { FileChip } from "@/components/media/file-chip";
import { useLongPress } from "@/lib/use-long-press";
import { useSwipeReply } from "@/lib/use-swipe-reply";
import { cn } from "@/lib/cn";
import { AlbumCard, AnnouncementCard, EventCard, PollCard } from "./cards";

const URL_RE = /(https?:\/\/[^\s<>"'）」]+)/g;

/** Linkifies URLs and highlights @mentions of known members. */
function RichText({ text, mine, mentionNames }: { text: string; mine: boolean; mentionNames: string[] }) {
  const parts = text.split(URL_RE);
  const mentionRe = mentionNames.length
    ? new RegExp(`(@(?:${mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g")
    : null;
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={cn("underline underline-offset-2 break-all", mine ? "text-white" : "text-accent")}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        if (!mentionRe) return part;
        return part.split(mentionRe).map((seg, j) =>
          j % 2 === 1 ? (
            <span key={`${i}-${j}`} className={cn("font-semibold", mine ? "text-white underline decoration-white/50" : "text-accent")}>
              {seg}
            </span>
          ) : (
            seg
          ),
        );
      })}
    </>
  );
}

function ImageGrid({ items, local, onOpen }: { items: Attachment[]; local?: string[]; onOpen: (i: number) => void }) {
  const count = items.length;
  return (
    <div className={cn("grid gap-0.5 overflow-hidden", count === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {items.slice(0, 4).map((a, i) => (
        <button
          key={a.path || i}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!local) onOpen(i);
          }}
          className={cn("relative block", count === 3 && i === 0 && "col-span-2")}
          aria-label="写真を表示"
        >
          {local?.[i] ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview before upload
            <img src={local[i]} alt="" className={cn("w-full object-cover", count === 1 ? "max-h-[320px]" : "aspect-square")} />
          ) : (
            <SignedImage
              path={a.thumb_path ?? a.path}
              width={count === 1 ? a.width : null}
              height={count === 1 ? a.height : null}
              className={cn("w-full", count === 1 ? "max-h-[320px] min-h-24" : "aspect-square")}
            />
          )}
          {i === 3 && count > 4 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[20px] font-semibold text-white">+{count - 4}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export type MessageItemProps = {
  message: ChatMessage;
  mine: boolean;
  sender: PersonInfo | undefined;
  showSender: boolean;
  groupedWithPrev: boolean;
  groupedWithNext: boolean;
  isDirect: boolean;
  readCount: number;
  memberCount: number;
  myId: string;
  replySender: string | null;
  replyText: string | null;
  isNew: boolean;
  mentionNames: string[];
  highlighted: boolean;
  onActions: (m: ChatMessage) => void;
  onReply: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onOpenImages: (m: ChatMessage, index: number) => void;
  onJumpTo: (id: string) => void;
  onRetry: (m: ChatMessage) => void;
  onDiscard: (m: ChatMessage) => void;
  people: Map<string, PersonInfo>;
};

export const MessageItem = memo(function MessageItem(props: MessageItemProps) {
  const { message: m, mine, sender, showSender, groupedWithPrev, groupedWithNext, isDirect } = props;
  const longPress = useLongPress(() => {
    if (!m.local && !m.deleted_at) props.onActions(m);
  });
  const { row: swipeRow, content: swipeContent, icon: swipeIcon } = useSwipeReply<HTMLDivElement>(
    () => props.onReply(m),
    m.kind !== "system" && !m.local && !m.deleted_at,
  );

  if (m.kind === "system") {
    return (
      <div className="my-2 flex justify-center px-6">
        <span className="rounded-full bg-black/[0.06] px-3 py-1 text-center text-[12px] text-label-2 dark:bg-white/10">{m.body}</span>
      </div>
    );
  }

  const attachments = (m.attachments as unknown as Attachment[]) ?? [];
  const images = attachments.filter((a) => a.mime.startsWith("image/"));
  const files = attachments.filter((a) => !a.mime.startsWith("image/"));
  const reactions = Object.entries((m.reactions as Record<string, string[]>) ?? {}).filter(([, users]) => users.length);
  const isCard = m.kind === "poll" || m.kind === "event" || m.kind === "announcement" || m.kind === "album";
  const deleted = Boolean(m.deleted_at);
  const failed = m.local?.status === "failed";
  const sending = m.local?.status === "sending";

  let card: ReactNode = null;
  if (!deleted && isCard) {
    if (m.kind === "poll" && m.poll_id) card = <PollCard pollId={m.poll_id} />;
    else if (m.kind === "event" && m.event_id) card = <EventCard eventId={m.event_id} />;
    else if (m.kind === "announcement" && m.announcement_id) card = <AnnouncementCard announcementId={m.announcement_id} />;
    else if (m.kind === "album" && m.album_id) card = <AlbumCard albumId={m.album_id} />;
    else card = <div className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-label-3">この項目は削除されました</div>;
  }

  const radius = mine
    ? cn("rounded-[20px]", groupedWithPrev && "rounded-tr-[6px]", groupedWithNext && "rounded-br-[6px]")
    : cn("rounded-[20px]", groupedWithPrev && "rounded-tl-[6px]", groupedWithNext && "rounded-bl-[6px]");

  const meta = (
    <div className={cn("flex shrink-0 flex-col justify-end pb-0.5 text-[10px] leading-tight text-label-3 tabular", mine ? "items-end" : "items-start")}>
      {mine && !m.local && props.readCount > 0 && (
        <span className="font-medium text-accent">{isDirect ? "既読" : `既読 ${props.readCount}`}</span>
      )}
      {sending ? (
        <span className="flex items-center gap-0.5" aria-label="送信中">
          <Clock3 className="size-3" />
          送信中
        </span>
      ) : failed ? null : (
        <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
      )}
    </div>
  );

  const hasText = !deleted && m.body.trim().length > 0 && !isCard;

  const bubble = deleted ? (
    <div className={cn("px-3.5 py-2 text-[14px] text-label-3 italic ring-1 ring-separator", radius)}>メッセージが削除されました</div>
  ) : isCard ? (
    card
  ) : (
    <div
      className={cn(
        "max-w-full overflow-hidden",
        radius,
        mine ? "bg-bubble-out text-bubble-out-label" : "bg-bubble-in text-label shadow-[0_1px_1px_rgba(0,0,0,0.04)]",
        images.length > 0 && !hasText && props.replySender === null && "bg-transparent shadow-none",
        failed && "opacity-70",
      )}
    >
      {props.replySender !== null && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (m.reply_to_id) props.onJumpTo(m.reply_to_id);
          }}
          className={cn(
            "m-1.5 mb-0 block max-w-[260px] rounded-[14px] border-l-[3px] px-2.5 py-1.5 text-left text-[12px]",
            mine ? "border-white/70 bg-white/15" : "border-accent bg-surface-3",
          )}
        >
          <span className="block truncate font-semibold">{props.replySender}</span>
          <span className={cn("block truncate", mine ? "text-white/80" : "text-label-2")}>{props.replyText}</span>
        </button>
      )}
      {images.length > 0 && (
        <div className={cn(hasText || props.replySender !== null ? "p-1 pb-0" : "", "w-[min(260px,62vw)]")}>
          <div className={radius + " overflow-hidden"}>
            <ImageGrid items={images} local={m.local?.previews} onOpen={(i) => props.onOpenImages(m, i)} />
          </div>
        </div>
      )}
      {files.length > 0 && (
        <div className="space-y-1 p-1.5 pb-0">
          {files.map((f) => (
            <FileChip key={f.path} path={f.path} name={f.name} size={f.size} disabled={Boolean(m.local)} className={mine ? "bg-white/15 text-white" : ""} />
          ))}
        </div>
      )}
      {hasText && (
        <p className="px-3.5 py-2 text-[16px] leading-[1.45] whitespace-pre-wrap break-anywhere">
          <RichText text={m.body} mine={mine} mentionNames={props.mentionNames} />
          {m.edited_at && <span className={cn("ml-1 text-[11px]", mine ? "text-white/70" : "text-label-3")}>(編集済み)</span>}
        </p>
      )}
      {!hasText && files.length > 0 && <div className="h-1.5" />}
    </div>
  );

  return (
    <div
      id={`m-${m.id}`}
      ref={swipeRow}
      className={cn(
        "group/msg relative overflow-x-clip transition-colors duration-700",
        groupedWithPrev ? "mt-0.5" : "mt-3",
        props.highlighted && "bg-accent-soft",
        props.isNew && !m.local && "animate-message-in",
      )}
      style={{ touchAction: "pan-y" }}
    >
      {/* revealed by swiping the message to the left (LINE-style reply) */}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center" aria-hidden>
        <span ref={swipeIcon} className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-label opacity-0">
          <CornerUpLeft className="size-4" />
        </span>
      </span>
      <div ref={swipeContent} className={cn("flex px-3", mine ? "justify-end" : "justify-start")}>
        {!mine && (
          <div className="mr-2 w-9 shrink-0">
            {!groupedWithPrev && <Avatar name={sender?.name} src={sender?.avatar} id={m.sender_id} size={36} />}
          </div>
        )}
        <div className={cn("flex min-w-0 max-w-[78%] flex-col sm:max-w-[68%]", mine ? "items-end" : "items-start")}>
          {!mine && showSender && !groupedWithPrev && (
            <span className="mb-1 ml-1 text-[12px] font-medium text-label-2">{sender?.name ?? "退会したメンバー"}</span>
          )}
          <div className={cn("flex items-end gap-1.5", mine && "flex-row-reverse")}>
            <div
              {...longPress}
              onDoubleClick={() => !m.local && !deleted && props.onReply(m)}
              className="min-w-0 select-none sm:select-text"
              role="group"
              aria-label={`${mine ? "あなた" : (sender?.name ?? "メンバー")}のメッセージ`}
            >
              {bubble}
            </div>
            {meta}
            {!m.local && !deleted && (
              <button
                type="button"
                onClick={() => props.onActions(m)}
                aria-label="メッセージのメニュー"
                className="hidden size-7 shrink-0 items-center justify-center self-center rounded-full text-label-3 hover:bg-surface-3 sm:flex sm:opacity-0 sm:group-hover/msg:opacity-100 focus:opacity-100"
              >
                <MoreHorizontal className="size-4" />
              </button>
            )}
          </div>
          {failed && (
            <div className="mt-1 flex items-center gap-2 text-[12px] text-danger" role="alert">
              <AlertCircle className="size-3.5" aria-hidden />
              <span>{m.local?.error ?? "送信できませんでした"}</span>
              <button type="button" onClick={() => props.onRetry(m)} className="flex items-center gap-0.5 font-semibold underline-offset-2 hover:underline">
                <RotateCcw className="size-3.5" aria-hidden />
                再送信
              </button>
              <button type="button" onClick={() => props.onDiscard(m)} className="flex items-center gap-0.5 text-label-3" aria-label="送信を取り消す">
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
          {reactions.length > 0 && (
            <div className={cn("-mt-1 flex flex-wrap gap-1 px-1", mine ? "justify-end" : "justify-start")}>
              {reactions.map(([emoji, users]) => {
                const reacted = users.includes(props.myId);
                const names = users.map((u) => props.people.get(u)?.name ?? "メンバー").join("、");
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => props.onReact(m, emoji)}
                    title={names}
                    aria-label={`${emoji} ${users.length}人（${names}）${reacted ? "、リアクション済み" : ""}`}
                    aria-pressed={reacted}
                    className={cn(
                      "relative z-[1] flex h-6 items-center gap-1 rounded-full px-2 text-[13px] shadow-[var(--shadow-card)] ring-1 transition-transform active:scale-95",
                      reacted ? "bg-accent-soft ring-accent/50" : "bg-surface ring-separator",
                    )}
                  >
                    <span>{emoji}</span>
                    <span className="text-[11px] font-semibold text-label-2 tabular">{users.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
