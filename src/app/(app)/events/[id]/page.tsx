"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarPlus, Clock, Lock, MapPin, MoreHorizontal, Pencil, RotateCcw, Share2, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, useAttendance, useEvent, useEventScope, useMyGroups, usePeople } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatEventRange, relativeDay } from "@/lib/format";
import { removeMedia } from "@/lib/media";
import { buildIcs } from "@/lib/ics";
import { ATTENDANCE_LABEL, CATEGORY_COLOR, CATEGORY_LABEL, type AttendanceStatus } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, GroupTag } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { ActionSheet } from "@/components/ui/sheet";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { SignedImage } from "@/components/media/signed-image";
import { AttendanceButtons, attendanceClosedReason } from "@/components/events/attendance-buttons";
import { cn } from "@/lib/cn";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const myId = useUserId();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const people = usePeople();
  const { data: event, isLoading } = useEvent(id);
  const { data: attendance } = useAttendance(event && !event.personal_user_id ? id : null);
  const { data: groups } = useMyGroups();
  const scope = useEventScope();
  const [menu, setMenu] = useState(false);
  const [comment, setComment] = useState<string | null>(null);
  const [tab, setTab] = useState<AttendanceStatus | "none">("going");

  if (isLoading) return (<><PageHeader title="予定" back="/calendar" /><ListSkeleton rows={3} /></>);
  if (!event) {
    return (
      <>
        <PageHeader title="予定" back="/calendar" />
        <EmptyState title="予定が見つかりません" description="削除されたか、閲覧する権限がありません。" />
      </>
    );
  }

  const isPersonal = Boolean(event.personal_user_id);
  const group = event.group_id ? groups?.find((g) => g.id === event.group_id) : undefined;
  const scopeTag = scope(event);
  const canManage = isPersonal ? event.personal_user_id === myId : event.created_by === myId || group?.my_role === "owner" || group?.my_role === "admin";
  const organizer = event.created_by ? people.get(event.created_by) : undefined;
  const closedReason = attendanceClosedReason(event);
  const myComment = comment ?? attendance?.mine?.comment ?? "";

  const share = async () => {
    const { error } = await getSupabase().rpc("share_to_chat", { p_kind: "event", p_id: id });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("グループトークに共有しました");
  };

  const toggleCancel = async () => {
    const cancel = !event.canceled_at;
    if (cancel && !(await confirm({ title: "予定を中止しますか？", message: "メンバーに中止の通知が届きます。", confirmLabel: "中止する", destructive: true }))) return;
    const { error } = await getSupabase().rpc("set_event_canceled", { p_event_id: id, p_canceled: cancel });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show(cancel ? "予定を中止にしました" : "予定を再開しました");
    void queryClient.invalidateQueries({ queryKey: qk.event(id) });
    void queryClient.invalidateQueries({ queryKey: qk.events });
  };

  const remove = async () => {
    if (!(await confirm({ title: "予定を削除しますか？", message: "出欠の回答もすべて削除され、元に戻せません。", confirmLabel: "削除", destructive: true }))) return;
    const { error } = await getSupabase().from("events").delete().eq("id", id);
    if (error) return toast.show(errorMessage(error), "error");
    if (event.image_path) void removeMedia([event.image_path]).catch(() => undefined);
    toast.show("予定を削除しました");
    void queryClient.invalidateQueries({ queryKey: qk.events });
    router.replace("/calendar");
  };

  const addToCalendar = () => {
    const blob = new Blob([buildIcs(event, `${window.location.origin}/events/${id}`)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const saveComment = async () => {
    if (!attendance?.mine) return;
    const { error } = await getSupabase().rpc("set_attendance", { p_event_id: id, p_status: attendance.mine.status, p_comment: myComment });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("コメントを保存しました");
    setComment(null);
    void queryClient.invalidateQueries({ queryKey: qk.attendance(id) });
  };

  const byStatus = (s: AttendanceStatus) => (attendance?.responses ?? []).filter((r) => r.status === s);
  const tabs: Array<{ value: AttendanceStatus | "none"; label: string; count: number }> = [
    { value: "going", label: "参加", count: attendance?.going ?? 0 },
    { value: "maybe", label: "未定", count: attendance?.maybe ?? 0 },
    { value: "not_going", label: "不参加", count: attendance?.not_going ?? 0 },
    { value: "none", label: "未回答", count: attendance?.non_respondents?.length ?? 0 },
  ];
  const listed =
    tab === "none"
      ? (attendance?.non_respondents ?? []).map((u) => ({ user_id: u, comment: "" }))
      : byStatus(tab).map((r) => ({ user_id: r.user_id, comment: r.comment }));

  return (
    <>
      <PageHeader
        title="予定"
        back="/calendar"
        actions={
          <IconButton label="予定のメニュー" tone="accent" onClick={() => setMenu(true)}>
            <MoreHorizontal className="size-5" />
          </IconButton>
        }
      />
      <PageBody className="space-y-4">
        <Card className="overflow-hidden">
          {event.image_path && <SignedImage path={event.image_path} className="aspect-[2/1] w-full" />}
          <div className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {scopeTag && <GroupTag name={scopeTag.name} color={scopeTag.color} />}
              {isPersonal && (
                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-label-2">
                  <Lock className="size-3" aria-hidden />
                  個人の予定（自分だけに表示）
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-label-2">
                <span className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[event.category] }} aria-hidden />
                {CATEGORY_LABEL[event.category]}
              </span>
              {event.canceled_at ? <Pill tone="danger">中止</Pill> : <Pill tone="accent">{relativeDay(event.starts_at)}</Pill>}
            </div>
            <h2 className={cn("mt-2 text-[22px] leading-snug font-bold break-anywhere", event.canceled_at && "line-through opacity-60")}>{event.title}</h2>
            <dl className="mt-3 space-y-2 text-[15px]">
              <div className="flex gap-2.5">
                <dt className="sr-only">日時</dt>
                <Clock className="mt-0.5 size-[18px] shrink-0 text-label-3" aria-hidden />
                <dd>{formatEventRange(event.starts_at, event.ends_at, event.all_day)}</dd>
              </div>
              {event.location && (
                <div className="flex gap-2.5">
                  <dt className="sr-only">場所</dt>
                  <MapPin className="mt-0.5 size-[18px] shrink-0 text-label-3" aria-hidden />
                  <dd>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {event.location}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {event.description && <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap text-label-2 break-anywhere">{event.description}</p>}
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-label-3">
              <Avatar name={organizer?.name} src={organizer?.avatar} id={event.created_by} size={20} />
              主催: {organizer?.name ?? "退会したメンバー"}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" icon={<CalendarPlus className="size-4" />} onClick={addToCalendar}>
                カレンダーに追加
              </Button>
              {!isPersonal && (
              <Button variant="secondary" size="sm" icon={<Share2 className="size-4" />} onClick={share}>
                トークで共有
              </Button>
              )}
            </div>
          </div>
        </Card>

        {event.rsvp_enabled && (
          <Card className="px-4 py-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-[17px] font-semibold">出欠</h3>
              {event.rsvp_deadline && <span className="text-[12px] text-label-3">回答期限 {formatDateTime(event.rsvp_deadline)}</span>}
            </div>
            <AttendanceButtons event={event} comment={comment ?? undefined} />
            {attendance?.mine && !closedReason && (
              <div className="mt-3 flex gap-2">
                <Input
                  value={myComment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={200}
                  placeholder="コメント（例: 30分遅れます）"
                  aria-label="出欠コメント"
                  className="h-10"
                />
                {comment !== null && comment !== (attendance.mine.comment ?? "") && (
                  <Button size="md" className="h-10" onClick={saveComment}>
                    保存
                  </Button>
                )}
              </div>
            )}

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-[13px] text-label-2">
                <span>
                  回答 {(attendance?.going ?? 0) + (attendance?.maybe ?? 0) + (attendance?.not_going ?? 0)} / {attendance?.member_count ?? "-"}人
                </span>
              </div>
              {attendance?.can_view_individuals ? (
                <>
                  <div role="tablist" aria-label="回答の内訳" className="flex gap-1 rounded-xl bg-surface-3 p-1">
                    {tabs.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.value}
                        onClick={() => setTab(t.value)}
                        className={cn(
                          "flex h-8 flex-1 items-center justify-center gap-1 rounded-[9px] text-[12px] font-semibold",
                          tab === t.value ? "bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-label-2",
                        )}
                      >
                        {t.label}
                        <span className="tabular">{t.count}</span>
                      </button>
                    ))}
                  </div>
                  {listed.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-label-3">該当するメンバーはいません</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-separator">
                      {listed.map((r) => {
                        const p = people.get(r.user_id);
                        return (
                          <li key={r.user_id} className="flex items-center gap-2.5 py-2">
                            <Avatar name={p?.name} src={p?.avatar} id={r.user_id} size={32} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px]">{p?.name ?? "メンバー"}</span>
                              {r.comment && <span className="block truncate text-[12px] text-label-3">{r.comment}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(["going", "maybe", "not_going"] as const).map((s) => (
                    <div key={s} className="rounded-xl bg-surface-2 py-2">
                      <p className="text-[12px] text-label-3">{ATTENDANCE_LABEL[s]}</p>
                      <p className="text-[18px] font-bold tabular">{attendance?.[s] ?? 0}</p>
                    </div>
                  ))}
                  <p className="col-span-3 text-[12px] text-label-3">個別の回答は管理者と主催者のみ確認できます</p>
                </div>
              )}
            </div>
          </Card>
        )}
      </PageBody>

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: "トークで共有", icon: <Share2 />, hidden: isPersonal, onSelect: share },
          { label: "カレンダーに追加 (.ics)", icon: <CalendarPlus />, onSelect: addToCalendar },
          { label: "編集", icon: <Pencil />, hidden: !canManage, onSelect: () => router.push(`/events/${id}/edit`) },
          { label: event.canceled_at ? "中止を取り消す" : "中止にする", icon: event.canceled_at ? <RotateCcw /> : <Ban />, hidden: !canManage || isPersonal, onSelect: toggleCancel },
          { label: "削除", icon: <Trash2 />, destructive: true, hidden: !canManage, onSelect: remove },
        ]}
      />
      {group && (
        <p className="sr-only">
          <Link href={`/groups/${group.id}`}>{group.name}</Link>
        </p>
      )}
    </>
  );
}
