"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { qk, useMyGroups } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { fromLocalInputValue, toLocalDateInputValue, toLocalInputValue } from "@/lib/format";
import { uploadMedia } from "@/lib/media";
import { CATEGORY_COLOR, CATEGORY_LABEL, type EventCategory, type EventRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { SignedImage } from "@/components/media/signed-image";
import { GroupPicker, canCreate } from "@/components/polls/poll-form";
import { cn } from "@/lib/cn";

function defaultStart(initialDate?: string) {
  const d = initialDate ? new Date(`${initialDate}T18:00`) : new Date();
  if (!initialDate) {
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
  }
  return d;
}

export function EventForm({
  groupId: fixedGroup,
  event,
  initialDate,
  onDone,
}: {
  groupId?: string;
  event?: EventRow;
  initialDate?: string;
  onDone: (id: string) => void;
}) {
  const { data: groups } = useMyGroups();
  const queryClient = useQueryClient();
  const toast = useToast();
  const editing = Boolean(event);
  const start0 = event ? new Date(event.starts_at) : defaultStart(initialDate);
  const end0 = event?.ends_at ? new Date(event.ends_at) : new Date(start0.getTime() + 2 * 3600_000);

  const [groupId, setGroupId] = useState(fixedGroup ?? event?.group_id ?? "");
  const [title, setTitle] = useState(event?.title ?? "");
  const [category, setCategory] = useState<EventCategory>(event?.category ?? "practice");
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [start, setStart] = useState(toLocalInputValue(start0));
  const [end, setEnd] = useState(event && !event.ends_at ? "" : toLocalInputValue(end0));
  const [startDate, setStartDate] = useState(toLocalDateInputValue(start0));
  const [endDate, setEndDate] = useState(toLocalDateInputValue(event?.ends_at ?? start0));
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [rsvp, setRsvp] = useState(event?.rsvp_enabled ?? true);
  const [rsvpDeadline, setRsvpDeadline] = useState(toLocalInputValue(event?.rsvp_deadline));
  const [visibility, setVisibility] = useState(event?.attendance_visibility ?? "members");
  const [postToChat, setPostToChat] = useState(true);
  const [imagePath, setImagePath] = useState<string | null>(event?.image_path ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  const effectiveGroup = fixedGroup ?? groupId;
  const group = groups?.find((g) => g.id === effectiveGroup);
  const selectable = groups?.filter((g) => canCreate(g, "event")) ?? [];

  const compute = () => {
    if (allDay) {
      const s = new Date(`${startDate}T00:00`);
      const e = new Date(`${endDate || startDate}T23:59`);
      return { startsAt: Number.isNaN(s.getTime()) ? null : s.toISOString(), endsAt: Number.isNaN(e.getTime()) ? null : e.toISOString() };
    }
    return { startsAt: fromLocalInputValue(start), endsAt: fromLocalInputValue(end) };
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const { startsAt, endsAt } = compute();
    if (!effectiveGroup) e.group = "グループを選択してください";
    if (!title.trim()) e.title = "タイトルを入力してください";
    if (!startsAt) e.start = "開始日時を入力してください";
    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) e.end = "終了は開始より後にしてください";
    if (rsvp && rsvpDeadline && startsAt && new Date(fromLocalInputValue(rsvpDeadline)!) > new Date(startsAt)) {
      e.rsvpDeadline = "回答期限は開始日時より前にしてください";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      let path = imagePath;
      if (imageFile) {
        const uploaded = await uploadMedia(`g/${effectiveGroup}/events/`, imageFile);
        path = uploaded.path;
      }
      const { startsAt, endsAt } = compute();
      const common = {
        p_title: title.trim(),
        p_starts_at: startsAt!,
        p_ends_at: endsAt ?? undefined,
        p_all_day: allDay,
        p_location: location.trim(),
        p_description: description.trim(),
        p_category: category,
        p_rsvp_enabled: rsvp,
        p_rsvp_deadline: rsvp ? (fromLocalInputValue(rsvpDeadline) ?? undefined) : undefined,
        p_attendance_visibility: visibility,
        p_image_path: path ?? undefined,
      };
      let id = event?.id;
      if (event) {
        const { error } = await getSupabase().rpc("update_event", { p_event_id: event.id, ...common, p_ends_at: endsAt as string, p_rsvp_deadline: (rsvp ? fromLocalInputValue(rsvpDeadline) : null) as string });
        if (error) throw error;
      } else {
        const { data, error } = await getSupabase().rpc("create_event", { p_group_id: effectiveGroup, ...common, p_post_to_chat: postToChat });
        if (error) throw error;
        id = data;
      }
      toast.show(editing ? "予定を更新しました" : "予定を作成しました");
      void queryClient.invalidateQueries({ queryKey: qk.events });
      if (id) void queryClient.invalidateQueries({ queryKey: qk.event(id) });
      onDone(id!);
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  if (!editing && group && !canCreate(group, "event")) {
    return <p className="px-6 py-10 text-center text-[14px] text-label-3">このグループでは管理者のみ予定を作成できます。</p>;
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 px-4 pt-1 pb-6">
      {!fixedGroup && !editing && <GroupPicker value={groupId} onChange={setGroupId} groups={selectable} what="event" />}
      {errors.group && <p className="-mt-3 px-1 text-[13px] text-danger">{errors.group}</p>}

      <Field label="タイトル" htmlFor="event-title" error={errors.title}>
        <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="例: 全体練習" aria-invalid={Boolean(errors.title)} data-autofocus />
      </Field>

      <fieldset>
        <legend className="mb-1.5 px-1 text-[13px] font-semibold text-label-2">カテゴリ</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="カテゴリ">
          {(Object.keys(CATEGORY_LABEL) as EventCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                category === c ? "bg-label text-surface" : "bg-surface-3 text-label-2",
              )}
            >
              <span className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[c] }} aria-hidden />
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface-2">
        <Switch checked={allDay} onChange={setAllDay} label="終日" />
      </div>

      {allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始日" htmlFor="event-sd" error={errors.start}>
            <Input id="event-sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="終了日" htmlFor="event-ed" error={errors.end}>
            <Input id="event-ed" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="開始" htmlFor="event-start" error={errors.start}>
            <Input
              id="event-start"
              type="datetime-local"
              value={start}
              onChange={(e) => {
                const prevStart = fromLocalInputValue(start);
                const prevEnd = fromLocalInputValue(end);
                setStart(e.target.value);
                // Keep the duration when the start moves.
                const next = fromLocalInputValue(e.target.value);
                if (next && prevStart && prevEnd) {
                  setEnd(toLocalInputValue(new Date(new Date(next).getTime() + (new Date(prevEnd).getTime() - new Date(prevStart).getTime()))));
                }
              }}
            />
          </Field>
          <Field label="終了（任意）" htmlFor="event-end" error={errors.end}>
            <Input id="event-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      )}

      <Field label="場所（任意）" htmlFor="event-location">
        <Input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="例: 第2体育館" />
      </Field>

      <Field label="詳細（任意）" htmlFor="event-desc">
        <Textarea id="event-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} placeholder="持ち物、集合時間など" />
      </Field>

      <div>
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-label-2">画像（任意）</p>
        {imageFile || imagePath ? (
          <div className="relative overflow-hidden rounded-2xl">
            {imageFile ? <LocalImage file={imageFile} /> : <SignedImage path={imagePath} className="aspect-[2/1] w-full" />}
            <button
              type="button"
              onClick={() => (setImageFile(null), setImagePath(null))}
              aria-label="画像を外す"
              className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <Button variant="secondary" icon={<ImagePlus className="size-4" />} onClick={() => imageInput.current?.click()}>
            画像を選択
          </Button>
        )}
        <input ref={imageInput} type="file" accept="image/*" hidden onChange={(e) => (setImageFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface-2 divide-y divide-separator">
        <Switch checked={rsvp} onChange={setRsvp} label="出欠を確認する" description="メンバーに参加・不参加・未定の回答を求めます" />
        {!editing && !fixedGroup && <Switch checked={postToChat} onChange={setPostToChat} label="グループトークに投稿" />}
      </div>

      {rsvp && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="回答期限（任意）" htmlFor="event-rsvp" error={errors.rsvpDeadline}>
            <Input id="event-rsvp" type="datetime-local" value={rsvpDeadline} onChange={(e) => setRsvpDeadline(e.target.value)} />
          </Field>
          <Field label="回答の公開範囲" htmlFor="event-vis">
            <Select id="event-vis" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="members">メンバー全員に公開</option>
              <option value="admins">管理者・作成者のみ</option>
            </Select>
          </Field>
        </div>
      )}

      <Button type="submit" block size="lg" loading={saving}>
        {editing ? "変更を保存" : "予定を作成"}
      </Button>
    </form>
  );
}

function LocalImage({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file));
  // eslint-disable-next-line @next/next/no-img-element -- local preview
  return <img src={url} alt="" className="aspect-[2/1] w-full object-cover" />;
}
