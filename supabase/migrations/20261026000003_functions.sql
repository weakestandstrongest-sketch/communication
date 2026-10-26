-- つどい: RPC functions. Each validates the caller (auth.uid()) and their role
-- before writing, so rules hold even if the UI is bypassed.

create or replace function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

create or replace function private.require_member(p_group_id uuid)
returns public.group_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.group_role;
begin
  select role into v_role from public.group_members
  where group_id = p_group_id and user_id = private.require_user();
  if v_role is null then
    raise exception 'このグループのメンバーではありません' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function private.group_conversation_id(p_group_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.conversations where group_id = p_group_id and kind = 'group';
$$;

-- Inserts a structured card message (poll / event / announcement / album / system).
create or replace function private.post_card(
  p_group_id uuid,
  p_kind public.message_kind,
  p_body text,
  p_poll_id uuid default null,
  p_event_id uuid default null,
  p_announcement_id uuid default null,
  p_album_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.messages (conversation_id, sender_id, client_id, kind, body, poll_id, event_id, announcement_id, album_id)
  values (private.group_conversation_id(p_group_id), auth.uid(), gen_random_uuid(), p_kind, left(coalesce(p_body, ''), 5000),
          p_poll_id, p_event_id, p_announcement_id, p_album_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_description text default '', p_color text default 'indigo')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_group uuid;
begin
  if (select count(*) from public.group_members where user_id = v_uid and role = 'owner') >= 20 then
    raise exception '作成できるグループ数の上限に達しました';
  end if;
  insert into public.groups (name, description, color, created_by)
  values (btrim(p_name), coalesce(p_description, ''), coalesce(p_color, 'indigo'), v_uid)
  returning id into v_group;
  insert into public.group_invites (group_id) values (v_group);
  insert into public.conversations (kind, group_id) values ('group', v_group);
  insert into public.group_members (group_id, user_id, role) values (v_group, v_uid, 'owner');
  return v_group;
end;
$$;

create or replace function public.preview_invite(p_code text)
returns table (group_id uuid, name text, description text, color text, member_count bigint, already_member boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  return query
  select g.id, g.name, g.description, g.color,
    (select count(*) from public.group_members m where m.group_id = g.id),
    exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = v_uid)
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where i.code = upper(btrim(p_code)) and i.enabled;
end;
$$;

create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_group uuid;
  v_count integer;
begin
  select i.group_id into v_group from public.group_invites i
  where i.code = upper(btrim(p_code)) and i.enabled;
  if v_group is null then
    raise exception '招待コードが無効か、期限切れです' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_members where group_id = v_group and user_id = v_uid) then
    return v_group;
  end if;
  select count(*) into v_count from public.group_members where group_id = v_group;
  if v_count >= 100 then
    raise exception 'このグループは人数の上限に達しています';
  end if;
  insert into public.group_members (group_id, user_id, role) values (v_group, v_uid, 'member');
  insert into public.messages (conversation_id, sender_id, client_id, kind, body)
  values (private.group_conversation_id(v_group), v_uid, gen_random_uuid(), 'system',
          (select display_name from public.profiles where id = v_uid) || 'さんが参加しました');
  return v_group;
end;
$$;

create or replace function public.regenerate_invite(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if private.require_member(p_group_id) not in ('owner', 'admin') then
    raise exception '管理者のみ操作できます' using errcode = '42501';
  end if;
  update public.group_invites set code = public.generate_invite_code(), enabled = true, updated_at = now()
  where group_id = p_group_id returning code into v_code;
  return v_code;
end;
$$;

create or replace function public.set_invite_enabled(p_group_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.require_member(p_group_id) not in ('owner', 'admin') then
    raise exception '管理者のみ操作できます' using errcode = '42501';
  end if;
  update public.group_invites set enabled = p_enabled, updated_at = now() where group_id = p_group_id;
end;
$$;

-- Only the owner manages roles. Assigning 'owner' transfers ownership.
create or replace function public.set_member_role(p_group_id uuid, p_user_id uuid, p_role public.group_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  if private.require_member(p_group_id) <> 'owner' then
    raise exception 'オーナーのみ権限を変更できます' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception '自分の権限は変更できません。オーナーを譲渡してください';
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
    raise exception 'メンバーが見つかりません';
  end if;
  if p_role = 'owner' then
    update public.group_members set role = 'admin' where group_id = p_group_id and user_id = v_uid;
  end if;
  update public.group_members set role = p_role where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_my_role public.group_role := private.require_member(p_group_id);
  v_target_role public.group_role;
begin
  select role into v_target_role from public.group_members where group_id = p_group_id and user_id = p_user_id;
  if v_target_role is null then
    raise exception 'メンバーが見つかりません';
  end if;
  if p_user_id = v_uid then
    raise exception '自分を削除するには「グループを退会」を使ってください';
  end if;
  if v_target_role = 'owner'
     or v_my_role = 'member'
     or (v_my_role = 'admin' and v_target_role = 'admin') then
    raise exception 'このメンバーを削除する権限がありません' using errcode = '42501';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_role public.group_role := private.require_member(p_group_id);
begin
  if v_role = 'owner' then
    if (select count(*) from public.group_members where group_id = p_group_id) > 1 then
      raise exception 'オーナーは退会前に他のメンバーへオーナーを譲渡してください';
    end if;
    delete from public.groups where id = p_group_id;
    return;
  end if;
  insert into public.messages (conversation_id, sender_id, client_id, kind, body)
  values (private.group_conversation_id(p_group_id), v_uid, gen_random_uuid(), 'system',
          (select display_name from public.profiles where id = v_uid) || 'さんが退会しました');
  delete from public.group_members where group_id = p_group_id and user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversations and messages
-- ---------------------------------------------------------------------------
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
  return v_id;
end;
$$;

create or replace function public.get_conversations()
returns table (
  id uuid,
  kind public.conversation_kind,
  group_id uuid,
  group_name text,
  group_color text,
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
    c.id, c.kind, c.group_id, g.name, g.color,
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

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_at timestamptz;
begin
  update public.conversation_members
  set last_read_at = greatest(last_read_at, now())
  where conversation_id = p_conversation_id and user_id = v_uid
  returning last_read_at into v_at;
  if v_at is null then
    raise exception 'トークが見つかりません' using errcode = '42501';
  end if;
  -- Collapse message-related notifications for this conversation.
  update public.notifications set read_at = now()
  where user_id = v_uid and read_at is null and kind in ('mention', 'reply')
    and link = '/talk/' || p_conversation_id::text;
  return v_at;
end;
$$;

-- p_attachments: [{path, thumb_path?, name, mime, size, width?, height?}]
create or replace function public.send_message(
  p_conversation_id uuid,
  p_client_id uuid,
  p_body text,
  p_reply_to_id uuid default null,
  p_mentions uuid[] default '{}',
  p_attachments jsonb default '[]'::jsonb
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_conv public.conversations;
  v_msg public.messages;
  v_prefix text;
  v_att jsonb;
  v_kind public.message_kind := 'text';
  v_mentions uuid[];
begin
  -- Idempotency: a retried send returns the original message.
  select * into v_msg from public.messages where sender_id = v_uid and client_id = p_client_id;
  if found then
    return v_msg;
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.id is null or not public.is_conversation_member(p_conversation_id) then
    raise exception 'このトークに投稿する権限がありません' using errcode = '42501';
  end if;

  p_body := coalesce(p_body, '');
  p_attachments := coalesce(p_attachments, '[]'::jsonb);
  if jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) > 10 then
    raise exception '添付ファイルは10件までです';
  end if;
  if btrim(p_body) = '' and jsonb_array_length(p_attachments) = 0 then
    raise exception 'メッセージが空です';
  end if;
  if char_length(p_body) > 5000 then
    raise exception 'メッセージは5000文字以内で入力してください';
  end if;

  v_prefix := case when v_conv.kind = 'group'
    then 'g/' || v_conv.group_id::text || '/chat/' || v_conv.id::text || '/'
    else 'dm/' || v_conv.id::text || '/' end;

  for v_att in select * from jsonb_array_elements(p_attachments) loop
    if (v_att ->> 'path') is null or left(v_att ->> 'path', length(v_prefix)) <> v_prefix
       or not public.owns_storage_object(v_att ->> 'path')
       or ((v_att ->> 'thumb_path') is not null and (
            left(v_att ->> 'thumb_path', length(v_prefix)) <> v_prefix
            or not public.owns_storage_object(v_att ->> 'thumb_path'))) then
      raise exception '添付ファイルが不正です';
    end if;
  end loop;

  if jsonb_array_length(p_attachments) > 0 then
    v_kind := case when not exists (
      select 1 from jsonb_array_elements(p_attachments) a where (a ->> 'mime') not like 'image/%'
    ) then 'image' else 'file' end;
  end if;

  if p_reply_to_id is not null and not exists (
    select 1 from public.messages where id = p_reply_to_id and conversation_id = p_conversation_id
  ) then
    p_reply_to_id := null;
  end if;

  -- Mentions are limited to members of this conversation.
  select coalesce(array_agg(distinct cm.user_id), '{}') into v_mentions
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.user_id = any (coalesce(p_mentions, '{}')) and cm.user_id <> v_uid;

  insert into public.messages (conversation_id, sender_id, client_id, kind, body, reply_to_id, mentions, attachments)
  values (p_conversation_id, v_uid, p_client_id, v_kind, p_body, p_reply_to_id, v_mentions,
    (select coalesce(jsonb_agg(jsonb_build_object(
      'path', a ->> 'path',
      'thumb_path', a ->> 'thumb_path',
      'name', left(coalesce(a ->> 'name', ''), 200),
      'mime', left(coalesce(a ->> 'mime', 'application/octet-stream'), 100),
      'size', coalesce((a ->> 'size')::bigint, 0),
      'width', (a ->> 'width')::integer,
      'height', (a ->> 'height')::integer
    )), '[]'::jsonb) from jsonb_array_elements(p_attachments) a))
  on conflict (sender_id, client_id) do nothing
  returning * into v_msg;

  if v_msg.id is null then
    select * into v_msg from public.messages where sender_id = v_uid and client_id = p_client_id;
    return v_msg;
  end if;

  insert into public.media_items (group_id, conversation_id, message_id, uploader_id, storage_path, thumb_path, mime_type, file_name, size_bytes, width, height)
  select v_conv.group_id, v_conv.id, v_msg.id, v_uid, a ->> 'path', a ->> 'thumb_path', a ->> 'mime', a ->> 'name',
         (a ->> 'size')::bigint, (a ->> 'width')::integer, (a ->> 'height')::integer
  from jsonb_array_elements(v_msg.attachments) a;

  update public.conversation_members set last_read_at = greatest(last_read_at, v_msg.created_at)
  where conversation_id = p_conversation_id and user_id = v_uid;

  return v_msg;
end;
$$;

create or replace function public.edit_message(p_message_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_msg public.messages;
begin
  if btrim(coalesce(p_body, '')) = '' or char_length(p_body) > 5000 then
    raise exception 'メッセージは1〜5000文字で入力してください';
  end if;
  update public.messages set body = p_body, edited_at = now()
  where id = p_message_id and sender_id = v_uid and deleted_at is null and kind in ('text', 'image', 'file')
  returning * into v_msg;
  if v_msg.id is null then
    raise exception 'このメッセージは編集できません' using errcode = '42501';
  end if;
  return v_msg;
end;
$$;

-- Returns storage paths so the client can remove the files from Storage.
create or replace function public.delete_message(p_message_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_msg public.messages;
  v_conv public.conversations;
  v_paths text[];
begin
  select * into v_msg from public.messages where id = p_message_id;
  if v_msg.id is null or v_msg.deleted_at is not null then
    raise exception 'メッセージが見つかりません';
  end if;
  select * into v_conv from public.conversations where id = v_msg.conversation_id;
  if not (v_msg.sender_id = v_uid or (v_conv.kind = 'group' and public.is_group_admin(v_conv.group_id))) then
    raise exception 'このメッセージを削除する権限がありません' using errcode = '42501';
  end if;
  select coalesce(array_agg(p) filter (where p is not null), '{}') into v_paths
  from (
    select a ->> 'path' as p from jsonb_array_elements(v_msg.attachments) a
    union all
    select a ->> 'thumb_path' from jsonb_array_elements(v_msg.attachments) a
  ) s;
  delete from public.media_items where message_id = p_message_id;
  delete from public.message_reactions where message_id = p_message_id;
  update public.messages
  set body = '', attachments = '[]'::jsonb, mentions = '{}', reactions = '{}'::jsonb, deleted_at = now()
  where id = p_message_id;
  return v_paths;
end;
$$;

create or replace function public.toggle_reaction(p_message_id uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_conv uuid;
begin
  select conversation_id into v_conv from public.messages where id = p_message_id and deleted_at is null;
  if v_conv is null or not public.is_conversation_member(v_conv) then
    raise exception 'リアクションできません' using errcode = '42501';
  end if;
  if char_length(coalesce(p_emoji, '')) not between 1 and 16 then
    raise exception '不正なリアクションです';
  end if;
  delete from public.message_reactions where message_id = p_message_id and user_id = v_uid and emoji = p_emoji;
  if found then
    return false;
  end if;
  if (select count(distinct emoji) from public.message_reactions where message_id = p_message_id and user_id = v_uid) >= 6 then
    raise exception 'リアクションは1つのメッセージに6種類までです';
  end if;
  insert into public.message_reactions (message_id, user_id, conversation_id, emoji) values (p_message_id, v_uid, v_conv, p_emoji);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Polls
-- ---------------------------------------------------------------------------
create or replace function private.poll_is_closed(p public.polls)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p.closed_at is not null or (p.deadline is not null and p.deadline <= now());
$$;

create or replace function public.create_poll(
  p_group_id uuid,
  p_title text,
  p_options text[],
  p_description text default '',
  p_multiple boolean default false,
  p_allow_free_text boolean default false,
  p_anonymous boolean default false,
  p_allow_change boolean default true,
  p_result_visibility public.poll_result_visibility default 'always',
  p_deadline timestamptz default null,
  p_post_to_chat boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_role public.group_role := private.require_member(p_group_id);
  v_poll uuid;
  v_options text[];
begin
  if v_role = 'member' and not (select member_can_create_polls from public.groups where id = p_group_id) then
    raise exception 'このグループでは管理者のみ投票を作成できます' using errcode = '42501';
  end if;
  select coalesce(array_agg(btrim(o) order by ord), '{}') into v_options
  from unnest(p_options) with ordinality as t(o, ord) where btrim(o) <> '';
  if cardinality(v_options) < 2 and not coalesce(p_allow_free_text, false) then
    raise exception '選択肢を2つ以上入力してください';
  end if;
  if cardinality(v_options) > 20 then
    raise exception '選択肢は20個までです';
  end if;
  if (select count(distinct o) from unnest(v_options) o) <> cardinality(v_options) then
    raise exception '同じ選択肢が重複しています';
  end if;
  if p_deadline is not null and p_deadline <= now() then
    raise exception '締切は現在より後の日時を指定してください';
  end if;

  insert into public.polls (group_id, created_by, title, description, multiple, allow_free_text, anonymous, allow_change, result_visibility, deadline)
  values (p_group_id, v_uid, btrim(p_title), coalesce(p_description, ''), coalesce(p_multiple, false), coalesce(p_allow_free_text, false),
          coalesce(p_anonymous, false), coalesce(p_allow_change, true), coalesce(p_result_visibility, 'always'), p_deadline)
  returning id into v_poll;

  insert into public.poll_options (poll_id, label, position)
  select v_poll, o, ord::integer from unnest(v_options) with ordinality as t(o, ord);

  if coalesce(p_post_to_chat, true) then
    perform private.post_card(p_group_id, 'poll', btrim(p_title), p_poll_id => v_poll);
  end if;
  return v_poll;
end;
$$;

create or replace function public.update_poll(p_poll_id uuid, p_title text, p_description text, p_deadline timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_poll public.polls;
begin
  select * into v_poll from public.polls where id = p_poll_id;
  if v_poll.id is null or not (v_poll.created_by = v_uid or public.is_group_admin(v_poll.group_id)) then
    raise exception 'この投票を編集する権限がありません' using errcode = '42501';
  end if;
  if p_deadline is not null and p_deadline <= now() and p_deadline is distinct from v_poll.deadline then
    raise exception '締切は現在より後の日時を指定してください';
  end if;
  update public.polls set title = btrim(p_title), description = coalesce(p_description, ''), deadline = p_deadline
  where id = p_poll_id;
end;
$$;

create or replace function public.set_poll_closed(p_poll_id uuid, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_poll public.polls;
begin
  select * into v_poll from public.polls where id = p_poll_id;
  if v_poll.id is null or not (v_poll.created_by = v_uid or public.is_group_admin(v_poll.group_id)) then
    raise exception 'この投票を締め切る権限がありません' using errcode = '42501';
  end if;
  if p_closed then
    update public.polls set closed_at = coalesce(closed_at, now()) where id = p_poll_id;
  else
    if v_poll.deadline is not null and v_poll.deadline <= now() then
      raise exception '締切日時を過ぎています。再開するには締切を変更してください';
    end if;
    update public.polls set closed_at = null where id = p_poll_id;
  end if;
end;
$$;

create or replace function public.submit_poll_response(p_poll_id uuid, p_option_ids uuid[], p_free_text text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_poll public.polls;
  v_options uuid[] := coalesce((select array_agg(distinct x) from unnest(p_option_ids) x), '{}');
  v_text text := nullif(btrim(coalesce(p_free_text, '')), '');
begin
  select * into v_poll from public.polls where id = p_poll_id for update;
  if v_poll.id is null then
    raise exception '投票が見つかりません';
  end if;
  perform private.require_member(v_poll.group_id);
  if private.poll_is_closed(v_poll) then
    raise exception 'この投票は締め切られています';
  end if;
  if exists (select 1 from public.poll_responses where poll_id = p_poll_id and user_id = v_uid) and not v_poll.allow_change then
    raise exception 'この投票は回答を変更できません';
  end if;
  if v_text is not null and not v_poll.allow_free_text then
    raise exception 'この投票は自由回答を受け付けていません';
  end if;
  if v_text is not null and char_length(v_text) > 500 then
    raise exception '自由回答は500文字以内で入力してください';
  end if;
  if cardinality(v_options) = 0 and v_text is null then
    raise exception '選択肢を選んでください';
  end if;
  if not v_poll.multiple and cardinality(v_options) > 1 then
    raise exception 'この投票は1つだけ選択できます';
  end if;
  if exists (
    select 1 from unnest(v_options) o
    where not exists (select 1 from public.poll_options po where po.id = o and po.poll_id = p_poll_id)
  ) then
    raise exception '不正な選択肢です';
  end if;

  insert into public.poll_responses (poll_id, user_id, free_text)
  values (p_poll_id, v_uid, v_text)
  on conflict (poll_id, user_id) do update set free_text = excluded.free_text, updated_at = now();
  delete from public.poll_votes where poll_id = p_poll_id and user_id = v_uid;
  insert into public.poll_votes (poll_id, option_id, user_id)
  select p_poll_id, o, v_uid from unnest(v_options) o;
  -- bump updated_at so realtime subscribers refresh results
  update public.polls set updated_at = now() where id = p_poll_id;
end;
$$;

create or replace function public.retract_poll_response(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_poll public.polls;
begin
  select * into v_poll from public.polls where id = p_poll_id;
  if v_poll.id is null then
    raise exception '投票が見つかりません';
  end if;
  perform private.require_member(v_poll.group_id);
  if private.poll_is_closed(v_poll) or not v_poll.allow_change then
    raise exception '回答を取り消せません';
  end if;
  delete from public.poll_responses where poll_id = p_poll_id and user_id = v_uid;
  update public.polls set updated_at = now() where id = p_poll_id;
end;
$$;

-- Aggregated results honoring result_visibility and anonymity.
create or replace function public.get_poll_results(p_poll_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_poll public.polls;
  v_role public.group_role;
  v_responded boolean;
  v_closed boolean;
  v_visible boolean;
  v_privileged boolean;
  v_eligible integer;
begin
  select * into v_poll from public.polls where id = p_poll_id;
  if v_poll.id is null then
    raise exception '投票が見つかりません';
  end if;
  v_role := private.require_member(v_poll.group_id);
  v_responded := exists (select 1 from public.poll_responses where poll_id = p_poll_id and user_id = v_uid);
  v_closed := private.poll_is_closed(v_poll);
  v_privileged := v_role in ('owner', 'admin') or v_poll.created_by = v_uid;
  v_visible := v_privileged or case v_poll.result_visibility
    when 'always' then true
    when 'after_vote' then v_responded or v_closed
    when 'after_close' then v_closed
    else false end;
  select count(*) into v_eligible from public.group_members where group_id = v_poll.group_id;

  return jsonb_build_object(
    'poll_id', v_poll.id,
    'visible', v_visible,
    'closed', v_closed,
    'responded', v_responded,
    'response_count', v_poll.response_count,
    'eligible_count', v_eligible,
    'my_option_ids', coalesce((select jsonb_agg(option_id) from public.poll_votes where poll_id = p_poll_id and user_id = v_uid), '[]'::jsonb),
    'my_free_text', (select free_text from public.poll_responses where poll_id = p_poll_id and user_id = v_uid),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'label', o.label,
        'position', o.position,
        'count', case when v_visible then (select count(*) from public.poll_votes v where v.option_id = o.id) else null end,
        'voters', case when v_visible and not v_poll.anonymous then
          coalesce((select jsonb_agg(v.user_id order by v.created_at) from public.poll_votes v where v.option_id = o.id), '[]'::jsonb)
          else null end
      ) order by o.position)
      from public.poll_options o where o.poll_id = p_poll_id
    ), '[]'::jsonb),
    'free_texts', case when v_visible then coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', case when v_poll.anonymous then null else r.user_id end,
        'text', r.free_text
      ) order by case when v_poll.anonymous then md5(r.user_id::text || r.poll_id::text) else r.created_at::text end)
      from public.poll_responses r where r.poll_id = p_poll_id and r.free_text is not null
    ), '[]'::jsonb) else null end,
    -- For non-anonymous polls, list members who have not answered yet (for reminders).
    'non_respondents', case when not v_poll.anonymous then coalesce((
      select jsonb_agg(m.user_id)
      from public.group_members m
      where m.group_id = v_poll.group_id
        and not exists (select 1 from public.poll_responses r where r.poll_id = p_poll_id and r.user_id = m.user_id)
    ), '[]'::jsonb) else null end
  );
end;
$$;

create or replace function public.list_polls(p_group_id uuid default null)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_color text,
  created_by uuid,
  creator_name text,
  title text,
  description text,
  multiple boolean,
  anonymous boolean,
  deadline timestamptz,
  closed_at timestamptz,
  is_closed boolean,
  created_at timestamptz,
  response_count integer,
  eligible_count bigint,
  responded boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.group_id, g.name, g.color, p.created_by, pr.display_name, p.title, p.description,
    p.multiple, p.anonymous, p.deadline, p.closed_at,
    (p.closed_at is not null or (p.deadline is not null and p.deadline <= now())),
    p.created_at, p.response_count,
    (select count(*) from public.group_members m where m.group_id = p.group_id),
    exists (select 1 from public.poll_responses r where r.poll_id = p.id and r.user_id = auth.uid())
  from public.polls p
  join public.group_members me on me.group_id = p.group_id and me.user_id = auth.uid()
  join public.groups g on g.id = p.group_id
  left join public.profiles pr on pr.id = p.created_by
  where p_group_id is null or p.group_id = p_group_id
  order by p.created_at desc
  limit 300;
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create or replace function public.create_event(
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
  p_post_to_chat boolean default true
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
  if v_role = 'member' and not (select member_can_create_events from public.groups where id = p_group_id) then
    raise exception 'このグループでは管理者のみ予定を作成できます' using errcode = '42501';
  end if;
  if p_image_path is not null and (
    left(p_image_path, length('g/' || p_group_id::text || '/events/')) <> 'g/' || p_group_id::text || '/events/'
    or not public.owns_storage_object(p_image_path)) then
    raise exception '画像が不正です';
  end if;
  insert into public.events (group_id, created_by, title, description, location, category, starts_at, ends_at, all_day,
                             rsvp_enabled, rsvp_deadline, attendance_visibility, image_path)
  values (p_group_id, v_uid, btrim(p_title), coalesce(p_description, ''), coalesce(p_location, ''), coalesce(p_category, 'other'),
          p_starts_at, p_ends_at, coalesce(p_all_day, false), coalesce(p_rsvp_enabled, true), p_rsvp_deadline,
          coalesce(p_attendance_visibility, 'members'), p_image_path)
  returning id into v_event;
  if coalesce(p_post_to_chat, true) then
    perform private.post_card(p_group_id, 'event', btrim(p_title), p_event_id => v_event);
  end if;
  return v_event;
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
begin
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null or not (v_event.created_by = v_uid or public.is_group_admin(v_event.group_id)) then
    raise exception 'この予定を編集する権限がありません' using errcode = '42501';
  end if;
  if p_image_path is not null and p_image_path is distinct from v_event.image_path and (
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
  if v_event.id is null or not (v_event.created_by = v_uid or public.is_group_admin(v_event.group_id)) then
    raise exception 'この予定を変更する権限がありません' using errcode = '42501';
  end if;
  update public.events set canceled_at = case when p_canceled then coalesce(canceled_at, now()) else null end
  where id = p_event_id;
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
  if v_event.id is null then
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
  if v_event.id is null then
    raise exception '予定が見つかりません';
  end if;
  perform private.require_member(v_event.group_id);
  v_can_see := public.can_view_event_attendance(p_event_id);
  return jsonb_build_object(
    'can_view_individuals', v_can_see,
    'member_count', (select count(*) from public.group_members where group_id = v_event.group_id),
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
        and not exists (select 1 from public.event_attendance a where a.event_id = p_event_id and a.user_id = m.user_id)
    ), '[]'::jsonb) else null end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create or replace function public.create_announcement(
  p_group_id uuid,
  p_title text,
  p_body text,
  p_important boolean default false,
  p_pinned boolean default false,
  p_poll_id uuid default null,
  p_event_id uuid default null,
  p_post_to_chat boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_role public.group_role := private.require_member(p_group_id);
  v_id uuid;
begin
  if v_role = 'member' and not (select member_can_post_announcements from public.groups where id = p_group_id) then
    raise exception 'このグループでは管理者のみお知らせを投稿できます' using errcode = '42501';
  end if;
  if coalesce(p_pinned, false) and v_role = 'member' then
    raise exception 'ピン留めは管理者のみ可能です' using errcode = '42501';
  end if;
  if p_poll_id is not null and public.poll_group_id(p_poll_id) is distinct from p_group_id then
    raise exception '関連する投票が不正です';
  end if;
  if p_event_id is not null and public.event_group_id(p_event_id) is distinct from p_group_id then
    raise exception '関連する予定が不正です';
  end if;
  insert into public.announcements (group_id, author_id, title, body, important, pinned, poll_id, event_id)
  values (p_group_id, v_uid, btrim(p_title), coalesce(p_body, ''), coalesce(p_important, false), coalesce(p_pinned, false), p_poll_id, p_event_id)
  returning id into v_id;
  insert into public.announcement_reads (announcement_id, user_id) values (v_id, v_uid);
  if coalesce(p_post_to_chat, true) then
    perform private.post_card(p_group_id, 'announcement', btrim(p_title), p_announcement_id => v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.get_announcement_read_count(p_announcement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  select group_id into v_group from public.announcements where id = p_announcement_id;
  if v_group is null then
    raise exception 'お知らせが見つかりません';
  end if;
  perform private.require_member(v_group);
  return jsonb_build_object(
    'read', (select count(*) from public.announcement_reads r join public.group_members m on m.user_id = r.user_id and m.group_id = v_group
             where r.announcement_id = p_announcement_id),
    'members', (select count(*) from public.group_members where group_id = v_group)
  );
end;
$$;

-- Share an existing poll / event / announcement / album as a card in the group chat
-- (references the same record: nothing is duplicated).
create or replace function public.share_to_chat(p_kind public.message_kind, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_title text;
begin
  if p_kind = 'poll' then
    select group_id, title into v_group, v_title from public.polls where id = p_id;
  elsif p_kind = 'event' then
    select group_id, title into v_group, v_title from public.events where id = p_id;
  elsif p_kind = 'announcement' then
    select group_id, title into v_group, v_title from public.announcements where id = p_id;
  elsif p_kind = 'album' then
    select group_id, title into v_group, v_title from public.albums where id = p_id;
  else
    raise exception '共有できない種類です';
  end if;
  if v_group is null then
    raise exception '見つかりません';
  end if;
  perform private.require_member(v_group);
  return private.post_card(v_group, p_kind, v_title,
    p_poll_id => case when p_kind = 'poll' then p_id end,
    p_event_id => case when p_kind = 'event' then p_id end,
    p_announcement_id => case when p_kind = 'announcement' then p_id end,
    p_album_id => case when p_kind = 'album' then p_id end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Push subscriptions
-- ---------------------------------------------------------------------------
-- A device endpoint belongs to whoever registered it most recently, so a shared
-- device never keeps delivering the previous user's notifications.
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  if p_endpoint !~ '^https://' then
    raise exception '不正な購読情報です';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> v_uid;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 400))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, failure_count = 0;
  -- Keep at most 10 devices per user.
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where user_id = v_uid order by created_at desc offset 10
  );
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
