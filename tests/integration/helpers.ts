import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Defaults are the well-known keys of the local `supabase start` stack (not secrets).
export const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY =
  process.env.TEST_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const SERVICE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL)) {
  throw new Error("Integration tests must run against a local Supabase stack");
}

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type TestUser = { id: string; email: string; name: string; client: SupabaseClient };

export async function createTestUser(name: string): Promise<TestUser> {
  const email = `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, avatar_url: `https://example.test/${name}.png` },
  });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, name, client };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests poke at loosely typed RPC results
export async function must<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<NonNullable<T> & any> {
  const { data, error } = await p;
  if (error) throw new Error(`Unexpected error: ${JSON.stringify(error)}`);
  return data as NonNullable<T>;
}

export const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Runs SQL as the database owner (for jobs that are not exposed through the API). */
export function sql(query: string): string {
  return execFileSync("psql", [DB_URL, "-tAX", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
}
