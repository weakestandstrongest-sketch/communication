"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Pin, Search, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { unwrap, type PersonInfo } from "@/lib/queries";
import { formatListTime } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";

type Row = { id: string; body: string; kind: string; sender_id: string | null; created_at: string; deleted_at: string | null };

function senderName(people: Map<string, PersonInfo>, id: string | null) {
  return people.get(id ?? "")?.name ?? "退会したメンバー";
}

/** The message fixed to the top of the talk (固定). Tap to jump to it; × unpins it for everyone. */
export function PinnedBanner({
  messageId,
  people,
  onJump,
  onUnpin,
}: {
  messageId: string;
  people: Map<string, PersonInfo>;
  onJump: (id: string) => void;
  onUnpin: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["pinnedMessage", messageId],
    queryFn: async () =>
      unwrap(await getSupabase().from("messages").select("id, body, kind, sender_id, created_at, deleted_at").eq("id", messageId).maybeSingle()) as Row | null,
  });
  if (!data || data.deleted_at) return null;
  const text = data.body.trim() || (data.kind === "image" ? "写真" : data.kind === "file" ? "ファイル" : "メッセージ");
  return (
    <div className="glass hairline-b z-10 flex shrink-0 items-center gap-1 pr-1 pl-3">
      <button type="button" onClick={() => onJump(data.id)} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left" aria-label={`固定メッセージ: ${text}`}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-label text-bg">
          <Pin className="size-3.5 rotate-45" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold text-label-3">{senderName(people, data.sender_id)}</span>
          <span className="block truncate text-[14px] leading-tight">{text}</span>
        </span>
      </button>
      <button type="button" onClick={onUnpin} aria-label="固定を解除" className="flex size-9 shrink-0 items-center justify-center rounded-full text-label-3 hover:bg-surface-3">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Escapes LIKE wildcards so the query is matched literally. */
function likeLiteral(q: string) {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return <>{text}</>;
  // Show the match even when it is far into a long message.
  const start = Math.max(0, i - 24);
  return (
    <>
      {start > 0 && "…"}
      {text.slice(start, i)}
      <mark className="rounded-[4px] bg-label px-0.5 text-bg">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Full-screen search over this talk's messages (RLS limits it to talks I'm in). */
export function MessageSearch({
  conversationId,
  people,
  onClose,
  onJump,
}: {
  conversationId: string;
  people: Map<string, PersonInfo>;
  onClose: () => void;
  onJump: (id: string) => void;
}) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["messageSearch", conversationId, q],
    enabled: q.length > 0,
    queryFn: async () =>
      unwrap(
        await getSupabase()
          .from("messages")
          .select("id, body, kind, sender_id, created_at, deleted_at")
          .eq("conversation_id", conversationId)
          .is("deleted_at", null)
          .in("kind", ["text", "image", "file"])
          .ilike("body", `%${likeLiteral(q)}%`)
          .order("created_at", { ascending: false })
          .limit(50),
      ) as Row[],
  });

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg" role="dialog" aria-label="トーク内を検索">
      <div className="glass hairline-b shrink-0 pt-safe">
        <div className="flex h-14 items-center gap-1 px-2">
          <button type="button" onClick={onClose} aria-label="検索を閉じる" className="flex size-11 items-center justify-center text-accent">
            <ChevronLeft className="size-7" strokeWidth={2.2} />
          </button>
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-3 px-3.5">
            <Search className="size-4 shrink-0 text-label-3" aria-hidden />
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="メッセージを検索"
              aria-label="メッセージを検索"
              enterKeyHint="search"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-label-3"
            />
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!q ? (
          <p className="px-6 py-10 text-center text-[14px] text-label-3">このトークのメッセージを検索できます</p>
        ) : error ? (
          <p className="px-6 py-10 text-center text-[14px] text-danger">{errorMessage(error)}</p>
        ) : !data ? (
          <div className="flex justify-center py-10 text-label-3">
            <Spinner className="size-5" />
          </div>
        ) : data.length === 0 ? (
          <p className="px-6 py-10 text-center text-[14px] text-label-3">「{q}」に一致するメッセージはありません</p>
        ) : (
          <>
            <p className="px-4 pt-3 pb-1 text-[12px] font-semibold text-label-3">
              {data.length >= 50 ? "50件以上" : `${data.length}件`}
              {isFetching && " ・ 更新中…"}
            </p>
            <ul className="divide-y divide-separator">
              {data.map((m) => {
                const p = people.get(m.sender_id ?? "");
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onJump(m.id);
                      }}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-surface-3"
                    >
                      <Avatar name={p?.name} src={p?.avatar} id={m.sender_id} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[14px] font-semibold">{senderName(people, m.sender_id)}</span>
                          <span className="ml-auto shrink-0 text-[12px] text-label-3 tabular">{formatListTime(m.created_at)}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-label-2 break-anywhere">
                          <Highlight text={m.body} q={q} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
