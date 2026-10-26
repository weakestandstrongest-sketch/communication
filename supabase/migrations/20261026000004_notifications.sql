-- つどい: notifications, reminders and backend-triggered Web Push delivery.
--
-- * In-app notifications are rows in public.notifications, created by triggers here.
-- * Chat messages do not create a notification row per member (that would flood the
--   notification center); only mentions and replies do. Chat pushes are dispatched
--   per message and the dispatcher decides recipients (muted / preferences / active).
-- * Push delivery: an AFTER INSERT trigger posts the new ids to the Next.js route
--   /api/push/dispatch via pg_net. The URL and shared secret live in
--   private.push_config (see docs/NOTIFICATIONS.md). When unset, nothing is sent.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Push dispatch
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_push(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select dispatch_url, dispatch_secret into v_url, v_secret from private.push_config where id;
  if v_url is null or v_secret is null or v_url = '' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := p_payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 10000
  );
exception when others then
  -- Never let push delivery problems break the user's write.
  raise warning 'push dispatch failed: %', sqlerrm;
end;
$$;

create or replace function private.set_push_config(p_url text, p_secret text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.push_config set dispatch_url = p_url, dispatch_secret = p_secret where id;
$$;

create or replace function private.on_notifications_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids jsonb;
begin
  select jsonb_agg(id) into v_ids from new_rows where push;
  if v_ids is not null then
    perform private.dispatch_push(jsonb_build_object('type', 'notifications', 'ids', v_ids));
  end if;
  return null;
end;
$$;

create trigger notifications_dispatch_push
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function private.on_notifications_inserted();

-- ---------------------------------------------------------------------------
-- Fan-out helper
-- ---------------------------------------------------------------------------
create or replace function private.notify_group_members(
  p_group_id uuid,
  p_actor uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_ref_id uuid,
  p_dedupe_prefix text default null,
  p_push boolean default true,
  p_only_admins boolean default false
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
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity triggers
-- ---------------------------------------------------------------------------
create or replace function private.on_poll_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text := (select name from public.groups where id = new.group_id);
begin
  perform private.notify_group_members(
    new.group_id, new.created_by, 'poll_new',
    '新しい投票: ' || new.title,
    v_group || ' ・ ' || case when new.deadline is null then '回答をお願いします'
      else to_char(new.deadline at time zone 'Asia/Tokyo', 'FMMM/FMDD HH24:MI') || ' 締切' end,
    '/polls/' || new.id::text, new.id, 'poll_new:' || new.id::text);
  return null;
end;
$$;

create trigger polls_notify_created after insert on public.polls
  for each row execute function private.on_poll_created();

create or replace function private.on_event_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text := (select name from public.groups where id = new.group_id);
begin
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

create trigger events_notify_created after insert on public.events
  for each row execute function private.on_event_created();

create or replace function private.on_event_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text := (select name from public.groups where id = new.group_id);
begin
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

create trigger events_notify_updated after update on public.events
  for each row execute function private.on_event_updated();

create or replace function private.on_announcement_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text := (select name from public.groups where id = new.group_id);
begin
  perform private.notify_group_members(
    new.group_id, new.author_id, 'announcement',
    case when new.important then '【重要】' else 'お知らせ: ' end || new.title,
    v_group || ' ・ ' || left(regexp_replace(new.body, '\s+', ' ', 'g'), 80),
    '/announcements/' || new.id::text, new.id, 'announcement:' || new.id::text);
  return null;
end;
$$;

create trigger announcements_notify_created after insert on public.announcements
  for each row execute function private.on_announcement_created();

create or replace function private.on_member_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'member' then
    perform private.notify_group_members(
      new.group_id, new.user_id, 'member_joined',
      (select display_name from public.profiles where id = new.user_id) || 'さんが参加しました',
      (select name from public.groups where id = new.group_id),
      '/groups/' || new.group_id::text, new.user_id,
      'member_joined:' || new.group_id::text || ':' || new.user_id::text, false, true);
  end if;
  return null;
end;
$$;

create trigger group_members_notify_joined after insert on public.group_members
  for each row execute function private.on_member_joined();

-- Mentions and replies get a persistent notification (push is sent by the message dispatcher).
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
  select c.group_id, coalesce(g.name, 'トーク') into v_group, v_where
  from public.conversations c left join public.groups g on g.id = c.group_id where c.id = new.conversation_id;
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

create trigger messages_notify_created after insert on public.messages
  for each row execute function private.on_message_created();

-- ---------------------------------------------------------------------------
-- Scheduled reminders (pg_cron, every 15 minutes)
-- ---------------------------------------------------------------------------
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
         g.name || ' ・ ' || to_char(e.starts_at at time zone 'Asia/Tokyo', case when e.all_day then 'FMMM/FMDD' else 'FMMM/FMDD HH24:MI' end)
           || case when e.location <> '' then ' ・ ' || e.location else '' end,
         '/events/' || e.id::text, e.id,
         'event_upcoming:' || e.id::text || ':' || extract(epoch from e.starts_at)::bigint::text || ':' || m.user_id::text
  from public.events e
  join public.groups g on g.id = e.group_id
  join public.group_members m on m.group_id = e.group_id
  left join public.event_attendance a on a.event_id = e.id and a.user_id = m.user_id
  where e.canceled_at is null and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
    and e.created_at < now() - interval '1 hour'
    and (a.status is null or a.status <> 'not_going')
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- Attendance deadlines within 24 hours for members who have not answered.
  insert into public.notifications (user_id, group_id, kind, title, body, link, ref_id, dedupe_key)
  select m.user_id, e.group_id, 'attendance_deadline', '出欠の回答期限が近づいています: ' || e.title,
         g.name || ' ・ ' || to_char(e.rsvp_deadline at time zone 'Asia/Tokyo', 'FMMM/FMDD HH24:MI') || ' まで',
         '/events/' || e.id::text, e.id, 'attendance_deadline:' || e.id::text || ':' || m.user_id::text
  from public.events e
  join public.groups g on g.id = e.group_id
  join public.group_members m on m.group_id = e.group_id
  where e.canceled_at is null and e.rsvp_enabled and e.rsvp_deadline > now() and e.rsvp_deadline <= now() + interval '24 hours'
    and e.starts_at > now() + interval '24 hours'
    and not exists (select 1 from public.event_attendance a where a.event_id = e.id and a.user_id = m.user_id)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  -- Housekeeping: keep notification history bounded (90 days).
  delete from public.notifications where created_at < now() - interval '90 days';
  return v_count;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- Schedule reminders when pg_cron is available (it is on Supabase, including the free plan).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'tsudoi-reminders') then
      perform cron.unschedule('tsudoi-reminders');
    end if;
    perform cron.schedule('tsudoi-reminders', '*/15 * * * *', 'select private.process_reminders()');
  else
    raise notice 'pg_cron is not available; schedule private.process_reminders() externally';
  end if;
end;
$$;
