"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, ChevronRight, LogOut, Send, Share, SquarePlus, Smartphone } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, useMyGroups, useMyProfile, useUserSettings } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { enablePush, disablePush, getCurrentSubscription, getPushSupport, isIOS, isStandalone, type PushSupport } from "@/lib/push";
import { signOut } from "@/lib/sign-out";
import { removeMedia } from "@/lib/media";
import { PhotoPicker } from "@/components/profile/photo-picker";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, SectionHeader } from "@/components/ui/card";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch, Textarea } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="設定" large />
      <PageBody className="space-y-7">
        <ProfileSection />
        <PushSection />
        <GroupNotificationLinks />
        <InstallSection />
        <AccountSection />
      </PageBody>
    </>
  );
}

function ProfileSection() {
  const { data: me } = useMyProfile();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!me) return null;
  const currentName = name ?? me.display_name;
  const currentBio = bio ?? me.bio;
  const dirty = currentName !== me.display_name || currentBio !== me.bio;

  const save = async () => {
    if (!currentName.trim()) return toast.show("表示名を入力してください", "error");
    setSaving(true);
    const { error } = await getSupabase().from("profiles").update({ display_name: currentName.trim(), bio: currentBio.trim() }).eq("id", me.id);
    setSaving(false);
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("プロフィールを更新しました");
    setName(null);
    setBio(null);
    void queryClient.invalidateQueries({ queryKey: qk.me });
    void queryClient.invalidateQueries({ queryKey: qk.members });
  };

  return (
    <section>
      <SectionHeader title="プロフィール" />
      <Card className="space-y-4 px-4 py-4">
        <PhotoPicker
          prefix={`u/${me.id}/`}
          preview={<Avatar name={me.display_name} src={me.avatar_url} id={me.id} size={72} />}
          hasPhoto={Boolean(me.avatar_url)}
          label="プロフィール写真を変更"
          onUploaded={async (path) => {
            const old = me.avatar_url && !/^https?:\/\//.test(me.avatar_url) ? me.avatar_url : null;
            const { error } = await getSupabase().from("profiles").update({ avatar_url: path }).eq("id", me.id);
            if (error) throw error;
            if (old) void removeMedia([old]).catch(() => undefined);
            toast.show("プロフィール写真を変更しました");
            void queryClient.invalidateQueries({ queryKey: qk.me });
            void queryClient.invalidateQueries({ queryKey: qk.members });
            void queryClient.invalidateQueries({ queryKey: qk.conversations });
          }}
          onRemove={async () => {
            const old = me.avatar_url && !/^https?:\/\//.test(me.avatar_url) ? me.avatar_url : null;
            const { error } = await getSupabase().from("profiles").update({ avatar_url: null }).eq("id", me.id);
            if (error) throw error;
            if (old) void removeMedia([old]).catch(() => undefined);
            toast.show("プロフィール写真を削除しました");
            void queryClient.invalidateQueries({ queryKey: qk.me });
            void queryClient.invalidateQueries({ queryKey: qk.members });
            void queryClient.invalidateQueries({ queryKey: qk.conversations });
          }}
        />
        <Field label="表示名" htmlFor="profile-name" hint="グループのメンバーに表示される名前です">
          <Input id="profile-name" value={currentName} onChange={(e) => setName(e.target.value)} maxLength={50} />
        </Field>
        <Field label="ひとこと（任意）" htmlFor="profile-bio">
          <Textarea id="profile-bio" value={currentBio} onChange={(e) => setBio(e.target.value)} maxLength={200} className="min-h-16" />
        </Field>
        <Button block onClick={save} loading={saving} disabled={!dirty}>
          保存
        </Button>
      </Card>
    </section>
  );
}

function PushSection() {
  const userId = useUserId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useUserSettings();
  // This page renders only on the client (behind the auth gate), so browser APIs are safe here.
  const [support] = useState<PushSupport>(() => getPushSupport());
  const [permission, setPermission] = useState<NotificationPermission | "unknown">(() =>
    "Notification" in window ? Notification.permission : "unknown",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (support === "supported") void getCurrentSubscription().then((sub) => setSubscribed(Boolean(sub)));
  }, [support]);

  const enable = async () => {
    setBusy(true);
    try {
      const result = await enablePush();
      setPermission(Notification.permission);
      if (result === "granted") {
        setSubscribed(true);
        toast.show("この端末で通知を受け取れるようになりました");
      } else if (result === "denied") {
        toast.show("通知が許可されませんでした。ブラウザの設定から許可してください", "error");
      } else {
        toast.show("通知を有効にできませんでした", "error");
      }
    } catch (e) {
      toast.show(errorMessage(e, "通知を有効にできませんでした"), "error");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    await disablePush().catch(() => undefined);
    setBusy(false);
    setSubscribed(false);
    toast.show("この端末への通知をオフにしました");
  };

  const test = async () => {
    setBusy(true);
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { sent?: number; error?: string } | null;
    if (res?.ok && body?.sent) toast.show(`テスト通知を送信しました（${body.sent}台）`);
    else toast.show(body?.error ?? "テスト通知を送信できませんでした", "error");
  };

  const setPreview = async (v: boolean) => {
    const { error } = await getSupabase().from("user_settings").upsert({ user_id: userId, push_preview: v });
    if (error) return toast.show(errorMessage(error), "error");
    void queryClient.invalidateQueries({ queryKey: qk.settings });
  };

  return (
    <section id="push">
      <SectionHeader title="端末への通知" />
      <Card className="overflow-hidden">
        <div className="space-y-3 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <BellRing className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold">プッシュ通知</p>
              <p className="text-[13px] leading-relaxed text-label-3">
                {support === "unconfigured" && "サーバーでプッシュ通知が設定されていません（管理者向け: VAPID キーを設定してください）。アプリ内の通知センターは利用できます。"}
                {support === "unsupported" && "このブラウザはプッシュ通知に対応していません。アプリ内の通知センターをご利用ください。"}
                {support === "ios-needs-install" && "iPhone では、ホーム画面に追加したアプリからのみ通知を受け取れます（iOS 16.4 以降）。下の手順でホーム画面に追加してから、追加したアイコンで開いてください。"}
                {support === "supported" &&
                  (permission === "denied"
                    ? "通知がブロックされています。端末またはブラウザの設定で、このサイトの通知を許可してください。"
                    : subscribed
                      ? "この端末で通知を受け取ります。"
                      : "新しいメッセージや投票、予定の変更をこの端末に通知します。")}
              </p>
            </div>
          </div>
          {support === "supported" && permission !== "denied" && (
            <div className="flex gap-2">
              {subscribed ? (
                <>
                  <Button variant="secondary" onClick={disable} loading={busy}>
                    オフにする
                  </Button>
                  <Button variant="tinted" icon={<Send className="size-4" />} onClick={test} disabled={busy}>
                    テスト通知
                  </Button>
                </>
              ) : (
                <Button onClick={enable} loading={busy} block>
                  この端末で通知を受け取る
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="border-t border-separator">
          <Switch
            checked={settings?.push_preview ?? true}
            onChange={setPreview}
            label="通知にメッセージ内容を表示"
            description="オフにすると「新しいメッセージがあります」とだけ表示されます"
          />
        </div>
      </Card>
      <p className="mt-2 px-1 text-[12px] leading-relaxed text-label-3">トークごとの通知は、トーク画面の情報ボタンからオフにできます。自分の操作や、閲覧中のトークのメッセージは通知されません。</p>
    </section>
  );
}

function GroupNotificationLinks() {
  const { data: groups } = useMyGroups();
  if (!groups?.length) return null;
  return (
    <section>
      <SectionHeader title="グループごとの通知" />
      <Card className="overflow-hidden">
        <ul className="divide-y divide-separator">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}/settings`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <GroupAvatar name={g.name} color={g.color} icon={g.icon_path} size={32} />
                <span className="flex-1 truncate text-[16px]">{g.name}</span>
                <ChevronRight className="size-4 text-label-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function InstallSection() {
  const [standalone] = useState(() => isStandalone());
  const [ios] = useState(() => isIOS());
  return (
    <section>
      <SectionHeader title="ホーム画面に追加" />
      <Card className="space-y-3 px-4 py-4">
        {standalone ? (
          <p className="flex items-center gap-2 text-[15px]">
            <Smartphone className="size-5 text-success" aria-hidden />
            ホーム画面のアプリとして起動しています
          </p>
        ) : ios ? (
          <ol className="space-y-2.5 text-[14px] leading-relaxed">
            <li className="flex gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-contrast">1</span>
              <span>
                Safari で開き、画面下の共有ボタン <Share className="inline size-4 align-text-bottom text-accent" aria-label="共有" /> をタップ
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-contrast">2</span>
              <span>
                「ホーム画面に追加」<SquarePlus className="inline size-4 align-text-bottom text-accent" aria-hidden />を選ぶ
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-contrast">3</span>
              <span>ホーム画面の「つどい」アイコンから開き、この画面で通知をオンにする</span>
            </li>
          </ol>
        ) : (
          <p className="text-[14px] leading-relaxed text-label-2">
            Android の Chrome ではメニューの「ホーム画面に追加」または「アプリをインストール」、パソコンの Chrome / Edge ではアドレスバーのインストールボタンから追加できます。
          </p>
        )}
      </Card>
    </section>
  );
}

function AccountSection() {
  const userId = useUserId();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <SectionHeader title="アカウント" />
      <Card className="px-4 py-4">
        <Button
          variant="danger"
          block
          loading={busy}
          icon={<LogOut className="size-4" />}
          onClick={async () => {
            if (!(await confirm({ title: "ログアウトしますか？", message: "この端末への通知も停止されます。", confirmLabel: "ログアウト" }))) return;
            setBusy(true);
            await signOut(userId);
          }}
        >
          ログアウト
        </Button>
      </Card>
      <p className="mt-3 text-center text-[12px] text-label-4">つどい</p>
    </section>
  );
}
