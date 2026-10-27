"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EventForm } from "@/components/events/event-form";
import { toLocalDateInputValue } from "@/lib/format";

function NewEvent() {
  const router = useRouter();
  const params = useSearchParams();
  const groupId = params.get("group") ?? undefined;
  const date = params.get("date") ?? undefined;
  return (
    <div className="mx-auto max-w-2xl pt-4 pb-10">
      <EventForm key={`${groupId}-${date}`} groupId={groupId} initialDate={date} onDone={(_id, startsAt) => router.replace(`/calendar?date=${toLocalDateInputValue(new Date(startsAt))}`)} />
    </div>
  );
}

export default function NewEventPage() {
  return (
    <>
      <PageHeader title="予定を作成" back="/calendar" />
      <Suspense>
        <NewEvent />
      </Suspense>
    </>
  );
}
