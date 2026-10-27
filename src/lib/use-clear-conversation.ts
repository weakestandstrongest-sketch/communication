"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { forgetConversation } from "@/lib/chat-store";
import { qk } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import type { ConversationSummary } from "@/lib/types";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

/** What 「削除」 is called and promises for a talk: 1:1 talks disappear, group / team talks only lose their history. */
export function clearLabels(kind: ConversationSummary["kind"]) {
  return kind === "direct"
    ? { action: "トークを削除", title: "このトークを削除しますか？", message: "あなたのトーク一覧からトークと履歴が消えます。相手には影響せず、相手から新しいメッセージが届くとまた表示されます。", done: "トークを削除しました" }
    : { action: "トーク履歴を削除", title: "トーク履歴を削除しますか？", message: "あなたの画面からこれまでのメッセージが消えます。ほかのメンバーには影響しません。トーク自体はグループに残り、新しいメッセージは表示されます。", done: "トーク履歴を削除しました" };
}

/** LINE-style delete: clears a talk for yourself only. Resolves true when it was cleared. */
export function useClearConversation() {
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useCallback(
    async (c: Pick<ConversationSummary, "id" | "kind">) => {
      const t = clearLabels(c.kind);
      const ok = await confirm({ title: t.title, message: t.message, confirmLabel: "削除", destructive: true });
      if (!ok) return false;
      const { error } = await getSupabase().rpc("clear_conversation", { p_conversation_id: c.id });
      if (error) {
        toast.show(errorMessage(error), "error");
        return false;
      }
      forgetConversation(c.id);
      await queryClient.invalidateQueries({ queryKey: qk.conversations });
      toast.show(t.done);
      return true;
    },
    [confirm, toast, queryClient],
  );
}
