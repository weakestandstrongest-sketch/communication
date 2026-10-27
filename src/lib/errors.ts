// Converts backend errors into safe Japanese messages for display.
// Messages raised by our own SQL functions are already Japanese and safe to show.
const JAPANESE = /[぀-ヿ一-龯]/;

export function errorMessage(error: unknown, fallback = "エラーが発生しました。もう一度お試しください。"): string {
  if (!error) return fallback;
  const e = error as { message?: string; code?: string; status?: number; statusCode?: string | number };
  const message = e.message ?? (typeof error === "string" ? error : "");
  if (message && JAPANESE.test(message)) return message;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "インターネットに接続されていません。接続を確認してください。";
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return "通信に失敗しました。接続を確認してください。";
  if (e.code === "42501" || /row-level security|permission denied/i.test(message)) return "この操作を行う権限がありません。";
  // The app is newer than the database: a function or column from a later migration is missing.
  if (e.code === "PGRST202" || e.code === "PGRST204" || e.code === "42883" || e.code === "42703") {
    return "データベースが最新ではありません。管理者がデータベースの更新（npx supabase db push）を行う必要があります。";
  }
  if (e.code === "23505") return "すでに登録されています。";
  if (e.code === "23514" || e.code === "22001") return "入力内容が長すぎるか、形式が正しくありません。";
  if (/JWT|session|not authenticated/i.test(message)) return "ログインの有効期限が切れました。もう一度ログインしてください。";
  if (/exceeded the maximum allowed size|Payload too large/i.test(message) || String(e.statusCode) === "413") {
    return "ファイルサイズが大きすぎます（最大20MB）。";
  }
  if (/mime type|invalid_mime_type/i.test(message)) return "この種類のファイルはアップロードできません。";
  return fallback;
}
