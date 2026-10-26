"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, useGroupMembers, useMyGroups, useNotificationPrefs } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { removeMedia } from "@/lib/media";
import type { MyGroup, NotificationPreferences } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch, Textarea } from "@/components/ui/form";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { ColorPicker } from "@/components/groups/color-picker";

export default function GroupSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: groups, isLoading } = useMyGroups();
  const group = groups?.find((g) => g.id === id);
  if (isLoading) return (<><PageHeader title="グループ設定" back={`/groups/${id}`} /><ListSkeleton rows={4} /></>);
  if (!group) {
    return (
      <>
        <PageHeader title="グループ設定" back="/groups" />
        <EmptyState title="グループが見つかりません" />
      </>
    );
  }
  return (
    <>
      <PageHeader title="グループ設定" back={`/groups/${id}`} />
      <PageBody className="space-y-7">
        {group.my_role !== "member" && <AdminSettings key={group.updated_at} group={group} />}
        <NotificationSettings groupId={id} />
        <DangerZone group={group} />
      </PageBody>
    </>
  );
}

function AdminSettings({ group }: { group: MyGroup }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [color, setColor] = useState(group.color);
  const [saving, setSaving] = useState(false);

  const save = async (patch: Partial<MyGroup>, message = "保存しました") => {
    const { my_role: _ignored, ...rest } = patch as MyGroup;
    void _ignored;
    const { error } = await getSupabase().from("groups").update(rest).eq("id", group.id);
    if (error) {
      toast.show(errorMessage(error), "error");
      return false;
    }
    toast.show(message);
    void queryClient.invalidateQueries({ queryKey: qk.groups });
    void queryClient.invalidateQueries({ queryKey: qk.conversations });
    return true;
  };

  return (
    <>
      <section>
        <SectionHeader title="基本情報" />
        <Card className="space-y-4 px-4 py-4">
          <Field label="グループ名" htmlFor="gs-name">
            <Input id="gs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="説明" htmlFor="gs-desc">
            <Textarea id="gs-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </Field>
          <Field label="テーマカラー">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <Button
            block
            loading={saving}
            disabled={!name.trim() || (name === group.name && description === group.description && color === group.color)}
            onClick={async () => {
              setSaving(true);
              await save({ name: name.trim(), description: description.trim(), color });
              setSaving(false);
            }}
          >
            変更を保存
          </Button>
        </Card>
      </section>
      <section>
        <SectionHeader title="メンバーの権限" />
        <Card className="divide-y divide-separator overflow-hidden">
          <Switch checked={group.member_can_invite} onChange={(v) => save({ member_can_invite: v })} label="メンバーも招待できる" />
          <Switch checked={group.member_can_create_polls} onChange={(v) => save({ member_can_create_polls: v })} label="メンバーも投票を作成できる" />
          <Switch checked={group.member_can_create_events} onChange={(v) => save({ member_can_create_events: v })} label="メンバーも予定を作成できる" />
          <Switch
            checked={group.member_can_post_announcements}
            onChange={(v) => save({ member_can_post_announcements: v })}
            label="メンバーもお知らせを投稿できる"
            description="オフの場合は管理者のみ投稿できます"
          />
        </Card>
      </section>
    </>
  );
}

const PREF_ITEMS: Array<{ key: keyof Omit<NotificationPreferences, "user_id" | "group_id" | "updated_at">; label: string; description?: string }> = [
  { key: "messages", label: "トークの新着メッセージ" },
  { key: "mentions", label: "メンション・返信", description: "トークの通知をオフにしていても届きます" },
  { key: "polls", label: "新しい投票" },
  { key: "events", label: "予定・出欠確認・予定の変更" },
  { key: "announcements", label: "お知らせ" },
  { key: "reminders", label: "締切・予定のリマインダー" },
];

function NotificationSettings({ groupId }: { groupId: string }) {
  const myId = useUserId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: prefs } = useNotificationPrefs();
  const current = prefs?.find((p) => p.group_id === groupId);

  const update = async (key: (typeof PREF_ITEMS)[number]["key"], value: boolean) => {
    const next: Omit<NotificationPreferences, "updated_at"> = {
      user_id: myId,
      group_id: groupId,
      messages: current?.messages ?? true,
      mentions: current?.mentions ?? true,
      polls: current?.polls ?? true,
      events: current?.events ?? true,
      announcements: current?.announcements ?? true,
      reminders: current?.reminders ?? true,
      [key]: value,
    };
    queryClient.setQueryData<NotificationPreferences[]>(qk.prefs, (old) => [
      ...(old ?? []).filter((p) => p.group_id !== groupId),
      { ...next, updated_at: new Date().toISOString() },
    ]);
    const { error } = await getSupabase().from("notification_preferences").upsert(next);
    if (error) toast.show(errorMessage(error), "error");
    void queryClient.invalidateQueries({ queryKey: qk.prefs });
  };

  return (
    <section>
      <SectionHeader title="このグループのプッシュ通知" />
      <Card className="divide-y divide-separator overflow-hidden">
        {PREF_ITEMS.map((item) => (
          <Switch
            key={item.key}
            checked={current?.[item.key] ?? true}
            onChange={(v) => update(item.key, v)}
            label={item.label}
            description={item.description}
          />
        ))}
      </Card>
      <p className="mt-2 px-1 text-[12px] leading-relaxed text-label-3">アプリ内の通知センターにはすべての通知が残ります。端末への通知は「設定」から有効にしてください。</p>
    </section>
  );
}

function DangerZone({ group }: { group: MyGroup }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data: members } = useGroupMembers(group.id);
  const isOwner = group.my_role === "owner";
  const alone = (members?.length ?? 0) <= 1;

  const done = async (message: string) => {
    toast.show(message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.groups }),
      queryClient.invalidateQueries({ queryKey: qk.members }),
      queryClient.invalidateQueries({ queryKey: qk.conversations }),
    ]);
    router.replace("/groups");
  };

  const leave = async () => {
    if (!(await confirm({ title: `「${group.name}」を退会しますか？`, message: "トークや予定が見られなくなります。再参加には招待が必要です。", confirmLabel: "退会", destructive: true }))) return;
    const { error } = await getSupabase().rpc("leave_group", { p_group_id: group.id });
    if (error) return toast.show(errorMessage(error), "error");
    await done("グループを退会しました");
  };

  const remove = async () => {
    if (!(await confirm({ title: `「${group.name}」を削除しますか？`, message: "トーク、投票、予定、お知らせ、写真を含むすべてのデータが削除され、元に戻せません。", confirmLabel: "完全に削除", destructive: true }))) return;
    const supabase = getSupabase();
    // Collect file paths: the rows that reference them are deleted with the group.
    const [{ data: media }, { data: events }] = await Promise.all([
      supabase.from("media_items").select("storage_path, thumb_path").eq("group_id", group.id),
      supabase.from("events").select("image_path").eq("group_id", group.id).not("image_path", "is", null),
    ]);
    // Files go first: storage permissions depend on the caller still being an admin of the group.
    const paths = [
      ...(media ?? []).flatMap((m) => [m.storage_path, m.thumb_path ?? ""]),
      ...(events ?? []).map((e) => e.image_path ?? ""),
    ].filter(Boolean);
    for (let i = 0; i < paths.length; i += 100) await removeMedia(paths.slice(i, i + 100)).catch(() => undefined);
    const { error } = await supabase.from("groups").delete().eq("id", group.id);
    if (error) return toast.show(errorMessage(error), "error");
    await done("グループを削除しました");
  };

  return (
    <section>
      <SectionHeader title="その他" />
      <Card className="space-y-2 px-4 py-4">
        {(!isOwner || alone) && (
          <Button variant="danger" block icon={<LogOut className="size-4" />} onClick={leave}>
            グループを退会
          </Button>
        )}
        {isOwner && !alone && <p className="text-[13px] text-label-3">オーナーが退会するには、先にメンバー画面からオーナーを譲渡してください。</p>}
        {isOwner && (
          <Button variant="danger" block icon={<Trash2 className="size-4" />} onClick={remove}>
            グループを削除
          </Button>
        )}
      </Card>
    </section>
  );
}
