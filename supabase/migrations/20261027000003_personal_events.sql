-- つどい: personal events (予定 only the creator can see). group_id is null and personal_user_id is the owner.
-- No attendance, chat card or notifications; never visible to group members or admins.

alter table public.events alter column group_id drop not null;
alter table public.events add column personal_user_id uuid references public.profiles (id) on delete cascade;
alter table public.events add constraint events_scope_check check (
  (group_id is not null and personal_user_id is null) or (group_id is null and personal_user_id is not null)
);
create index events_personal_idx on public.events (personal_user_id, starts_at) where personal_user_id is not null;

drop policy events_select on public.events;
create policy events_select on public.events for select to authenticated
  using ((group_id is not null and public.is_group_member(group_id)) or personal_user_id = (select auth.uid()));
drop policy events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (
    personal_user_id = (select auth.uid())
    or (group_id is not null and (created_by = (select auth.uid()) or public.is_group_admin(group_id)))
  );

create or replace function public.create_personal_event(
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_all_day boolean default false,
  p_location text default '',
  p_description text default '',
  p_category public.event_category default 'other'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_id uuid;
begin
  if (select count(*) from public.events where personal_user_id = v_uid) >= 2000 then
    raise exception '個人の予定の上限に達しました';
  end if;
  insert into public.events (group_id, personal_user_id, created_by, title, description, location, category, starts_at, ends_at, all_day, rsvp_enabled)
  values (null, v_uid, v_uid, btrim(p_title), coalesce(p_description, ''), coalesce(p_location, ''), coalesce(p_category, 'other'),
          p_starts_at, p_ends_at, coalesce(p_all_day, false), false)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_event(
  p_event_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_all_day boolean,
  p_location text,
  p_description text,
  p_category public.event_category,
  p_rsvp_enabled boolean,
  p_rsvp_deadline timestamptz,
  p_attendance_visibility text,
  p_image_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_event public.events;
  v_personal boolean;
begin
  select * into v_event from public.events where id = p_event_id;
  v_personal := v_event.personal_user_id is not null;
  if v_event.id is null
     or not (
       (v_personal and v_event.personal_user_id = v_uid)
       or (not v_personal and (v_event.created_by = v_uid or public.is_group_admin(v_event.group_id)))
     ) then
    raise exception 'この予定を編集する権限がありません' using errcode = '42501';
  end if;
  if v_personal then
    p_rsvp_enabled := false;
    p_rsvp_deadline := null;
    p_image_path := null;
  elsif p_image_path is not null and p_image_path is distinct from v_event.image_path and (
    left(p_image_path, length('g/' || v_event.group_id::text || '/events/')) <> 'g/' || v_event.group_id::text || '/events/'
    or not public.owns_storage_object(p_image_path)) then
    raise exception '画像が不正です';
  end if;
  update public.events set
    title = btrim(p_title), starts_at = p_starts_at, ends_at = p_ends_at, all_day = coalesce(p_all_day, false),
    location = coalesce(p_location, ''), description = coalesce(p_description, ''), category = coalesce(p_category, 'other'),
    rsvp_enabled = coalesce(p_rsvp_enabled, true), rsvp_deadline = p_rsvp_deadline,
    attendance_visibility = coalesce(p_attendance_visibility, 'members'), image_path = p_image_path
  where id = p_event_id;
end;
$$;

-- Notifications only make sense for group events.
create or replace function private.on_event_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text;
begin
  if new.group_id is null then
    return null;
  end if;
  v_group := (select name from public.groups where id = new.group_id);
  perform private.notify_group_members(
    new.group_id, new.created_by, case when new.rsvp_enabled then 'attendance_request' else 'event_new' end,
    case when new.rsvp_enabled then '出欠確認: ' else '新しい予定: ' end || new.title,
    v_group || ' ・ ' || to_char(new.starts_at at time zone 'Asia/Tokyo',
      case when new.all_day then 'FMMM/FMDD' else 'FMMM/FMDD HH24:MI' end)
      || case when new.location <> '' then ' ・ ' || new.location else '' end,
    '/events/' || new.id::text, new.id, 'event_new:' || new.id::text);
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
  v_group text;
begin
  if new.group_id is null then
    return null;
  end if;
  v_group := (select name from public.groups where id = new.group_id);
  if new.canceled_at is not null and old.canceled_at is null then
    perform private.notify_group_members(
      new.group_id, auth.uid(), 'event_canceled', '予定が中止になりました: ' || new.title,
      v_group, '/events/' || new.id::text, new.id);
  elsif new.canceled_at is null and (
    new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or new.location is distinct from old.location or new.all_day is distinct from old.all_day) then
    perform private.notify_group_members(
      new.group_id, auth.uid(), 'event_updated', '予定が変更されました: ' || new.title,
      v_group || ' ・ ' || to_char(new.starts_at at time zone 'Asia/Tokyo',
        case when new.all_day then 'FMMM/FMDD' else 'FMMM/FMDD HH24:MI' end)
        || case when new.location <> '' then ' ・ ' || new.location else '' end,
      '/events/' || new.id::text, new.id);
  end if;
  return null;
end;
$$;

create or replace function public.set_event_canceled(p_event_id uuid, p_canceled boolean)
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
  if v_event.id is null
     or v_event.personal_user_id is not null
     or not (v_event.created_by = v_uid or public.is_group_admin(v_event.group_id)) then
    raise exception 'この予定を変更する権限がありません' using errcode = '42501';
  end if;
  update public.events set canceled_at = case when p_canceled then coalesce(canceled_at, now()) else null end
  where id = p_event_id;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
