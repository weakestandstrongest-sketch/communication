"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import type {
  Album,
  Announcement,
  AttendanceSummary,
  ConversationSummary,
  EventRow,
  MediaItem,
  MemberWithProfile,
  MyGroup,
  NotificationPreferences,
  NotificationRow,
  Poll,
  PollListItem,
  PollOption,
  PollResults,
  Profile,
} from "@/lib/types";

/** Throws the Supabase error, otherwise returns the data. Single-row lookups cast to `X | null` themselves. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return (res.data ?? null) as T;
}

export const qk = {
  me: ["me"] as const,
  groups: ["groups"] as const,
  teams: ["teams"] as const,
  members: ["members"] as const,
  invite: (groupId: string) => ["invite", groupId] as const,
  conversations: ["conversations"] as const,
  conversationMembers: (id: string) => ["conversationMembers", id] as const,
  polls: ["polls"] as const,
  poll: (id: string) => ["poll", id] as const,
  pollResults: (id: string) => ["pollResults", id] as const,
  events: ["events"] as const,
  event: (id: string) => ["event", id] as const,
  attendance: (id: string) => ["attendance", id] as const,
  myAttendance: ["myAttendance"] as const,
  announcements: ["announcements"] as const,
  announcement: (id: string) => ["announcement", id] as const,
  announcementReads: ["announcementReads"] as const,
  notifications: ["notifications"] as const,
  albums: (groupId: string) => ["albums", groupId] as const,
  album: (id: string) => ["album", id] as const,
  media: (scope: string) => ["media", scope] as const,
  prefs: ["prefs"] as const,
  settings: ["settings"] as const,
};

// ---------------------------------------------------------------------------
// Profile and groups
// ---------------------------------------------------------------------------
export function useMyProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.me,
    enabled: Boolean(userId),
    queryFn: async () => unwrap(await getSupabase().from("profiles").select("*").eq("id", userId).single()) as Profile,
  });
}

export function useMyGroups() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.groups,
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyGroup[]> => {
      const rows = unwrap(
        await getSupabase().from("group_members").select("role, group:groups(*)").eq("user_id", userId).order("joined_at"),
      );
      return (rows ?? []).filter((r) => r.group).map((r) => ({ ...r.group!, my_role: r.role }));
    },
  });
}

export type Team = { id: string; group_id: string; name: string; color: string; created_by: string | null; member_ids: string[]; mine: boolean };

/** パート・バンド of all my groups (RLS: teams of groups I belong to), with their members. */
export function useTeams() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.teams,
    enabled: Boolean(userId),
    queryFn: async (): Promise<Team[]> => {
      const rows = unwrap(
        await getSupabase().from("teams").select("id, group_id, name, color, created_by, team_members(user_id)").order("created_at"),
      );
      return (rows ?? []).map(({ team_members, ...t }) => {
        const member_ids = team_members.map((m) => m.user_id);
        return { ...t, member_ids, mine: member_ids.includes(userId!) };
      });
    },
  });
}

/** Label for where an event belongs: "グループ" or "グループ / パート・バンド" (null for personal events). */
export function useEventScope() {
  const { data: groups } = useMyGroups();
  const { data: teams } = useTeams();
  return useMemo(() => {
    const g = new Map((groups ?? []).map((x) => [x.id, x]));
    const t = new Map((teams ?? []).map((x) => [x.id, x]));
    return (e: Pick<EventRow, "group_id" | "team_id">): { name: string; color: string } | null => {
      const group = e.group_id ? g.get(e.group_id) : undefined;
      if (!group) return null;
      const team = e.team_id ? t.get(e.team_id) : undefined;
      return team ? { name: `${group.name} / ${team.name}`, color: team.color } : { name: group.name, color: group.color };
    };
  }, [groups, teams]);
}

/** All members of all my groups (RLS limits rows to groups I belong to). */
export function useAllMembers() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.members,
    enabled: Boolean(userId),
    queryFn: async (): Promise<MemberWithProfile[]> =>
      unwrap(
        await getSupabase()
          .from("group_members")
          .select("*, profile:profiles(id, display_name, avatar_url, last_seen_at, bio)")
          .order("joined_at"),
      ) as MemberWithProfile[],
  });
}

export function useGroupMembers(groupId: string | null | undefined) {
  const q = useAllMembers();
  const data = useMemo(() => (groupId ? q.data?.filter((m) => m.group_id === groupId) : undefined), [q.data, groupId]);
  return { ...q, data };
}

export type PersonInfo = { id: string; name: string; avatar: string | null; lastSeen: string | null };

/** Lookup of people I can see, for rendering names and avatars. */
export function usePeople() {
  const { data: members } = useAllMembers();
  const { data: me } = useMyProfile();
  return useMemo(() => {
    const map = new Map<string, PersonInfo>();
    for (const m of members ?? []) {
      if (m.profile)
        map.set(m.user_id, {
          id: m.user_id,
          name: m.profile.display_name,
          avatar: m.profile.avatar_url,
          lastSeen: m.profile.last_seen_at,
        });
    }
    if (me) map.set(me.id, { id: me.id, name: me.display_name, avatar: me.avatar_url, lastSeen: me.last_seen_at });
    return map;
  }, [members, me]);
}

export function useGroupInvite(groupId: string) {
  return useQuery({
    queryKey: qk.invite(groupId),
    queryFn: async () =>
      unwrap(await getSupabase().from("group_invites").select("code, enabled").eq("group_id", groupId).maybeSingle()) as {
        code: string;
        enabled: boolean;
      } | null,
  });
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export function useConversations() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.conversations,
    enabled: Boolean(userId),
    queryFn: async () => unwrap(await getSupabase().rpc("get_conversations")) as ConversationSummary[],
  });
}

export function useUnreadTotal() {
  const { data } = useConversations();
  return useMemo(() => (data ?? []).reduce((sum, c) => sum + (c.muted ? 0 : Number(c.unread_count)), 0), [data]);
}

export function useConversationMembers(conversationId: string) {
  return useQuery({
    queryKey: qk.conversationMembers(conversationId),
    queryFn: async () =>
      unwrap(
        await getSupabase()
          .from("conversation_members")
          .select("user_id, last_read_at, muted, pinned")
          .eq("conversation_id", conversationId),
      ),
  });
}

// ---------------------------------------------------------------------------
// Polls
// ---------------------------------------------------------------------------
export function usePolls() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.polls,
    enabled: Boolean(userId),
    queryFn: async () => unwrap(await getSupabase().rpc("list_polls", {})) as PollListItem[],
  });
}

export function isPollClosed(p: Pick<Poll, "closed_at" | "deadline">) {
  return Boolean(p.closed_at) || (p.deadline ? new Date(p.deadline).getTime() <= Date.now() : false);
}

export function useUnansweredPollCount() {
  const { data } = usePolls();
  return useMemo(() => (data ?? []).filter((p) => !p.responded && !isPollClosed(p)).length, [data]);
}

export function usePoll(pollId: string | null | undefined) {
  return useQuery({
    queryKey: qk.poll(pollId ?? ""),
    enabled: Boolean(pollId),
    queryFn: async () => {
      const poll = unwrap(
        await getSupabase().from("polls").select("*, options:poll_options(*)").eq("id", pollId!).maybeSingle(),
      ) as (Poll & { options: PollOption[] }) | null;
      if (poll) poll.options.sort((a, b) => a.position - b.position);
      return poll;
    },
  });
}

export function usePollResults(pollId: string | null | undefined) {
  return useQuery({
    queryKey: qk.pollResults(pollId ?? ""),
    enabled: Boolean(pollId),
    queryFn: async () => unwrap(await getSupabase().rpc("get_poll_results", { p_poll_id: pollId! })) as unknown as PollResults,
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
/** Events from 60 days ago to 1 year ahead across my groups (small groups → one query). */
export function useEvents() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.events,
    enabled: Boolean(userId),
    queryFn: async () => {
      const from = new Date(Date.now() - 60 * 86400000).toISOString();
      const to = new Date(Date.now() + 365 * 86400000).toISOString();
      return unwrap(
        await getSupabase().from("events").select("*").gte("starts_at", from).lte("starts_at", to).order("starts_at").limit(1000),
      ) as EventRow[];
    },
  });
}

export function useEvent(eventId: string | null | undefined) {
  return useQuery({
    queryKey: qk.event(eventId ?? ""),
    enabled: Boolean(eventId),
    queryFn: async () => unwrap(await getSupabase().from("events").select("*").eq("id", eventId!).maybeSingle()) as EventRow | null,
  });
}

export function useAttendance(eventId: string | null | undefined) {
  return useQuery({
    queryKey: qk.attendance(eventId ?? ""),
    enabled: Boolean(eventId),
    queryFn: async () =>
      unwrap(await getSupabase().rpc("get_event_attendance", { p_event_id: eventId! })) as unknown as AttendanceSummary,
  });
}

/** My own attendance answers (to find events that still need a response). */
export function useMyAttendance() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.myAttendance,
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = unwrap(await getSupabase().from("event_attendance").select("event_id, status").eq("user_id", userId));
      return new Map((rows ?? []).map((r) => [r.event_id, r.status]));
    },
  });
}

export function needsAttendance(e: EventRow, mine: Map<string, string> | undefined) {
  if (!e.rsvp_enabled || e.canceled_at) return false;
  if (new Date(e.starts_at).getTime() < Date.now()) return false;
  if (e.rsvp_deadline && new Date(e.rsvp_deadline).getTime() <= Date.now()) return false;
  return !mine?.has(e.id);
}

export function usePendingAttendanceCount() {
  const { data: events } = useEvents();
  const { data: mine } = useMyAttendance();
  return useMemo(() => (events ?? []).filter((e) => needsAttendance(e, mine)).length, [events, mine]);
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------
export function useAnnouncements() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.announcements,
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap(
        await getSupabase()
          .from("announcements")
          .select("*")
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
      ) as Announcement[],
  });
}

export function useAnnouncement(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.announcement(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () =>
      unwrap(await getSupabase().from("announcements").select("*").eq("id", id!).maybeSingle()) as Announcement | null,
  });
}

export function useAnnouncementReads() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.announcementReads,
    enabled: Boolean(userId),
    queryFn: async () => {
      const rows = unwrap(await getSupabase().from("announcement_reads").select("announcement_id").eq("user_id", userId));
      return new Set((rows ?? []).map((r) => r.announcement_id));
    },
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export function useNotifications() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.notifications,
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap(
        await getSupabase()
          .from("notifications")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100),
      ) as NotificationRow[],
  });
}

export function useUnreadNotificationCount() {
  const { data } = useNotifications();
  return useMemo(() => (data ?? []).filter((n) => !n.read_at).length, [data]);
}

export function useNotificationPrefs() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.prefs,
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap(await getSupabase().from("notification_preferences").select("*").eq("user_id", userId)) as NotificationPreferences[],
  });
}

export function useUserSettings() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.settings,
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap(await getSupabase().from("user_settings").select("*").eq("user_id", userId).maybeSingle()) as {
        user_id: string;
        push_preview: boolean;
      } | null,
  });
}

// ---------------------------------------------------------------------------
// Albums and media
// ---------------------------------------------------------------------------
export function useAlbums(groupId: string) {
  return useQuery({
    queryKey: qk.albums(groupId),
    queryFn: async () => {
      const albums = unwrap(
        await getSupabase().from("albums").select("*").eq("group_id", groupId).order("created_at", { ascending: false }),
      ) as Album[];
      const ids = albums.map((a) => a.id);
      const covers = ids.length
        ? (unwrap(
            await getSupabase()
              .from("media_items")
              .select("album_id, thumb_path, storage_path, created_at")
              .in("album_id", ids)
              .order("created_at", { ascending: false })
              .limit(500),
          ) as Pick<MediaItem, "album_id" | "thumb_path" | "storage_path" | "created_at">[])
        : [];
      return albums.map((a) => {
        const items = covers.filter((c) => c.album_id === a.id);
        return { ...a, count: items.length, cover: items[0]?.thumb_path ?? items[0]?.storage_path ?? null };
      });
    },
  });
}

export function useAlbum(albumId: string) {
  return useQuery({
    queryKey: qk.album(albumId),
    queryFn: async () => unwrap(await getSupabase().from("albums").select("*").eq("id", albumId).maybeSingle()) as Album | null,
  });
}

/** scope: "album:<id>" | "group:<id>" | "conversation:<id>" */
export function useMedia(scope: string) {
  return useQuery({
    queryKey: qk.media(scope),
    queryFn: async () => {
      const [kind, id] = scope.split(":");
      const column = kind === "album" ? "album_id" : kind === "group" ? "group_id" : "conversation_id";
      return unwrap(
        await getSupabase()
          .from("media_items")
          .select("*")
          .eq(column, id)
          .order("created_at", { ascending: false })
          .limit(300),
      ) as MediaItem[];
    },
  });
}
