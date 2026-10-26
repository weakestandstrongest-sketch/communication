"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PollForm } from "@/components/polls/poll-form";

function NewPoll() {
  const router = useRouter();
  const groupId = useSearchParams().get("group") ?? undefined;
  return (
    <div className="mx-auto max-w-2xl pt-4 pb-10">
      <PollForm key={groupId} groupId={groupId} onDone={(id) => router.replace(`/polls/${id}`)} />
    </div>
  );
}

export default function NewPollPage() {
  return (
    <>
      <PageHeader title="投票を作成" back="/polls" />
      <Suspense>
        <NewPoll />
      </Suspense>
    </>
  );
}
