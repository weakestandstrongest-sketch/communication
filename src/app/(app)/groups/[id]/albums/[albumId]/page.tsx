"use client";

import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Images, MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useUserId } from "@/lib/auth";
import { qk, useAlbum, useMedia, useMyGroups, usePeople } from "@/lib/queries";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { removeMedia, uploadMedia } from "@/lib/media";
import type { MediaItem } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Button, IconButton } from "@/components/ui/button";
import { ActionSheet, Sheet } from "@/components/ui/sheet";
import { EmptyState, ListSkeleton } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { PhotoGrid } from "@/components/media/photo-grid";

export default function AlbumPage() {
  const { id, albumId } = useParams<{ id: string; albumId: string }>();
  const myId = useUserId();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const people = usePeople();
  const { data: album, isLoading } = useAlbum(albumId);
  const { data: media } = useMedia(`album:${albumId}`);
  const { data: groups } = useMyGroups();
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const [menu, setMenu] = useState(false);
  const [photoMenu, setPhotoMenu] = useState<MediaItem | null>(null);
  const [rename, setRename] = useState(false);
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const group = groups?.find((g) => g.id === id);
  const isAdmin = group?.my_role === "owner" || group?.my_role === "admin";
  const canManage = album?.created_by === myId || isAdmin;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.media(`album:${albumId}`) });
    void queryClient.invalidateQueries({ queryKey: qk.media(`group:${id}`) });
    void queryClient.invalidateQueries({ queryKey: qk.albums(id) });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length !== files.length) toast.show("写真以外のファイルはアルバムに追加できません", "info");
    const failed: string[] = [];
    setProgress({ done: 0, total: list.length, failed });
    for (let i = 0; i < list.length; i++) {
      try {
        const a = await uploadMedia(`g/${id}/albums/${albumId}/`, list[i]);
        const { error } = await getSupabase().from("media_items").insert({
          group_id: id,
          album_id: albumId,
          uploader_id: myId,
          storage_path: a.path,
          thumb_path: a.thumb_path,
          mime_type: a.mime,
          file_name: a.name,
          size_bytes: a.size,
          width: a.width,
          height: a.height,
        });
        if (error) {
          await removeMedia([a.path, a.thumb_path ?? ""]);
          throw error;
        }
      } catch (e) {
        failed.push(`${list[i].name}: ${errorMessage(e, "アップロードに失敗しました")}`);
      }
      setProgress({ done: i + 1, total: list.length, failed: [...failed] });
    }
    refresh();
    if (failed.length) toast.show(`${failed.length}枚の写真を追加できませんでした`, "error");
    else {
      toast.show(`${list.length}枚の写真を追加しました`);
      setProgress(null);
    }
  };

  const deletePhoto = async (m: MediaItem) => {
    if (!(await confirm({ title: "写真を削除しますか？", confirmLabel: "削除", destructive: true }))) return;
    const { error } = await getSupabase().from("media_items").delete().eq("id", m.id);
    if (error) return toast.show(errorMessage(error), "error");
    await removeMedia([m.storage_path, m.thumb_path ?? ""]).catch(() => undefined);
    toast.show("写真を削除しました");
    refresh();
  };

  const deleteAlbum = async () => {
    if (!(await confirm({ title: "アルバムを削除しますか？", message: "アルバム内の写真もすべて削除されます。", confirmLabel: "削除", destructive: true }))) return;
    const paths = (media ?? []).flatMap((m) => [m.storage_path, m.thumb_path ?? ""]);
    for (let i = 0; i < paths.length; i += 100) await removeMedia(paths.slice(i, i + 100)).catch(() => undefined);
    const { error } = await getSupabase().from("albums").delete().eq("id", albumId);
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("アルバムを削除しました");
    refresh();
    router.replace(`/groups/${id}`);
  };

  const share = async () => {
    const { error } = await getSupabase().rpc("share_to_chat", { p_kind: "album", p_id: albumId });
    if (error) return toast.show(errorMessage(error), "error");
    toast.show("グループトークに共有しました");
  };

  if (isLoading) return (<><PageHeader title="アルバム" back={`/groups/${id}`} /><ListSkeleton rows={2} /></>);
  if (!album) return (<><PageHeader title="アルバム" back={`/groups/${id}`} /><EmptyState title="アルバムが見つかりません" /></>);

  return (
    <>
      <PageHeader
        title={album.title}
        subtitle={group?.name}
        back={`/groups/${id}`}
        actions={
          <IconButton label="アルバムのメニュー" tone="accent" onClick={() => setMenu(true)}>
            <MoreHorizontal className="size-5" />
          </IconButton>
        }
      />
      <PageBody className="space-y-4">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[13px] text-label-3">
            {media?.length ?? 0}枚 ・ {people.get(album.created_by ?? "")?.name ?? "メンバー"}が{formatDate(album.created_at)}に作成
          </p>
          <Button size="sm" icon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()} loading={Boolean(progress && progress.done < progress.total)}>
            写真を追加
          </Button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => (void upload(e.target.files), (e.target.value = ""))} />
        </div>
        {album.description && <p className="px-1 text-[14px] text-label-2">{album.description}</p>}
        {progress && (
          <div className="rounded-2xl bg-surface px-4 py-3 shadow-[var(--shadow-card)]" role="status">
            <div className="flex items-center justify-between text-[13px]">
              <span>{progress.done < progress.total ? "アップロード中…" : "アップロード完了"}</span>
              <span className="tabular">
                {progress.done}/{progress.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            {progress.failed.map((f) => (
              <p key={f} className="mt-1.5 text-[12px] text-danger">
                {f}
              </p>
            ))}
            {progress.done === progress.total && (
              <button type="button" onClick={() => setProgress(null)} className="mt-2 text-[13px] font-semibold text-accent">
                閉じる
              </button>
            )}
          </div>
        )}
        {!media?.length ? (
          <EmptyState icon={<Images />} title="写真がありません" description="「写真を追加」から iPhone の写真やパソコンの画像をアップロードできます。" />
        ) : (
          <>
            <PhotoGrid items={media} onLongPress={(m) => (m.uploader_id === myId || isAdmin) && setPhotoMenu(m)} />
            <p className="px-1 text-[12px] text-label-3">写真を長押し（右クリック）すると削除できます。</p>
          </>
        )}
      </PageBody>

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: "グループトークに共有", icon: <Share2 />, onSelect: share },
          { label: "名前を変更", icon: <Pencil />, hidden: !canManage, onSelect: () => (setTitle(album.title), setRename(true)) },
          { label: "アルバムを削除", icon: <Trash2 />, destructive: true, hidden: !canManage, onSelect: deleteAlbum },
        ]}
      />
      <ActionSheet
        open={Boolean(photoMenu)}
        onClose={() => setPhotoMenu(null)}
        actions={photoMenu ? [{ label: "写真を削除", icon: <Trash2 />, destructive: true, onSelect: () => deletePhoto(photoMenu) }] : []}
      />
      <Sheet open={rename} onClose={() => setRename(false)} title="名前を変更" size="sm">
        <form
          className="space-y-4 px-4 pb-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await getSupabase().from("albums").update({ title: title.trim() }).eq("id", albumId);
            if (error) return toast.show(errorMessage(error), "error");
            setRename(false);
            void queryClient.invalidateQueries({ queryKey: qk.album(albumId) });
            refresh();
          }}
        >
          <Field label="タイトル" htmlFor="rename-album">
            <Input id="rename-album" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
          </Field>
          <Button type="submit" block disabled={!title.trim()}>
            保存
          </Button>
        </form>
      </Sheet>
    </>
  );
}
