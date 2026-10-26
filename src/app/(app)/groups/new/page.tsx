"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { qk } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { GroupAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ColorPicker } from "@/components/groups/color-picker";

export default function NewGroupPage() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("indigo");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("グループ名を入力してください");
    setError(null);
    setSaving(true);
    const { data, error } = await getSupabase().rpc("create_group", { p_name: name.trim(), p_description: description.trim(), p_color: color });
    setSaving(false);
    if (error || !data) return toast.show(errorMessage(error), "error");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.groups }),
      queryClient.invalidateQueries({ queryKey: qk.members }),
      queryClient.invalidateQueries({ queryKey: qk.conversations }),
    ]);
    toast.show("グループを作成しました");
    setName("");
    setDescription("");
    router.replace(`/groups/${data}?invite=1`);
  };

  return (
    <>
      <PageHeader title="グループを作成" back="/groups" />
      <PageBody>
        <form onSubmit={submit} noValidate className="mx-auto max-w-lg space-y-6">
          <div className="flex flex-col items-center gap-2 pt-2">
            <GroupAvatar name={name || "グ"} color={color} size={88} />
          </div>
          <Field label="グループ名" htmlFor="g-name" error={error}>
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="例: テニスサークル Ace" aria-invalid={Boolean(error)} autoFocus />
          </Field>
          <Field label="説明（任意）" htmlFor="g-desc">
            <Textarea id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="活動内容や練習日など" />
          </Field>
          <Field label="テーマカラー">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <Button type="submit" block size="lg" loading={saving}>
            作成する
          </Button>
          <p className="text-center text-[12px] text-label-3">作成後、招待リンクを共有してメンバーを招待できます。</p>
        </form>
      </PageBody>
    </>
  );
}
