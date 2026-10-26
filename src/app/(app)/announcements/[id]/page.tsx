"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Pin, PinOff, Share2, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, useAnnouncement, useAnnouncementReads, useMyGroups, usePeople } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, GroupTag } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { ActionSheet, Sheet } from "@/components/ui/sheet";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { EventCard, PollCard } from "@/components/chat/cards";

export default function AnnouncementPage() {
  const { id } = useParams<{ id: string }>();
  const myId = useUserId();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const people = usePeople();
  const { data: a, isLoading } = useAnnouncement(id);
  const { data: reads } = useAnnouncementReads();
  const { data: groups } = useMyGroups();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  // Viewing an announcement marks it as read, then loads the read count (in that order).
  const { data: readCount } = useQuery({
    queryKey: ["announcementReadCount", id],
    enabled: Boolean(a) && Boolean(reads),
    queryFn: async () => {
      const supabase = getSupabase();
      if (!reads?.has(id)) {
        const { error } = await supabase.from("announcement_reads").insert({ announcement_id: id, user_id: myId });
        if (!error || error.code === "23505") void queryClient.invalidateQueries({ queryKey: qk.announcementReads });
      }
      const { data, error } = await supabase.rpc("get_announcement_read_count", { p_announcement_id: id });
      if (error) throw error;
      return data as { read: number; members: number };
    },
  });

  if (isLoading) return (<><PageHeader title="お知らせ" back /><ListSkeleton rows={3} /></>);
  if (!a) {
    return (
      <>
        <PageHeader title="お知らせ" back />
        <EmptyState title="お知らせが見つかりません" description="削除されたか、閲覧する権限がありません。" />
      </>
    );
  }

  const group = groups?.find((g) => g.id === a.group_id);
  const isAdmin = group?.my_role === "owner" || group?.my_role === "admin";
  const canEdit = a.author_id === myId || isAdmin;
  const author = a.author_id ? people.get(a.author_id) : undefined;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.announcement(id) });
    void queryClient.invalidateQueries({ queryKey: qk.announcements });
  };

  const togglePin = async () => {
    const { error } = await getSupabase().from("announcements").update({ pinned: !a.pinned }).eq("id", id);
    if (error) return toast.show(errorMessage(error), "error");
    toast.show(a.pinned ? "ピン留めを外しました" : "ピン留めしました");
    refresh();
  };

  const remove = async () => {
    if (!(await confirm({ title: "お知らせを削除しますか？", confirmLabel: "削除", destructive: true }))) return;
    const { error } = await getSupabase().from("announcements").delete().eq("id", id);
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("お知らせを削除しました");
    refresh();
    router.replace(`/groups/${a.group_id}`);
  };

  const share = async () => {
    const { error } = await getSupabase().rpc("share_to_chat", { p_kind: "announcement", p_id: id });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("グループトークに共有しました");
  };

  return (
    <>
      <PageHeader
        title="お知らせ"
        back
        actions={
          <IconButton label="お知らせのメニュー" tone="accent" onClick={() => setMenu(true)}>
            <MoreHorizontal className="size-5" />
          </IconButton>
        }
      />
      <PageBody className="space-y-4">
        <Card className="px-4 py-5">
          <div className="flex flex-wrap items-center gap-2">
            {group && <GroupTag name={group.name} color={group.color} />}
            {a.important && <Pill tone="danger">重要</Pill>}
            {a.pinned && (
              <Pill tone="accent">
                <Pin className="size-3 rotate-45" aria-hidden />
                ピン留め
              </Pill>
            )}
          </div>
          <h2 className="mt-2 text-[22px] leading-snug font-bold break-anywhere">{a.title}</h2>
          <div className="mt-2 flex items-center gap-2 text-[13px] text-label-3">
            <Avatar name={author?.name} src={author?.avatar} id={a.author_id} size={20} />
            <span>{author?.name ?? "退会したメンバー"}</span>
            <span>・</span>
            <span>{formatDateTime(a.created_at)}</span>
            {a.updated_at !== a.created_at && <span>（編集済み）</span>}
          </div>
          {a.body && <p className="mt-4 text-[16px] leading-[1.75] whitespace-pre-wrap break-anywhere">{a.body}</p>}
          {readCount && (
            <p className="mt-5 border-t border-separator pt-3 text-[13px] text-label-3 tabular">
              既読 {readCount.read} / {readCount.members}人
            </p>
          )}
        </Card>
        {(a.poll_id || a.event_id) && (
          <section aria-label="関連">
            <h3 className="mb-2 px-1 text-[13px] font-semibold text-label-2">関連</h3>
            <div className="flex flex-wrap gap-3">
              {a.poll_id && <PollCard pollId={a.poll_id} />}
              {a.event_id && <EventCard eventId={a.event_id} />}
            </div>
          </section>
        )}
      </PageBody>
      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: "グループトークに共有", icon: <Share2 />, onSelect: share },
          { label: a.pinned ? "ピン留めを外す" : "ピン留め", icon: a.pinned ? <PinOff /> : <Pin />, hidden: !isAdmin, onSelect: togglePin },
          { label: "編集", icon: <Pencil />, hidden: !canEdit, onSelect: () => setEditing(true) },
          { label: "削除", icon: <Trash2 />, destructive: true, hidden: !canEdit, onSelect: remove },
        ]}
      />
      <Sheet open={editing} onClose={() => setEditing(false)} title="お知らせを編集" size="lg">
        <AnnouncementForm announcement={a} onDone={() => (setEditing(false), refresh())} />
      </Sheet>
    </>
  );
}
