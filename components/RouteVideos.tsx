"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { Check, Label, TextField } from "@/components/ui/Form";
import { ClosedNotice } from "@/components/ui/Comments";
import { useToast } from "@/components/ui/Toast";
import { PickedFile, VideoPickButton, VideoStrip, VideoViewer, type VideoCard } from "@/components/ui/Video";
import { checkVideo, deleteVideo, getVideos, uploadVideo, videoUrl, type Route, type Video } from "@/lib/data";
import { ago } from "@/lib/date";
import type { Status } from "@/lib/design";

// 路線卡片的「影片」分頁：看大家分享的攀爬影片、上傳自己的；onCount 回報影片數（分頁標籤用）
// 規則跟留言一樣：路線在牆上、留言開放才能分享；路線下架時影片會一起刪除
export default function RouteVideos({
  route: r,
  gymId,
  open,
  staff,
  myStatus,
  onLogin,
  onCount,
  onProfile,
}: {
  onProfile?: (userId: string) => void;
  route: Route;
  gymId: string;
  open: boolean;
  staff: boolean;
  myStatus: Status | null;
  onLogin: () => void;
  onCount?: (n: number) => void;
}) {
  const { session } = useAuth();
  const toast = useToast();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);

  useEffect(() => {
    getVideos(r.id)
      .then(setVideos)
      .catch(() => setVideos([]));
  }, [r.id]);
  useEffect(() => {
    if (videos) onCount?.(videos.length);
  }, [videos, onCount]);

  const canShare = open && !r.archived_at;
  const cards: VideoCard[] = (videos ?? []).map((v) => ({
    key: v.id,
    src: videoUrl(v.path),
    name: v.nickname,
    ago: ago(v.created_at),
    caption: v.caption,
    status: v.status,
    onName: onProfile ? () => (setPlaying(null), onProfile(v.user_id)) : undefined,
  }));
  if (!canShare && videos && !videos.length) return <ClosedNotice>這條路線目前不開放分享影片</ClosedNotice>;

  const pick = async (f: File) => {
    try {
      await checkVideo(f);
      setFile(f);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const reset = () => {
    setFile(null);
    setCaption("");
    setConsent(false);
  };

  const upload = async () => {
    if (!session || !file || !consent) return;
    setBusy(true);
    try {
      await uploadVideo(session.user.id, gymId, r.id, file, { caption: caption.trim() || null, status: myStatus });
      reset();
      setVideos(await getVideos(r.id));
      toast("已分享影片");
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    try {
      await deleteVideo(id);
      setPlaying(null);
      setVideos((vs) => vs?.filter((v) => v.id !== id) ?? null);
      toast("已刪除影片");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      {videos && videos.length > 0 ? (
        <>
          <VideoStrip items={cards} onOpen={setPlaying} />
          <VideoViewer
            items={cards}
            index={playing}
            onIndex={setPlaying}
            actions={(i) => {
              const v = videos[i];
              return session && (v.user_id === session.user.id || staff) ? (
                <button onClick={() => void remove(v.id)} className="text-meta text-warn">
                  刪除這支影片
                </button>
              ) : null;
            }}
          />
        </>
      ) : (
        <p className="mt-1 mb-2.5 text-note text-muted">{videos ? "還沒有人分享影片，拍下你的攀爬過程吧。" : "讀取中…"}</p>
      )}
      {canShare &&
        (!session ? (
          <Button onClick={onLogin}>登入後分享影片</Button>
        ) : !file ? (
          <>
            <VideoPickButton onPick={pick} disabled={busy}>
              分享攀爬影片
            </VideoPickButton>
            <p className="mt-1.5 mb-0 text-tiny text-muted">最長 60 秒、50 MB 以內；這條路線換線時影片會一起刪除</p>
          </>
        ) : (
          <>
            <PickedFile name={file.name} size={file.size} onClear={busy ? undefined : reset} />
            <Label htmlFor="vcap">一句說明（選填）</Label>
            <TextField id="vcap" maxLength={40} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="例如 第三手用左腳勾" />
            <Check checked={consent} onChange={setConsent}>
              影片裡的其他人都同意入鏡，內容符合<Link href="/rules" className="underline">分享規範</Link>
            </Check>
            <Button variant="primary" className="mt-3.5" disabled={!consent || busy} onClick={upload}>
              {busy ? "上傳中，請不要關閉畫面…" : "上傳影片"}
            </Button>
            {!busy && <LinkButton onClick={reset}>取消</LinkButton>}
          </>
        ))}
    </>
  );
}
