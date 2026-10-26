"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { qk, useMyGroups } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/format";
import type { MyGroup } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export function canCreate(group: MyGroup | undefined, what: "poll" | "event" | "announcement") {
  if (!group) return false;
  if (group.my_role !== "member") return true;
  if (what === "poll") return group.member_can_create_polls;
  if (what === "event") return group.member_can_create_events;
  return group.member_can_post_announcements;
}

export function GroupPicker({ value, onChange, groups, what }: { value: string; onChange: (v: string) => void; groups: MyGroup[]; what: "poll" | "event" | "announcement" }) {
  return (
    <Field label="グループ" htmlFor="group-picker">
      <Select id="group-picker" value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="" disabled>
          グループを選択
        </option>
        {groups.map((g) => (
          <option key={g.id} value={g.id} disabled={!canCreate(g, what)}>
            {g.name}
            {!canCreate(g, what) ? "（管理者のみ）" : ""}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function preset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(21, 0, 0, 0);
  return toLocalInputValue(d);
}

export function PollForm({ groupId: fixedGroup, onDone }: { groupId?: string; onDone: (id: string) => void }) {
  const { data: groups } = useMyGroups();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [groupId, setGroupId] = useState(fixedGroup ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [freeText, setFreeText] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [allowChange, setAllowChange] = useState(true);
  const [visibility, setVisibility] = useState<"always" | "after_vote" | "after_close" | "admins">("always");
  const [deadline, setDeadline] = useState("");
  const [postToChat, setPostToChat] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const group = groups?.find((g) => g.id === (fixedGroup ?? groupId));
  const allowed = canCreate(group, "poll");
  const selectable = groups?.filter((g) => canCreate(g, "poll")) ?? [];

  const validate = () => {
    const e: Record<string, string> = {};
    const filled = options.map((o) => o.trim()).filter(Boolean);
    if (!(fixedGroup ?? groupId)) e.group = "グループを選択してください";
    if (!title.trim()) e.title = "質問を入力してください";
    if (filled.length < 2 && !freeText) e.options = "選択肢を2つ以上入力してください";
    if (new Set(filled).size !== filled.length) e.options = "同じ選択肢が重複しています";
    if (deadline) {
      const d = fromLocalInputValue(deadline);
      if (!d || new Date(d).getTime() <= Date.now()) e.deadline = "締切は現在より後の日時にしてください";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const { data, error } = await getSupabase().rpc("create_poll", {
      p_group_id: fixedGroup ?? groupId,
      p_title: title.trim(),
      p_description: description.trim(),
      p_options: options.map((o) => o.trim()).filter(Boolean),
      p_multiple: multiple,
      p_allow_free_text: freeText,
      p_anonymous: anonymous,
      p_allow_change: allowChange,
      p_result_visibility: visibility,
      p_deadline: fromLocalInputValue(deadline) ?? undefined,
      p_post_to_chat: postToChat,
    });
    setSaving(false);
    if (error || !data) {
      toast.show(errorMessage(error), "error");
      return;
    }
    toast.show("投票を作成しました");
    void queryClient.invalidateQueries({ queryKey: qk.polls });
    setTitle("");
    setDescription("");
    setOptions(["", ""]);
    setDeadline("");
    onDone(data);
  };

  if (group && !allowed) {
    return <p className="px-6 py-10 text-center text-[14px] text-label-3">このグループでは管理者のみ投票を作成できます。</p>;
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 px-4 pt-1 pb-6">
      {!fixedGroup && <GroupPicker value={groupId} onChange={setGroupId} groups={selectable} what="poll" />}
      {errors.group && <p className="-mt-3 px-1 text-[13px] text-danger">{errors.group}</p>}

      <Field label="質問" htmlFor="poll-title" error={errors.title}>
        <Input
          id="poll-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="例: 夏合宿の日程はどれがいいですか？"
          aria-invalid={Boolean(errors.title)}
          data-autofocus
        />
      </Field>

      <Field label="説明（任意）" htmlFor="poll-desc">
        <Textarea id="poll-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="min-h-20" />
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 px-1 text-[13px] font-semibold text-label-2">選択肢</legend>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={o}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={100}
              placeholder={`選択肢 ${i + 1}`}
              aria-label={`選択肢 ${i + 1}`}
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
                aria-label={`選択肢 ${i + 1} を削除`}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-label-3 hover:bg-surface-3"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
        {options.length < 20 && (
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setOptions([...options, ""])}>
            選択肢を追加
          </Button>
        )}
        {errors.options && <p className="px-1 text-[13px] text-danger" role="alert">{errors.options}</p>}
      </fieldset>

      <Field label="締切（任意）" htmlFor="poll-deadline" error={errors.deadline}>
        <Input id="poll-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-invalid={Boolean(errors.deadline)} />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[
            ["明日", 1],
            ["3日後", 3],
            ["1週間後", 7],
          ].map(([label, days]) => (
            <button
              key={label}
              type="button"
              onClick={() => setDeadline(preset(days as number))}
              className="h-8 rounded-full bg-surface-3 px-3 text-[13px] font-medium text-label-2"
            >
              {label} 21:00
            </button>
          ))}
          {deadline && (
            <button type="button" onClick={() => setDeadline("")} className="h-8 rounded-full px-3 text-[13px] text-label-3">
              締切なし
            </button>
          )}
        </div>
      </Field>

      <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface-2 divide-y divide-separator">
        <Switch checked={multiple} onChange={setMultiple} label="複数選択を許可" />
        <Switch checked={freeText} onChange={setFreeText} label="自由回答を許可" description="選択肢以外のコメントを受け付けます" />
        <Switch checked={anonymous} onChange={setAnonymous} label="匿名投票" description="誰がどれに投票したかは誰にも表示されません" />
        <Switch checked={allowChange} onChange={setAllowChange} label="回答の変更を許可" />
        {!fixedGroup && <Switch checked={postToChat} onChange={setPostToChat} label="グループトークに投稿" />}
      </div>

      <Field label="結果の公開" htmlFor="poll-visibility">
        <Select id="poll-visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
          <option value="always">常に公開</option>
          <option value="after_vote">回答後に公開</option>
          <option value="after_close">締切後に公開</option>
          <option value="admins">管理者・作成者のみ</option>
        </Select>
      </Field>

      <Button type="submit" block size="lg" loading={saving}>
        投票を作成
      </Button>
    </form>
  );
}
