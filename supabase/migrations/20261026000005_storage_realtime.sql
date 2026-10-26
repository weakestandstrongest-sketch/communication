-- つどい: private media storage and realtime configuration.
--
-- Storage layout (bucket "media", private):
--   g/{group_id}/chat/{conversation_id}/{file}   group chat attachments
--   g/{group_id}/albums/{album_id}/{file}        album photos
--   g/{group_id}/events/{file}                   event images
--   dm/{conversation_id}/{file}                  direct-message attachments
-- Files are served only through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'audio/mpeg', 'audio/mp4', 'video/mp4', 'video/quicktime'
  ]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

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
  if v_parts[1] = 'g' then
    if not public.is_group_member(v_id) then
      return false;
    end if;
    if v_parts[3] = 'chat' then
      return public.is_conversation_member(public.try_uuid(v_parts[4]));
    end if;
    return v_parts[3] in ('albums', 'events');
  elsif v_parts[1] = 'dm' then
    return public.is_conversation_member(v_id);
  end if;
  return false;
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
  return v_parts[1] = 'g' and public.is_group_admin(public.try_uuid(v_parts[2]));
end;
$$;

revoke execute on function public.can_access_media_path(text) from public, anon;
revoke execute on function public.can_delete_media_path(text) from public, anon;
grant execute on function public.can_access_media_path(text) to authenticated;
grant execute on function public.can_delete_media_path(text) to authenticated;

create policy "media: members can read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.can_access_media_path(name));

create policy "media: members can upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_access_media_path(name));

create policy "media: uploader or admin can delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (owner_id = (select auth.uid())::text or public.can_delete_media_path(name)));

-- ---------------------------------------------------------------------------
-- Realtime: database changes (RLS is enforced per subscriber)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table
  public.messages,
  public.conversation_members,
  public.notifications,
  public.polls,
  public.events,
  public.event_attendance,
  public.announcements,
  public.group_members;

-- ---------------------------------------------------------------------------
-- Realtime: private broadcast/presence channels for typing indicators.
-- Topic format: "conv:{conversation_id}". Only conversation members may join.
-- ---------------------------------------------------------------------------
create policy "conversation channels: members can receive" on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'conv:%'
    and public.is_conversation_member(public.try_uuid(substr(realtime.topic(), 6)))
  );

create policy "conversation channels: members can send" on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'conv:%'
    and public.is_conversation_member(public.try_uuid(substr(realtime.topic(), 6)))
  );
