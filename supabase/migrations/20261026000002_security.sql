-- つどい: access-control helpers, consistency triggers and Row Level Security.
--
-- Model:
--   * Every private table has RLS enabled.
--   * Reads are allowed only to members of the owning group / conversation.
--   * Most writes go through SECURITY DEFINER RPCs (see 0003) that validate roles,
--     deadlines and invariants. Direct table writes are allowed only where a simple
--     policy fully expresses the rule (reactions, albums, preferences, ...).

-- ---------------------------------------------------------------------------
-- Helper predicates (SECURITY DEFINER so they can be used inside policies without
-- recursive RLS evaluation). They always use the caller's auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = (select auth.uid()) and role in ('owner', 'admin')
  );
$$;

create or replace function public.group_role_of(p_group_id uuid)
returns public.group_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.group_members
  where group_id = p_group_id and user_id = (select auth.uid());
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.can_view_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    or exists (
      select 1 from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
    )
    or exists (
      select 1 from public.conversation_members mine
      join public.conversation_members theirs on theirs.conversation_id = mine.conversation_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
    );
$$;

create or replace function public.poll_group_id(p_poll_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select group_id from public.polls where id = p_poll_id;
$$;

create or replace function public.event_group_id(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select group_id from public.events where id = p_event_id;
$$;

create or replace function public.can_view_event_attendance(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and public.is_group_member(e.group_id)
      and (e.attendance_visibility = 'members' or public.is_group_admin(e.group_id) or e.created_by = (select auth.uid()))
  );
$$;

-- Media rows may only be created for storage objects the caller uploaded.
create or replace function public.owns_storage_object(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from storage.objects
    where bucket_id = 'media' and name = p_path and owner_id = (select auth.uid())::text
  );
$$;

-- ---------------------------------------------------------------------------
-- Profile creation / sync after Google sign-in
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'メンバー'
  );
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(v_name, 50),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the Google avatar fresh unless the user has replaced it.
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avatar text := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
begin
  if v_avatar is not null and v_avatar is distinct from coalesce(old.raw_user_meta_data ->> 'avatar_url', old.raw_user_meta_data ->> 'picture') then
    update public.profiles set avatar_url = v_avatar where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- ---------------------------------------------------------------------------
-- Group chat membership mirrors group membership
-- ---------------------------------------------------------------------------
create or replace function public.sync_group_conversation_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.conversation_members (conversation_id, user_id)
    select c.id, new.user_id from public.conversations c
    where c.group_id = new.group_id and c.kind = 'group'
    on conflict do nothing;
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.conversation_members cm
    using public.conversations c
    where cm.conversation_id = c.id and c.group_id = old.group_id and c.kind = 'group' and cm.user_id = old.user_id;
    delete from public.notification_preferences where group_id = old.group_id and user_id = old.user_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger group_members_sync_conversations
  after insert or delete on public.group_members
  for each row execute function public.sync_group_conversation_membership();

-- ---------------------------------------------------------------------------
-- Counters and caches
-- ---------------------------------------------------------------------------
create or replace function public.update_poll_response_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll uuid := coalesce(new.poll_id, old.poll_id);
begin
  update public.polls
  set response_count = (select count(*) from public.poll_responses where poll_id = v_poll)
  where id = v_poll;
  return null;
end;
$$;

create trigger poll_responses_count
  after insert or delete on public.poll_responses
  for each row execute function public.update_poll_response_count();

create or replace function public.update_event_attendance_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
begin
  update public.events e
  set going_count = c.going, maybe_count = c.maybe, not_going_count = c.not_going
  from (
    select
      count(*) filter (where status = 'going') as going,
      count(*) filter (where status = 'maybe') as maybe,
      count(*) filter (where status = 'not_going') as not_going
    from public.event_attendance where event_id = v_event
  ) c
  where e.id = v_event;
  return null;
end;
$$;

create trigger event_attendance_counts
  after insert or update or delete on public.event_attendance
  for each row execute function public.update_event_attendance_counts();

create or replace function public.refresh_message_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message uuid := coalesce(new.message_id, old.message_id);
begin
  update public.messages m
  set reactions = coalesce((
    select jsonb_object_agg(emoji, users)
    from (
      select emoji, jsonb_agg(user_id order by created_at) as users
      from public.message_reactions where message_id = v_message
      group by emoji
    ) r
  ), '{}'::jsonb)
  where m.id = v_message;
  return null;
end;
$$;

create trigger message_reactions_refresh
  after insert or delete on public.message_reactions
  for each row execute function public.refresh_message_reactions();

-- Reactions inherit their conversation from the message (never trust the client).
create or replace function public.set_reaction_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select conversation_id into new.conversation_id from public.messages where id = new.message_id;
  if new.conversation_id is null then
    raise exception 'message not found';
  end if;
  return new;
end;
$$;

create trigger message_reactions_set_conversation
  before insert on public.message_reactions
  for each row execute function public.set_reaction_conversation();

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at, last_message_id = new.id
  where id = new.conversation_id and (last_message_at is null or last_message_at <= new.created_at);
  return null;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- Only admins may pin; the group of an announcement never changes.
create or replace function public.guard_announcement_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_id <> old.group_id or new.author_id is distinct from old.author_id then
    raise exception 'immutable column';
  end if;
  if new.pinned is distinct from old.pinned and not public.is_group_admin(old.group_id)
     and (select auth.uid()) is not null then
    raise exception 'only admins can pin announcements' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger announcements_guard
  before update on public.announcements
  for each row execute function public.guard_announcement_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.groups enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_members enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_responses enable row level security;
alter table public.poll_votes enable row level security;
alter table public.events enable row level security;
alter table public.event_attendance enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.albums enable row level security;
alter table public.media_items enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

-- Start from a closed state: anon gets nothing, authenticated gets only what is granted below.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select on all tables in schema public to authenticated;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update (display_name, avatar_url, bio, last_seen_at) on public.profiles to authenticated;

-- user_settings
create policy user_settings_own on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant insert, update on public.user_settings to authenticated;

-- groups (created through create_group RPC)
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy groups_update_admin on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy groups_delete_owner on public.groups for delete to authenticated
  using (public.group_role_of(id) = 'owner');
grant update (name, description, color, member_can_invite, member_can_create_polls, member_can_create_events, member_can_post_announcements)
  on public.groups to authenticated;
grant delete on public.groups to authenticated;

-- group_invites: visible to admins, or to members when member invites are allowed
create policy group_invites_select on public.group_invites for select to authenticated
  using (
    public.is_group_admin(group_id)
    or (public.is_group_member(group_id) and exists (select 1 from public.groups g where g.id = group_id and g.member_can_invite))
  );

-- group_members (writes via RPC only)
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

-- conversations
create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

-- conversation_members: members see each other's read state; users can mute/pin their own row
create policy conversation_members_select on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy conversation_members_update_own on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update (muted, pinned) on public.conversation_members to authenticated;

-- messages (writes via RPC)
create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- message_reactions
create policy message_reactions_select on public.message_reactions for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy message_reactions_insert on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id and m.deleted_at is null and public.is_conversation_member(m.conversation_id)
    )
  );
create policy message_reactions_delete on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));
grant insert, delete on public.message_reactions to authenticated;

-- polls (writes via RPC; deletion by creator or admin)
create policy polls_select on public.polls for select to authenticated
  using (public.is_group_member(group_id));
create policy polls_delete on public.polls for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id));
grant delete on public.polls to authenticated;

create policy poll_options_select on public.poll_options for select to authenticated
  using (public.is_group_member(public.poll_group_id(poll_id)));

-- Individual answers are only directly readable by their author. Aggregates and
-- (non-anonymous) voter lists are served by get_poll_results().
create policy poll_responses_select_own on public.poll_responses for select to authenticated
  using (user_id = (select auth.uid()));
create policy poll_votes_select_own on public.poll_votes for select to authenticated
  using (user_id = (select auth.uid()));

-- events (create/update via RPC; deletion by creator or admin)
create policy events_select on public.events for select to authenticated
  using (public.is_group_member(group_id));
create policy events_delete on public.events for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id));
grant delete on public.events to authenticated;

create policy event_attendance_select on public.event_attendance for select to authenticated
  using (user_id = (select auth.uid()) or public.can_view_event_attendance(event_id));

-- announcements
create policy announcements_select on public.announcements for select to authenticated
  using (public.is_group_member(group_id));
create policy announcements_update on public.announcements for update to authenticated
  using (author_id = (select auth.uid()) or public.is_group_admin(group_id))
  with check (author_id = (select auth.uid()) or public.is_group_admin(group_id));
create policy announcements_delete on public.announcements for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_group_admin(group_id));
grant update (title, body, pinned, important, poll_id, event_id) on public.announcements to authenticated;
grant delete on public.announcements to authenticated;

create policy announcement_reads_own on public.announcement_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy announcement_reads_insert on public.announcement_reads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.announcements a where a.id = announcement_id and public.is_group_member(a.group_id))
  );
grant insert on public.announcement_reads to authenticated;

-- albums
create policy albums_select on public.albums for select to authenticated
  using (public.is_group_member(group_id));
create policy albums_insert on public.albums for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id));
create policy albums_update on public.albums for update to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id))
  with check (created_by = (select auth.uid()) or public.is_group_admin(group_id));
create policy albums_delete on public.albums for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id));
grant insert (group_id, title, description, created_by) on public.albums to authenticated;
grant update (title, description) on public.albums to authenticated;
grant delete on public.albums to authenticated;

-- media_items
create policy media_items_select on public.media_items for select to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or (conversation_id is not null and public.is_conversation_member(conversation_id))
  );
-- Album uploads are inserted directly; chat attachments are inserted by send_message().
create policy media_items_insert_album on public.media_items for insert to authenticated
  with check (
    uploader_id = (select auth.uid())
    and album_id is not null
    and message_id is null
    and conversation_id is null
    and public.is_group_member(group_id)
    and exists (select 1 from public.albums a where a.id = album_id and a.group_id = media_items.group_id)
    and storage_path like 'g/' || group_id::text || '/albums/' || album_id::text || '/%'
    and public.owns_storage_object(storage_path)
    and (thumb_path is null or public.owns_storage_object(thumb_path))
  );
create policy media_items_delete on public.media_items for delete to authenticated
  using (uploader_id = (select auth.uid()) or (group_id is not null and public.is_group_admin(group_id)));
grant insert (group_id, album_id, uploader_id, storage_path, thumb_path, mime_type, file_name, size_bytes, width, height)
  on public.media_items to authenticated;
grant delete on public.media_items to authenticated;

-- notifications: private to their recipient
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

create policy notification_preferences_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));
grant insert, update, delete on public.notification_preferences to authenticated;

-- push_subscriptions: registration goes through register_push_subscription()
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
grant delete on public.push_subscriptions to authenticated;

-- Helper functions are callable by signed-in users only.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
