# Local development

## 1. Prerequisites

- Node.js 20.9 or newer, and npm
- Docker Desktop (or another Docker engine), which the Supabase CLI uses for the local stack
- The Supabase CLI comes in as a dev dependency (`npx supabase …`)

## 2. Install and start the backend

```bash
npm install
npm run db:start
```

`db:start` starts Postgres, Auth, Realtime, Storage and the REST API in Docker, then applies everything in `supabase/migrations/`. When it finishes it prints the local URLs and keys. Run `npx supabase status` to see them again.

> Studio, analytics and the edge runtime are disabled in `supabase/config.toml` to keep the stack small. To use Studio locally, set `[studio] enabled = true`.
>
> If image pulls from `public.ecr.aws` fail (rate limit or "data limit exceeded"), start the stack with images from Docker Hub instead: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start`.

## 3. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Where it is used | Local value |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | `PUBLISHABLE_KEY` from `supabase status` (the legacy `ANON_KEY` also works) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only (`/api/push/*`) | `SECRET_KEY` or `SERVICE_ROLE_KEY` from `supabase status` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push | `npm run vapid` (optional locally) |
| `PUSH_DISPATCH_SECRET` | server: authenticates calls from the database | any long random string (optional locally) |

Only variables prefixed with `NEXT_PUBLIC_` are bundled for the browser. The service-role key and the VAPID private key stay on the server.

## 4. Run the app

```bash
npm run dev
```

Open http://localhost:3000. You will be sent to `/login`.

## 5. Google sign-in in local development

Google OAuth is the only sign-in method in the UI, so a local session needs a Google OAuth client:

1. Create an OAuth client as described in [DEPLOYMENT.md § Google OAuth](DEPLOYMENT.md#3-google-oauth-client), and add `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI.
2. Put the credentials where the Supabase CLI can read them, either exported in your shell or in `supabase/.env` (gitignored):
   ```bash
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=GOCSPX-xxxxxxxx
   ```
3. In `supabase/config.toml`, set `[auth.external.google] enabled = true`.
4. Restart with `npx supabase stop && npm run db:start`.

`site_url` and `additional_redirect_urls` in `config.toml` already allow `http://localhost:3000/auth/callback`.

> Without Google credentials you can still run every automated test. The tests create users through the local Auth admin API and give the browser a real session cookie (`tests/e2e/session.mjs`). The app has no test login path.

## 6. Tests

```bash
npm run lint
npm run typecheck
npm test                     # integration tests (requires `npm run db:start`)
npm run build && npm start & # production server on :3000
npm run test:e2e             # browser journey (requires the app on :3000)
```

To include the push-delivery step in the end-to-end run:

```bash
# 1) A throwaway TLS certificate for the mock push service
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout /tmp/push-key.pem -out /tmp/push-cert.pem -days 7 -subj "/CN=127.0.0.1" \
  -addext "subjectAltName=IP:127.0.0.1"
# 2) Start the app trusting only that certificate (web-push speaks HTTPS only)
NODE_EXTRA_CA_CERTS=/tmp/push-cert.pem npm start &
# 3) Tell the local database where to send pushes (the Next.js server, seen from Docker)
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "select private.set_push_config('http://host.docker.internal:3000/api/push/dispatch', '<PUSH_DISPATCH_SECRET>')"
# 4) Run the journey
E2E_PUSH_CERT=/tmp/push-cert.pem E2E_PUSH_KEY=/tmp/push-key.pem npm run test:e2e -- ./screenshots
```

Passing a directory to `test:e2e` saves screenshots of each step, plus a screenshot of every page when a step fails.

## 7. Changing the database

1. Create a migration with `npx supabase migration new <name>` and write the SQL.
2. Apply it locally with `npm run db:reset`.
3. Regenerate types with `npm run db:types`.
4. Add or adjust integration tests in `tests/integration/`.
5. Deploy it with `npx supabase db push` (see [DEPLOYMENT.md](DEPLOYMENT.md)).
