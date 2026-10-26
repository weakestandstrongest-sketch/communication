"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/errors";
import { uploadMedia, validateFile } from "@/lib/media";
import type { Attachment, MessageRow } from "@/lib/types";

/**
 * Per-conversation message store kept outside React so it survives navigation.
 *
 * - History is loaded in pages of PAGE_SIZE (newest first) and kept sorted ascending.
 * - Realtime INSERT/UPDATE rows are merged by id; optimistic messages are reconciled by
 *   client_id, so a message never appears twice even if the realtime event arrives
 *   before the RPC response.
 * - Sending is idempotent on the server (sender_id + client_id), so retries are safe.
 * - Unsent text messages are persisted locally per user so they are never silently lost.
 */

export const PAGE_SIZE = 50;

export type LocalState = {
  status: "sending" | "failed";
  error?: string;
  files?: File[];
  previews?: string[];
  uploaded?: Attachment[];
};

export type ChatMessage = MessageRow & { local?: LocalState };

type ConvState = {
  messages: ChatMessage[];
  hasMore: boolean;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  loadingOlder: boolean;
};

const EMPTY: ConvState = { messages: [], hasMore: true, status: "idle", error: null, loadingOlder: false };
const states = new Map<string, ConvState>();
const listeners = new Map<string, Set<() => void>>();
let currentUserId: string | null = null;

const MESSAGE_SELECT = "*";

function get(cid: string): ConvState {
  return states.get(cid) ?? EMPTY;
}

function set(cid: string, next: ConvState) {
  states.set(cid, next);
  listeners.get(cid)?.forEach((l) => l());
}

function compare(a: ChatMessage, b: ChatMessage) {
  // Unconfirmed messages always stay at the bottom, in the order they were written.
  if (Boolean(a.local) !== Boolean(b.local)) return a.local ? 1 : -1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function merge(existing: ChatMessage[], incoming: MessageRow[]): ChatMessage[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  const confirmedClientIds = new Set<string>();
  for (const row of incoming) {
    byId.set(row.id, row);
    if (row.sender_id === currentUserId) confirmedClientIds.add(row.client_id);
  }
  const result: ChatMessage[] = [];
  for (const m of byId.values()) {
    if (m.local && confirmedClientIds.has(m.client_id)) {
      m.local.previews?.forEach((u) => u && URL.revokeObjectURL(u));
      dropDraft(m.client_id);
      continue;
    }
    result.push(m);
  }
  return result.sort(compare);
}

export function setChatUser(userId: string | null) {
  if (userId !== currentUserId) {
    states.clear();
    currentUserId = userId;
  }
}

export function resetChatStore() {
  states.clear();
  currentUserId = null;
}

export async function loadLatest(cid: string) {
  const state = get(cid);
  if (state.status === "loading") return;
  set(cid, { ...state, status: state.status === "ready" ? "ready" : "loading", error: null });
  const { data, error } = await getSupabase()
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", cid)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  const now = get(cid);
  if (error) {
    set(cid, { ...now, status: now.messages.length ? "ready" : "error", error: errorMessage(error) });
    return;
  }
  const rows = (data ?? []) as MessageRow[];
  const first = now.status !== "ready";
  set(cid, {
    ...now,
    messages: merge(withRestoredDrafts(cid, now.messages), rows),
    hasMore: first ? rows.length === PAGE_SIZE : now.hasMore,
    status: "ready",
    error: null,
  });
}

export async function loadOlder(cid: string) {
  const state = get(cid);
  if (state.loadingOlder || !state.hasMore || state.status !== "ready") return;
  const oldest = state.messages.find((m) => !m.local);
  if (!oldest) return;
  set(cid, { ...state, loadingOlder: true });
  const { data, error } = await getSupabase()
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", cid)
    .lt("created_at", oldest.created_at)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  const now = get(cid);
  if (error) {
    set(cid, { ...now, loadingOlder: false, error: errorMessage(error) });
    return;
  }
  const rows = (data ?? []) as MessageRow[];
  set(cid, { ...now, messages: merge(now.messages, rows), hasMore: rows.length === PAGE_SIZE, loadingOlder: false });
}

/** Applies a row coming from realtime or an RPC response. */
export function applyServerMessage(row: MessageRow) {
  const state = states.get(row.conversation_id);
  if (!state || state.status !== "ready") return;
  set(row.conversation_id, { ...state, messages: merge(state.messages, [row]) });
}

export function findMessage(cid: string, id: string): ChatMessage | undefined {
  return get(cid).messages.find((m) => m.id === id);
}

function upsertLocal(cid: string, msg: ChatMessage) {
  const state = get(cid);
  const others = state.messages.filter((m) => !(m.local && m.client_id === msg.client_id));
  set(cid, { ...state, messages: [...others, msg].sort(compare) });
}

function removeLocal(cid: string, clientId: string) {
  const state = get(cid);
  set(cid, { ...state, messages: state.messages.filter((m) => !(m.local && m.client_id === clientId)) });
}

// ---------------------------------------------------------------------------
// Unsent drafts (text only) persisted per user on this device.
// ---------------------------------------------------------------------------
type Draft = { conversation_id: string; client_id: string; body: string; reply_to_id: string | null; mentions: string[]; created_at: string };

function draftKey() {
  return currentUserId ? `tsudoi:unsent:${currentUserId}` : null;
}

function readDrafts(): Draft[] {
  const key = draftKey();
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as Draft[];
  } catch {
    return [];
  }
}

function writeDrafts(drafts: Draft[]) {
  const key = draftKey();
  if (!key) return;
  try {
    if (drafts.length) localStorage.setItem(key, JSON.stringify(drafts.slice(-50)));
    else localStorage.removeItem(key);
  } catch {
    // storage unavailable (private mode); unsent messages still stay visible in memory
  }
}

function saveDraft(d: Draft) {
  writeDrafts([...readDrafts().filter((x) => x.client_id !== d.client_id), d]);
}

function dropDraft(clientId: string) {
  writeDrafts(readDrafts().filter((x) => x.client_id !== clientId));
}

function withRestoredDrafts(cid: string, messages: ChatMessage[]): ChatMessage[] {
  const present = new Set(messages.map((m) => m.client_id));
  const restored: ChatMessage[] = readDrafts()
    .filter((d) => d.conversation_id === cid && !present.has(d.client_id))
    .map((d) => localMessage(cid, d.client_id, d.body, d.reply_to_id, d.mentions, [], d.created_at, {
      status: "failed",
      error: "送信されていません",
    }));
  return [...messages, ...restored];
}

export function clearDraftsForUser(userId: string) {
  try {
    localStorage.removeItem(`tsudoi:unsent:${userId}`);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
function localMessage(
  cid: string,
  clientId: string,
  body: string,
  replyTo: string | null,
  mentions: string[],
  attachments: Attachment[],
  createdAt: string,
  local: LocalState,
): ChatMessage {
  return {
    id: `local-${clientId}`,
    conversation_id: cid,
    sender_id: currentUserId,
    client_id: clientId,
    kind: attachments.length ? "image" : "text",
    body,
    reply_to_id: replyTo,
    mentions,
    attachments: attachments as unknown as MessageRow["attachments"],
    reactions: {},
    poll_id: null,
    event_id: null,
    announcement_id: null,
    album_id: null,
    edited_at: null,
    deleted_at: null,
    created_at: createdAt,
    local,
  };
}

export type SendInput = {
  conversationId: string;
  storagePrefix: string;
  body: string;
  replyToId?: string | null;
  mentions?: string[];
  files?: File[];
};

export function sendMessage(input: SendInput): string {
  const clientId = crypto.randomUUID();
  const files = input.files ?? [];
  for (const f of files) {
    const problem = validateFile(f);
    if (problem) throw new Error(problem);
  }
  const previews = files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : ""));
  const placeholder: Attachment[] = files.map((f, i) => ({
    path: previews[i] ? `blob:${i}` : "",
    thumb_path: null,
    name: f.name,
    mime: f.type,
    size: f.size,
    width: null,
    height: null,
  }));
  const msg = localMessage(
    input.conversationId,
    clientId,
    input.body,
    input.replyToId ?? null,
    input.mentions ?? [],
    placeholder,
    new Date().toISOString(),
    { status: "sending", files, previews, uploaded: [] },
  );
  if (!files.length) {
    saveDraft({
      conversation_id: input.conversationId,
      client_id: clientId,
      body: input.body,
      reply_to_id: input.replyToId ?? null,
      mentions: input.mentions ?? [],
      created_at: msg.created_at,
    });
  }
  upsertLocal(input.conversationId, msg);
  void deliver(input.conversationId, input.storagePrefix, msg);
  return clientId;
}

async function deliver(cid: string, prefix: string, msg: ChatMessage) {
  const local = msg.local!;
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("オフラインのため送信できませんでした");
    }
    const files = local.files ?? [];
    const uploaded = [...(local.uploaded ?? [])];
    for (let i = uploaded.length; i < files.length; i++) {
      uploaded.push(await uploadMedia(prefix, files[i]));
      local.uploaded = uploaded;
    }
    const { data, error } = await getSupabase()
      .rpc("send_message", {
        p_conversation_id: cid,
        p_client_id: msg.client_id,
        p_body: msg.body,
        p_reply_to_id: msg.reply_to_id ?? undefined,
        p_mentions: msg.mentions,
        p_attachments: uploaded as unknown as MessageRow["attachments"],
      })
      .abortSignal(AbortSignal.timeout(20000));
    if (error) throw error;
    dropDraft(msg.client_id);
    const row = data as unknown as MessageRow;
    const state = get(cid);
    if (state.status === "ready") set(cid, { ...state, messages: merge(state.messages, [row]) });
    else removeLocal(cid, msg.client_id);
  } catch (e) {
    const name = (e as { name?: string })?.name;
    const message = name === "TimeoutError" || name === "AbortError" ? "送信がタイムアウトしました" : errorMessage(e, "送信できませんでした");
    upsertLocal(cid, { ...msg, local: { ...local, status: "failed", error: message } });
  }
}

export function retryMessage(cid: string, prefix: string, clientId: string) {
  const msg = get(cid).messages.find((m) => m.local && m.client_id === clientId);
  if (!msg?.local) return;
  const next = { ...msg, local: { ...msg.local, status: "sending" as const, error: undefined } };
  upsertLocal(cid, next);
  void deliver(cid, prefix, next);
}

export function discardMessage(cid: string, clientId: string) {
  const msg = get(cid).messages.find((m) => m.local && m.client_id === clientId);
  msg?.local?.previews?.forEach((u) => u && URL.revokeObjectURL(u));
  dropDraft(clientId);
  removeLocal(cid, clientId);
}

// ---------------------------------------------------------------------------
// React binding
// ---------------------------------------------------------------------------
export function useConversationMessages(cid: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      let set = listeners.get(cid);
      if (!set) listeners.set(cid, (set = new Set()));
      set.add(cb);
      return () => {
        set!.delete(cb);
      };
    },
    [cid],
  );
  const getSnapshot = useCallback(() => get(cid), [cid]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function isLoaded(cid: string) {
  return get(cid).status === "ready";
}

export function loadedConversationIds(): string[] {
  return Array.from(states.entries())
    .filter(([, s]) => s.status === "ready")
    .map(([id]) => id);
}
