-- つどい: 意見箱 (anonymous suggestion box with threads).
--
-- Anonymity model
--   * public.feedback_posts / feedback_replies contain NO author column, so rows (and their Realtime
--     payloads) never identify anyone.
--   * The author of each post / reply, per-thread aliases and likes live in the "private" schema, which is
--     not exposed through the API. Only the SECURITY DEFINER functions below read it.
--   * Functions return a `mine` flag, never an author id. Group admins can delete any post (moderation) but
--     cannot see who wrote it.
--   * Replies in a thread get a stable alias per person (匿名A, 匿名B, …); the original poster is alias 0 (スレ主).

create table public.feedback_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 600),
  topic text check (topic is null or char_length(btrim(topic)) between 1 and 40),
  like_count integer not null default 0,
  reply_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index feedback_posts_group_idx on public.feedback_posts (group_id, created_at desc);
create index feedback_posts_topic_idx on public.feedback_posts (group_id, topic) where topic is not null;

create table public.feedback_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feedback_posts (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 600),
  alias_no integer not null check (alias_no >= 0),
  like_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index feedback_replies_post_idx on public.feedback_replies (post_id, created_at);

create table private.feedback_post_authors (
  post_id uuid primary key references public.feedback_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade
);
create index feedback_post_authors_user_idx on private.feedback_post_authors (user_id);

create table private.feedback_reply_authors (
  reply_id uuid primary key references public.feedback_replies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade
);

create table private.feedback_aliases (
  post_id uuid not null references public.feedback_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  alias_no integer not null,
  primary key (post_id, user_id),
  unique (post_id, alias_no)
);

create table private.feedback_likes (
  target_kind text not null check (target_kind in ('post', 'reply')),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (target_kind, target_id, user_id)
);

create or replace function private.cleanup_feedback_likes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.feedback_likes where target_id = old.id;
  return old;
end;
$$;
create trigger feedback_posts_cleanup_likes after delete on public.feedback_posts
  for each row execute function private.cleanup_feedback_likes();
create trigger feedback_replies_cleanup_likes after delete on public.feedback_replies
  for each row execute function private.cleanup_feedback_likes();

create or replace function private.refresh_reply_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post uuid := coalesce(new.post_id, old.post_id);
begin
  update public.feedback_posts set reply_count = (select count(*) from public.feedback_replies where post_id = v_post) where id = v_post;
  return null;
end;
$$;
create trigger feedback_replies_count after insert or delete on public.feedback_replies
  for each row execute function private.refresh_reply_count();

alter table public.feedback_posts enable row level security;
alter table public.feedback_replies enable row level security;
create policy feedback_posts_select on public.feedback_posts for select to authenticated using (public.is_group_member(group_id));
create policy feedback_replies_select on public.feedback_replies for select to authenticated using (public.is_group_member(group_id));
grant select on public.feedback_posts, public.feedback_replies to authenticated;

-- Realtime: rows carry no author, so they can be published.
alter publication supabase_realtime add table public.feedback_posts, public.feedback_replies;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
create or replace function public.create_feedback_post(p_group_id uuid, p_body text, p_topic text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_post uuid;
  v_topic text := nullif(btrim(coalesce(p_topic, '')), '');
begin
  perform private.require_member(p_group_id);
  if btrim(coalesce(p_body, '')) = '' or char_length(p_body) > 600 then
    raise exception '意見は1〜600文字で入力してください';
  end if;
  if (select count(*) from private.feedback_post_authors a join public.feedback_posts p on p.id = a.post_id
      where a.user_id = v_uid and p.group_id = p_group_id and p.created_at > now() - interval '1 hour') >= 10 then
    raise exception '短時間に投稿しすぎです。しばらくしてからもう一度お試しください';
  end if;
  insert into public.feedback_posts (group_id, body, topic) values (p_group_id, btrim(p_body), v_topic) returning id into v_post;
  insert into private.feedback_post_authors (post_id, user_id) values (v_post, v_uid);
  insert into private.feedback_aliases (post_id, user_id, alias_no) values (v_post, v_uid, 0);

  -- In-app notification for the other members (no actor, no push: nothing points at the author).
  insert into public.notifications (user_id, group_id, kind, title, body, link, ref_id, dedupe_key, push)
  select m.user_id, p_group_id, 'feedback_new', '意見箱に新しい投稿', coalesce(v_topic || ' ・ ', '') || left(regexp_replace(btrim(p_body), '\s+', ' ', 'g'), 60),
         '/groups/' || p_group_id::text || '/feedback/' || v_post::text, v_post, 'feedback_new:' || v_post::text || ':' || m.user_id::text, false
  from public.group_members m where m.group_id = p_group_id and m.user_id <> v_uid
  on conflict (user_id, dedupe_key) do nothing;
  return v_post;
end;
$$;

create or replace function public.create_feedback_reply(p_post_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_post public.feedback_posts;
  v_alias integer;
  v_reply uuid;
  v_author uuid;
begin
  select * into v_post from public.feedback_posts where id = p_post_id for update;
  if v_post.id is null then
    raise exception '投稿が見つかりません';
  end if;
  perform private.require_member(v_post.group_id);
  if btrim(coalesce(p_body, '')) = '' or char_length(p_body) > 600 then
    raise exception '返信は1〜600文字で入力してください';
  end if;
  if (select count(*) from private.feedback_reply_authors a join public.feedback_replies r on r.id = a.reply_id
      where a.user_id = v_uid and r.created_at > now() - interval '1 hour') >= 40 then
    raise exception '短時間に投稿しすぎです。しばらくしてからもう一度お試しください';
  end if;
  select alias_no into v_alias from private.feedback_aliases where post_id = p_post_id and user_id = v_uid;
  if v_alias is null then
    select coalesce(max(alias_no), 0) + 1 into v_alias from private.feedback_aliases where post_id = p_post_id;
    insert into private.feedback_aliases (post_id, user_id, alias_no) values (p_post_id, v_uid, v_alias);
  end if;
  insert into public.feedback_replies (post_id, group_id, body, alias_no) values (p_post_id, v_post.group_id, btrim(p_body), v_alias) returning id into v_reply;
  insert into private.feedback_reply_authors (reply_id, user_id) values (v_reply, v_uid);

  select user_id into v_author from private.feedback_post_authors where post_id = p_post_id;
  if v_author is not null and v_author <> v_uid then
    insert into public.notifications (user_id, group_id, kind, title, body, link, ref_id, dedupe_key, push)
    values (v_author, v_post.group_id, 'feedback_reply', 'あなたの意見に返信がありました', left(regexp_replace(btrim(p_body), '\s+', ' ', 'g'), 80),
            '/groups/' || v_post.group_id::text || '/feedback/' || p_post_id::text, v_reply, 'feedback_reply:' || v_reply::text, true);
  end if;
  return v_reply;
end;
$$;

create or replace function public.toggle_feedback_like(p_kind text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_group uuid;
  v_liked boolean;
  v_count integer;
begin
  if p_kind = 'post' then
    select group_id into v_group from public.feedback_posts where id = p_id;
  elsif p_kind = 'reply' then
    select group_id into v_group from public.feedback_replies where id = p_id;
  else
    raise exception '不正な操作です';
  end if;
  if v_group is null then
    raise exception '見つかりません';
  end if;
  perform private.require_member(v_group);
  delete from private.feedback_likes where target_kind = p_kind and target_id = p_id and user_id = v_uid;
  if found then
    v_liked := false;
  else
    insert into private.feedback_likes (target_kind, target_id, user_id) values (p_kind, p_id, v_uid);
    v_liked := true;
  end if;
  select count(*) into v_count from private.feedback_likes where target_kind = p_kind and target_id = p_id;
  if p_kind = 'post' then
    update public.feedback_posts set like_count = v_count where id = p_id;
  else
    update public.feedback_replies set like_count = v_count where id = p_id;
  end if;
  return v_liked;
end;
$$;

-- Authors delete their own; group admins can delete any (moderation) without learning the author.
create or replace function public.delete_feedback(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_group uuid;
  v_author uuid;
begin
  if p_kind = 'post' then
    select p.group_id, a.user_id into v_group, v_author from public.feedback_posts p left join private.feedback_post_authors a on a.post_id = p.id where p.id = p_id;
  elsif p_kind = 'reply' then
    select r.group_id, a.user_id into v_group, v_author from public.feedback_replies r left join private.feedback_reply_authors a on a.reply_id = r.id where r.id = p_id;
  else
    raise exception '不正な操作です';
  end if;
  if v_group is null then
    raise exception '見つかりません';
  end if;
  if not (v_author = v_uid or (public.is_group_member(v_group) and public.is_group_admin(v_group))) then
    raise exception '削除する権限がありません' using errcode = '42501';
  end if;
  if p_kind = 'post' then
    delete from public.feedback_posts where id = p_id;
  else
    delete from public.feedback_replies where id = p_id;
  end if;
end;
$$;

create or replace function public.list_feedback(
  p_group_id uuid,
  p_topic text default null,
  p_sort text default 'new',
  p_before timestamptz default null,
  p_limit integer default 30
)
returns table (id uuid, group_id uuid, body text, topic text, like_count integer, reply_count integer, created_at timestamptz, liked boolean, mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  perform private.require_member(p_group_id);
  return query
  select p.id, p.group_id, p.body, p.topic, p.like_count, p.reply_count, p.created_at,
         exists (select 1 from private.feedback_likes l where l.target_kind = 'post' and l.target_id = p.id and l.user_id = v_uid),
         exists (select 1 from private.feedback_post_authors a where a.post_id = p.id and a.user_id = v_uid)
  from public.feedback_posts p
  where p.group_id = p_group_id
    and (p_topic is null or p.topic = p_topic)
    and (p_before is null or p.created_at < p_before)
    and (p_sort <> 'hot' or p.created_at > now() - interval '14 days')
  order by case when p_sort = 'hot' then p.like_count + 2 * p.reply_count end desc nulls last, p.created_at desc
  limit least(greatest(p_limit, 1), 50);
end;
$$;

create or replace function public.get_feedback_thread(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_post public.feedback_posts;
begin
  select * into v_post from public.feedback_posts where id = p_post_id;
  if v_post.id is null then
    raise exception '投稿が見つかりません';
  end if;
  perform private.require_member(v_post.group_id);
  return jsonb_build_object(
    'post', jsonb_build_object(
      'id', v_post.id, 'group_id', v_post.group_id, 'body', v_post.body, 'topic', v_post.topic,
      'like_count', v_post.like_count, 'reply_count', v_post.reply_count, 'created_at', v_post.created_at,
      'liked', exists (select 1 from private.feedback_likes l where l.target_kind = 'post' and l.target_id = v_post.id and l.user_id = v_uid),
      'mine', exists (select 1 from private.feedback_post_authors a where a.post_id = v_post.id and a.user_id = v_uid)
    ),
    'replies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'body', r.body, 'alias_no', r.alias_no, 'like_count', r.like_count, 'created_at', r.created_at,
        'liked', exists (select 1 from private.feedback_likes l where l.target_kind = 'reply' and l.target_id = r.id and l.user_id = v_uid),
        'mine', exists (select 1 from private.feedback_reply_authors a where a.reply_id = r.id and a.user_id = v_uid)
      ) order by r.created_at)
      from public.feedback_replies r where r.post_id = p_post_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.feedback_topics(p_group_id uuid)
returns table (topic text, post_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_group_id);
  return query
  select p.topic, count(*) from public.feedback_posts p
  where p.group_id = p_group_id and p.topic is not null
  group by p.topic order by max(p.created_at) desc limit 12;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
