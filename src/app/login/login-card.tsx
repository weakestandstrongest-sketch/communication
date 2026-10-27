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
    <div className="relative z-10 my-auto flex w-full max-w-sm flex-col items-center py-8">
      <div className="login-rise login-float" style={{ animationDelay: "0ms, 0ms" }}>
        <BrandMark className="size-[108px] [@media(max-height:700px)]:size-[84px] shadow-[0_24px_60px_-12px_rgba(240,201,180,0.35)]" />
      </div>
      <h1 className="login-rise mt-8 font-[family-name:var(--font-display)] text-[68px] [@media(max-height:700px)]:mt-5 [@media(max-height:700px)]:text-[52px] leading-none font-bold tracking-[-0.04em]" style={{ animationDelay: "120ms" }}>
        Jam
      </h1>
      <p className="login-rise mt-4 text-center text-[15px] leading-relaxed text-white/60" style={{ animationDelay: "220ms" }}>
        サークル・部活の連絡を、
        <br />
        ひとつの場所に。
      </p>

      <ul className="login-rise mt-8 flex flex-wrap justify-center gap-2" style={{ animationDelay: "320ms" }}>
        {FEATURES.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/80">
            <Icon className="size-[14px] shrink-0 text-[#f0c9b4]" aria-hidden />
            {label}
          </li>
        ))}
      </ul>

      <div className="login-rise mt-10 w-full space-y-3" style={{ animationDelay: "420ms" }}>
        {inviting && (
          <p className="rounded-2xl border border-[#f0c9b4]/30 bg-[#f0c9b4]/10 px-4 py-3 text-center text-[14px] font-medium text-[#f0c9b4]">
            グループに招待されています。ログインして参加しましょう。
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[14px] leading-relaxed text-red-300">
            {error}
          </p>
        )}
        {inApp && (
          <div role="alert" className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-[14px] leading-relaxed text-white/90">
            <p className="font-semibold text-amber-300">{inApp}のブラウザではGoogleログインができません</p>
            <p className="mt-1 text-white/60">
              画面右上（または右下）のメニューから「ブラウザで開く」「Safariで開く」を選んでから、もう一度ログインしてください。
            </p>
          </div>
        )}
        {!isSupabaseConfigured ? (
          <p role="alert" className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-[14px] leading-relaxed text-amber-300">
            サーバー設定（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY）が未設定のため、ログインできません。README のセットアップ手順を確認してください。
          </p>
        ) : (
          <button
            type="button"
            onClick={signIn}
            disabled={loading}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[#f5f3ee] text-[16px] font-bold text-[#0b0b0c] shadow-[0_10px_40px_-10px_rgba(245,243,238,0.45)] transition active:scale-[0.97] disabled:opacity-60"
          >
            {loading ? <Spinner className="size-5" /> : <GoogleLogo />}
            Googleでログイン
          </button>
        )}
        <p className="px-3 pt-1 text-center text-[11.5px] leading-relaxed text-white/40">
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
