-- Jam: パート・バンド (teams inside a group) and pinned messages.
-- A team has its own members (a subset of the group), its own talk room and its own events.
-- Team events are visible only to team members: not to the rest of the group, not to group admins.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default 'slate',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index teams_group_idx on public.teams (group_id);

-- (group_id, user_id) references the group membership, so leaving or being removed from the group
-- also removes the person from every team in it.
create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  group_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on delete cascade
);
create index team_members_user_idx on public.team_members (user_id);

alter table public.conversations add column team_id uuid references public.teams (id) on delete cascade;
alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (
  (kind = 'group' and group_id is not null and direct_key is null and team_id is null)
  or (kind = 'direct' and group_id is null and direct_key is not null and team_id is null)
  or (kind = 'team' and group_id is not null and team_id is not null and direct_key is null)
);
create unique index conversations_one_team_chat on public.conversations (team_id) where kind = 'team';

-- One pinned (固定) message per conversation, shown as a banner at the top of the talk.
alter table public.conversations
  add column pinned_message_id uuid references public.messages (id) on delete set null,
  add column pinned_by uuid references public.profiles (id) on delete set null,
  add column pinned_at timestamptz;

alter table public.events add column team_id uuid references public.teams (id) on delete cascade;
alter table public.events add constraint events_team_scope check (team_id is null or group_id is not null);
create index events_team_idx on public.events (team_id) where team_id is not null;

-- ---------------------------------------------------------------------------
-- Helpers and RLS
-- ---------------------------------------------------------------------------
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members where team_id = p_team_id and user_id = (select auth.uid()));
$$;

create or replace function private.team_conversation_id(p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.conversations where team_id = p_team_id and kind = 'team';
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
grant select on public.teams, public.team_members to authenticated;
-- Everyone in the group can see which teams exist and who is in them (like a member list); writes go through RPCs.
create policy teams_select on public.teams for select to authenticated using (public.is_group_member(group_id));
create policy team_members_select on public.team_members for select to authenticated using (public.is_group_member(group_id));

drop policy events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id) and (team_id is null or public.is_team_member(team_id)))
    or personal_user_id = (select auth.uid())
  );

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
      and (e.team_id is null or public.is_team_member(e.team_id))
      and (e.attendance_visibility = 'members' or public.is_group_admin(e.group_id) or e.created_by = (select auth.uid()))
  );
$$;

-- Team membership drives the team talk room's membership.
create or replace function public.sync_team_conversation_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.conversation_members (conversation_id, user_id)
    select c.id, new.user_id from public.conversations c where c.team_id = new.team_id and c.kind = 'team'
    on conflict do nothing;
    return new;
  end if;
  delete from public.conversation_members cm
  using public.conversations c
  where cm.conversation_id = c.id and c.team_id = old.team_id and c.kind = 'team' and cm.user_id = old.user_id;
  return old;
end;
$$;
create trigger team_members_sync_conversation
  after insert or delete on public.team_members
  for each row execute function public.sync_team_conversation_membership();

-- A deleted message can't stay pinned.
create or replace function public.unpin_deleted_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.conversations set pinned_message_id = null, pinned_by = null, pinned_at = null
    where id = new.conversation_id and pinned_message_id = new.id;
  end if;
  return null;
end;
$$;
create trigger messages_unpin_deleted
  after update of deleted_at on public.messages
  for each row execute function public.unpin_deleted_message();

-- ---------------------------------------------------------------------------
-- Team RPCs
-- ---------------------------------------------------------------------------
create or replace function private.require_team_manager(p_team_id uuid)
returns public.teams
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
begin
  select * into v_team from public.teams where id = p_team_id;
  if v_team.id is null then
    raise exception 'パート・バンドが見つかりません';
  end if;
  perform private.require_member(v_team.group_id);
  if not (public.is_team_member(p_team_id) or public.is_group_admin(v_team.group_id)) then
    raise exception 'このパート・バンドのメンバーではありません' using errcode = '42501';
  end if;
  return v_team;
end;
$$;

create or replace function public.create_team(p_group_id uuid, p_name text, p_color text default 'slate', p_member_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_team uuid;
  v_conv uuid;
begin
  perform private.require_member(p_group_id);
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception '名前は1〜40文字で入力してください';
  end if;
  if (select count(*) from public.teams where group_id = p_group_id) >= 50 then
    raise exception 'このグループのパート・バンドは50個までです';
  end if;
  insert into public.teams (group_id, name, color, created_by)
  values (p_group_id, btrim(p_name), coalesce(nullif(p_color, ''), 'slate'), v_uid)
  returning id into v_team;
  insert into public.conversations (kind, group_id, team_id) values ('team', p_group_id, v_team) returning id into v_conv;
  -- The creator plus the chosen people who are members of the group (others are ignored).
  insert into public.team_members (team_id, group_id, user_id)
  select v_team, p_group_id, m.user_id from public.group_members m
  where m.group_id = p_group_id and (m.user_id = v_uid or m.user_id = any (coalesce(p_member_ids, '{}')))
  on conflict do nothing;
  insert into public.messages (conversation_id, sender_id, client_id, kind, body)
  values (v_conv, v_uid, gen_random_uuid(), 'system',
          (select display_name from public.profiles where id = v_uid) || 'さんが「' || btrim(p_name) || '」を作成しました');
  return v_team;
end;
$$;

create or replace function public.update_team(p_team_id uuid, p_name text, p_color text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_team_manager(p_team_id);
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception '名前は1〜40文字で入力してください';
  end if;
  update public.teams set name = btrim(p_name), color = coalesce(nullif(p_color, ''), color) where id = p_team_id;
end;
$$;

create or replace function public.add_team_members(p_team_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_team public.teams := private.require_team_manager(p_team_id);
  v_names text;
  v_added integer;
begin
  with added as (
    insert into public.team_members (team_id, group_id, user_id)
    select p_team_id, v_team.group_id, m.user_id from public.group_members m
    where m.group_id = v_team.group_id and m.user_id = any (coalesce(p_user_ids, '{}'))
    on conflict do nothing
    returning user_id
  )
  select count(*), string_agg(p.display_name, '、') into v_added, v_names
  from added a join public.profiles p on p.id = a.user_id;
  if v_added > 0 then
    insert into public.messages (conversation_id, sender_id, client_id, kind, body)
    values (private.team_conversation_id(p_team_id), v_uid, gen_random_uuid(), 'system',
            (select display_name from public.profiles where id = v_uid) || 'さんが' || v_names || 'さんを追加しました');
  end if;
  return v_added;
end;
$$;

create or replace function public.remove_team_member(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_team public.teams;
begin
  select * into v_team from public.teams where id = p_team_id;
  if v_team.id is null then
    raise exception 'パート・バンドが見つかりません';
  end if;
  perform private.require_member(v_team.group_id);
  -- Anyone can leave; removing someone else is for the team's creator and group admins.
  if p_user_id <> v_uid and not (v_team.created_by = v_uid or public.is_group_admin(v_team.group_id)) then
    raise exception 'メンバーを外せるのは作成者と管理者だけです' using errcode = '42501';
  end if;
  if not exists (select 1 from public.team_members where team_id = p_team_id and user_id = p_user_id) then
    return;
  end if;
  insert into public.messages (conversation_id, sender_id, client_id, kind, body)
  values (private.team_conversation_id(p_team_id), v_uid, gen_random_uuid(), 'system',
          (select display_name from public.profiles where id = p_user_id)
          || case when p_user_id = v_uid then 'さんが退出しました' else 'さんが外れました' end);
  delete from public.team_members where team_id = p_team_id and user_id = p_user_id;
end;
$$;

create or replace function public.delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_team public.teams;
begin
  select * into v_team from public.teams where id = p_team_id;
  if v_team.id is null then
    raise exception 'パート・バンドが見つかりません';
  end if;
  perform private.require_member(v_team.group_id);
  if not (v_team.created_by = v_uid or public.is_group_admin(v_team.group_id)) then
    raise exception '削除できるのは作成者と管理者だけです' using errcode = '42501';
  end if;
  -- Cascades to its members, talk room (and messages) and events.
  delete from public.teams where id = p_team_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pinned messages
-- ---------------------------------------------------------------------------
create or replace function public.set_pinned_message(p_conversation_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_msg public.messages;
  v_name text := (select display_name from public.profiles where id = v_uid);
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'このトークのメンバーではありません' using errcode = '42501';
  end if;
  if p_message_id is null then
    if (select pinned_message_id from public.conversations where id = p_conversation_id) is null then
      return;
    end if;
    update public.conversations set pinned_message_id = null, pinned_by = null, pinned_at = null where id = p_conversation_id;
    insert into public.messages (conversation_id, sender_id, client_id, kind, body)
    values (p_conversation_id, v_uid, gen_random_uuid(), 'system', v_name || 'さんが固定を解除しました');
    return;
  end if;
  select * into v_msg from public.messages where id = p_message_id;
  if v_msg.id is null or v_msg.conversation_id <> p_conversation_id or v_msg.deleted_at is not null or v_msg.kind = 'system' then
    raise exception 'このメッセージはピン留めできません';
  end if;
  update public.conversations set pinned_message_id = p_message_id, pinned_by = v_uid, pinned_at = now() where id = p_conversation_id;
  -- The system message also tells everyone's open talk to refresh the banner (through Realtime).
  insert into public.messages (conversation_id, sender_id, client_id, kind, body)
  values (p_conversation_id, v_uid, gen_random_uuid(), 'system', v_name || 'さんがメッセージをトーク上部に固定しました');
end;
$$;

-- ---------------------------------------------------------------------------
-- Events: team scope
-- ---------------------------------------------------------------------------
drop function public.create_event(uuid, text, timestamptz, timestamptz, boolean, text, text, public.event_category, boolean, timestamptz, text, text, boolean);
create function public.create_event(
  p_group_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_all_day boolean default false,
  p_location text default '',
  p_description text default '',
  p_category public.event_category default 'other',
  p_rsvp_enabled boolean default true,
  p_rsvp_deadline timestamptz default null,
  p_attendance_visibility text default 'members',
  p_image_path text default null,
  p_post_to_chat boolean default true,
  p_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_role public.group_role := private.require_member(p_group_id);
  v_event uuid;
begin
  if p_team_id is not null then
    -- Any team member may add events to their team, whatever the group setting.
    if not exists (select 1 from public.teams where id = p_team_id and group_id = p_group_id) or not public.is_team_member(p_team_id) then
      raise exception 'このパート・バンドのメンバーではありません' using errcode = '42501';
    end if;
  elsif v_role = 'member' and not (select member_can_create_events from public.groups where id = p_group_id) then
    raise exception 'このグループでは管理者のみ予定を作成できます' using errcode = '42501';
  end if;
  if p_image_path is not null and (
    left(p_image_path, length('g/' || p_group_id::text || '/events/')) <> 'g/' || p_group_id::text || '/events/'
    or not public.owns_storage_object(p_image_path)) then
    raise exception '画像が不正です';
  end if;
  insert into public.events (group_id, team_id, created_by, title, description, location, category, starts_at, ends_at, all_day,
                             rsvp_enabled, rsvp_deadline, attendance_visibility, image_path)
  values (p_group_id, p_team_id, v_uid, btrim(p_title), coalesce(p_description, ''), coalesce(p_location, ''), coalesce(p_category, 'other'),
          p_starts_at, p_ends_at, coalesce(p_all_day, false), coalesce(p_rsvp_enabled, true), p_rsvp_deadline,
          coalesce(p_attendance_visibility, 'members'), p_image_path)
  returning id into v_event;
  if coalesce(p_post_to_chat, true) then
    if p_team_id is null then
      perform private.post_card(p_group_id, 'event', btrim(p_title), p_event_id => v_event);
    else
      insert into public.messages (conversation_id, sender_id, client_id, kind, body, event_id)
      values (private.team_conversation_id(p_team_id), v_uid, gen_random_uuid(), 'event', left(btrim(p_title), 5000), v_event);
    end if;
  end if;
  return v_event;
end;
$$;

create or replace function public.set_attendance(p_event_id uuid, p_status public.attendance_status, p_comment text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_event public.events;
begin
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null or (v_event.team_id is not null and not public.is_team_member(v_event.team_id)) then
    raise exception '予定が見つかりません';
  end if;
  perform private.require_member(v_event.group_id);
  if not v_event.rsvp_enabled then
    raise exception 'この予定は出欠確認を受け付けていません';
  end if;
  if v_event.canceled_at is not null then
    raise exception 'この予定は中止されました';
  end if;
  if v_event.rsvp_deadline is not null and v_event.rsvp_deadline <= now() then
    raise exception '出欠の回答期限を過ぎています';
  end if;
  if coalesce(v_event.ends_at, v_event.starts_at) < now() - interval '1 day' then
    raise exception '終了した予定の出欠は変更できません';
  end if;
  insert into public.event_attendance (event_id, user_id, status, comment)
  values (p_event_id, v_uid, p_status, left(coalesce(p_comment, ''), 200))
  on conflict (event_id, user_id) do update set status = excluded.status, comment = excluded.comment, updated_at = now();
end;
$$;

create or replace function public.get_event_attendance(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_event public.events;
  v_can_see boolean;
begin
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null or (v_event.team_id is not null and not public.is_team_member(v_event.team_id)) then
    raise exception '予定が見つかりません';
  end if;
  perform private.require_member(v_event.group_id);
  v_can_see := public.can_view_event_attendance(p_event_id);
  return jsonb_build_object(
    'can_view_individuals', v_can_see,
    'member_count', case when v_event.team_id is null
      then (select count(*) from public.group_members where group_id = v_event.group_id)
      else (select count(*) from public.team_members where team_id = v_event.team_id) end,
    'going', v_event.going_count,
    'maybe', v_event.maybe_count,
    'not_going', v_event.not_going_count,
    'mine', (select jsonb_build_object('status', status, 'comment', comment) from public.event_attendance where event_id = p_event_id and user_id = v_uid),
    'responses', case when v_can_see then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'status', a.status, 'comment', a.comment, 'updated_at', a.updated_at) order by a.updated_at)
      from public.event_attendance a where a.event_id = p_event_id
    ), '[]'::jsonb) else null end,
    'non_respondents', case when v_can_see then coalesce((
      select jsonb_agg(m.user_id) from public.group_members m
      where m.group_id = v_event.group_id
        and (v_event.team_id is null or exists (select 1 from public.team_members t where t.team_id = v_event.team_id and t.user_id = m.user_id))
        and not exists (select 1 from public.event_attendance a where a.event_id = p_event_id and a.user_id = m.user_id)
    ), '[]'::jsonb) else null end
  );
end;
$$;

create or replace function public.share_to_chat(p_kind public.message_kind, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_team uuid;
  v_title text;
  v_id uuid;
begin
  if p_kind = 'poll' then
    select group_id, title into v_group, v_title from public.polls where id = p_id;
  elsif p_kind = 'event' then
    select group_id, team_id, title into v_group, v_team, v_title from public.events where id = p_id;
  elsif p_kind = 'announcement' then
    select group_id, title into v_group, v_title from public.announcements where id = p_id;
  elsif p_kind = 'album' then
    select group_id, title into v_group, v_title from public.albums where id = p_id;
  else
    raise exception '共有できない種類です';
  end if;
  if v_group is null or (v_team is not null and not public.is_team_member(v_team)) then
    raise exception '見つかりません';
  end if;
  perform private.require_member(v_group);
  -- A team event is shared into its team's talk only.
  if v_team is not null then
    insert into public.messages (conversation_id, sender_id, client_id, kind, body, event_id)
    values (private.team_conversation_id(v_team), auth.uid(), gen_random_uuid(), 'event', left(coalesce(v_title, ''), 5000), p_id)
    returning id into v_id;
    return v_id;
  end if;
  return private.post_card(v_group, p_kind, v_title,
    p_poll_id => case when p_kind = 'poll' then p_id end,
    p_event_id => case when p_kind = 'event' then p_id end,
    p_announcement_id => case when p_kind = 'announcement' then p_id end,
    p_album_id => case when p_kind = 'album' then p_id end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications: team events reach team members only
-- ---------------------------------------------------------------------------
drop function private.notify_group_members(uuid, uuid, text, text, text, text, uuid, text, boolean, boolean);
create function private.notify_group_members(
  p_group_id uuid,
  p_actor uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_ref_id uuid,
  p_dedupe_prefix text default null,
  p_push boolean default true,
  p_only_admins boolean default false,
  p_team_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, group_id, kind, title, body, link, actor_id, ref_id, dedupe_key, push)
  select m.user_id, p_group_id, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 300), p_link, p_actor, p_ref_id,
         case when p_dedupe_prefix is null then null else p_dedupe_prefix || ':' || m.user_id::text end,
         p_push
  from public.group_members m
  where m.group_id = p_group_id
    and m.user_id is distinct from p_actor
    and (not p_only_admins or m.role in ('owner', 'admin'))
    and (p_team_id is null or exists (select 1 from public.team_members t where t.team_id = p_team_id and t.user_id = m.user_id))
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;
revoke all on function private.notify_group_members from public, anon, authenticated;

create or replace function private.event_where(p_group_id uuid, p_team_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select (select name from public.groups where id = p_group_id)
         || coalesce(' / ' || (select name from public.teams where id = p_team_id), '');
$$;

create or replace function private.on_event_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_id is null then
    return null;
  end if;
  perform private.notify_group_members(
    new.group_id, new.created_by, case when new.rsvp_enabled then 'attendance_request' else 'event_new' end,
    case when new.rsvp_enabled then '出欠確認: ' else '新しい予定: ' end || new.title,
    private.event_where(new.group_id, new.team_id) || ' ・ ' || to_char(new.starts_at at time zone 'Asia/Tokyo',
      case when new.all_day then 'FMMM/FMDD' else 'FMMM/FMDD HH24:MI' end)
      || case when new.location <> '' then ' ・ ' || new.location else '' end,
    '/events/' || new.id::text, new.id, 'event_new:' || new.id::text, p_team_id => new.team_id);
  return null;
end;
$$;

create or replace function private.on_event_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_where text;
begin
  if new.group_id is null then
    return null;
  end if;
  v_where := private.event_where(new.group_id, new.team_id);
  if new.canceled_at is not null and old.canceled_at is null then
    perform private.notify_group_members(
      new.group_id, auth.uid(), 'event_canceled', '予定が中止になりました: ' || new.title,
      v_where, '/events/' || new.id::text, new.id, p_team_id => new.team_id);
  elsif new.canceled_at is null and (
    new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or new.location is distinct from old.location or new.all_day is distinct from old.all_day) then
    perform private.notify_group_members(
      new.group_id, auth.uid(), 'event_updated', '予定が変更されました: ' || new.title,
      v_where || ' ・ ' || to_char(new.starts_at at time zone 'Asia/Tokyo',
        case when new.all_day then 'FMMM/FMDD' else 'FMMM/FMDD HH24:MI' end)
        || case when new.location <> '' then ' ・ ' || new.location else '' end,
      '/events/' || new.id::text, new.id, p_team_id => new.team_id);
  end if;
  return null;
end;
$$;

-- Mentions and replies in a team talk say "グループ / チーム".
create or replace function private.on_message_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender text;
  v_where text;
  v_reply_author uuid;
  v_preview text;
  v_group uuid;
begin
  if new.kind = 'system' then
    return null;
  end if;
  select display_name into v_sender from public.profiles where id = new.sender_id;
  select c.group_id, coalesce(g.name || coalesce(' / ' || t.name, ''), 'トーク') into v_group, v_where
  from public.conversations c
  left join public.groups g on g.id = c.group_id
  left join public.teams t on t.id = c.team_id
  where c.id = new.conversation_id;
  v_preview := case
    when new.kind = 'image' then '写真を送信しました'
    when new.kind = 'file' then 'ファイルを送信しました'
    else left(regexp_replace(new.body, '\s+', ' ', 'g'), 80) end;

  if cardinality(new.mentions) > 0 then
    insert into public.notifications (user_id, group_id, kind, title, body, link, actor_id, ref_id, dedupe_key, push)
    select u, v_group, 'mention', v_sender || 'さんがあなたをメンションしました', v_where || ' ・ ' || v_preview,
           '/talk/' || new.conversation_id::text, new.sender_id, new.id, 'mention:' || new.id::text || ':' || u::text, false
    from unnest(new.mentions) u
    where u is distinct from new.sender_id
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  if new.reply_to_id is not null then
    select sender_id into v_reply_author from public.messages where id = new.reply_to_id;
    if v_reply_author is not null and v_reply_author is distinct from new.sender_id and not (v_reply_author = any (new.mentions)) then
      insert into public.notifications (user_id, group_id, kind, title, body, link, actor_id, ref_id, dedupe_key, push)
      values (v_reply_author, v_group, 'reply', v_sender || 'さんがあなたのメッセージに返信しました', v_where || ' ・ ' || v_preview,
              '/talk/' || new.conversation_id::text, new.sender_id, new.id, 'reply:' || new.id::text, false)
      on conflict (user_id, dedupe_key) do nothing;
    end if;
  end if;

  -- Card messages (polls, events, announcements) already produce their own notification.
  if new.kind in ('text', 'image', 'file') then
    perform private.dispatch_push(jsonb_build_object('type', 'message', 'message_id', new.id));
  end if;
  return null;
end;
$$;

-- Reminders: same as before, but team events only remind team members.
create or replace function private.process_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rows integer;
begin
  -- Polls closing within 24 hours that the member has not answered yet.
  insert into public.notifications (user_id, group_id, kind, title, body, link, ref_id, dedupe_key)
  select m.user_id, p.group_id, 'poll_deadline', '投票の締切が近づいています: ' || p.title,
         g.name || ' ・ ' || to_char(p.deadline at time zone 'Asia/Tokyo', 'FMMM/FMDD HH24:MI') || ' 締切',
         '/polls/' || p.id::text, p.id, 'poll_deadline:' || p.id::text || ':' || m.user_id::text
  from public.polls p
  join public.groups g on g.id = p.group_id
  join public.group_members m on m.group_id = p.group_id
  where p.closed_at is null and p.deadline > now() and p.deadline <= now() + interval '24 hours'
    and p.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.poll_responses r where r.poll_id = p.id and r.user_id = m.user_id)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- Events starting within 24 hours (not for members who declined).
  insert into public.notifications (user_id, group_id, kind, title, body, link, ref_id, dedupe_key)
  select m.user_id, e.group_id, 'event_upcoming',
         case when e.rsvp_enabled and a.status is null then '出欠未回答の予定があります: ' else 'まもなく予定があります: ' end || e.title,
         private.event_where(e.group_id, e.team_id) || ' ・ ' || to_char(e.starts_at at time zone 'Asia/Tokyo', case when e.all_day then 'FMMM/FMDD' else 'FMMM/FMDD HH24:MI' end)
           || case when e.location <> '' then ' ・ ' || e.location else '' end,
         '/events/' || e.id::text, e.id,
         'event_upcoming:' || e.id::text || ':' || extract(epoch from e.starts_at)::bigint::text || ':' || m.user_id::text
  from public.events e
  join public.group_members m on m.group_id = e.group_id
  left join public.event_attendance a on a.event_id = e.id and a.user_id = m.user_id
  where e.canceled_at is null and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
    and e.created_at < now() - interval '1 hour'
    and (a.status is null or a.status <> 'not_going')
    and (e.team_id is null or exists (select 1 from public.team_members t where t.team_id = e.team_id and t.user_id = m.user_id))
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- Attendance deadlines within 24 hours for members who have not answered.
  insert into public.notifications (user_id, group_id, kind, title, body, link, ref_id, dedupe_key)
  select m.user_id, e.group_id, 'attendance_deadline', '出欠の回答期限が近づいています: ' || e.title,
         private.event_where(e.group_id, e.team_id) || ' ・ ' || to_char(e.rsvp_deadline at time zone 'Asia/Tokyo', 'FMMM/FMDD HH24:MI') || ' まで',
         '/events/' || e.id::text, e.id, 'attendance_deadline:' || e.id::text || ':' || m.user_id::text
  from public.events e
  join public.group_members m on m.group_id = e.group_id
  where e.canceled_at is null and e.rsvp_enabled and e.rsvp_deadline > now() and e.rsvp_deadline <= now() + interval '24 hours'
    and e.starts_at > now() + interval '24 hours'
    and (e.team_id is null or exists (select 1 from public.team_members t where t.team_id = e.team_id and t.user_id = m.user_id))
    and not exists (select 1 from public.event_attendance a where a.event_id = e.id and a.user_id = m.user_id)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- Housekeeping: keep notification history bounded (90 days).
  delete from public.notifications where created_at < now() - interval '90 days';
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Talk list: team rooms and the pinned message
-- ---------------------------------------------------------------------------
drop function public.get_conversations();
create function public.get_conversations()
returns table (
  id uuid,
  kind public.conversation_kind,
  group_id uuid,
  group_name text,
  group_color text,
  group_icon_path text,
  team_id uuid,
  team_name text,
  team_color text,
  peer_id uuid,
  peer_name text,
  peer_avatar_url text,
  last_message_at timestamptz,
  last_message_body text,
  last_message_kind public.message_kind,
  last_message_sender_id uuid,
  last_message_sender_name text,
  last_message_deleted boolean,
  unread_count bigint,
  mention_count bigint,
  muted boolean,
  pinned boolean,
  last_read_at timestamptz,
  member_count bigint,
  pinned_message_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.kind, c.group_id, g.name, g.color, g.icon_path,
    t.id, t.name, t.color,
    peer.id, peer.display_name, peer.avatar_url,
    c.last_message_at, lm.body, lm.kind, lm.sender_id, ls.display_name, lm.deleted_at is not null,
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.created_at > cm.last_read_at
        and m.sender_id is distinct from cm.user_id and m.deleted_at is null and m.kind <> 'system'),
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.created_at > cm.last_read_at
        and m.deleted_at is null and cm.user_id = any (m.mentions)),
    cm.muted, cm.pinned, cm.last_read_at,
    (select count(*) from public.conversation_members x where x.conversation_id = c.id),
    c.pinned_message_id
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join public.groups g on g.id = c.group_id
  left join public.teams t on t.id = c.team_id
  left join lateral (
    select p.id, p.display_name, p.avatar_url
    from public.conversation_members o join public.profiles p on p.id = o.user_id
    where c.kind = 'direct' and o.conversation_id = c.id and o.user_id <> cm.user_id
    limit 1
  ) peer on true
  left join public.messages lm on lm.id = c.last_message_id
  left join public.profiles ls on ls.id = lm.sender_id
  where cm.user_id = auth.uid()
    and (c.kind in ('group', 'team') or c.last_message_at is not null or c.created_at > now() - interval '1 day')
  order by cm.pinned desc, coalesce(c.last_message_at, c.created_at) desc;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
