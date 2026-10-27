-- Jam: delete a talk for yourself, LINE-style.
-- Clearing a talk hides its history (and, for a 1:1 talk, the room itself) from the person who cleared it.
-- It changes nothing for anyone else. New messages after that moment show up again, and bring a 1:1 room back.

alter table public.conversation_members
  add column cleared_at timestamptz,            -- history before this moment is hidden from this member
  add column hidden boolean not null default false, -- a deleted 1:1 room stays out of the talk list ...
  add column opened_at timestamptz;             -- ... until a message arrives or they open it again

-- Messages are readable by conversation members, but only those sent after they cleared the talk.
create or replace function public.can_read_message(p_conversation_id uuid, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = (select auth.uid())
      and (cm.cleared_at is null or p_created_at > cm.cleared_at)
  );
$$;

drop policy messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.can_read_message(conversation_id, created_at));

-- Photos and files shared in a 1:1 talk follow the same rule (group albums and libraries are unaffected).
drop policy media_items_select on public.media_items;
create policy media_items_select on public.media_items for select to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or (conversation_id is not null and public.can_read_message(conversation_id, created_at))
  );

create or replace function public.clear_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  update public.conversation_members cm
  set cleared_at = now(), last_read_at = now(), pinned = false,
      hidden = exists (select 1 from public.conversations c where c.id = cm.conversation_id and c.kind = 'direct')
  where cm.conversation_id = p_conversation_id and cm.user_id = v_uid;
  if not found then
    raise exception 'このトークのメンバーではありません' using errcode = '42501';
  end if;
end;
$$;

-- A new message brings a deleted 1:1 room back for everyone who had hidden it (only the new messages are visible).
create or replace function public.unhide_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_members set hidden = false where conversation_id = new.conversation_id and hidden;
  return null;
end;
$$;
create trigger messages_unhide_conversation
  after insert on public.messages
  for each row execute function public.unhide_conversation_on_message();

-- Opening a 1:1 talk again (from the member list) brings it back to the talk list.
create or replace function public.get_or_create_direct(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_key text;
  v_id uuid;
begin
  if p_user_id = v_uid then
    raise exception '自分自身とはトークできません';
  end if;
  if not exists (
    select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
    where a.user_id = v_uid and b.user_id = p_user_id
  ) then
    raise exception '同じグループのメンバーとのみトークできます' using errcode = '42501';
  end if;
  v_key := least(v_uid::text, p_user_id::text) || ':' || greatest(v_uid::text, p_user_id::text);
  select id into v_id from public.conversations where direct_key = v_key;
  if v_id is null then
    insert into public.conversations (kind, direct_key) values ('direct', v_key)
    on conflict (direct_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.conversations where direct_key = v_key;
    end if;
  end if;
  insert into public.conversation_members (conversation_id, user_id)
  values (v_id, v_uid), (v_id, p_user_id)
  on conflict do nothing;
  update public.conversation_members set hidden = false, opened_at = now() where conversation_id = v_id and user_id = v_uid;
  return v_id;
end;
$$;

-- The talk list: cleared history is not counted or previewed, and a cleared 1:1 room stays hidden until a new message arrives.
create or replace function public.get_conversations()
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
    case when cm.cleared_at is null or c.last_message_at > cm.cleared_at then c.last_message_at end,
    case when cm.cleared_at is null or lm.created_at > cm.cleared_at then lm.body end,
    case when cm.cleared_at is null or lm.created_at > cm.cleared_at then lm.kind end,
    case when cm.cleared_at is null or lm.created_at > cm.cleared_at then lm.sender_id end,
    case when cm.cleared_at is null or lm.created_at > cm.cleared_at then ls.display_name end,
    lm.deleted_at is not null and (cm.cleared_at is null or lm.created_at > cm.cleared_at),
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.created_at > cm.last_read_at
        and m.sender_id is distinct from cm.user_id and m.deleted_at is null and m.kind <> 'system'
        and (cm.cleared_at is null or m.created_at > cm.cleared_at)),
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.created_at > cm.last_read_at
        and m.deleted_at is null and cm.user_id = any (m.mentions)
        and (cm.cleared_at is null or m.created_at > cm.cleared_at)),
    cm.muted, cm.pinned, cm.last_read_at,
    (select count(*) from public.conversation_members x where x.conversation_id = c.id),
    case when pm.id is not null and (cm.cleared_at is null or pm.created_at > cm.cleared_at) then c.pinned_message_id end
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
  left join public.messages pm on pm.id = c.pinned_message_id
  where cm.user_id = auth.uid()
    and (
      c.kind in ('group', 'team')
      -- a 1:1 room: not deleted, and either has messages (since the last clear) or was opened within a day
      or (
        not cm.hidden
        and (
          (c.last_message_at is not null and (cm.cleared_at is null or c.last_message_at > cm.cleared_at))
          or coalesce(cm.opened_at, c.created_at) > now() - interval '1 day'
        )
      )
    )
  order by cm.pinned desc, coalesce(c.last_message_at, c.created_at) desc;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
