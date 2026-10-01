"use client";

import { useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/Card";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { NoPhoto, WallPhoto } from "@/components/ui/Wall";
import { photoUrl, uploadZonePhoto, type Zone } from "@/lib/data";
import { SPRAY_WALLS, sprayPath } from "@/lib/gyms";

// Spray Wall 公版照片（員工）：上傳／更換；換照片（岩點全部重裝）時這面牆的路線會全部下架
export default function SprayPhotoPanel({ zones, onChanged }: { zones: Zone[]; onChanged: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Zone | null>(null);
  const [confirm, setConfirm] = useState<{ zone: Zone; file: File } | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (zone: Zone, file: File) => {
    setBusy(true);
    try {
      toast("照片上傳中…");
      await uploadZonePhoto(zone, file);
      toast(zone.photo_path ? "已更換公版照片，舊路線已全部下架" : "已上傳公版照片");
      onChanged();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
    setConfirm(null);
  };

  return (
    <>
      {zones.map((z) => {
        const wall = SPRAY_WALLS.find((s) => s.gymId === z.gym_id && s.zoneCode === z.code);
        const src = photoUrl(z.photo_path);
        return (
          <div key={z.id}>
            <SectionTitle>{wall?.name ?? z.name} 公版照片</SectionTitle>
            {src ? <WallPhoto src={src} alt={`${wall?.name ?? z.name}公版照片`} /> : <NoPhoto>還沒上傳公版照片，上傳後大家才能在上面出路線</NoPhoto>}
            <SetBox>
              <p className="mt-3 mb-3 text-meta text-muted">岩館路線請到 {wall ? <a href={sprayPath(wall.id)} className="underline">{wall.name}</a> : "Spray Wall"} 頁面按「新增岩館路線」。整面岩點重裝時再換照片，舊路線會全部下架（大家的紀錄保留）。</p>
              <Button
                disabled={busy}
                onClick={() => {
                  setTarget(z);
                  fileRef.current?.click();
                }}
              >
                {src ? "更換公版照片" : "上傳公版照片"}
              </Button>
            </SetBox>
          </div>
        );
      })}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || !target) return;
          if (target.photo_path) setConfirm({ zone: target, file: f });
          else void upload(target, f);
        }}
      />
      <Sheet open={!!confirm} onClose={() => setConfirm(null)}>
        {confirm && (
          <>
            <SheetTitle>更換公版照片</SheetTitle>
            <SheetSub>換照片代表岩點全部重裝，這面牆的岩館路線和岩友路線都會下架，大家的完攀紀錄會保留。</SheetSub>
            <Button variant="danger" disabled={busy} onClick={() => void upload(confirm.zone, confirm.file)}>
              確認更換並下架舊路線
            </Button>
            <LinkButton onClick={() => setConfirm(null)}>取消</LinkButton>
          </>
        )}
      </Sheet>
    </>
  );
}
