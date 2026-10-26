// Test-only helpers: create users in the LOCAL Supabase stack and produce the session cookie
// that @supabase/ssr reads, so a browser context starts signed in (no backdoor in the app).
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const APP_URL = process.env.TEST_APP_URL ?? "http://localhost:3000";
const ANON =
  process.env.TEST_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL)) throw new Error("E2E tests only run against local Supabase");

export const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

export async function createUser(name) {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}-${crypto.randomUUID().slice(0, 6)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signIn, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, name, email, client, session: signIn.session };
}

function base64url(str) {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sessionCookies(session) {
  const key = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + base64url(JSON.stringify(session));
  const host = new URL(APP_URL).hostname;
  const base = { domain: host, path: "/", httpOnly: false, secure: false, sameSite: "Lax" };
  if (value.length <= 3180) return [{ ...base, name: key, value }];
  const chunks = [];
  for (let i = 0; i * 3180 < value.length; i++) chunks.push({ ...base, name: `${key}.${i}`, value: value.slice(i * 3180, (i + 1) * 3180) });
  return chunks;
}

export async function signedInContext(browser, user, options = {}) {
  const context = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo", ...options });
  await context.addCookies(sessionCookies(user.session));
  return context;
}
