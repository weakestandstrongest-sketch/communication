"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Bell, CalendarDays, Home, MessageCircle, Settings, Users, Vote, WifiOff } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { RealtimeProvider, useConnection } from "@/lib/realtime";
import { setChatUser } from "@/lib/chat-store";
import { getSupabase } from "@/lib/supabase/client";
import { registerServiceWorker, setAppBadge, syncPushSubscription } from "@/lib/push";
import {
  useMyGroups,
  useMyProfile,
  usePendingAttendanceCount,
  useUnansweredPollCount,
  useUnreadNotificationCount,
  useUnreadTotal,
} from "@/lib/queries";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import { CountBadge } from "@/components/ui/badge";
import { PageSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { BrandMark } from "@/components/brand";

type NavItem = { href: string; label: string; icon: typeof Home; badge?: number; match: (p: string) => boolean };

function useNavItems(): NavItem[] {
  const unread = useUnreadTotal();
  const polls = useUnansweredPollCount();
  const attendance = usePendingAttendanceCount();
  return [
    { href: "/", label: "ホーム", icon: Home, match: (p) => p === "/" },
    { href: "/talk", label: "トーク", icon: MessageCircle, badge: unread, match: (p) => p.startsWith("/talk") },
    {
      href: "/calendar",
      label: "予定",
      icon: CalendarDays,
      badge: attendance,
      match: (p) => p.startsWith("/calendar") || p.startsWith("/events"),
    },
    { href: "/polls", label: "投票", icon: Vote, badge: polls, match: (p) => p.startsWith("/polls") },
    {
      href: "/groups",
      label: "グループ",
      icon: Users,
      match: (p) => p.startsWith("/groups") || p.startsWith("/announcements"),
    },
  ];
}

function TabBar() {
  const pathname = usePathname();
  const items = useNavItems();
  // The conversation screen uses the full height for messages and the composer.
  const hidden = /^\/talk\/.+/.test(pathname) || /\/(new|edit)$/.test(pathname);
  if (hidden) return null;
  return (
    <nav
      aria-label="メインナビゲーション"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="glass-bar pointer-events-auto flex h-[64px] w-[min(28rem,calc(100vw-1.5rem))] items-stretch gap-0 rounded-[32px] p-1">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 active:scale-95",
                  active ? "bg-label/[0.09] text-label" : "text-label-3",
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
                  {item.badge ? <CountBadge count={item.badge} className="absolute -top-1.5 left-3 h-[17px] min-w-[17px] text-[10px]" /> : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const items = useNavItems();
  const notifications = useUnreadNotificationCount();
  const { data: me } = useMyProfile();
  const { data: groups } = useMyGroups();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-separator bg-surface lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <BrandMark className="size-8" />
        <span className="text-[19px] font-bold tracking-tight">つどい</span>
      </div>
      <nav aria-label="メインナビゲーション" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                    active ? "bg-accent-soft text-accent" : "text-label hover:bg-surface-2",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  <CountBadge count={item.badge ?? 0} />
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/notifications"
              aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                pathname.startsWith("/notifications") ? "bg-accent-soft text-accent" : "text-label hover:bg-surface-2",
              )}
            >
              <Bell className="size-5" strokeWidth={1.9} aria-hidden />
              <span className="flex-1">通知</span>
              <CountBadge count={notifications} />
            </Link>
          </li>
        </ul>
        {groups && groups.length > 0 && (
          <div className="mt-6">
            <p className="px-3 pb-1.5 text-[12px] font-semibold text-label-3">マイグループ</p>
            <ul className="space-y-0.5">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/groups/${g.id}`}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-xl px-3 text-[14px] transition-colors",
                      pathname.startsWith(`/groups/${g.id}`) ? "bg-surface-3 font-semibold" : "text-label-2 hover:bg-surface-2",
                    )}
                  >
                    <GroupAvatar name={g.name} color={g.color} icon={g.icon_path} size={24} />
                    <span className="truncate">{g.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
      <Link
        href="/settings"
        className="m-3 flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2"
        aria-label="設定"
      >
        <Avatar name={me?.display_name} src={me?.avatar_url} id={me?.id} size={32} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{me?.display_name ?? ""}</span>
        <Settings className="size-4 text-label-3" aria-hidden />
      </Link>
    </aside>
  );
}

function ConnectionBanner() {
  const state = useConnection();
  if (state === "online" || state === "connecting") return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+52px)] z-40 flex justify-center px-4 lg:top-4 lg:left-[248px]"
    >
      <div className="glass flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium shadow-[var(--shadow-float)]">
        <WifiOff className="size-4 text-warning" aria-hidden />
        {state === "offline" ? "オフラインです。接続が戻ると自動で更新します" : "再接続しています…"}
      </div>
    </div>
  );
}

/** Keeps last_seen_at fresh, registers the service worker and syncs the app badge. */
function Background() {
  const { userId } = useAuth();
  const unread = useUnreadTotal();
  const notifications = useUnreadNotificationCount();

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
    };
    beat();
    const t = window.setInterval(beat, 5 * 60_000);
    document.addEventListener("visibilitychange", beat);
    void registerServiceWorker().then(() => syncPushSubscription().catch(() => undefined));
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [userId]);

  useEffect(() => {
    void setAppBadge(unread + notifications);
  }, [unread, notifications]);

  return null;
}

function Gate({ children }: { children: ReactNode }) {
  const { ready, userId } = useAuth();
  setChatUser(userId);
  if (!ready || !userId) return <PageSpinner />;
  return (
    <RealtimeProvider>
      <Background />
      <div className="flex min-h-dvh">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <TabBar />
      <ConnectionBanner />
    </RealtimeProvider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
