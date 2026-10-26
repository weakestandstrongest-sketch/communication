"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, EyeOff, Lock } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { isPollClosed, qk, usePeople, usePollResults } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import type { Poll, PollOption } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/** Voting + results for a poll. Used by the poll detail screen. */
export function PollVote({ poll }: { poll: Poll & { options: PollOption[] } }) {
  const { data: results, isLoading } = usePollResults(poll.id);
  const people = usePeople();
  const queryClient = useQueryClient();
  const toast = useToast();
  const closed = isPollClosed(poll);
  const responded = results?.responded ?? false;
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [freeText, setFreeText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showVoters, setShowVoters] = useState<string | null>(null);

  const mySelection = selected ?? results?.my_option_ids ?? [];
  const myText = freeText ?? results?.my_free_text ?? "";
  const canVote = !closed && (!responded || (poll.allow_change && editing));
  const showResults = Boolean(results?.visible) && (!canVote || responded);

  const toggle = (id: string) => {
    if (!canVote) return;
    if (poll.multiple) setSelected(mySelection.includes(id) ? mySelection.filter((x) => x !== id) : [...mySelection, id]);
    else setSelected([id]);
  };

  const submit = async () => {
    setSaving(true);
    const { error } = await getSupabase().rpc("submit_poll_response", {
      p_poll_id: poll.id,
      p_option_ids: mySelection,
      p_free_text: poll.allow_free_text ? myText : undefined,
    });
    setSaving(false);
    if (error) {
      toast.show(errorMessage(error), "error");
      return;
    }
    toast.show(responded ? "回答を変更しました" : "回答しました");
    setEditing(false);
    setSelected(null);
    setFreeText(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.pollResults(poll.id) }),
      queryClient.invalidateQueries({ queryKey: qk.polls }),
    ]);
  };

  const retract = async () => {
    setSaving(true);
    const { error } = await getSupabase().rpc("retract_poll_response", { p_poll_id: poll.id });
    setSaving(false);
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("回答を取り消しました");
    setSelected(null);
    setFreeText(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.pollResults(poll.id) }),
      queryClient.invalidateQueries({ queryKey: qk.polls }),
    ]);
  };

  const maxCount = Math.max(1, ...(results?.options ?? []).map((o) => o.count ?? 0));
  const hasAnswer = mySelection.length > 0 || myText.trim().length > 0;

  return (
    <div>
      <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-label-3">
        <span>{poll.multiple ? "複数選択可" : "1つ選択"}</span>
        {poll.anonymous && (
          <span className="inline-flex items-center gap-1">
            <EyeOff className="size-3.5" aria-hidden />
            匿名投票
          </span>
        )}
        {!poll.allow_change && <span>回答後の変更不可</span>}
      </p>

      <ul className="space-y-2" role={canVote ? (poll.multiple ? "group" : "radiogroup") : undefined} aria-label="選択肢">
        {poll.options.map((o) => {
          const r = results?.options.find((x) => x.id === o.id);
          const count = r?.count ?? 0;
          const mine = mySelection.includes(o.id);
          const pct = results && results.response_count > 0 ? Math.round((count / results.response_count) * 100) : 0;
          return (
            <li key={o.id}>
              <button
                type="button"
                role={canVote ? (poll.multiple ? "checkbox" : "radio") : undefined}
                aria-checked={canVote ? mine : undefined}
                onClick={() => (canVote ? toggle(o.id) : r?.voters?.length ? setShowVoters(showVoters === o.id ? null : o.id) : undefined)}
                className={cn(
                  "relative flex min-h-[52px] w-full items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-left transition-colors",
                  canVote ? (mine ? "bg-accent-soft ring-2 ring-accent" : "bg-surface-2 ring-1 ring-separator hover:bg-surface-3") : "bg-surface-2",
                )}
              >
                {showResults && (
                  <span
                    aria-hidden
                    className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", mine ? "bg-accent/18" : "bg-label/[0.06]")}
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                )}
                <span
                  className={cn(
                    "relative flex size-6 shrink-0 items-center justify-center border-2 transition-colors",
                    poll.multiple ? "rounded-md" : "rounded-full",
                    mine ? "border-accent bg-accent text-white" : "border-label-4",
                  )}
                  aria-hidden
                >
                  {mine && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="relative min-w-0 flex-1 text-[15px] font-medium break-anywhere">{o.label}</span>
                {showResults && (
                  <span className="relative shrink-0 text-right text-[13px] text-label-2 tabular">
                    <span className="font-semibold text-label">{count}</span>票 <span className="text-label-3">{pct}%</span>
                  </span>
                )}
              </button>
              {showVoters === o.id && r?.voters && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 px-2">
                  {r.voters.map((v) => (
                    <span key={v} className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 py-1 pr-2.5 pl-1 text-[12px]">
                      <Avatar name={people.get(v)?.name} src={people.get(v)?.avatar} id={v} size={20} />
                      {people.get(v)?.name ?? "メンバー"}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {poll.allow_free_text && canVote && (
        <div className="mt-3">
          <label className="mb-1.5 block px-1 text-[13px] font-semibold text-label-2" htmlFor={`free-${poll.id}`}>
            自由回答（任意）
          </label>
          <Textarea
            id={`free-${poll.id}`}
            value={myText}
            maxLength={500}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="コメントやその他の回答"
            className="min-h-20"
          />
        </div>
      )}

      {!isLoading && (
        <div className="mt-4 space-y-2">
          {canVote ? (
            <>
              <Button block size="lg" onClick={submit} loading={saving} disabled={!hasAnswer}>
                {responded ? "回答を変更する" : "回答する"}
              </Button>
              {editing && (
                <Button block variant="secondary" onClick={() => setEditing(false)}>
                  キャンセル
                </Button>
              )}
            </>
          ) : closed ? (
            <p className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-3 py-3 text-[14px] font-medium text-label-2">
              <Lock className="size-4" aria-hidden />
              この投票は締め切られました
            </p>
          ) : (
            <div className="flex gap-2">
              <p className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success-soft py-3 text-[14px] font-semibold text-success">
                <Check className="size-4" aria-hidden />
                回答済み
              </p>
              {poll.allow_change && (
                <>
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    変更
                  </Button>
                  <Button variant="ghost" onClick={retract} loading={saving}>
                    取消
                  </Button>
                </>
              )}
            </div>
          )}
          {results && !results.visible && (
            <p className="text-center text-[12px] text-label-3">
              {poll.result_visibility === "after_close"
                ? "結果は締切後に公開されます"
                : poll.result_visibility === "after_vote"
                  ? "結果は回答後に表示されます"
                  : "結果は管理者と作成者のみ確認できます"}
            </p>
          )}
        </div>
      )}

      {showResults && results?.free_texts && results.free_texts.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 px-1 text-[13px] font-semibold text-label-2">自由回答（{results.free_texts.length}件）</h3>
          <ul className="space-y-2">
            {results.free_texts.map((t, i) => (
              <li key={i} className="rounded-2xl bg-surface-2 px-4 py-3 text-[14px] leading-relaxed break-anywhere whitespace-pre-wrap">
                {t.user_id && <span className="mb-1 block text-[12px] font-semibold text-label-2">{people.get(t.user_id)?.name ?? "メンバー"}</span>}
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
