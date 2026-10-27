# つどい (Tsudoi)

An all-in-one communication app for Japanese university clubs, school clubs, circles and other small groups (up to ~50 members). It puts the things clubs usually split across LINE, Google Forms and spreadsheets in one place:

**Chat + polls + calendar + attendance + announcements + photos + notifications**

It is a browser app (PWA) built for iPhone first. Members open a URL; nothing has to be installed from an app store. The whole interface is in Japanese.

| ホーム | トーク | 投票 | 予定 | 出欠 |
| --- | --- | --- | --- | --- |
| LINE-style profile header and search, plus the things you need to act on | Real-time group and 1:1 chat with read receipts, reactions, replies, photos and files | Filters: すべて / 未回答 / 回答済み / 締切間近 / 終了 | カレンダー (pinch to zoom: dots → titles → details, swipe between months) and タイムライン (a day as a vertical flow with free time) | 参加 / 不参加 / 未定, with a list of who hasn't answered |

---

## Features

### Implemented and tested
These were verified against a real local Supabase stack with several signed-in test users (see [Testing](#testing)).

- **Look and feel:** a black-and-white, bank-app style design (light and dark), a floating translucent tab bar, and custom profile photos and group icons stored in private storage.
- **Accounts:** Google sign-in through Supabase Auth (PKCE). Sessions persist. Signed-out users are redirected away from protected routes. A profile is created from the Google name and avatar on first sign-in.
- **Groups:** create a group, join with an invite link or invite code, regenerate or disable invites, roles (owner / admin / member), promote and demote, transfer ownership, remove members, leave or delete a group. Group settings control whether members may invite, create polls, create events or post announcements.
- **Chat:**
  - Messages arrive in real time and in the right order; retries never create duplicates.
  - Sending is optimistic, with a visible failure state and a 再送信 button. Unsent text survives a reload.
  - Unread counts, a 「ここから未読」 divider, and LINE-style read receipts (既読 N, plus a list of who has read).
  - Emoji reactions, replies with jump-to-original, @mentions, editing, deletion, image and file attachments.
  - Pinned and muted conversations, conversation search, typing indicators and online presence.
  - Older messages load in pages without losing your scroll position.
  - 1:1 chats with anyone who shares one of your groups.
- **Cards in chat:** polls, events/attendance requests, announcements and albums appear as live cards in the group chat. Every card points to the same database record as its full screen, so nothing is duplicated and edits show up everywhere.
- **意見箱 (anonymous suggestion box):** a Threads/X-style feed per group where members post feedback ("この曲のここが…") with an optional topic or song name, reply in threads, and like. Nobody can see who wrote anything, including admins; replies get stable aliases (スレ主, 匿名A, 匿名B …). Authors can delete their own posts and admins can moderate. See [docs/SECURITY.md](docs/SECURITY.md#anonymous-suggestion-box-意見箱).
- **Polls:**
  - Single or multiple choice, optional free-text answers, anonymous voting, deadlines, and manual close or reopen.
  - You choose whether answers can be changed, and when results are visible: always, after voting, after closing, or admins only.
  - A non-respondent list for non-anonymous polls.
- **予定 (calendar, timeline and attendance):**
  - A month calendar with three pinch-zoom levels, a rolling month number, Japanese public holidays, and a Structured-style day timeline with free-time gaps and a "now" line. Personal events (visible only to you, mixed into the same calendar and timeline), and event categories, all-day events, location (with a map link), an optional event image, and an attendance deadline.
  - Attendance comments, with individual answers visible to all members or to admins only.
  - Cancel or restore events, and download an `.ics` file for the phone's calendar.
- **Announcements:** important (重要) and pinned announcements, read tracking (既読 N/M), optional links to a poll or event, edit and delete.
- **Photos and files:** a private bucket per group, client-side resizing (a 2048px image plus a 480px thumbnail), albums, a library of all group photos, and a full-screen viewer.
- **Notifications:**
  - **In-app:** a persistent notification center (mark one or all read) and an app badge.
  - **Triggers:** new polls, events and attendance requests, event changes and cancellations, announcements, mentions and replies.
  - **Reminders:** polls closing soon, upcoming events and attendance deadlines (pg_cron, every 15 minutes).
  - **Preferences:** per-group settings and per-conversation mute. Nobody is notified about their own actions.
- **Web Push:** the database triggers delivery itself through a server route (no browser tab needs to be open). It respects mute and preference settings, skips members who are viewing the conversation, and prunes expired subscriptions. Delivery and decryption were verified against a mock push service; see the limits below.
- **PWA:** manifest, icons, a service worker that caches only static assets, an offline page, safe-area support and iPhone keyboard handling.
- **Security:** Row Level Security on every table and on storage, with all privileged writes going through validated database functions. Details are in [docs/SECURITY.md](docs/SECURITY.md).

### Requires your own credentials and configuration
- **Google login:** needs a Google OAuth client and a Supabase project. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **Push to real devices:** needs VAPID keys, an HTTPS deployment, and one SQL call to tell the database where to send pushes. See [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md).
- **Deployment:** this repository has not been deployed anywhere, so there is no public URL yet. Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (Supabase free plan + Vercel Hobby).

### Not verified in this environment
- **Real Google sign-in:** the integration code is complete, but no Google client credentials were available. Tests sign in through Supabase Auth with test users instead.
- **Real iPhone or Safari:** testing used Chromium with iPhone viewport emulation. Safari's keyboard behavior and Home Screen push could not be exercised. Push encryption and delivery were verified end to end against a mock push endpoint, not against Apple's or Google's push servers.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, TanStack Query, lucide-react, date-fns |
| Backend | Supabase: Postgres + RLS, Auth (Google), Realtime (Postgres changes + private broadcast/presence channels), Storage, pg_net, pg_cron |
| Push | Web Push (VAPID) via `web-push`, sent from a Next.js route handler that the database calls |
| Hosting | Vercel (recommended) + Supabase |

## Quick start (local)

Requirements: Node 20.9+, Docker (for the local Supabase stack).

```bash
npm install
npm run db:start            # starts local Supabase (Postgres, Auth, Realtime, Storage) and applies migrations
cp .env.example .env.local  # then fill in the values printed by `npx supabase status`
npm run dev                 # http://localhost:3000
```

Google sign-in needs OAuth credentials, even locally; see [docs/SETUP.md](docs/SETUP.md). The automated tests do not need Google.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run lint` / `typecheck` | ESLint (including the React Compiler rules) and TypeScript |
| `npm test` | Integration tests against the local Supabase: RLS, RPC rules, storage and realtime authorization |
| `npm run test:e2e` | Browser journey with several signed-in users (needs a running app on :3000) |
| `npm run db:reset` | Recreates the local database from the migrations |
| `npm run db:types` | Regenerates `src/lib/database.types.ts` |
| `npm run vapid` | Generates a VAPID key pair for Web Push |

## Testing

| Suite | What it covers |
| --- | --- |
| `tests/integration/security.test.ts` | 28 tests: profiles, membership and roles, invites, idempotent sends, unread counts, edit and delete permissions, reactions, mention and reply notifications, DM restrictions, poll rules (single choice, answer changes, closing, anonymity, result visibility), events and attendance (visibility, deadlines, no duplicates), announcements (posting and pinning permissions, read counts), notification privacy, push subscription ownership, reminders, storage isolation and attachment validation |
| `tests/integration/realtime.test.ts` | Realtime only delivers to members, deletions don't leak to outsiders, and only conversation members can join private typing/presence channels |
| `tests/integration/personal-events.test.ts` | 5 tests: personal events are private to their owner, create no cards or notifications, and cannot be shared or moved |
| `tests/e2e/design.mjs` | 19 browser steps: round + buttons, personal events, floating tab bar with a jelly highlight, 意見箱 end to end (including a check that API responses never contain an author id), LINE-style home and search, calendar zoom (buttons and a real two-finger pinch), month roll and swipe, holidays, timeline, profile photo and group icon upload |
| `tests/integration/feedback.test.ts` | 9 tests: authors are never exposed (members, admins, direct table access, notifications), stable aliases, permissions, moderation, cascading deletes, likes, topics, paging, rate limits |
| `tests/integration/icons.test.ts` | 6 tests: who can upload or read profile photos and group icons |
| `tests/e2e/journey.mjs` | 26 browser steps with 4 users (iPhone and desktop viewports), covering the full journey in the requirements, including offline send and retry, outsider access, 320px screens, history paging, dark mode, and push delivery and decryption |

Latest run: **52/52 integration tests, 26/26 journey steps and 19/19 design steps passed**, along with `npm run lint`, `npm run typecheck` and `npm run build`.

## Project structure

```
src/
  app/                    Routes (App Router)
    (app)/                Authenticated app: home, talk, calendar, polls, groups, events, …
    login/ auth/callback/ Google OAuth entry and PKCE callback
    api/push/             dispatch (called by the database) and test endpoints
    offline/ manifest.ts  PWA
  components/             UI primitives (ui/), chat, polls, events, media, layout
  lib/                    Supabase clients, query hooks, chat store, realtime, push, media
  proxy.ts                Session refresh + route protection (Next 16 "proxy", formerly middleware)
supabase/
  migrations/             Schema, RLS, functions, notifications/push/reminders, storage/realtime
  config.toml             Local stack configuration
public/sw.js              Service worker (push + static caching)
tests/                    Integration (vitest) and end-to-end (Playwright) tests
docs/                     Setup, deployment, notifications, security, database, costs, member guide
```

## Documentation

- [docs/SETUP.md](docs/SETUP.md): local development and environment variables
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Supabase, Google OAuth, Vercel, troubleshooting
- [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md): in-app notifications, Web Push, iPhone requirements, testing
- [docs/SECURITY.md](docs/SECURITY.md): the security model
- [docs/DATABASE.md](docs/DATABASE.md): schema and migrations
- [docs/COSTS.md](docs/COSTS.md): free-tier limits and what to watch
- [docs/MEMBER_GUIDE.ja.md](docs/MEMBER_GUIDE.ja.md): a Japanese guide for members (iPhone, Home Screen, notifications, invites)
