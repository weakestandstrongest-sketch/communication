import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

export type TypedClient = SupabaseClient<Database>;

let client: TypedClient | undefined;

/** Browser-side Supabase client (singleton). Uses the publishable key + the user's session. */
export function getSupabase(): TypedClient {
  if (!client) {
    client = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return client;
}
