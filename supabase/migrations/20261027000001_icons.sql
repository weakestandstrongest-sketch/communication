-- つどい: custom profile photos and group icons.
--   u/{user_id}/…            profile photos   (readable by people who can see the profile; writable only by the user)
--   g/{group_id}/icon/…      group icons      (readable by members; writable only by group admins)
-- profiles.avatar_url holds either an https URL (Google) or a storage path in the private "media" bucket.

alter table public.groups add column icon_path text check (icon_path is null or char_length(icon_path) <= 500);
grant update (icon_path) on public.groups to authenticated;

-- A custom photo must never be overwritten by a later Google avatar change.
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
    update public.profiles set avatar_url = v_avatar
    where id = new.id and (avatar_url is null or avatar_url ~ '^https?://');
  end if;
  return new;
end;
$$;

create or replace function public.can_access_media_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_id uuid;
begin
  if array_length(v_parts, 1) < 3 then
    return false;
  end if;
  v_id := public.try_uuid(v_parts[2]);
  if v_id is null then
    return false;
  end if;
  if v_parts[1] = 'u' then
    return public.can_view_profile(v_id);
  elsif v_parts[1] = 'g' then
    if not public.is_group_member(v_id) then
      return false;
    end if;
    if v_parts[3] = 'chat' then
      return public.is_conversation_member(public.try_uuid(v_parts[4]));
    end if;
    return v_parts[3] in ('albums', 'events', 'icon');
  elsif v_parts[1] = 'dm' then
    return public.is_conversation_member(v_id);
  end if;
  return false;
end;
$$;

-- Upload rule: same as read, except profile photos are self-only and group icons admin-only.
create or replace function public.can_upload_media_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
begin
  if v_parts[1] = 'u' then
    return public.try_uuid(v_parts[2]) = (select auth.uid());
  elsif v_parts[1] = 'g' and v_parts[3] = 'icon' then
    return public.is_group_admin(public.try_uuid(v_parts[2]));
  end if;
  return public.can_access_media_path(p_name);
end;
$$;

create or replace function public.can_delete_media_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
begin
  if v_parts[1] = 'u' then
    return public.try_uuid(v_parts[2]) = (select auth.uid());
  end if;
  return v_parts[1] = 'g' and public.is_group_admin(public.try_uuid(v_parts[2]));
end;
$$;

revoke execute on function public.can_upload_media_path(text) from public, anon;
grant execute on function public.can_upload_media_path(text) to authenticated;

drop policy "media: members can upload" on storage.objects;
create policy "media: members can upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_upload_media_path(name));

-- A profile photo / group icon path must belong to its owner.
create or replace function public.guard_icon_paths()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'profiles' then
    if new.avatar_url is not null and new.avatar_url !~ '^https?://'
       and left(new.avatar_url, length('u/' || new.id::text || '/')) <> 'u/' || new.id::text || '/' then
      raise exception '画像が不正です';
    end if;
  else
    if new.icon_path is not null and left(new.icon_path, length('g/' || new.id::text || '/icon/')) <> 'g/' || new.id::text || '/icon/' then
      raise exception '画像が不正です';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_avatar before insert or update of avatar_url on public.profiles
  for each row execute function public.guard_icon_paths();
create trigger groups_guard_icon before update of icon_path on public.groups
  for each row execute function public.guard_icon_paths();

-- Chat list: expose the group icon.
drop function public.get_conversations();
create function public.get_conversations()
returns table (
  id uuid,
  kind public.conversation_kind,
  group_id uuid,
  group_name text,
  group_color text,
  group_icon_path text,
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
  member_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.kind, c.group_id, g.name, g.color, g.icon_path,
    peer.id, peer.display_name, peer.avatar_url,
    c.last_message_at, lm.body, lm.kind, lm.sender_id, ls.display_name, lm.deleted_at is not null,
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.created_at > cm.last_read_at
        and m.sender_id is distinct from cm.user_id and m.deleted_at is null and m.kind <> 'system'),
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.created_at > cm.last_read_at
        and m.deleted_at is null and cm.user_id = any (m.mentions)),
    cm.muted, cm.pinned, cm.last_read_at,
    (select count(*) from public.conversation_members x where x.conversation_id = c.id)
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join public.groups g on g.id = c.group_id
  left join lateral (
    select p.id, p.display_name, p.avatar_url
    from public.conversation_members o join public.profiles p on p.id = o.user_id
    where c.kind = 'direct' and o.conversation_id = c.id and o.user_id <> cm.user_id
    limit 1
  ) peer on true
  left join public.messages lm on lm.id = c.last_message_id
  left join public.profiles ls on ls.id = lm.sender_id
  where cm.user_id = auth.uid()
    and (c.kind = 'group' or c.last_message_at is not null or c.created_at > now() - interval '1 day')
  order by cm.pinned desc, coalesce(c.last_message_at, c.created_at) desc;
$$;
revoke execute on function public.get_conversations() from public, anon;
grant execute on function public.get_conversations() to authenticated;
