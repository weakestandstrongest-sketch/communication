"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { isPollClosed, qk, useMyGroups, usePeople, usePoll, usePollResults } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatDeadline, fromLocalInputValue, toLocalInputValue } from "@/lib/format";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, GroupTag } from "@/components/ui/avatar";
import { Button, IconButton } from "@/components/ui/button";
import { ActionSheet, Sheet } from "@/components/ui/sheet";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { PollVote } from "@/components/polls/poll-vote";

export default function PollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const myId = useUserId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const people = usePeople();
  const { data: poll, isLoading } = usePoll(id);
  const { data: results } = usePollResults(poll ? id : null);
  const { data: groups } = useMyGroups();
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);

  if (isLoading) return (<><PageHeader title="投票" back="/polls" /><ListSkeleton rows={3} /></>);
  if (!poll) {
    return (
      <>
        <PageHeader title="投票" back="/polls" />
        <EmptyState title="投票が見つかりません" description="削除されたか、閲覧する権限がありません。" />
      </>
    );
  }

  const group = groups?.find((g) => g.id === poll.group_id);
  const canManage = poll.created_by === myId || group?.my_role === "owner" || group?.my_role === "admin";
  const closed = isPollClosed(poll);
  const creator = poll.created_by ? people.get(poll.created_by) : undefined;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.poll(id) }),
      queryClient.invalidateQueries({ queryKey: qk.pollResults(id) }),
      queryClient.invalidateQueries({ queryKey: qk.polls }),
    ]);

  const setClosed = async (value: boolean) => {
    const { error } = await getSupabase().rpc("set_poll_closed", { p_poll_id: id, p_closed: value });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show(value ? "投票を締め切りました" : "投票を再開しました");
    void refresh();
  };

  const share = async () => {
    const { error } = await getSupabase().rpc("share_to_chat", { p_kind: "poll", p_id: id });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("グループトークに共有しました");
  };

  const remove = async () => {
    if (!(await confirm({ title: "投票を削除しますか？", message: "回答もすべて削除され、元に戻せません。", confirmLabel: "削除", destructive: true }))) return;
    const { error } = await getSupabase().from("polls").delete().eq("id", id);
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("投票を削除しました");
    void queryClient.invalidateQueries({ queryKey: qk.polls });
    router.replace("/polls");
  };

  return (
    <>
      <PageHeader
        title="投票"
        back="/polls"
        actions={
          <IconButton label="投票のメニュー" tone="accent" onClick={() => setMenu(true)}>
            <MoreHorizontal className="size-5" />
          </IconButton>
        }
      />
      <PageBody className="space-y-4">
        <Card className="px-4 py-4">
          {group && <GroupTag name={group.name} color={group.color} />}
          <h2 className="mt-1.5 text-[21px] leading-snug font-bold break-anywhere">{poll.title}</h2>
          {poll.description && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-label-2 break-anywhere">{poll.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-label-3">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={creator?.name} src={creator?.avatar} id={poll.created_by} size={20} />
              {creator?.name ?? "退会したメンバー"}
            </span>
            <span>{formatDateTime(poll.created_at)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 px-3 py-2">
              <p className="text-[11px] text-label-3">締切</p>
              <p className="text-[14px] font-semibold">{poll.deadline ? formatDateTime(poll.deadline) : "なし"}</p>
              {!closed && poll.deadline && <p className="text-[11px] text-danger">{formatDeadline(poll.deadline)}</p>}
              {poll.closed_at && <p className="text-[11px] text-label-3">手動で締切済み</p>}
            </div>
            <div className="rounded-xl bg-surface-2 px-3 py-2">
              <p className="text-[11px] text-label-3">回答</p>
              <p className="text-[14px] font-semibold tabular">
                {results?.response_count ?? poll.response_count} / {results?.eligible_count ?? "-"}人
              </p>
            </div>
          </div>
        </Card>

        <Card className="px-4 py-4">
          <PollVote poll={poll} />
        </Card>

        {results?.non_respondents && results.non_respondents.length > 0 && (results.visible || canManage) && (
          <Card className="px-4 py-4">
            <h3 className="mb-2.5 text-[13px] font-semibold text-label-2">未回答のメンバー（{results.non_respondents.length}人）</h3>
            <div className="flex flex-wrap gap-1.5">
              {results.non_respondents.map((uid) => (
                <span key={uid} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-2.5 pl-1 text-[13px]">
                  <Avatar name={people.get(uid)?.name} src={people.get(uid)?.avatar} id={uid} size={20} />
                  {people.get(uid)?.name ?? "メンバー"}
                </span>
              ))}
            </div>
          </Card>
        )}
      </PageBody>

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: "グループトークに共有", icon: <Share2 />, onSelect: share },
          { label: "編集", icon: <Pencil />, hidden: !canManage, onSelect: () => setEdit(true) },
          { label: closed ? "投票を再開" : "今すぐ締め切る", icon: closed ? <LockOpen /> : <Lock />, hidden: !canManage, onSelect: () => void setClosed(!closed) },
          { label: "削除", icon: <Trash2 />, destructive: true, hidden: !canManage, onSelect: remove },
        ]}
      />
      <Sheet open={edit} onClose={() => setEdit(false)} title="投票を編集">
        <EditPoll
          initial={{ title: poll.title, description: poll.description, deadline: poll.deadline }}
          onSave={async (v) => {
            const { error } = await getSupabase().rpc("update_poll", {
              p_poll_id: id,
              p_title: v.title,
              p_description: v.description,
              p_deadline: v.deadline as string,
            });
            if (error) return toast.show(errorMessage(error), "error");
            toast.show("投票を更新しました");
            setEdit(false);
            void refresh();
          }}
        />
      </Sheet>
    </>
  );
}

function EditPoll({
  initial,
  onSave,
}: {
  initial: { title: string; description: string; deadline: string | null };
  onSave: (v: { title: string; description: string; deadline: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [deadline, setDeadline] = useState(toLocalInputValue(initial.deadline));
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="space-y-4 px-4 pb-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSaving(true);
        await onSave({ title: title.trim(), description, deadline: fromLocalInputValue(deadline) });
        setSaving(false);
      }}
    >
      <Field label="質問" htmlFor="ep-title">
        <Input id="ep-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </Field>
      <Field label="説明" htmlFor="ep-desc">
        <Textarea id="ep-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </Field>
      <Field label="締切" htmlFor="ep-deadline" hint="空欄にすると締切なしになります">
        <Input id="ep-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </Field>
      <Button type="submit" block size="lg" loading={saving}>
        保存
      </Button>
    </form>
  );
}
