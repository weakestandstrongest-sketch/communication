# Deployment (Supabase + Google OAuth + Vercel)

This is the recommended low-cost setup for a beginner: a **Supabase Free** project, plus a **Vercel Hobby** deployment connected to this GitHub repository. Both can be done entirely in the browser, apart from one CLI command to apply the migrations. Check the provider limits in [COSTS.md](COSTS.md) first.

Throughout this guide:

- `<APP_URL>` is your deployed URL, for example `https://tsudoi-club.vercel.app`.
- `<PROJECT_REF>` is your Supabase project reference, the `xxxx` in `https://xxxx.supabase.co`.

---

## 1. Create the Supabase project

1. Sign in at https://supabase.com and create a **New project**.
   - Region: **Northeast Asia (Tokyo)**, which is closest to members in Japan.
   - Save the database password somewhere safe.
2. Go to **Project Settings → API Keys** and note:
   - the **Publishable key** (`sb_publishable_…`, or the legacy `anon` key) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - the **Secret key** (`sb_secret_…`, or the legacy `service_role` key) → `SUPABASE_SERVICE_ROLE_KEY`. **This is a server secret. Never put it in a `NEXT_PUBLIC_` variable.**
3. Note the **Project URL**, `https://<PROJECT_REF>.supabase.co` → `NEXT_PUBLIC_SUPABASE_URL`.

## 2. Apply the database migrations

From your clone of this repository:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>     # asks for the database password
npx supabase db push                              # applies supabase/migrations/*.sql in order
```

The migrations create the schema, RLS policies, functions, the private `media` storage bucket, the Realtime publication, and the realtime channel policies. They also enable `pg_net` (outgoing HTTP for push) and `pg_cron` (the reminder job that runs every 15 minutes).

To check it worked, open **Database → Tables** and look for `groups`, `messages` and the other tables. Then open **Database → Cron Jobs** (or run `select * from cron.job;`) and look for `tsudoi-reminders`.

> If `pg_cron` could not be enabled automatically, the migration only prints a notice. Enable **pg_cron** under **Database → Extensions**, then run:
> ```sql
> select cron.schedule('tsudoi-reminders', '*/15 * * * *', 'select private.process_reminders()');
> ```

**Without the CLI:** you can paste the five files from `supabase/migrations/` into **SQL Editor** one at a time, in filename order.

## 3. Google OAuth client

1. Open https://console.cloud.google.com/ and create (or choose) a project.
2. **APIs & Services → OAuth consent screen** (labelled "Google Auth Platform" in newer consoles):
   - User type: **External**
   - App name: つどい (or your club's name), plus a support email and a developer contact email
   - Scopes: `openid`, `email` and `profile`. These are the defaults and need no Google verification.
   - **Publish the app** ("In production"). While it is in "Testing", only the test users you list can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins:** `<APP_URL>` (and `http://localhost:3000` for local development)
   - **Authorized redirect URIs:**
     - `https://<PROJECT_REF>.supabase.co/auth/v1/callback` (production)
     - `http://127.0.0.1:54321/auth/v1/callback` (only if you use Google login with the local stack)
4. Copy the **Client ID** and **Client secret**.

> Google redirects to **Supabase** (`/auth/v1/callback`), not to the app. Supabase then redirects back to `<APP_URL>/auth/callback`, where the app exchanges the PKCE code for a session cookie.

## 4. Configure Supabase Auth

1. **Authentication → Sign In / Providers → Google:** enable it and paste the Client ID and Client secret.
2. **Authentication → Sign In / Providers → Email:** turn this **off**. The app only offers Google sign-in, and leaving email sign-up on would let anyone create accounts through the API. They still couldn't read any group without an invite, but there's no reason to allow it.
3. **Authentication → URL Configuration:**
   - **Site URL:** `<APP_URL>`
   - **Redirect URLs:**
     - `<APP_URL>/auth/callback`
     - `http://localhost:3000/auth/callback` (local development)
     - optionally Vercel preview deployments, for example `https://*-<your-vercel-team>.vercel.app/auth/callback`

The app builds the redirect from `window.location.origin`, so no URL is hard-coded. Every origin you use just has to be in this list.

## 5. Deploy to Vercel

1. Push this repository to GitHub.
2. At https://vercel.com, choose **Add New → Project**, import the repository, and keep the Next.js defaults.
3. Add **Environment Variables** (for Production, and for Preview if you use previews):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable (or anon) key |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret (or service_role) key |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from `npm run vapid` |
   | `VAPID_PRIVATE_KEY` | from `npm run vapid` |
   | `VAPID_SUBJECT` | `mailto:you@example.com` |
   | `PUSH_DISPATCH_SECRET` | output of `openssl rand -hex 32` |

4. **Deploy.** Then, in **Settings → Functions → Function Region**, choose **Tokyo (hnd1)** so the API routes run next to the database, and redeploy.
5. If `<APP_URL>` changed (for example, you added a custom domain), update the Supabase URL configuration (step 4) and the Google JavaScript origins (step 3).

> `NEXT_PUBLIC_*` values are compiled into the browser bundle, so **redeploy after changing them**.

## 6. Turn on push delivery

Tell the database where the dispatcher lives, using the **same** secret you set as `PUSH_DISPATCH_SECRET`. Run this in **SQL Editor**:

```sql
select private.set_push_config('<APP_URL>/api/push/dispatch', '<PUSH_DISPATCH_SECRET>');
```

To turn push off again: `select private.set_push_config(null, null);`. In-app notifications keep working either way. More detail is in [NOTIFICATIONS.md](NOTIFICATIONS.md).

## 7. Smoke test

1. Open `<APP_URL>` on a desktop browser and sign in with Google.
2. Create a group (グループ → グループを作成) and copy the invite link.
3. Open the link on an iPhone in **Safari**, sign in with another Google account, and join.
4. Send messages in both directions. Create a poll and an event, then check the home screen and the notification center.
5. On the iPhone, add the app to the Home Screen and open it from there. Go to 設定 → 端末への通知 → この端末で通知を受け取る, then tap **テスト通知**.

The deployed URL is whatever Vercel assigns, or your custom domain. This repository's own development environment was **not** deployed.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Google says `Error 400: redirect_uri_mismatch` | The Google client's **Authorized redirect URIs** must contain exactly `https://<PROJECT_REF>.supabase.co/auth/v1/callback`. |
| Google says `403: disallowed_useragent` | The link was opened inside LINE, Instagram or another in-app browser, and Google blocks sign-in there. Open it in Safari or Chrome. The login page detects this case, and invite links include `?openExternalBrowser=1` so LINE opens them externally. |
| 「Googleログインがまだ設定されていません」 or `Unsupported provider` | The Google provider is not enabled in Supabase (step 4.1). |
| After choosing an account, you land back on `/login?error=exchange` | The PKCE code was opened in a different browser or tab from the one that started sign-in, or it expired. Start again from the same browser. |
| After sign-in you are redirected to `localhost` or the wrong domain | Supabase **Site URL** / **Redirect URLs** are missing `<APP_URL>/auth/callback`. Supabase falls back to the Site URL when the requested redirect isn't allow-listed. |
| Only some Google accounts can sign in | The OAuth consent screen is still in **Testing**. Publish it. |
| The login page says the server isn't configured | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` were missing at build time. Set them and redeploy. |
| Messages don't appear in real time | Check that the migration's `alter publication supabase_realtime add table …` ran (**Database → Publications**). Corporate networks that block WebSockets also break Realtime; the app catches up when it reconnects. |
| Uploading photos fails | The `media` bucket must exist and be private (created by migration 5). Each file must be under 20 MB and of an allowed type. |
| No push notifications | See the troubleshooting section in [NOTIFICATIONS.md](NOTIFICATIONS.md). |
| The app is down after a quiet week | Free Supabase projects pause after a period of inactivity. Restore the project from the dashboard; see [COSTS.md](COSTS.md). |
| `/api/push/dispatch` returns 401 | The secret in `private.push_config` and `PUSH_DISPATCH_SECRET` in Vercel are different. |
