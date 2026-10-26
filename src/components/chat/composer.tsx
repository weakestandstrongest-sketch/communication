"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, FileUp, ImagePlus, Megaphone, Plus, SendHorizontal, Vote, X, Pencil, CornerUpLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { sendMessage, type ChatMessage } from "@/lib/chat-store";
import { validateFile } from "@/lib/media";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import type { PersonInfo } from "@/lib/queries";
import { Avatar } from "@/components/ui/avatar";
import { ActionSheet, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { PollForm } from "@/components/polls/poll-form";
import { EventForm } from "@/components/events/event-form";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { cn } from "@/lib/cn";

const drafts = new Map<string, string>();

type Props = {
  conversationId: string;
  storagePrefix: string;
  groupId: string | null;
  members: PersonInfo[];
  myId: string;
  replyTo: { message: ChatMessage; senderName: string } | null;
  onCancelReply: () => void;
  editing: ChatMessage | null;
  onCancelEdit: () => void;
  onTyping: () => void;
  onSent: () => void;
  disabledReason?: string | null;
};

export function Composer(props: Props) {
  const { conversationId } = props;
  const [text, setText] = useState(() => drafts.get(conversationId) ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [menu, setMenu] = useState(false);
  const [create, setCreate] = useState<"poll" | "event" | "announcement" | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIds, setMentionIds] = useState<Map<string, string>>(new Map());
  const [savingEdit, setSavingEdit] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [prevEditing, setPrevEditing] = useState<ChatMessage | null>(null);

  // Entering edit mode loads the message text; leaving it restores the draft.
  if (props.editing !== prevEditing) {
    setPrevEditing(props.editing);
    setText(props.editing ? props.editing.body : (drafts.get(conversationId) ?? ""));
  }

  useEffect(() => {
    if (!props.editing) drafts.set(conversationId, text);
  }, [text, conversationId, props.editing]);

  useEffect(() => {
    if (props.replyTo || props.editing) textarea.current?.focus();
  }, [props.replyTo, props.editing]);

  // Auto-grow up to ~6 lines.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, [text]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return props.members.filter((m) => m.id !== props.myId && m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, props.members, props.myId]);

  const updateMentionQuery = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = /(?:^|\s)@([^\s@]{0,20})$/.exec(before);
    setMentionQuery(match ? match[1] : null);
  };

  const insertMention = (person: PersonInfo) => {
    const el = textarea.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,20})$/, `@${person.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setMentionIds(new Map(mentionIds).set(person.name, person.id));
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    for (const f of incoming) {
      const problem = validateFile(f);
      if (problem) {
        toast.show(problem, "error");
        return;
      }
    }
    setFiles((prev) => [...prev, ...incoming].slice(0, 10));
  };

  const submit = async () => {
    if (props.disabledReason) return;
    const body = text.replace(/\s+$/, "");
    if (props.editing) {
      if (!body.trim()) return;
      setSavingEdit(true);
      const { error } = await getSupabase().rpc("edit_message", { p_message_id: props.editing.id, p_body: body });
      setSavingEdit(false);
      if (error) return toast.show(errorMessage(error), "error");
      toast.show("メッセージを編集しました");
      props.onCancelEdit();
      return;
    }
    if (!body.trim() && files.length === 0) return;
    const mentions = Array.from(mentionIds.entries())
      .filter(([name]) => body.includes(`@${name}`))
      .map(([, id]) => id);
    try {
      sendMessage({
        conversationId,
        storagePrefix: props.storagePrefix,
        body,
        replyToId: props.replyTo?.message.id ?? null,
        mentions,
        files,
      });
    } catch (e) {
      toast.show(errorMessage(e), "error");
      return;
    }
    setText("");
    drafts.delete(conversationId);
    setFiles([]);
    setMentionIds(new Map());
    props.onCancelReply();
    props.onSent();
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Never send while the Japanese IME is converting text.
    if (e.nativeEvent.isComposing || composing.current || e.keyCode === 229) return;
    if (mentionCandidates.length && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      insertMention(mentionCandidates[0]);
      return;
    }
    if (e.key === "Escape") {
      if (props.editing) props.onCancelEdit();
      else if (props.replyTo) props.onCancelReply();
      setMentionQuery(null);
      return;
    }
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !coarse) {
      e.preventDefault();
      void submit();
    }
  };

  const canSend = !props.disabledReason && (text.trim().length > 0 || files.length > 0) && !savingEdit;

  return (
    <div className="relative">
      {mentionCandidates.length > 0 && (
        <ul
          role="listbox"
          aria-label="メンションするメンバー"
          className="absolute inset-x-2 bottom-full mb-2 max-h-60 overflow-y-auto rounded-2xl bg-surface p-1 shadow-[var(--shadow-float)] ring-1 ring-separator"
        >
          {mentionCandidates.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(p)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[15px] hover:bg-surface-2"
              >
                <Avatar name={p.name} src={p.avatar} id={p.id} size={28} />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(props.replyTo || props.editing) && (
        <div className="flex items-center gap-2 border-t border-separator bg-surface px-4 py-2">
          {props.editing ? <Pencil className="size-4 shrink-0 text-accent" aria-hidden /> : <CornerUpLeft className="size-4 shrink-0 text-accent" aria-hidden />}
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold text-accent">{props.editing ? "メッセージを編集" : `${props.replyTo!.senderName}に返信`}</p>
            <p className="truncate text-label-3">{(props.editing ?? props.replyTo!.message).body || "写真・ファイル"}</p>
          </div>
          <button
            type="button"
            onClick={props.editing ? props.onCancelEdit : props.onCancelReply}
            aria-label="キャンセル"
            className="flex size-8 items-center justify-center rounded-full text-label-3 hover:bg-surface-3"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="scrollbar-none flex gap-2 overflow-x-auto border-t border-separator bg-surface px-3 py-2" aria-label="添付ファイル">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative shrink-0">
              {f.type.startsWith("image/") ? (
                <FilePreview file={f} />
              ) : (
                <div className="flex h-16 w-36 flex-col justify-center rounded-xl bg-surface-3 px-3 text-[12px]">
                  <span className="truncate font-medium">{f.name}</span>
                  <span className="text-label-3">{formatBytes(f.size)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                aria-label={`${f.name}を外す`}
                className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-label text-surface"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="glass hairline-t flex items-end gap-1.5 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        {!props.editing && (
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label="添付・作成メニュー"
            disabled={Boolean(props.disabledReason)}
            className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-soft disabled:opacity-40"
          >
            <Plus className="size-6" strokeWidth={2.2} />
          </button>
        )}
        <label className="sr-only" htmlFor={`composer-${conversationId}`}>
          メッセージ
        </label>
        <textarea
          id={`composer-${conversationId}`}
          ref={textarea}
          rows={1}
          value={text}
          maxLength={5000}
          disabled={Boolean(props.disabledReason)}
          placeholder={props.disabledReason ?? "メッセージを入力"}
          onChange={(e) => {
            setText(e.target.value);
            updateMentionQuery(e.target.value, e.target.selectionStart);
            props.onTyping();
          }}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          enterKeyHint="send"
          className="max-h-[148px] min-h-10 flex-1 resize-none rounded-[20px] border border-separator-strong bg-surface px-4 py-[9px] text-[16px] leading-[1.35] outline-none placeholder:text-label-3 focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          aria-label={props.editing ? "編集を保存" : "送信"}
          className={cn(
            "mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full transition-all",
            canSend ? "scale-100 bg-accent text-accent-contrast" : "scale-90 bg-surface-3 text-label-4",
          )}
        >
          <SendHorizontal className="size-5" />
        </button>
      </div>

      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.mp3,.m4a,.mp4,.mov,image/*"
        onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))}
      />

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: "写真", icon: <ImagePlus />, onSelect: () => photoInput.current?.click() },
          { label: "ファイル", icon: <FileUp />, onSelect: () => fileInput.current?.click() },
          { label: "投票を作成", icon: <Vote />, onSelect: () => setCreate("poll"), hidden: !props.groupId },
          { label: "予定・出欠確認を作成", icon: <CalendarPlus />, onSelect: () => setCreate("event"), hidden: !props.groupId },
          { label: "お知らせを投稿", icon: <Megaphone />, onSelect: () => setCreate("announcement"), hidden: !props.groupId },
        ]}
      />

      {props.groupId && (
        <>
          <Sheet open={create === "poll"} onClose={() => setCreate(null)} title="投票を作成" size="lg">
            <PollForm groupId={props.groupId} onDone={() => (setCreate(null), props.onSent())} />
          </Sheet>
          <Sheet open={create === "event"} onClose={() => setCreate(null)} title="予定を作成" size="lg">
            <EventForm groupId={props.groupId} onDone={() => (setCreate(null), props.onSent())} />
          </Sheet>
          <Sheet open={create === "announcement"} onClose={() => setCreate(null)} title="お知らせを投稿" size="lg">
            <AnnouncementForm groupId={props.groupId} onDone={() => (setCreate(null), props.onSent())} />
          </Sheet>
        </>
      )}
    </div>
  );
}

function FilePreview({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element -- local preview
  return <img src={url} alt="" className="size-16 rounded-xl object-cover" />;
}
