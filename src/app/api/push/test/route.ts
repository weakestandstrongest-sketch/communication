import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliver, pushConfigured } from "@/lib/server/push";

/** Sends a test notification to the signed-in user's own devices. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "サーバーでプッシュ通知が設定されていません" }, { status: 503 });
  const result = await deliver(createSupabaseAdminClient(), [
    { userId, payload: { title: "Jam", body: "テスト通知です。通知は正しく設定されています 🎉", url: "/settings", tag: "test" } },
  ]);
  if (!result.sent) {
    return NextResponse.json({ error: "この端末の通知登録が見つかりません。通知を一度オフにしてからオンにしてください", ...result }, { status: 404 });
  }
  return NextResponse.json(result);
}
