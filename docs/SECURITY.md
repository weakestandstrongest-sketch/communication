# Security model

## Principles

1. **The database enforces the rules.** Every table in `public` has Row Level Security enabled. Writes that involve rules (roles, deadlines, poll settings, invitations) go through `SECURITY DEFINER` functions that check `auth.uid()` and the caller's role. Hidden or disabled buttons in the UI are only a convenience.
2. **Closed by default.** All table privileges are revoked from `anon` and `authenticated`. `authenticated` then gets `SELECT` (filtered by RLS) plus only the specific `INSERT` / `UPDATE` / `DELETE` grants listed below, some of them limited to particular columns.
3. **No privileged keys in the browser.** The browser only has the publishable (anon) key and the user's own JWT. The service-role key and the VAPID private key are read only by server routes (`src/lib/supabase/admin.ts`, `src/lib/server/push.ts`, both marked `server-only`).

## Who can do what

| Data | Read | Write |
| --- | --- | --- |
| `profiles` | yourself, and people who share a group or conversation with you | your own `display_name`, `avatar_url`, `bio`, `last_seen_at` |
| `groups` | members | admins may update name, description, color and permission settings (column grants); the owner may delete; creation only via `create_group` |
| `group_invites` | admins, or members when the group allows member invites | `regenerate_invite`, `set_invite_enabled` (admins) |
| `group_members` | members of the same group | only via RPC: `join_group` (valid, enabled code), `set_member_role` (owner only; you can't change your own role), `remove_member` (admins remove members, the owner removes anyone except themselves), `leave_group` |
| `conversations`, `conversation_members` | conversation members | `muted` / `pinned` on your own row (column grants); read state via `mark_conversation_read`; DMs via `get_or_create_direct`, which requires sharing a group |
| `messages` | conversation members | `send_message` (member; idempotent on `client_id`; attachments must be objects the sender uploaded under that conversation's storage prefix), `edit_message` (sender only), `delete_message` (sender, or a group admin) |
| `message_reactions` | conversation members | your own reactions only |
| `polls`, `poll_options` | group members | `create_poll` (respects the group setting), `update_poll` / `set_poll_closed` (creator or admin), `DELETE` (creator or admin) |
| `poll_responses`, `poll_votes` | **your own rows only** | `submit_poll_response` / `retract_poll_response` (member; checks closed state, deadline, single or multiple choice, free text and `allow_change`) |
| Poll results | `get_poll_results`: counts only when results are visible; voter IDs **never** for anonymous polls; non-respondents only for non-anonymous polls | — |
| `events` | group members | `create_event` (respects the group setting), `update_event` / `set_event_canceled` (creator or admin), `DELETE` (creator or admin) |
| Personal events (`events.group_id` is null, `personal_user_id` = owner; no longer created by the app, which also hides old ones) | the owner only: not group members, not admins | `create_personal_event` / `update_event` / delete by the owner; no attendance, no chat card, no notifications, no images; can't be moved into a group (check constraint + no direct writes) |
| `event_attendance` | your own rows; everyone's when the event's visibility is "members", otherwise admins and the organizer | `set_attendance` (member; checks attendance is enabled, the deadline, cancellation and whether the event has ended) |
| `announcements` | group members | `create_announcement` (respects the setting; pinning is admin-only); update and delete by the author or an admin; a trigger blocks non-admins from changing `pinned` |
| `announcement_reads` | your own rows (counts via `get_announcement_read_count`) | insert your own read receipt |
| Profile photos / group icons | `u/{user}/…` readable by people who can see that profile, writable only by the user; `g/{group}/icon/…` readable by members, writable only by admins; `profiles.avatar_url` and `groups.icon_path` must point into their own folder (trigger) | |
| `albums`, `media_items` | group members (DM media: conversation members) | albums: members create, creator or admin edit and delete; media rows must reference a storage object **the caller uploaded** (`owns_storage_object`) at the right path |
| `notifications` | the recipient only | the recipient may set `read_at` or delete; rows are created only by triggers |
| `notification_preferences`, `user_settings` | your own rows | your own rows (preferences only for groups you belong to) |
| `push_subscriptions` | your own rows | `register_push_subscription` (moves an endpoint to the newest user), delete your own |
| `private.push_config` | not exposed through the API | `private.set_push_config` (database owner only) |

These rules are covered by `tests/integration/security.test.ts`, which uses four real users (owner, admin, member and outsider) and tries the forbidden operations directly against the API, not through the UI.

## Teams (パート・バンド)

- A team belongs to a group; `team_members` references `group_members`, so leaving or being removed from the group also removes the person from its teams (and from the team talk, through a trigger).
- Any group member can see which teams exist and who is in them (like the member list). Only team members are in the team's talk room (`conversation_members`), so only they can read it, receive it through Realtime, or reach its storage paths.
- Events with a `team_id` are readable only by team members (RLS on `events`), not by other group members and not by group admins. Attendance, `get_event_attendance`, `share_to_chat`, notifications and reminders are all limited to team members. Group admins can still delete a team (moderation).
- Teams are created and changed only through `create_team`, `update_team`, `add_team_members` (team members or group admins; only people in the group are added), `remove_team_member` (anyone can leave; removing others is for the team's creator and group admins) and `delete_team` (creator or group admin).
- Pinned (固定) messages: any member of a talk can fix one of its messages to the top (`set_pinned_message`); a deleted message is unpinned automatically.

## Deleting a talk (for yourself)

- `clear_conversation` sets a per-member cut-off (`cleared_at`). The `messages` policy (and the media policy for 1:1 talks) only returns messages sent after the member's cut-off, so cleared history is hidden through the API and through Realtime, not just in the UI. Other members are unaffected.
- A deleted 1:1 room is hidden from that member's talk list until a new message arrives or they open the talk again. A group or team talk stays (it belongs to the group); only its history is cleared.
- This hides messages from the person who deleted; it does not erase them from the database or storage, because the other members still see them. Files shared in a talk stay in private storage and are reachable only through signed URLs for members.

## Anonymous suggestion box (意見箱)

- `feedback_posts` and `feedback_replies` have **no author column**. Authors, per-thread aliases and likes live in tables in the `private` schema, which the API cannot reach; only SECURITY DEFINER functions read them, and they return a `mine` flag instead of an author id. The tables are published to Realtime for live updates, and their rows identify nobody.
- Notifications about the suggestion box have `actor_id = null`. The post author is not notified about their own post. Only the author is notified about replies, without naming the replier.
- Admins can delete any post or reply (moderation) but cannot see who wrote it. Authors can delete their own. There is no editing, since that would need an identity check on every edit.
- Anti-spam: 10 posts and 40 replies per person per hour.
- **Limits of anonymity:** the project owner (who can open the Supabase dashboard) can read the `private` tables. A group with only two or three members may be able to guess an author from the content or timing. Members should be told that this is anonymous to other members and admins, not to the database owner.

## Anonymous polls

- Raw `poll_votes` and `poll_responses` rows are readable **only by the voter**, even for admins.
- `get_poll_results` returns `voters: null` and free-text answers without `user_id` for anonymous polls, and orders free-text answers by a hash instead of by time, so the order doesn't reveal who answered first. It also returns no non-respondent list, since that would reveal who *did* answer.
- To prevent double voting and allow answer changes, the database still links each vote to its voter. A person with direct database access (the Supabase project owner) could technically see who voted for what. Members should be told that "anonymous" means anonymous to other members and admins.

## Storage

- Bucket `media` is **private**. Files are served only through signed URLs that expire after one hour. They are cached in memory per tab and never persisted.
- Path layout: `g/{group_id}/chat/{conversation_id}/…`, `g/{group_id}/albums/{album_id}/…`, `g/{group_id}/events/…` and `dm/{conversation_id}/…`. The read and upload policies use `can_access_media_path()`, which checks group membership and, for chat paths, conversation membership. Delete requires being the uploader or a group admin.
- Uploads are limited to 20 MB and to an allow-list of image, document, audio and video MIME types, at both the bucket and the client level.

## Realtime

- **Postgres changes** are filtered by RLS for each subscriber, so a member only receives rows they could `SELECT`.
- Supabase Realtime **can't apply RLS to `DELETE` events**: anyone subscribed to them receives the deleted row's primary key. The app therefore subscribes **only to `INSERT` and `UPDATE`**. Deletions of polls, events and announcements still reach members, because the chat card that references them is updated (its foreign key is set to null). `tests/integration/realtime.test.ts` checks that an outsider receives nothing.
- **Typing and presence** use *private* channels (`conv:{conversation_id}`). Policies on `realtime.messages` allow joining and sending only for members of that conversation. This is also tested.

## Authentication

- Google OAuth uses the PKCE flow. The callback (`/auth/callback`) exchanges the code on the server and only redirects to **relative** paths (`safeNextPath`), which prevents open redirects.
- `src/proxy.ts` refreshes the session cookie and checks the JWT with `getClaims()`, never trusting `getSession()` on the server. Signed-out users are redirected to `/login?next=…`.
- Turn off the Email provider in production (see [DEPLOYMENT.md](DEPLOYMENT.md)) so accounts can only be created through Google.
- Error messages shown to users come from a fixed Japanese list, or from the Japanese messages raised by our own SQL functions. Raw database and network errors are never shown.

## The device and the PWA

- The service worker caches only hashed static assets (`/_next/static`, icons) and the offline page. API responses, Supabase requests and signed media URLs are never cached.
- Signing out removes this device's push subscription, clears unsent drafts from `localStorage`, clears in-memory caches, and asks the service worker to delete its caches.
- Unsent text messages are kept in `localStorage` per user ID, so a failed send survives a reload. They are removed after a successful send, when discarded, and on sign-out.

## Push dispatch endpoint

- `/api/push/dispatch` accepts requests only with `Authorization: Bearer <PUSH_DISPATCH_SECRET>`, compared in constant time. The request body only carries IDs; the server loads all data itself with the service-role key.
- `/api/push/test` only sends to the signed-in user's own devices.

## Known limitations

- Rate limiting relies on Supabase's defaults (Auth rate limits, API gateway). There is no per-user message rate limit; for groups under 50 people, abuse is a moderation issue (admins can delete messages and remove members).
- Deleting a group or album also deletes its storage files from the client. If that step is interrupted, orphaned files can remain in the bucket. They are unreachable through the app (their group no longer exists) but still use storage until removed in the dashboard.
- Members removed from a group keep any existing 1:1 conversations with members. New 1:1 conversations require a shared group.
