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
  const [state, setState] = useState<ConnectionState>("connecting");
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

    const rowOf = (p: RealtimePostgresChangesPayload<Row>) => (p.eventType === "DELETE" ? p.old : p.new) as Row;

    const channel = supabase
      .channel(`user:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
        if (p.eventType !== "DELETE") applyServerMessage(p.new as unknown as MessageRow);
        invalidate(qk.conversations);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members", filter: `user_id=eq.${userId}` }, () =>
        invalidate(qk.conversations),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () =>
        invalidate(qk.notifications),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "polls" }, (p) => {
        const id = rowOf(p).id as string | undefined;
        invalidate(qk.polls, ...(id ? [qk.poll(id), qk.pollResults(id)] : []));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, (p) => {
        const id = rowOf(p).id as string | undefined;
        invalidate(qk.events, ...(id ? [qk.event(id), qk.attendance(id)] : []));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "event_attendance" }, (p) => {
        const id = rowOf(p).event_id as string | undefined;
        invalidate(qk.myAttendance, ...(id ? [qk.attendance(id)] : []));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, (p) => {
        const id = rowOf(p).id as string | undefined;
        invalidate(qk.announcements, ...(id ? [qk.announcement(id)] : []));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () =>
        invalidate(qk.groups, qk.members, qk.conversations, qk.polls),
      )
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
    if (!navigator.onLine) setState("offline");

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
