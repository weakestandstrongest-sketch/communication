"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, LogOut, MessageCircle, Pencil, Trash2, UserMinus, UserPlus } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, useConversations, useGroupMembers, useMyGroups, useTeams } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { ColorPicker } from "@/components/groups/color-picker";
import { MemberPicker } from "@/components/teams/member-picker";

export default function TeamPage() {
  return (
    <Suspense>
      <TeamDetail />
    </Suspense>
  );
}

function TeamDetail() {
  const { id: groupId, teamId } = useParams<{ id: string; teamId: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const myId = useUserId();
  const { data: teams, isLoading } = useTeams();
  const { data: groups } = useMyGroups();
  const { data: members } = useGroupMembers(groupId);
  const { data: conversations } = useConversations();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  const team = teams?.find((t) => t.id === teamId);
  const group = groups?.find((g) => g.id === groupId);
  if (isLoading) return (<><PageHeader title="パート・バンド" back={`/groups/${groupId}`} /><ListSkeleton rows={3} /></>);
  if (!team || !group) {
    return (
      <>
        <PageHeader title="パート・バンド" back={`/groups/${groupId}`} />
        <EmptyState title="パート・バンドが見つかりません" description="削除されたか、グループから退会した可能性があります。" />
      </>
    );
  }

  const isAdmin = group.my_role !== "member";
  const canManage = team.mine || isAdmin; // add members, rename
  const canModerate = team.created_by === myId || isAdmin; // remove others, delete
  const inTeam = (members ?? []).filter((m) => team.member_ids.includes(m.user_id));
  const notInTeam = (members ?? []).filter((m) => !team.member_ids.includes(m.user_id));
  const chat = conversations?.find((c) => c.team_id === teamId);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.teams }),
      queryClient.invalidateQueries({ queryKey: qk.conversations }),
    ]);

  const remove = async (userId: string) => {
    const self = userId === myId;
    const ok = await confirm({
      title: self ? `「${team.name}」から退出しますか？` : "このメンバーを外しますか？",
      message: self ? "トークと予定が見られなくなります。" : "外されたメンバーは、このトークと予定を見られなくなります。",
      confirmLabel: self ? "退出" : "外す",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await getSupabase().rpc("remove_team_member", { p_team_id: teamId, p_user_id: userId });
    if (error) return toast.show(errorMessage(error), "error");
    await refresh();
    toast.show(self ? "退出しました" : "メンバーを外しました");
    if (self) router.replace(`/groups/${groupId}`);
  };

  const removeTeam = async () => {
    const ok = await confirm({
      title: `「${team.name}」を削除しますか？`,
      message: "トーク・予定もすべて削除され、元に戻せません。",
      confirmLabel: "削除",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await getSupabase().rpc("delete_team", { p_team_id: teamId });
    if (error) return toast.show(errorMessage(error), "error");
    await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: qk.events })]);
    toast.show("削除しました");
    router.replace(`/groups/${groupId}`);
  };

  return (
    <>
      <PageHeader title={team.name} back={`/groups/${groupId}`} />
      <PageBody className="space-y-5">
        <Card className="px-4 py-5 text-center">
          <div className="flex justify-center">
            <GroupAvatar name={team.name} color={team.color} size={72} />
          </div>
          <h2 className="mt-3 flex items-center justify-center gap-1.5 text-[22px] font-bold">
            {team.name}
            {canManage && (
              <button type="button" onClick={() => setEditing(true)} aria-label="名前とカラーを変更" className="flex size-8 items-center justify-center rounded-full text-label-3 hover:bg-surface-3">
                <Pencil className="size-4" />
              </button>
            )}
          </h2>
          <p className="text-[13px] text-label-3">
            {group.name} のパート・バンド ・ {team.member_ids.length}人
          </p>
          {team.mine ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href={chat ? `/talk/${chat.id}` : "/talk"} className="flex flex-col items-center gap-1 rounded-2xl bg-accent-soft py-3 text-[12px] font-semibold text-accent">
                <MessageCircle className="size-5" aria-hidden />
                トーク
              </Link>
              <Link href={`/events/new?group=${groupId}&team=${teamId}`} className="flex flex-col items-center gap-1 rounded-2xl bg-accent-soft py-3 text-[12px] font-semibold text-accent">
                <CalendarPlus className="size-5" aria-hidden />
                予定を追加
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-label-2">
              {isAdmin ? "管理者は自分をメンバーに追加できます。" : "メンバーに追加してもらうと、トークと予定を見られます。"}
            </p>
          )}
        </Card>

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-[15px] font-bold">メンバー {team.member_ids.length}人</h3>
            {canManage && notInTeam.length > 0 && (
              <Button size="sm" variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
                追加
              </Button>
            )}
          </div>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-separator">
              {inTeam.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={m.profile?.display_name} src={m.profile?.avatar_url} id={m.user_id} size={36} />
                  <span className="min-w-0 flex-1 truncate text-[15px]">
                    {m.profile?.display_name ?? "メンバー"}
                    {m.user_id === team.created_by && <span className="ml-1.5 text-[12px] text-label-3">作成者</span>}
                  </span>
                  {m.user_id === myId ? (
                    <button type="button" onClick={() => void remove(m.user_id)} className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-danger hover:bg-danger-soft">
                      <LogOut className="size-4" aria-hidden />
                      退出
                    </button>
                  ) : (
                    canModerate && (
                      <button type="button" onClick={() => void remove(m.user_id)} aria-label={`${m.profile?.display_name ?? "メンバー"}を外す`} className="flex size-8 items-center justify-center rounded-full text-label-3 hover:bg-surface-3">
                        <UserMinus className="size-4" />
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {canModerate && (
          <Button variant="danger" block icon={<Trash2 className="size-4" />} onClick={() => void removeTeam()}>
            このパート・バンドを削除
          </Button>
        )}
      </PageBody>

      <AddMembersSheet open={adding} onClose={() => setAdding(false)} teamId={teamId} candidates={notInTeam} onDone={refresh} />
      {editing && <EditSheet onClose={() => setEditing(false)} teamId={teamId} name={team.name} color={team.color} onDone={refresh} />}
    </>
  );
}

function AddMembersSheet({
  open,
  onClose,
  teamId,
  candidates,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  candidates: Parameters<typeof MemberPicker>[0]["members"];
  onDone: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const add = async () => {
    setSaving(true);
    const { error } = await getSupabase().rpc("add_team_members", { p_team_id: teamId, p_user_ids: [...selected] });
    setSaving(false);
    if (error) return toast.show(errorMessage(error), "error");
    await onDone();
    toast.show(`${selected.size}人を追加しました`);
    setSelected(new Set());
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="メンバーを追加">
      <div className="space-y-4 px-4 pb-6">
        <MemberPicker
          members={candidates}
          selected={selected}
          onToggle={(uid) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(uid)) next.delete(uid);
              else next.add(uid);
              return next;
            })
          }
        />
        <Button block size="lg" disabled={!selected.size} loading={saving} onClick={() => void add()}>
          {selected.size ? `${selected.size}人を追加` : "追加するメンバーを選択"}
        </Button>
      </div>
    </Sheet>
  );
}

function EditSheet({ onClose, teamId, name: name0, color: color0, onDone }: { onClose: () => void; teamId: string; name: string; color: string; onDone: () => Promise<unknown> }) {
  const toast = useToast();
  const [name, setName] = useState(name0);
  const [color, setColor] = useState(color0);
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await getSupabase().rpc("update_team", { p_team_id: teamId, p_name: name.trim(), p_color: color });
    setSaving(false);
    if (error) return toast.show(errorMessage(error), "error");
    await onDone();
    toast.show("変更しました");
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="名前とカラー">
      <form onSubmit={save} className="space-y-5 px-4 pb-6">
        <Field label="名前" htmlFor="team-name">
          <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <Field label="カラー">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Button type="submit" block size="lg" loading={saving} disabled={!name.trim()}>
          保存
        </Button>
      </form>
    </Sheet>
  );
}
