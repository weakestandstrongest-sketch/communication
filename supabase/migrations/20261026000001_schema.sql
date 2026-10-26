-- つどい: core schema
-- Tables are normalized; a few counters/caches (response_count, reactions, last_message_at)
-- are maintained by triggers so that list screens and realtime updates stay cheap.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.group_role as enum ('owner', 'admin', 'member');
create type public.conversation_kind as enum ('group', 'direct');
create type public.message_kind as enum ('text', 'image', 'file', 'poll', 'event', 'announcement', 'album', 'system');
create type public.attendance_status as enum ('going', 'not_going', 'maybe');
create type public.poll_result_visibility as enum ('always', 'after_vote', 'after_close', 'admins');
create type public.event_category as enum ('practice', 'match', 'meeting', 'social', 'trip', 'other');

-- ---------------------------------------------------------------------------
-- Utilities
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  bytes bytea := extensions.gen_random_bytes(10);
begin
  for i in 0..9 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 1000),
  bio text not null default '' check (char_length(bio) <= 200),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_preview boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Groups and membership
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  color text not null default 'indigo' check (color in ('indigo', 'blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'slate')),
  member_can_invite boolean not null default true,
  member_can_create_polls boolean not null default true,
  member_can_create_events boolean not null default true,
  member_can_post_announcements boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger groups_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

create table public.group_invites (
  group_id uuid primary key references public.groups (id) on delete cascade,
  code text not null unique default public.generate_invite_code(),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
-- Exactly one owner per group at most.
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  group_id uuid references public.groups (id) on delete cascade,
  direct_key text unique,
  last_message_at timestamptz,
  last_message_id uuid,
  created_at timestamptz not null default now(),
  constraint conversations_kind_check check (
    (kind = 'group' and group_id is not null and direct_key is null)
    or (kind = 'direct' and group_id is null and direct_key is not null)
  )
);
create unique index conversations_one_group_chat on public.conversations (group_id) where kind = 'group';

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  pinned boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

-- ---------------------------------------------------------------------------
-- Polls
-- ---------------------------------------------------------------------------
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  multiple boolean not null default false,
  allow_free_text boolean not null default false,
  anonymous boolean not null default false,
  allow_change boolean not null default true,
  result_visibility public.poll_result_visibility not null default 'always',
  deadline timestamptz,
  closed_at timestamptz,
  response_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index polls_group_idx on public.polls (group_id, created_at desc);
create index polls_deadline_idx on public.polls (deadline) where closed_at is null and deadline is not null;
create trigger polls_updated_at before update on public.polls
  for each row execute function public.set_updated_at();

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 100),
  position integer not null,
  unique (poll_id, position)
);

-- One row per member who answered. Holds the optional free-text answer.
create table public.poll_responses (
  poll_id uuid not null references public.polls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  free_text text check (free_text is null or char_length(free_text) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index poll_responses_user_idx on public.poll_responses (user_id);

create table public.poll_votes (
  poll_id uuid not null,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, option_id, user_id),
  foreign key (poll_id, user_id) references public.poll_responses (poll_id, user_id) on delete cascade
);
create index poll_votes_option_idx on public.poll_votes (option_id);

-- ---------------------------------------------------------------------------
-- Events and attendance
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 3000),
  location text not null default '' check (char_length(location) <= 200),
  category public.event_category not null default 'other',
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  rsvp_enabled boolean not null default true,
  rsvp_deadline timestamptz,
  attendance_visibility text not null default 'members' check (attendance_visibility in ('members', 'admins')),
  image_path text,
  going_count integer not null default 0,
  maybe_count integer not null default 0,
  not_going_count integer not null default 0,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_check check (ends_at is null or ends_at >= starts_at)
);
create index events_group_time_idx on public.events (group_id, starts_at);
create index events_time_idx on public.events (starts_at) where canceled_at is null;
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table public.event_attendance (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.attendance_status not null,
  comment text not null default '' check (char_length(comment) <= 200),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_attendance_user_idx on public.event_attendance (user_id);

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 5000),
  pinned boolean not null default false,
  important boolean not null default false,
  poll_id uuid references public.polls (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_group_idx on public.announcements (group_id, pinned desc, created_at desc);
create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index announcement_reads_user_idx on public.announcement_reads (user_id);

-- ---------------------------------------------------------------------------
-- Albums and media
-- ---------------------------------------------------------------------------
create table public.albums (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index albums_group_idx on public.albums (group_id, created_at desc);
create trigger albums_updated_at before update on public.albums
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  client_id uuid not null,
  kind public.message_kind not null default 'text',
  body text not null default '' check (char_length(body) <= 5000),
  reply_to_id uuid references public.messages (id) on delete set null,
  mentions uuid[] not null default '{}',
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  -- Cached aggregate of message_reactions: {"👍": ["user-id", ...]}
  reactions jsonb not null default '{}'::jsonb,
  poll_id uuid references public.polls (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  announcement_id uuid references public.announcements (id) on delete set null,
  album_id uuid references public.albums (id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sender_id, client_id)
);
create index messages_conversation_time_idx on public.messages (conversation_id, created_at desc, id desc);
create index messages_reply_idx on public.messages (reply_to_id) where reply_to_id is not null;
create index messages_poll_idx on public.messages (poll_id) where poll_id is not null;
create index messages_event_idx on public.messages (event_id) where event_id is not null;

alter table public.conversations
  add constraint conversations_last_message_fk foreign key (last_message_id)
  references public.messages (id) on delete set null;

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  album_id uuid references public.albums (id) on delete cascade,
  uploader_id uuid references public.profiles (id) on delete set null,
  storage_path text not null unique check (char_length(storage_path) <= 500),
  thumb_path text check (thumb_path is null or char_length(thumb_path) <= 500),
  mime_type text not null check (char_length(mime_type) <= 100),
  file_name text not null default '' check (char_length(file_name) <= 200),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  constraint media_items_scope_check check (group_id is not null or conversation_id is not null)
);
create index media_items_group_idx on public.media_items (group_id, created_at desc);
create index media_items_album_idx on public.media_items (album_id, created_at desc);
create index media_items_conversation_idx on public.media_items (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text not null default '/',
  actor_id uuid references public.profiles (id) on delete set null,
  ref_id uuid,
  dedupe_key text,
  push boolean not null default true,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  messages boolean not null default true,
  mentions boolean not null default true,
  polls boolean not null default true,
  events boolean not null default true,
  announcements boolean not null default true,
  reminders boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id)
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text not null default '' check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Server-side push configuration (not exposed through the API).
create table private.push_config (
  id boolean primary key default true check (id),
  dispatch_url text,
  dispatch_secret text
);
insert into private.push_config (id) values (true);
