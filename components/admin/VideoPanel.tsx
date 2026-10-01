"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle } from "@/components/ui/Card";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { VideoStrip, VideoViewer, type VideoCard } from "@/components/ui/Video";
import { cleanOrphanVideos, deleteVideo, getGymVideos, getVideoUsage, videoUrl, type GymVideo } from "@/lib/data";
import { ago } from "@/lib/date";

const mb = (bytes: number) => (bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(2)} GB` : `${(bytes / 1048576).toFixed(1)} MB`);

// 顧客影片（員工）：空間用量、最近分享的影片、刪除不適當的影片、清理漏刪的檔案
export default function VideoPanel({ gymId, gymName }: { gymId: string; gymName: string }) {
  const toast = useToast();
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [videos, setVideos] = useState<GymVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, v] = await Promise.all([getVideoUsage(gymId), getGymVideos(gymId)]);
      setUsage(u);
      setVideos(v);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [gymId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setVideos(null);
      return load();
    });
  }, [load]);

  const cards: VideoCard[] = (videos ?? []).map((v) => ({
    key: v.id,
    src: videoUrl(v.path),
    name: v.nickname,
    ago: ago(v.created_at),
    caption: v.caption,
    status: v.status,
    meta: `${v.zone_name} ${v.route_code}`,
  }));

  const remove = async (v: GymVideo) => {
    if (confirm !== v.id) return setConfirm(v.id);
    setBusy(true);
    try {
      await deleteVideo(v.id);
      setConfirm(null);
      setPlaying(null);
      toast("已刪除影片");
      await load();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const clean = async () => {
    setBusy(true);
    try {
      const n = await cleanOrphanVideos(gymId);
      toast(n ? `已清理 ${n} 個檔案` : "沒有需要清理的檔案");
      await load();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <SectionTitle>{gymName}顧客影片</SectionTitle>
      <SetBox>
        <p className="mt-3 mb-0 text-sub">
          目前 <b className="font-num text-[17px]">{usage?.count ?? "–"}</b> 支，共{" "}
          <b className="font-num text-[17px]">{usage ? mb(usage.bytes) : "–"}</b>
        </p>
        <p className="mt-1 mb-3 text-meta text-muted">路線下架或整區換線時，那條路線的影片會自動刪除。</p>
        <Button disabled={busy} onClick={clean}>
          清理漏刪的檔案
        </Button>
      </SetBox>
      {error ? (
        <Empty>{error}</Empty>
      ) : videos == null ? (
        <Empty>讀取中…</Empty>
      ) : videos.length === 0 ? (
        <Empty>還沒有顧客分享影片。</Empty>
      ) : (
        <>
          <VideoStrip items={cards} onOpen={(i) => (setConfirm(null), setPlaying(i))} />
          <VideoViewer
            items={cards}
            index={playing}
            onIndex={(i) => (setConfirm(null), setPlaying(i))}
            actions={(i) => (
              <button disabled={busy} onClick={() => void remove(videos[i])} className="text-meta text-warn disabled:opacity-50">
                {confirm === videos[i].id ? "確定刪除？再按一次" : "刪除這支影片"}
              </button>
            )}
          />
        </>
      )}
    </>
  );
}
