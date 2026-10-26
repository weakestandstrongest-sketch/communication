"use client";

import { useParams, useRouter } from "next/navigation";
import { useEvent } from "@/lib/queries";
import { PageHeader } from "@/components/layout/page-header";
import { EventForm } from "@/components/events/event-form";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event, isLoading } = useEvent(id);
  return (
    <>
      <PageHeader title="予定を編集" back={`/events/${id}`} />
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : !event ? (
        <EmptyState title="予定が見つかりません" />
      ) : (
        <div className="mx-auto max-w-2xl pt-4 pb-10">
          <EventForm key={event.updated_at} event={event} onDone={() => router.replace(`/events/${id}`)} />
        </div>
      )}
    </>
  );
}
