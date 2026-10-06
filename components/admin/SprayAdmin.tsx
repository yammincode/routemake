"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SprayPhotoPanel from "@/components/admin/SprayPhotoPanel";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle } from "@/components/ui/Card";
import { RouteThumb } from "@/components/ui/Spray";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { Grade } from "@/components/ui/Route";
import { archiveRoute, getSprayList, getSprayZone, photoUrl, SPRAY_PAGE, thumbUrl, type SprayKind, type SprayRoute, type Zone } from "@/lib/data";
import { ago } from "@/lib/date";
import { saveLastGym, sprayPath, type SprayWall } from "@/lib/gyms";

// 管理後台的 Spray Wall（跟岩館分開）：公版照片、岩館路線／岩友路線管理（下架）
export default function SprayAdmin({ wall }: { wall: SprayWall }) {
  const toast = useToast();
  const router = useRouter();
  const [zone, setZone] = useState<Zone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SprayKind>("gym");
  const [list, setList] = useState<SprayRoute[] | null>(null);
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const loadZone = useCallback(async () => {
    try {
      setZone(await getSprayZone(wall.gymId, wall.zoneCode));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wall.gymId, wall.zoneCode]);

  const load = useCallback(
    async (offset: number) => {
      if (!zone) return;
      try {
        const rows = await getSprayList(zone.id, kind, null, "new", offset);
        setList((cur) => (offset ? [...(cur ?? []), ...rows] : rows));
        setMore(rows.length === SPRAY_PAGE);
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [zone, kind, toast]
  );

  useEffect(() => {
    void Promise.resolve().then(loadZone);
  }, [loadZone]);
  useEffect(() => {
    void Promise.resolve().then(() => {
      setList(null);
      return load(0);
    });
  }, [load]);

  if (error) return <Empty>{error}</Empty>;
  if (!zone) return <Empty>讀取中…</Empty>;
  const photo = photoUrl(zone.photo_path);
  const ratio = zone.photo_width && zone.photo_height ? zone.photo_height / zone.photo_width : 0.75;

  const archive = async (r: SprayRoute) => {
    if (confirm !== r.id) return setConfirm(r.id);
    try {
      await archiveRoute(r.id);
      setConfirm(null);
      setList((l) => l?.filter((x) => x.id !== r.id) ?? null);
      toast(`已下架「${r.name}」`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const go = () => {
    saveLastGym(wall.id);
    router.push(sprayPath(wall.id));
  };

  return (
    <>
      <SprayPhotoPanel zones={[zone]} onChanged={() => void loadZone().then(() => load(0))} />

      <SectionTitle>{wall.name} 路線</SectionTitle>
      <Tabs
        tabs={[
          { key: "gym", label: "岩館路線" },
          { key: "community", label: "岩友路線" },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setConfirm(null);
        }}
      />
      {kind === "gym" && (
        <Button variant="primary" className="mb-3" disabled={!photo} onClick={go}>
          {photo ? "到 Spray Wall 頁新增岩館路線" : "先上傳公版照片才能出路線"}
        </Button>
      )}
      {list == null ? (
        <Empty>讀取中…</Empty>
      ) : list.length === 0 ? (
        <Empty>{kind === "gym" ? "還沒有岩館路線。" : "還沒有岩友路線。"}</Empty>
      ) : (
        <>
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card">
                <Grade grade={r.grade} className="text-num-row w-[46px]" />
                {photo && r.holds?.length ? <RouteThumb src={thumbUrl(zone.photo_path) ?? photo} fallback={photo} holds={r.holds} ratio={ratio} /> : null}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sub">{r.name}</b>
                  <span className="block truncate text-meta text-muted">
                    {r.author ?? "攀岩者"} 出的・{ago(r.created_at)}・{r.sends} 人完攀・👍 {r.likes}
                  </span>
                </span>
                <button onClick={() => void archive(r)} className="flex-none px-1 py-1 text-note text-warn">
                  {confirm === r.id ? "確定下架？" : "下架"}
                </button>
              </li>
            ))}
          </ul>
          {more && (
            <Button className="mt-3" onClick={() => void load(list.length)}>
              載入更多
            </Button>
          )}
        </>
      )}
    </>
  );
}
