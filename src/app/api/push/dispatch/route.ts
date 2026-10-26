import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dispatchMessage, dispatchNotifications, pushConfigured, verifySecret } from "@/lib/server/push";

/**
 * Called by the database (pg_net) after notifications or chat messages are inserted.
 * Authenticated with PUSH_DISPATCH_SECRET; never callable by browsers.
 */
export async function POST(request: NextRequest) {
  if (!verifySecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as
    | { type: "notifications"; ids: string[] }
    | { type: "message"; message_id: string }
    | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  try {
    if (body.type === "notifications" && Array.isArray(body.ids)) {
      return NextResponse.json(await dispatchNotifications(admin, body.ids));
    }
    if (body.type === "message" && typeof body.message_id === "string") {
      return NextResponse.json(await dispatchMessage(admin, body.message_id));
    }
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  } catch (e) {
    console.error("push dispatch failed", e);
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 });
  }
}
