import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
type Fns = Database["public"]["Functions"];

export type Profile = Tables["profiles"]["Row"];
export type Group = Tables["groups"]["Row"];
export type GroupMember = Tables["group_members"]["Row"];
export type GroupRole = Database["public"]["Enums"]["group_role"];
export type Conversation = Tables["conversations"]["Row"];
export type ConversationMember = Tables["conversation_members"]["Row"];
export type MessageRow = Tables["messages"]["Row"];
export type MessageKind = Database["public"]["Enums"]["message_kind"];
export type Poll = Tables["polls"]["Row"];
export type PollOption = Tables["poll_options"]["Row"];
export type EventRow = Tables["events"]["Row"];
export type EventCategory = Database["public"]["Enums"]["event_category"];
export type AttendanceStatus = Database["public"]["Enums"]["attendance_status"];
export type Announcement = Tables["announcements"]["Row"];
export type Album = Tables["albums"]["Row"];
export type MediaItem = Tables["media_items"]["Row"];
export type NotificationRow = Tables["notifications"]["Row"];
export type NotificationPreferences = Tables["notification_preferences"]["Row"];

export type ConversationSummary = Fns["get_conversations"]["Returns"][number];
export type PollListItem = Fns["list_polls"]["Returns"][number];

export type Attachment = {
  path: string;
  thumb_path: string | null;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
};

export type MemberWithProfile = GroupMember & {
  profile: Pick<Profile, "id" | "display_name" | "avatar_url" | "last_seen_at" | "bio"> | null;
};

export type MyGroup = Group & { my_role: GroupRole };

export type PollResults = {
  poll_id: string;
  visible: boolean;
  closed: boolean;
  responded: boolean;
  response_count: number;
  eligible_count: number;
  my_option_ids: string[];
  my_free_text: string | null;
  options: Array<{ id: string; label: string; position: number; count: number | null; voters: string[] | null }>;
  free_texts: Array<{ user_id: string | null; text: string }> | null;
  non_respondents: string[] | null;
};

export type AttendanceSummary = {
  can_view_individuals: boolean;
  member_count: number;
  going: number;
  maybe: number;
  not_going: number;
  mine: { status: AttendanceStatus; comment: string } | null;
  responses: Array<{ user_id: string; status: AttendanceStatus; comment: string; updated_at: string }> | null;
  non_respondents: string[] | null;
};

export const ROLE_LABEL: Record<GroupRole, string> = { owner: "オーナー", admin: "管理者", member: "メンバー" };

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  practice: "練習",
  match: "試合・大会",
  meeting: "ミーティング",
  social: "交流・イベント",
  trip: "合宿・遠征",
  other: "その他",
};

export const CATEGORY_COLOR: Record<EventCategory, string> = {
  practice: "#3d7be0",
  match: "#e0503a",
  meeting: "#7a5bd1",
  social: "#e08a1a",
  trip: "#1c9c86",
  other: "#7c8290",
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = { going: "参加", not_going: "不参加", maybe: "未定" };
