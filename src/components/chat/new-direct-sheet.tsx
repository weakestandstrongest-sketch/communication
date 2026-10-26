"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, useAllMembers, useMyGroups } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

export function NewDirectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const userId = useUserId();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: members } = useAllMembers();
  const { data: groups } = useMyGroups();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const people = useMemo(() => {
    const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
    const map = new Map<string, { id: string; name: string; avatar: string | null; groups: string[] }>();
    for (const m of members ?? []) {
      if (m.user_id === userId || !m.profile) continue;
      const entry = map.get(m.user_id) ?? { id: m.user_id, name: m.profile.display_name, avatar: m.profile.avatar_url, groups: [] };
      entry.groups.push(groupName.get(m.group_id) ?? "");
      map.set(m.user_id, entry);
    }
    const term = q.trim().toLowerCase();
    return Array.from(map.values())
      .filter((p) => !term || p.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [members, groups, userId, q]);

  const start = async (id: string) => {
    setBusy(id);
    const { data, error } = await getSupabase().rpc("get_or_create_direct", { p_user_id: id });
    setBusy(null);
    if (error || !data) {
      toast.show(errorMessage(error), "error");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: qk.conversations });
    onClose();
    router.push(`/talk/${data}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="個別トーク">
      <div className="px-4 pb-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で検索" aria-label="名前で検索" type="search" />
      </div>
      {people.length === 0 ? (
        <p className="px-6 py-10 text-center text-[14px] text-label-3">
          {members?.length ? "該当するメンバーがいません" : "同じグループのメンバーと個別にトークできます"}
        </p>
      ) : (
        <ul className="px-2 pb-4">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => start(p.id)}
                disabled={Boolean(busy)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2 active:bg-surface-3"
              >
                <Avatar name={p.name} src={p.avatar} id={p.id} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{p.name}</span>
                  <span className="block truncate text-[12px] text-label-3">{p.groups.join("・")}</span>
                </span>
                {busy === p.id && <Spinner className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
