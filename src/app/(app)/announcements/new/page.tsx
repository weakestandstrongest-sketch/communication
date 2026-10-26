"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { AnnouncementForm } from "@/components/announcements/announcement-form";

function NewAnnouncement() {
  const router = useRouter();
  const groupId = useSearchParams().get("group") ?? undefined;
  return (
    <div className="mx-auto max-w-2xl pt-4 pb-10">
      <AnnouncementForm key={groupId} groupId={groupId} onDone={(id) => router.replace(`/announcements/${id}`)} />
    </div>
  );
}

export default function NewAnnouncementPage() {
  return (
    <>
      <PageHeader title="お知らせを投稿" back />
      <Suspense>
        <NewAnnouncement />
      </Suspense>
    </>
  );
}
