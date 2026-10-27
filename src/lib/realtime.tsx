"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { applyServerMessage, loadLatest, loadedConversationIds } from "@/lib/chat-store";
import { qk } from "@/lib/queries";
import type { MessageRow } from "@/lib/types";

export type ConnectionState = "connecting" | "online" | "offline" | "reconnecting";
const ConnectionContext = createContext<ConnectionState>("connecting");

export function useConnection() {
  return useContext(ConnectionContext);
}

type Row = Record<string, unknown>;

/**
 * One realtime channel per signed-in user. Postgres changes are filtered by RLS on the
 * server, so each member only receives rows from their own groups/conversations.
 * After a reconnect (or returning to the tab) cached data is refreshed to catch up on
 * anything missed while disconnected.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "connecting",
  );
  const hadConnection = useRef(false);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingKeys = new Set<string>();

    // Coalesce bursts of events into one refetch per query key.
    const invalidate = (...keys: ReadonlyArray<readonly unknown[]>) => {
      keys.forEach((k) => pendingKeys.add(JSON.stringify(k)));
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null;
        const list = Array.from(pendingKeys);
        pendingKeys.clear();
        list.forEach((k) => queryClient.invalidateQueries({ queryKey: JSON.parse(k) }));
      }, 250);
    };

    const resync = () => {
      queryClient.invalidateQueries();
      loadedConversationIds().forEach((cid) => void loadLatest(cid));
    };

    // Only INSERT and UPDATE: Realtime cannot apply RLS to DELETE events, so subscribing to
    // them would reveal deleted row ids to every signed-in user. Deleted polls/events/
    // announcements still reach members through the UPDATE of their chat card (FK set null).
    const changes = ["INSERT", "UPDATE"] as const;
    let channel = supabase.channel(`user:${userId}`);
    const on = (table: string, handler: (row: Row) => void, filter?: string) => {
      for (const event of changes) {
        channel = channel.on("postgres_changes", { event, schema: "public", table, ...(filter ? { filter } : {}) }, (p: RealtimePostgresChangesPayload<Row>) =>
          handler(p.new as Row),
        );
      }
    };

    on("messages", (row) => {
      applyServerMessage(row as unknown as MessageRow);
      invalidate(qk.conversations);
      if (row.kind !== "text" && row.kind !== "image" && row.kind !== "file" && row.kind !== "system") {
        invalidate(qk.polls, qk.events, qk.announcements);
      }
    });
    on("conversation_members", () => invalidate(qk.conversations), `user_id=eq.${userId}`);
    on("notifications", () => invalidate(qk.notifications), `user_id=eq.${userId}`);
    on("polls", (row) => invalidate(qk.polls, qk.poll(row.id as string), qk.pollResults(row.id as string)));
    on("events", (row) => invalidate(qk.events, qk.event(row.id as string), qk.attendance(row.id as string)));
    on("event_attendance", (row) => invalidate(qk.myAttendance, qk.attendance(row.event_id as string)));
    on("announcements", (row) => invalidate(qk.announcements, qk.announcement(row.id as string)));
    // 意見箱: these rows carry no author, so they are safe to publish.
    on("feedback_posts", () => invalidate(["feedback"], ["feedbackThread"], ["feedbackTopics"]));
    on("feedback_replies", () => invalidate(["feedbackThread"], ["feedback"]));
    on("group_members", () => invalidate(qk.groups, qk.members, qk.conversations, qk.polls));

    channel
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (hadConnection.current) resync();
          hadConnection.current = true;
          setState("online");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setState(navigator.onLine ? "reconnecting" : "offline");
        } else if (status === "CLOSED") {
          setState("reconnecting");
        }
      });

    const onOnline = () => {
      setState("reconnecting");
      resync();
    };
    const onOffline = () => setState("offline");
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > 30_000) {
        // Mobile browsers may suspend sockets in the background.
        hiddenAt.current = null;
        resync();
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return <ConnectionContext.Provider value={state}>{children}</ConnectionContext.Provider>;
}
