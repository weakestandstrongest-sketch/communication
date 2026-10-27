# Notifications

Jam has two layers of notifications:

1. **In-app notification center** (`/notifications`, the bell on Home, 通知 in the sidebar). This is always on, stored in the database, and doesn't depend on browser support.
2. **Web Push** to phones and computers. It is opt-in per device and needs VAPID keys plus an HTTPS deployment.

## What generates a notification

| Event | In-app row | Push | Who receives it |
| --- | --- | --- | --- |
| New chat message | — (the unread badge covers it) | ✓ | Conversation members except the sender. Skipped if the conversation is muted, the group's「トークの新着メッセージ」is off, or the member is viewing that conversation right now. |
| Mention / reply | ✓ `mention` / `reply` | ✓ (sent with the message push, never twice) | The mentioned member, or the author of the message being replied to. This still arrives when the conversation is muted, unless「メンション・返信」is off. |
| New poll | ✓ `poll_new` | ✓ | Group members except the creator |
| New event | ✓ `event_new`, or `attendance_request` if attendance is requested | ✓ | Group members except the creator |
| Event time or place changed | ✓ `event_updated` | ✓ | Group members except the editor |
| Event cancelled | ✓ `event_canceled` | ✓ | Group members except the editor |
| Announcement | ✓ `announcement` (titled 【重要】 when important) | ✓ | Group members except the author |
| Poll closes within 24 h and you haven't answered | ✓ `poll_deadline` | ✓ | Members who haven't answered (once per poll) |
| Event starts within 24 h | ✓ `event_upcoming` | ✓ | Members who answered 参加 or 未定, or haven't answered (once per event time) |
| Attendance deadline within 24 h | ✓ `attendance_deadline` | ✓ | Members who haven't answered (once per event) |
| New 意見箱 post | ✓ `feedback_new` (no actor) | — | Group members except the author |
| Reply to your 意見箱 post | ✓ `feedback_reply` (no actor) | ✓ (counts as 「メンション・返信」) | The post author only |
| A new member joins | ✓ `member_joined` | — | Owner and admins |

Duplicates are prevented by a `dedupe_key` column with a unique index. Nobody is notified about their own actions. Reminders come from `private.process_reminders()`, which pg_cron runs every 15 minutes. That job also deletes notifications older than 90 days.

### Preferences

- **Per group** (グループ設定 → このグループのプッシュ通知): messages, mentions and replies, polls, events, announcements and reminders. These control push. The in-app center keeps the full history.
- **Per conversation:** 通知オフ (mute) from the conversation's info sheet or by long-pressing it in the list.
- **Per user** (設定): 「通知にメッセージ内容を表示」. When this is off, pushes say 「新しいメッセージがあります」 instead of showing the text, which is useful on a shared or lock-screen-visible device.

## How push delivery works

```
row inserted (messages / notifications)
   └─ AFTER INSERT trigger
        └─ pg_net: POST <APP_URL>/api/push/dispatch   (Authorization: Bearer PUSH_DISPATCH_SECRET)
             └─ Next.js route (server, service role)
                  ├─ loads recipients, mute state, preferences and subscriptions
                  ├─ web-push → Apple / Google / Mozilla push services (VAPID-signed, encrypted payload)
                  └─ deletes subscriptions that return 404/410 and drops endpoints after repeated failures
```

- Delivery is **controlled by the backend**: it happens even when nobody has the app open.
- `notifications` uses a *statement-level* trigger, so one poll or event for 40 members makes **one** HTTP call, not 40.
- Payloads carry only a title, a short body, a relative URL and a tag. The tag (for example `conv:<id>`) makes newer notifications replace older ones from the same conversation on the device, instead of piling up.
- The service worker (`public/sw.js`) displays the notification. Tapping it focuses an open window and navigates to the poll, event or conversation, or opens a new window.
- Subscriptions are stored in `push_subscriptions` and tied to the signed-in user. If a device endpoint is registered again by another account, it moves to that account. Signing out removes the device's subscription, so the next person to sign in on a shared device doesn't receive the previous user's notifications.

## Setup

1. Generate VAPID keys:
   ```bash
   npm run vapid
   ```
2. Set the environment variables (Vercel and/or `.env.local`):
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>
   VAPID_PRIVATE_KEY=<privateKey>
   VAPID_SUBJECT=mailto:you@example.com
   PUSH_DISPATCH_SECRET=<openssl rand -hex 32>
   ```
   Redeploy afterwards, because the public key is compiled into the browser bundle.
3. Tell the database where to send pushes (SQL Editor):
   ```sql
   select private.set_push_config('https://<your-app>/api/push/dispatch', '<PUSH_DISPATCH_SECRET>');
   ```
   The URL and secret live in `private.push_config`, a schema that isn't exposed through the Supabase API.
4. Members enable push per device in **設定 → 端末への通知 → この端末で通知を受け取る**. The browser permission prompt is only shown after that tap; the app never asks automatically.

### iPhone / iPad requirements

- Web Push on iOS requires **iOS / iPadOS 16.4 or later**, and the site must be **added to the Home Screen** and opened from that icon. Safari tabs on iOS cannot receive web push.
- In Safari, the settings screen detects this and shows the steps: Share → 「ホーム画面に追加」→ open from the icon → turn notifications on. The member guide ([MEMBER_GUIDE.ja.md](MEMBER_GUIDE.ja.md)) has the same instructions.
- To turn notifications off later: iOS Settings → 通知 → Jam, or 設定 → オフにする inside the app.

### Android / desktop

Chrome, Edge and Firefox support Web Push in normal browser tabs; installing the PWA is optional. Safari on macOS 13+ is also supported.

## Testing

- **In the app:** after enabling notifications on a device, tap **テスト通知** (設定). This calls `/api/push/test`, which sends a notification to every device registered to your account and reports how many were sent.
- **End to end (automated):** `tests/e2e/journey.mjs`, step "push notifications are delivered…", starts a mock HTTPS push service and registers a real P-256 subscription for a test member. It then sends a chat message through the UI and checks that the database trigger → pg_net → dispatcher → web-push chain delivers a payload that **decrypts** to the expected title, body and URL. It also checks that muted conversations are not pushed and that new events are. See [SETUP.md § Tests](SETUP.md#6-tests).
- **What was not tested here:** delivery through the real Apple, Google or Mozilla push services, and display on a physical iPhone. Those need a deployed HTTPS URL and a real device. Use the テスト通知 button after deploying.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Settings says 「サーバーでプッシュ通知が設定されていません」 | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` was missing at build time. Set it and redeploy. |
| On iPhone, settings asks you to add the app to the Home Screen | Expected on iOS. Open the app from the Home Screen icon. |
| Permission shows 「ブロックされています」 | The user denied the prompt. Re-allow it in iOS Settings → 通知 → Jam, or in the browser's site settings. |
| テスト通知 says no registration was found | Turn notifications off and on again in 設定 to re-subscribe. |
| テスト通知 works but nothing arrives for messages or events | Check `select * from private.push_config;` (URL and secret), and check pg_net's recent responses: `select status_code, content, created from net._http_response order by created desc limit 20;`. A 401 means the secret doesn't match; a 503 means the VAPID keys are missing on the server. |
| You don't get pushes for a conversation you're viewing | Intentional: members active in a conversation within the last 20 seconds are skipped. |
