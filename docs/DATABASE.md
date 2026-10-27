# Database schema

All schema changes are SQL migrations in `supabase/migrations/`, applied in filename order:

| Migration | Contents |
| --- | --- |
| `20261026000001_schema.sql` | Enums, tables, constraints, indexes, `updated_at` triggers, `private.push_config` |
| `20261026000002_security.sql` | RLS helper functions, profile creation from Google metadata, group-chat membership sync, counter and cache triggers, **all RLS policies and grants** |
| `20261026000003_functions.sql` | RPCs: groups, invites, roles, conversations and messages, polls, events and attendance, announcements, sharing to chat, push registration |
| `20261026000004_notifications.sql` | Notification fan-out triggers, mention and reply notifications, pg_net push dispatch, `private.process_reminders()` plus the pg_cron schedule |
| `20261027000001_icons.sql` | Profile photos and group icons (`groups.icon_path`, storage rules, path guards, `get_conversations` returns the group icon) |
| `20261027000002_feedback.sql` | 意見箱: `feedback_posts`, `feedback_replies`, private author / alias / like tables and the RPCs |
| `20261026000005_storage_realtime.sql` | Private `media` bucket and its policies, Realtime publication, private-channel policies |

`src/lib/database.types.ts` is generated from the schema (`npm run db:types`).

## Entity overview

```
auth.users ─1:1─ profiles ─1:1─ user_settings
                    │
groups ──< group_members >── profiles
  │  └─1:1─ group_invites
  ├──< conversations (kind='group', one per group) ──< conversation_members >── profiles
  │                       └──< messages ──< message_reactions
  │                               │  └─ reply_to → messages
  │                               └─ poll_id / event_id / announcement_id / album_id  (chat cards)
  ├──< polls ──< poll_options ──< poll_votes
  │      └──< poll_responses ─┘ (votes reference the (poll, user) response)
  ├──< events ──< event_attendance
  ├──< announcements ──< announcement_reads
  ├──< albums ──< media_items  (media_items also link to group / conversation / message)
  └──< notification_preferences (per user + group)

conversations (kind='direct', direct_key = 'uidA:uidB')   1:1 chats between members of a shared group
notifications (per recipient)    push_subscriptions (per device)
```

## Tables

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | `id` → `auth.users`, `display_name`, `avatar_url`, `bio`, `last_seen_at` | Created by a trigger on sign-up; the avatar follows Google |
| `user_settings` | `user_id`, `push_preview` | Hides message text in pushes when off |
| `groups` | `name`, `description`, `color`, `member_can_*` permission flags, `created_by` | |
| `group_invites` | `group_id` (PK), `code` (unique, 10 characters, no ambiguous letters), `enabled` | |
| `group_members` | PK (`group_id`, `user_id`), `role` owner/admin/member | Partial unique index: one owner per group |
| `conversations` | `kind` group/direct, `group_id` or `direct_key`, `last_message_at`, `last_message_id` | Check constraint enforces the kind's shape; one group chat per group |
| `conversation_members` | PK (`conversation_id`, `user_id`), `last_read_at`, `muted`, `pinned` | Mirrors group membership through a trigger |
| `messages` | `conversation_id`, `sender_id`, `client_id` (unique per sender → idempotent sends), `kind`, `body`, `reply_to_id`, `mentions[]`, `attachments` jsonb, `reactions` jsonb (cache), card FKs, `edited_at`, `deleted_at` | Index (`conversation_id`, `created_at desc`, `id desc`); deletion is soft (content cleared) |
| `message_reactions` | PK (`message_id`, `user_id`, `emoji`), `conversation_id` (set by trigger) | Aggregated into `messages.reactions` |
| `polls` | settings (`multiple`, `allow_free_text`, `anonymous`, `allow_change`, `result_visibility`), `deadline`, `closed_at`, `response_count` (trigger) | |
| `poll_options` | `poll_id`, `label`, `position` (unique per poll) | |
| `poll_responses` | PK (`poll_id`, `user_id`), `free_text` | One row per respondent |
| `poll_votes` | PK (`poll_id`, `option_id`, `user_id`) | FK to `poll_responses`, so a vote can't exist without a response |
| `events` | `starts_at`, `ends_at` (check ≥ start), `all_day`, `category`, `location`, `rsvp_enabled`, `rsvp_deadline`, `attendance_visibility`, `image_path`, counters (trigger), `canceled_at` | |
| `event_attendance` | PK (`event_id`, `user_id`), `status` going/not_going/maybe, `comment` | |
| `announcements` | `title`, `body`, `pinned`, `important`, optional `poll_id` / `event_id` | |
| `announcement_reads` | PK (`announcement_id`, `user_id`) | |
| `albums` | `group_id`, `title`, `description`, `created_by` | |
| `media_items` | `storage_path` (unique), `thumb_path`, `mime_type`, `file_name`, `size_bytes`, `width`, `height`, scope FKs | Check: belongs to a group or a conversation |
| `notifications` | `user_id`, `group_id`, `kind`, `title`, `body`, `link`, `actor_id`, `ref_id`, `dedupe_key` (unique per user), `push`, `read_at` | Kept for 90 days |
| `notification_preferences` | PK (`user_id`, `group_id`), one boolean per category | |
| `push_subscriptions` | `endpoint` (unique), `p256dh`, `auth`, `user_id`, `failure_count`, `last_success_at` | |
| `private.push_config` | `dispatch_url`, `dispatch_secret` | Single row; not exposed through the API |

## Deletion behavior

- Deleting a **group** cascades to its members, invites, conversations (and their messages), polls, events, announcements, albums, media rows, preferences and notifications.
- Deleting a **user** (`auth.users`) cascades to their profile and memberships. Content they authored stays, with the author set to `NULL` (shown as 「退会したメンバー」).
- Deleting a **poll, event, announcement or album** sets the matching card FK on messages to `NULL`, so the card shows 「この項目は削除されました」.
- Deleting a **message** is soft: its body, attachments, mentions and reactions are cleared and `deleted_at` is set, and the client removes its storage files.

## Indexes that matter at runtime

- `messages (conversation_id, created_at desc, id desc)`: history pages and unread counts
- `group_members (user_id)`, `conversation_members (user_id)`: membership checks inside RLS
- `polls (group_id, created_at desc)`, `polls (deadline) where open`: lists and reminders
- `events (group_id, starts_at)`, `events (starts_at) where not canceled`: calendar and reminders
- `notifications (user_id, created_at desc)`, `notifications (user_id) where read_at is null`
