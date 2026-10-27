"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useFeedbackTopics, useInvalidateFeedback } from "@/lib/feedback";
import { errorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const MAX = 600;

export function ComposeSheet({ open, onClose, groupId, initialTopic, onPosted }: { open: boolean; onClose: () => void; groupId: string; initialTopic?: string | null; onPosted: (id: string) => void }) {
  const toast = useToast();
  const refresh = useInvalidateFeedback();
  const { data: topics } = useFeedbackTopics(groupId);
  const [body, setBody] = useState("");
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    const { data, error } = await getSupabase().rpc("create_feedback_post", { p_group_id: groupId, p_body: body.trim(), p_topic: topic.trim() || undefined });
    setSaving(false);
    if (error || !data) return toast.show(errorMessage(error), "error");
    toast.show("匿名で投稿しました");
    setBody("");
    refresh();
    onClose();
    onPosted(data);
  };

  return (
    <Sheet open={open} onClose={onClose} title="匿名で意見を投稿" size="md">
      <form onSubmit={submit} className="space-y-4 px-4 pb-6">
        <p className="flex items-start gap-2 rounded-2xl bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-label-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          投稿者は、他のメンバーにも管理者にも表示されません。誰かを傷つける内容は、管理者が削除することがあります。
        </p>
        <Field label="意見・感想" htmlFor="fb-body">
          <Textarea
            id="fb-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX}
            placeholder="例: Autumn Leaves のイントロ、ベースとドラムのタイミングが合っていない気がします"
            className="min-h-36"
            data-autofocus
          />
          <p className={cn("px-1 text-right text-[12px] tabular", body.length > MAX - 50 ? "text-danger" : "text-label-3")}>
            {body.length}/{MAX}
          </p>
        </Field>
        <Field label="お題・曲名（任意）" htmlFor="fb-topic" hint="同じお題の意見をまとめて見られます">
          <Input id="fb-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={40} placeholder="例: Autumn Leaves" />
          {topics && topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {topics.slice(0, 8).map((t) => (
                <button
                  key={t.topic}
                  type="button"
                  onClick={() => setTopic(t.topic)}
                  className={cn("h-8 rounded-full px-3 text-[13px] font-medium", topic === t.topic ? "bg-label text-bg" : "bg-surface text-label-2")}
                >
                  {t.topic}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Button type="submit" block size="lg" loading={saving} disabled={!body.trim()}>
          匿名で投稿する
        </Button>
      </form>
    </Sheet>
  );
}
