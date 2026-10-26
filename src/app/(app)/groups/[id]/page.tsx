"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Crown,
  Images,
  Link2,
  Megaphone,
  MessageCircle,
  Pin,
  Plus,
  RefreshCw,
  Settings,
  Share,
  Shield,
  ShieldOff,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import {
  qk,
  useAlbums,
  useAnnouncementReads,
  useAnnouncements,
  useConversations,
  useGroupInvite,
  useGroupMembers,
  useMyGroups,
} from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatAgo, formatDate } from "@/lib/format";
import { ROLE_LABEL, type MemberWithProfile } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, GroupAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented, Field, Input, Textarea } from "@/components/ui/form";
import { ActionSheet, Sheet } from "@/components/ui/sheet";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { SignedImage } from "@/components/media/signed-image";
import { canCreate } from "@/components/polls/poll-form";
import { cn } from "@/lib/cn";

type Tab = "announcements" | "members" | "albums";

export default function GroupPage() {
  return (
    <Suspense>
      <GroupDetail />
    </Suspense>
  );
}

function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { data: groups, isLoading } = useMyGroups();
  const { data: members } = useGroupMembers(id);
  const { data: conversations } = useConversations();
  const group = groups?.find((g) => g.id === id);
  const [tab, setTab] = useState<Tab>("announcements");
  const [invite, setInvite] = useState(params.get("invite") === "1");

  useEffect(() => {
    if (params.get("invite") === "1") router.replace(`/groups/${id}`, { scroll: false });
  }, [params, router, id]);

  if (isLoading) return (<><PageHeader title="グループ" back="/groups" /><ListSkeleton rows={4} /></>);
  if (!group) {
    return (
      <>
        <PageHeader title="グループ" back="/groups" />
        <EmptyState title="グループが見つかりません" description="退会したか、メンバーから削除された可能性があります。" />
      </>
    );
  }
  const isAdmin = group.my_role !== "member";
  const chat = conversations?.find((c) => c.group_id === id && c.kind === "group");

  return (
    <>
      <PageHeader
        title={group.name}
        back="/groups"
        actions={
          <Link href={`/groups/${id}/settings`} aria-label="グループ設定" className="flex size-10 items-center justify-center rounded-full text-accent hover:bg-accent-soft">
            <Settings className="size-[22px]" />
          </Link>
        }
      />
      <PageBody className="space-y-5">
        <Card className="px-4 py-5 text-center">
          <div className="flex justify-center">
            <GroupAvatar name={group.name} color={group.color} size={72} />
          </div>
          <h2 className="mt-3 text-[22px] font-bold">{group.name}</h2>
          <p className="text-[13px] text-label-3">
            メンバー {members?.length ?? "-"}人 ・ あなたは{ROLE_LABEL[group.my_role]}
          </p>
          {group.description && <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed whitespace-pre-wrap text-label-2">{group.description}</p>}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Link href={chat ? `/talk/${chat.id}` : "/talk"} className="flex flex-col items-center gap-1 rounded-2xl bg-accent-soft py-3 text-[12px] font-semibold text-accent">
              <MessageCircle className="size-5" aria-hidden />
              トーク
            </Link>
            <button type="button" onClick={() => setInvite(true)} className="flex flex-col items-center gap-1 rounded-2xl bg-accent-soft py-3 text-[12px] font-semibold text-accent">
              <UserPlus className="size-5" aria-hidden />
              招待
            </button>
            <Link href={`/groups/${id}/albums`} className="flex flex-col items-center gap-1 rounded-2xl bg-accent-soft py-3 text-[12px] font-semibold text-accent">
              <Images className="size-5" aria-hidden />
              写真
            </Link>
          </div>
        </Card>

        <Segmented
          label="グループの表示"
          value={tab}
          onChange={setTab}
          options={[
            { value: "announcements", label: "お知らせ" },
            { value: "members", label: "メンバー" },
            { value: "albums", label: "アルバム" },
          ]}
        />
        {tab === "announcements" && <Announcements groupId={id} canPost={canCreate(group, "announcement")} />}
        {tab === "members" && <Members groupId={id} members={members ?? []} myRole={group.my_role} isAdmin={isAdmin} />}
        {tab === "albums" && <Albums groupId={id} />}
      </PageBody>
      <InviteSheet open={invite} onClose={() => setInvite(false)} groupId={id} groupName={group.name} isAdmin={isAdmin} />
    </>
  );
}

function Announcements({ groupId, canPost }: { groupId: string; canPost: boolean }) {
  const { data, isLoading } = useAnnouncements();
  const { data: reads } = useAnnouncementReads();
  const list = (data ?? []).filter((a) => a.group_id === groupId);
  return (
    <section className="space-y-2.5" aria-label="お知らせ">
      {canPost && (
        <Link href={`/announcements/new?group=${groupId}`} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface text-[15px] font-semibold text-accent shadow-[var(--shadow-card)]">
          <Plus className="size-4" aria-hidden />
          お知らせを投稿
        </Link>
      )}
      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : list.length === 0 ? (
        <EmptyState icon={<Megaphone />} title="お知らせはまだありません" description="大事な連絡はお知らせにすると、トークに流れずいつでも確認できます。" />
      ) : (
        list.map((a) => (
          <Link key={a.id} href={`/announcements/${a.id}`} className="block">
            <Card className={cn("px-4 py-3.5 transition-colors hover:bg-surface-2", a.important && "ring-1 ring-danger/30")}>
              <div className="flex items-center gap-2">
                {a.pinned && <Pin className="size-3.5 shrink-0 rotate-45 text-accent" aria-label="ピン留め" />}
                {a.important && <Pill tone="danger">重要</Pill>}
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{a.title}</span>
                {!reads?.has(a.id) && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="未読" />}
              </div>
              {a.body && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-label-2">{a.body}</p>}
              <p className="mt-1.5 text-[12px] text-label-3">{formatDate(a.created_at)}</p>
            </Card>
          </Link>
        ))
      )}
    </section>
  );
}

function Members({ groupId, members, myRole, isAdmin }: { groupId: string; members: MemberWithProfile[]; myRole: string; isAdmin: boolean }) {
  const myId = useUserId();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<MemberWithProfile | null>(null);
  const sorted = useMemo(
    () => [...members].sort((a, b) => ["owner", "admin", "member"].indexOf(a.role) - ["owner", "admin", "member"].indexOf(b.role)),
    [members],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.members });
    void queryClient.invalidateQueries({ queryKey: qk.groups });
  };

  const setRole = async (m: MemberWithProfile, role: "owner" | "admin" | "member") => {
    if (role === "owner") {
      const ok = await confirm({
        title: `${m.profile?.display_name}さんをオーナーにしますか？`,
        message: "あなたは管理者になります。この操作は新しいオーナーにしか元に戻せません。",
        confirmLabel: "譲渡する",
        destructive: true,
      });
      if (!ok) return;
    }
    const { error } = await getSupabase().rpc("set_member_role", { p_group_id: groupId, p_user_id: m.user_id, p_role: role });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("権限を変更しました");
    refresh();
  };

  const remove = async (m: MemberWithProfile) => {
    const ok = await confirm({
      title: `${m.profile?.display_name}さんをグループから削除しますか？`,
      message: "削除されたメンバーはトークや予定を閲覧できなくなります。",
      confirmLabel: "削除",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await getSupabase().rpc("remove_member", { p_group_id: groupId, p_user_id: m.user_id });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("メンバーを削除しました");
    refresh();
  };

  const dm = async (m: MemberWithProfile) => {
    const { data, error } = await getSupabase().rpc("get_or_create_direct", { p_user_id: m.user_id });
    if (error || !data) return toast.show(errorMessage(error), "error");
    void queryClient.invalidateQueries({ queryKey: qk.conversations });
    router.push(`/talk/${data}`);
  };

  const canRemove = (m: MemberWithProfile) =>
    m.user_id !== myId && m.role !== "owner" && (myRole === "owner" || (myRole === "admin" && m.role === "member"));

  return (
    <section aria-label="メンバー">
      <Card className="overflow-hidden">
        <ul className="divide-y divide-separator">
          {sorted.map((m) => (
            <li key={m.user_id}>
              <button type="button" onClick={() => setSelected(m)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 active:bg-surface-3">
                <Avatar name={m.profile?.display_name} src={m.profile?.avatar_url} id={m.user_id} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[16px]">{m.profile?.display_name ?? "メンバー"}</span>
                    {m.user_id === myId && <span className="text-[12px] text-label-3">（あなた）</span>}
                  </span>
                  <span className="block truncate text-[12px] text-label-3">
                    {m.profile?.last_seen_at ? `最終アクティブ ${formatAgo(m.profile.last_seen_at)}` : `${formatDate(m.joined_at)}に参加`}
                  </span>
                </span>
                {m.role === "owner" && (
                  <Pill tone="warning">
                    <Crown className="size-3" aria-hidden />
                    オーナー
                  </Pill>
                )}
                {m.role === "admin" && (
                  <Pill tone="accent">
                    <Shield className="size-3" aria-hidden />
                    管理者
                  </Pill>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {!isAdmin && <p className="mt-2 px-1 text-[12px] text-label-3">メンバーの管理は管理者のみ行えます。</p>}
      <ActionSheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.profile?.display_name ?? ""}
        actions={
          selected
            ? [
                { label: "個別トーク", icon: <MessageCircle />, hidden: selected.user_id === myId, onSelect: () => dm(selected) },
                {
                  label: "管理者にする",
                  icon: <Shield />,
                  hidden: myRole !== "owner" || selected.role !== "member",
                  onSelect: () => setRole(selected, "admin"),
                },
                {
                  label: "管理者から外す",
                  icon: <ShieldOff />,
                  hidden: myRole !== "owner" || selected.role !== "admin",
                  onSelect: () => setRole(selected, "member"),
                },
                {
                  label: "オーナーを譲渡",
                  icon: <Crown />,
                  hidden: myRole !== "owner" || selected.user_id === myId,
                  onSelect: () => setRole(selected, "owner"),
                },
                { label: "グループから削除", icon: <UserMinus />, destructive: true, hidden: !canRemove(selected), onSelect: () => remove(selected) },
              ]
            : []
        }
      />
    </section>
  );
}

function Albums({ groupId }: { groupId: string }) {
  const { data, isLoading } = useAlbums(groupId);
  const [creating, setCreating] = useState(false);
  return (
    <section aria-label="アルバム" className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="tinted" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          アルバムを作成
        </Button>
        <Link href={`/groups/${groupId}/albums`} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-3 text-[15px] font-semibold">
          <Images className="size-4" aria-hidden />
          すべての写真
        </Link>
      </div>
      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : !data?.length ? (
        <EmptyState icon={<Images />} title="アルバムはまだありません" description="試合や合宿の写真をアルバムにまとめて共有しましょう。" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.map((a) => (
            <li key={a.id}>
              <Link href={`/groups/${groupId}/albums/${a.id}`} className="block">
                <div className="overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]">
                  {a.cover ? (
                    <SignedImage path={a.cover} className="aspect-square" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-surface-3 text-label-3">
                      <Images className="size-8" aria-hidden />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate px-0.5 text-[14px] font-semibold">{a.title}</p>
                <p className="px-0.5 text-[12px] text-label-3">{a.count}枚</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewAlbumSheet open={creating} onClose={() => setCreating(false)} groupId={groupId} />
    </section>
  );
}

function NewAlbumSheet({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId: string }) {
  const myId = useUserId();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const { data, error } = await getSupabase()
      .from("albums")
      .insert({ group_id: groupId, title: title.trim(), description: description.trim(), created_by: myId })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) return toast.show(errorMessage(error), "error");
    toast.show("アルバムを作成しました");
    void queryClient.invalidateQueries({ queryKey: qk.albums(groupId) });
    setTitle("");
    setDescription("");
    onClose();
    router.push(`/groups/${groupId}/albums/${data.id}`);
  };
  return (
    <Sheet open={open} onClose={onClose} title="アルバムを作成">
      <form onSubmit={submit} className="space-y-4 px-4 pb-6">
        <Field label="タイトル" htmlFor="album-title">
          <Input id="album-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="例: 2026 夏合宿" required />
        </Field>
        <Field label="説明（任意）" htmlFor="album-desc">
          <Textarea id="album-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="min-h-20" />
        </Field>
        <Button type="submit" block size="lg" loading={saving} disabled={!title.trim()}>
          作成
        </Button>
      </form>
    </Sheet>
  );
}

function InviteSheet({ open, onClose, groupId, groupName, isAdmin }: { open: boolean; onClose: () => void; groupId: string; groupName: string; isAdmin: boolean }) {
  const { data: invite, isLoading, refetch } = useGroupInvite(groupId);
  const toast = useToast();
  const confirm = useConfirm();
  const url = invite && typeof window !== "undefined" ? `${window.location.origin}/invite/${invite.code}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show("招待リンクをコピーしました");
    } catch {
      toast.show("コピーできませんでした", "error");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: `${groupName}への招待`, text: `「${groupName}」に参加しよう！`, url });
    } catch {
      // cancelled
    }
  };
  const regenerate = async () => {
    if (!(await confirm({ title: "招待リンクを再発行しますか？", message: "今までの招待リンク・コードは使えなくなります。", confirmLabel: "再発行" }))) return;
    const { error } = await getSupabase().rpc("regenerate_invite", { p_group_id: groupId });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("招待リンクを再発行しました");
    void refetch();
  };
  const toggle = async () => {
    const { error } = await getSupabase().rpc("set_invite_enabled", { p_group_id: groupId, p_enabled: !invite?.enabled });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show(invite?.enabled ? "招待を停止しました" : "招待を再開しました");
    void refetch();
  };

  return (
    <Sheet open={open} onClose={onClose} title="メンバーを招待">
      <div className="space-y-4 px-4 pb-6">
        {isLoading ? (
          <ListSkeleton rows={1} />
        ) : !invite ? (
          <p className="py-6 text-center text-[14px] text-label-3">このグループでは管理者のみ招待できます。管理者に招待リンクを依頼してください。</p>
        ) : (
          <>
            <p className="text-[14px] leading-relaxed text-label-2">リンクを LINE やメールで共有するか、招待コードを伝えてください。参加にはGoogleログインが必要です。</p>
            <div className={cn("rounded-2xl bg-surface-2 p-4 text-center", !invite.enabled && "opacity-50")}>
              <p className="text-[12px] text-label-3">招待コード</p>
              <p className="mt-1 font-mono text-[26px] font-bold tracking-[0.18em] select-all">{invite.code}</p>
              <p className="mt-2 truncate text-[12px] text-label-3 select-all">{url}</p>
            </div>
            {!invite.enabled && <p className="text-center text-[13px] font-semibold text-danger">招待は現在停止中です</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="tinted" icon={<Link2 className="size-4" />} onClick={copy} disabled={!invite.enabled}>
                リンクをコピー
              </Button>
              {typeof navigator !== "undefined" && "share" in navigator ? (
                <Button icon={<Share className="size-4" />} onClick={share} disabled={!invite.enabled}>
                  共有
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(invite.code).then(() => toast.show("コードをコピーしました"))}>
                  コードをコピー
                </Button>
              )}
            </div>
            {isAdmin && (
              <div className="grid grid-cols-2 gap-2 border-t border-separator pt-4">
                <Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={regenerate}>
                  再発行
                </Button>
                <Button variant={invite.enabled ? "danger" : "secondary"} size="sm" onClick={toggle}>
                  {invite.enabled ? "招待を停止" : "招待を再開"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

