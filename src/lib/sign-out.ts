"use client";

import { getSupabase } from "@/lib/supabase/client";
import { disablePush } from "@/lib/push";
import { clearDraftsForUser, resetChatStore } from "@/lib/chat-store";
import { clearSignedUrlCache } from "@/lib/media";

/** Signs out and removes everything this device holds for the user. */
export async function signOut(userId: string | null) {
  await disablePush().catch(() => undefined);
  if (userId) clearDraftsForUser(userId);
  resetChatStore();
  clearSignedUrlCache();
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    reg?.active?.postMessage({ type: "clear-caches" });
  } catch {
    // ignore
  }
  await getSupabase().auth.signOut();
  window.location.assign("/login");
}
