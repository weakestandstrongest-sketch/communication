"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk, useEvents, useMyGroups, usePolls } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import type { Announcement } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { GroupPicker, canCreate } from "@/components/polls/poll-form";
import { useNow } from "@/lib/use-now";

export function AnnouncementForm({
  groupId: fixedGroup,
  announcement,
  onDone,
}: {
  groupId?: string;
  announcement?: Announcement;
  onDone: (id: string) => void;
}) {
  const { data: groups } = useMyGroups();
  const { data: polls } = usePolls();
  const { data: events } = useEvents();
  const queryClient = useQueryClient();
  const toast = useToast();
  const editing = Boolean(announcement);
  const now = useNow();
  const [groupId, setGroupId] = useState(fixedGroup ?? announcement?.group_id ?? "");
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [important, setImportant] = useState(announcement?.important ?? false);
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [pollId, setPollId] = useState(announcement?.poll_id ?? "");
  const [eventId, setEventId] = useState(announcement?.event_id ?? "");
  const [postToChat, setPostToChat] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveGroup = fixedGroup ?? groupId;
  const group = groups?.find((g) => g.id === effectiveGroup);
  const isAdmin = group ? group.my_role !== "member" : false;
  const selectable = groups?.filter((g) => canCreate(g, "announcement")) ?? [];
  const groupPolls = (polls ?? []).filter((p) => p.group_id === effectiveGroup).slice(0, 30);
  const groupEvents = (events ?? [])
    .filter((e) => e.group_id === effectiveGroup && new Date(e.starts_at).getTime() > now - 7 * 86400000)
    .slice(0, 30);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!effectiveGroup) return setError("グループを選択してください");
    if (!title.trim()) return setError("タイトルを入力してください");
    setError(null);
    setSaving(true);
    let id = announcement?.id;
    const supabase = getSupabase();
    const res = announcement
      ? await supabase
          .from("announcements")
          .update({
            title: title.trim(),
            body: body.trim(),
            important,
            ...(isAdmin ? { pinned } : {}),
            poll_id: pollId || null,
            event_id: eventId || null,
          })
          .eq("id", announcement.id)
          .select("id")
          .single()
      : await supabase.rpc("create_announcement", {
          p_group_id: effectiveGroup,
          p_title: title.trim(),
          p_body: body.trim(),
          p_important: important,
          p_pinned: isAdmin && pinned,
          p_poll_id: pollId || undefined,
          p_event_id: eventId || undefined,
          p_post_to_chat: postToChat,
        });
    setSaving(false);
    if (res.error) {
      toast.show(errorMessage(res.error), "error");
      return;
    }
    if (!announcement) id = res.data as unknown as string;
    toast.show(editing ? "お知らせを更新しました" : "お知らせを投稿しました");
    void queryClient.invalidateQueries({ queryKey: qk.announcements });
    if (id) void queryClient.invalidateQueries({ queryKey: qk.announcement(id) });
    onDone(id!);
  };

  if (!editing && group && !canCreate(group, "announcement")) {
    return <p className="px-6 py-10 text-center text-[14px] text-label-3">このグループでは管理者のみお知らせを投稿できます。</p>;
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 px-4 pt-1 pb-6">
      {!fixedGroup && !editing && <GroupPicker value={groupId} onChange={setGroupId} groups={selectable} what="announcement" />}
      <Field label="タイトル" htmlFor="ann-title">
        <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="例: 来週の練習場所が変わります" data-autofocus />
      </Field>
      <Field label="本文" htmlFor="ann-body">
        <Textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} className="min-h-40" />
      </Field>
      {effectiveGroup && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="関連する投票（任意）" htmlFor="ann-poll">
            <Select id="ann-poll" value={pollId} onChange={(e) => setPollId(e.target.value)}>
              <option value="">なし</option>
              {groupPolls.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="関連する予定（任意）" htmlFor="ann-event">
            <Select id="ann-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">なし</option>
              {groupEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatDate(e.starts_at)} {e.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface-2 divide-y divide-separator">
        <Switch checked={important} onChange={setImportant} label="重要" description="ホーム画面で目立つように表示され、通知も強調されます" />
        <Switch
          checked={pinned}
          onChange={setPinned}
          label="ピン留め"
          description={isAdmin ? "グループのお知らせ一覧の上部に固定します" : "ピン留めは管理者のみ可能です"}
          disabled={!isAdmin}
        />
        {!editing && !fixedGroup && <Switch checked={postToChat} onChange={setPostToChat} label="グループトークに投稿" />}
      </div>
      {error && <p role="alert" className="px-1 text-[13px] text-danger">{error}</p>}
      <Button type="submit" block size="lg" loading={saving}>
        {editing ? "変更を保存" : "投稿する"}
      </Button>
    </form>
  );
}
