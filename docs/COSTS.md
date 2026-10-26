# Cost and free-tier limits

The recommended setup (Supabase Free + Vercel Hobby + Google OAuth + Web Push) costs **¥0** for a single club of fewer than 50 members **under normal use**. That is not guaranteed under every condition: providers change their plans, and heavy photo or video sharing is what uses up free quotas. Check the current numbers on each provider's pricing page before relying on them.

> The figures below were compiled in October 2026 from provider documentation and secondary sources. Some sources disagree; those cases are marked "≈". Always check https://supabase.com/pricing and https://vercel.com/docs/limits for the current limits.

## Supabase (Free plan)

| Resource | Free limit (≈) | Expected use by a 40-member club | Notes |
| --- | --- | --- | --- |
| Database size | 500 MB | 100k messages ≈ 100–150 MB including indexes | Notifications older than 90 days are deleted automatically |
| File storage | ≈ 1 GB (some sources say 500 MB) | Photos are resized on the device to ≤ 2048 px JPEG (≈ 300–600 KB) plus a ≈ 40 KB thumbnail, so roughly 1,500–3,000 photos | Videos and large PDFs use storage fastest. Per-file limit in this app: 20 MB |
| Egress (bandwidth) | ≈ 5 GB (some sources say 10 GB including cached) | Lists and grids load thumbnails; full-size images load only in the viewer | Heavy photo browsing is the main risk |
| Auth monthly active users | 50,000 | ≤ 50 | Google sign-in is free |
| Realtime concurrent connections | 200 | One WebSocket per open tab or app (≈ 40–80) | All channels share one socket per tab |
| Realtime messages | 2 million / month | ≈ 40 deliveries per chat message (inserts to online members, plus read receipts among people viewing the chat) → about 300 messages/day ≈ 0.4 M/month | Subscriptions are filtered; typing events are throttled to one every 2.5 s |
| Projects | 2 active per organization | 1 | |
| **Inactivity pause** | Free projects pause after **7 days** without activity | An active club keeps it awake | During a long break (summer vacation), the app stops until an owner clicks **Restore** in the dashboard. Data is kept |
| Backups | Not included on Free | — | Consider a periodic `supabase db dump` if the history matters |

`pg_net` and `pg_cron` are included at no extra cost. The reminder job runs every 15 minutes and is very cheap.

## Vercel (Hobby)

| Resource | Hobby limit (≈) | Notes |
| --- | --- | --- |
| Fast Data Transfer | 100 GB / month | Pages are small; media is served by Supabase, not Vercel |
| Function invocations | ≈ 1 M / month | Used by the session-refresh proxy, `/auth/callback` and push dispatch. Data requests go straight from the browser to Supabase |
| Active CPU | ≈ 4 CPU-hours / month | Push dispatch is short-lived |
| Usage | **Non-commercial, personal use only** | A student club with no revenue normally fits. If the app is run for profit, or built by a paid contractor, use Vercel Pro or another host |

On Hobby, when a limit is reached the feature stops until the 30-day window resets; you cannot buy extra usage.

Alternatives: Cloudflare, Netlify or any Node host can run Next.js. Vercel is recommended here because it needs no configuration.

## Web Push

Free. Delivery goes through Apple's, Google's or Mozilla's push services, and you don't need an Apple Developer account for web push. There is no per-message fee.

## Google OAuth

Free. With only the `openid`, `email` and `profile` scopes, the consent screen can be published without Google's app verification.

## When you outgrow the free tier

- **Storage or egress:** encourage sharing albums by link instead of re-uploading, delete old videos, or move to Supabase Pro (about US$25/month, with 100 GB storage and 250 GB egress).
- **Several clubs on one deployment:** the app supports many groups per user and per deployment. Free-tier limits apply to the whole Supabase project, not per group.
