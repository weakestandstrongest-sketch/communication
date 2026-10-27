"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { BellRing, CalendarCheck2, MessageCircle, Vote } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";
import { Spinner } from "@/components/ui/spinner";
import { BrandMark } from "@/components/brand";

const ERRORS: Record<string, string> = {
  oauth: "Googleでのログインがキャンセルされたか、失敗しました。もう一度お試しください。",
  missing_code: "ログイン情報を受け取れませんでした。もう一度お試しください。",
  exchange: "ログインの有効期限が切れたか、別のブラウザで開かれました。もう一度お試しください。",
};

const FEATURES = [
  { icon: MessageCircle, label: "グループトーク" },
  { icon: Vote, label: "未回答の投票が一目で" },
  { icon: CalendarCheck2, label: "予定と出欠確認" },
  { icon: BellRing, label: "大事な連絡を通知" },
];

export function LoginCard() {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") ?? ""] ?? null);
  const inviting = next.startsWith("/invite/");
  // Static page: read the user agent after hydration (server snapshot is null).
  const inApp = useSyncExternalStore(
    noopSubscribe,
    () => inAppBrowser(navigator.userAgent),
    () => null,
  );

  const signIn = async () => {
    setLoading(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setLoading(false);
      setError(
        /provider is not enabled|Unsupported provider/i.test(error.message)
          ? "Googleログインがまだ設定されていません。管理者に連絡してください（Supabase の Google プロバイダ設定が必要です）。"
          : "ログインを開始できませんでした。通信状況を確認してもう一度お試しください。",
      );
    }
  };

  return (
    <div className="relative w-full max-w-sm animate-pop-in">
      <div className="flex flex-col items-center text-center">
        <BrandMark className="size-[76px] shadow-[var(--shadow-float)]" />
        <h1 className="mt-5 font-[family-name:var(--font-display)] text-[30px] font-bold tracking-tight">Jam</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-label-2">
          サークル・部活の連絡を、
          <br />
          ひとつの場所に。
        </p>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-2">
        {FEATURES.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-3 text-[13px] font-medium shadow-[var(--shadow-card)]">
            <Icon className="size-[18px] shrink-0 text-accent" aria-hidden />
            {label}
          </li>
        ))}
      </ul>

      <div className="mt-8 space-y-3">
        {inviting && (
          <p className="rounded-2xl bg-accent-soft px-4 py-3 text-center text-[14px] font-medium text-accent">
            グループに招待されています。ログインして参加しましょう。
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] leading-relaxed text-danger">
            {error}
          </p>
        )}
        {inApp && (
          <div role="alert" className="rounded-2xl bg-warning-soft px-4 py-3 text-[14px] leading-relaxed text-label">
            <p className="font-semibold text-warning">{inApp}のブラウザではGoogleログインができません</p>
            <p className="mt-1 text-label-2">
              画面右上（または右下）のメニューから「ブラウザで開く」「Safariで開く」を選んでから、もう一度ログインしてください。
            </p>
          </div>
        )}
        {!isSupabaseConfigured ? (
          <p role="alert" className="rounded-2xl bg-warning-soft px-4 py-3 text-[14px] leading-relaxed text-warning">
            サーバー設定（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY）が未設定のため、ログインできません。README のセットアップ手順を確認してください。
          </p>
        ) : (
          <button
            type="button"
            onClick={signIn}
            disabled={loading}
            className="flex h-[54px] w-full items-center justify-center gap-3 rounded-2xl border border-separator-strong bg-surface text-[16px] font-semibold text-label shadow-[var(--shadow-card)] transition active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? <Spinner className="size-5" /> : <GoogleLogo />}
            Googleでログイン
          </button>
        )}
        <p className="px-2 text-center text-[12px] leading-relaxed text-label-3">
          ログインすると、Googleアカウントの名前とプロフィール画像がグループのメンバーに表示されます。
        </p>
      </div>
    </div>
  );
}

const noopSubscribe = () => () => {};

/** Google blocks OAuth inside embedded web views (LINE, Instagram, Facebook …). */
function inAppBrowser(ua: string): string | null {
  if (/\bLine\//i.test(ua)) return "LINE";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/\bTwitter|X-Client/i.test(ua)) return "X";
  return null;
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
