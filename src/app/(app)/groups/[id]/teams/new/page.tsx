"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, unwrap, useGroupMembers } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { GroupAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ColorPicker } from "@/components/groups/color-picker";
import { MemberPicker } from "@/components/teams/member-picker";

export default function NewTeamPage() {
  return (
    <Suspense>
      <NewTeam />
    </Suspense>
  );
}

function NewTeam() {
  const { id: groupId } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const myId = useUserId();
  const { data: members } = useGroupMembers(groupId);
  const [name, setName] = useState("");
  const [color, setColor] = useState("slate");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (uid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("名前を入力してください");
    setError(null);
    setSaving(true);
    try {
      const teamId = unwrap(
        await getSupabase().rpc("create_team", { p_group_id: groupId, p_name: name.trim(), p_color: color, p_member_ids: [...selected] }),
      ) as string;
      const conv = unwrap(await getSupabase().from("conversations").select("id").eq("team_id", teamId).maybeSingle()) as { id: string } | null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.teams }),
        queryClient.invalidateQueries({ queryKey: qk.conversations }),
      ]);
      toast.show(`「${name.trim()}」を作成しました`);
      router.replace(conv ? `/talk/${conv.id}` : `/groups/${groupId}/teams/${teamId}`);
    } catch (err) {
      toast.show(errorMessage(err), "error");
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="パート・バンドを作成" back={`/groups/${groupId}`} />
      <PageBody>
        <form onSubmit={submit} noValidate className="mx-auto max-w-lg space-y-6">
          <div className="flex flex-col items-center gap-2 pt-2">
            <GroupAvatar name={name || "パ"} color={color} size={72} />
          </div>
          <Field label="名前" htmlFor="t-name" error={error}>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="例: サックス、Bossa Trio" aria-invalid={Boolean(error)} autoFocus />
          </Field>
          <Field label="カラー">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <div>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-label-2">メンバー（{selected.size + 1}人）</p>
            <MemberPicker members={members ?? []} selected={selected} onToggle={toggle} locked={new Set(myId ? [myId] : [])} />
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-label-3">
            専用のトークができます。パート・バンドの予定は、メンバーだけに表示・通知されます。メンバーはあとから追加できます。
          </p>
          <Button type="submit" block size="lg" loading={saving}>
            作成する
          </Button>
        </form>
      </PageBody>
    </>
  );
}
