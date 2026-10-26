"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export default function JoinGroupPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Accept a full invite URL as well as a bare code.
    const match = /invite\/([A-Za-z0-9]+)/.exec(code);
    const value = (match ? match[1] : code).trim().toUpperCase();
    if (!/^[A-Z0-9]{6,16}$/.test(value)) return setError("招待コードは英数字で入力してください");
    setError(null);
    router.push(`/invite/${value}`);
  };

  return (
    <>
      <PageHeader title="招待コードで参加" back="/groups" />
      <PageBody>
        <form onSubmit={submit} noValidate className="mx-auto max-w-sm space-y-5 pt-4">
          <p className="text-[15px] leading-relaxed text-label-2">グループの管理者やメンバーから共有された招待コード、または招待リンクを入力してください。</p>
          <Field label="招待コード" htmlFor="code" error={error}>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="例: AB3D5FGH7K"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="text-center font-mono text-[20px] tracking-[0.2em]"
              aria-invalid={Boolean(error)}
              autoFocus
            />
          </Field>
          <Button type="submit" block size="lg" disabled={!code.trim()}>
            次へ
          </Button>
        </form>
      </PageBody>
    </>
  );
}
