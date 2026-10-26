"use client";

import { useParams } from "next/navigation";
import { Images } from "lucide-react";
import { useMedia, useMyGroups } from "@/lib/queries";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { PhotoGrid } from "@/components/media/photo-grid";

export default function GroupPhotosPage() {
  const { id } = useParams<{ id: string }>();
  const { data: groups } = useMyGroups();
  const { data, isLoading } = useMedia(`group:${id}`);
  const group = groups?.find((g) => g.id === id);
  const photos = (data ?? []).filter((m) => m.mime_type.startsWith("image/"));
  return (
    <>
      <PageHeader title="すべての写真" subtitle={group?.name} back={`/groups/${id}`} />
      <PageBody>
        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : photos.length === 0 ? (
          <EmptyState icon={<Images />} title="写真はまだありません" description="トークやアルバムで共有された写真がここにまとめて表示されます。" />
        ) : (
          <>
            <p className="mb-2 px-1 text-[13px] text-label-3">トークとアルバムの写真 {photos.length}枚</p>
            <PhotoGrid items={photos} />
          </>
        )}
      </PageBody>
    </>
  );
}
