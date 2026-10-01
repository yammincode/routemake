"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import RouteSheet from "@/components/RouteSheet";
import SprayEditor from "@/components/SprayEditor";
import { Button } from "@/components/ui/Button";
import { Empty, PageTitle } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { HoldLegend, SprayRow } from "@/components/ui/Spray";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { NoPhoto, WallPhoto } from "@/components/ui/Wall";
import { isStaffOf } from "@/lib/auth";
import {
  archiveRoute,
  getGym,
  getMyAscents,
  getSprayList,
  getSprayZone,
  likeRoute,
  photoUrl,
  SPRAY_PAGE,
  unlikeRoute,
  type Ascent,
  type Gym,
  type SprayKind,
  type SprayRoute,
  type SpraySort,
  type Zone,
} from "@/lib/data";
import { ago } from "@/lib/date";
import { gradeLabel, GRADES } from "@/lib/design";
import type { SprayWall } from "@/lib/gyms";

const SORTS: { key: SpraySort; label: string }[] = [
  { key: "new", label: "最新" },
  { key: "sends", label: "最多人完攀" },
  { key: "likes", label: "最多讚" },
  { key: "mine", label: "我出的" },
];

// Spray Wall：公版岩牆照片；岩館路線（員工出）／岩友路線（大家出），篩選難度、排序，一次 20 條
export default function SprayView({ wall }: { wall: SprayWall }) {
  const { session, access } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [zone, setZone] = useState<Zone | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SprayKind>("gym");
  const [grade, setGrade] = useState<number | null>(null);
  const [sort, setSort] = useState<SpraySort>("new");
  const [list, setList] = useState<SprayRoute[] | null>(null);
  const [more, setMore] = useState(false);
  const [mine, setMine] = useState<Record<string, Ascent>>({});
  const [open, setOpen] = useState<SprayRoute | null>(null);
  const [editor, setEditor] = useState<{ route: SprayRoute | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const staff = isStaffOf(access, wall.gymId);
  const uid = session?.user.id;

  useEffect(() => {
    Promise.all([getSprayZone(wall.gymId, wall.zoneCode), getGym(wall.gymId)])
      .then(([z, g]) => {
        setZone(z);
        setGym(g);
      })
      .catch((e) => setError((e as Error).message));
  }, [wall.gymId, wall.zoneCode]);

  const load = useCallback(
    async (offset: number) => {
      if (!zone) return;
      try {
        const rows = await getSprayList(zone.id, kind, grade, sort === "mine" && !uid ? "new" : sort, offset);
        setList((cur) => (offset ? [...(cur ?? []), ...rows] : rows));
        setMore(rows.length === SPRAY_PAGE);
        if (uid) {
          const a = await getMyAscents(rows.map((r) => r.id));
          setMine((m) => ({ ...(offset ? m : {}), ...a }));
        }
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [zone, kind, grade, sort, uid, toast]
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      setList(null);
      return load(0);
    });
  }, [load]);

  const photo = zone ? photoUrl(zone.photo_path) : null;

  const patch = (id: string, p: Partial<SprayRoute>) => {
    setList((l) => l?.map((r) => (r.id === id ? { ...r, ...p } : r)) ?? null);
    setOpen((o) => (o?.id === id ? { ...o, ...p } : o));
  };

  const toggleLike = async (r: SprayRoute) => {
    if (!session) return router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
    patch(r.id, { liked: !r.liked, likes: r.likes + (r.liked ? -1 : 1) });
    try {
      await (r.liked ? unlikeRoute(r.id) : likeRoute(r.id));
    } catch (e) {
      patch(r.id, { liked: r.liked, likes: r.likes });
      toast((e as Error).message);
    }
  };

  const remove = async (r: SprayRoute) => {
    if (pendingDelete !== r.id) {
      setPendingDelete(r.id);
      return toast("再按一次確認");
    }
    try {
      await archiveRoute(r.id);
      setPendingDelete(null);
      setOpen(null);
      setList((l) => l?.filter((x) => x.id !== r.id) ?? null);
      toast(r.mine ? "已刪除路線" : "已下架路線");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  if (error) return <Empty>{error}</Empty>;
  if (!zone) return <Empty>讀取中…</Empty>;

  const canCreate = kind === "gym" ? staff : !!session;

  return (
    <>
      <PageTitle sub="點路線看圈圈；岩館路線由教練出，岩友路線大家都可以出">{wall.name}</PageTitle>
      {photo ? (
        <>
          <WallPhoto src={photo} alt={`${wall.name}公版照片`} />
          <HoldLegend />
        </>
      ) : (
        <NoPhoto>公版照片還沒上傳，工作人員可以在管理後台上傳</NoPhoto>
      )}

      <Tabs
        tabs={[
          { key: "gym", label: "岩館路線" },
          { key: "community", label: "岩友路線" },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          if (k === "gym" && sort === "mine") setSort("new");
        }}
      />

      {photo &&
        (canCreate ? (
          <Button variant="primary" className="mb-3" onClick={() => setEditor({ route: null })}>
            {kind === "gym" ? "＋ 新增岩館路線" : "＋ 出一條岩友路線"}
          </Button>
        ) : (
          kind === "community" && (
            <Button className="mb-3" onClick={() => router.push(`/login?next=${encodeURIComponent(location.pathname)}`)}>
              登入後出路線
            </Button>
          )
        ))}

      <ChipRow>
        <Chip num pressed={grade == null} onClick={() => setGrade(null)}>
          全部
        </Chip>
        {GRADES.map((g) => (
          <Chip key={g} num pressed={grade === g} onClick={() => setGrade(grade === g ? null : g)}>
            {gradeLabel(g)}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow>
        {SORTS.filter((s) => s.key !== "mine" || (kind === "community" && uid)).map((s) => (
          <Chip key={s.key} pressed={sort === s.key} onClick={() => setSort(s.key)}>
            {s.label}
          </Chip>
        ))}
      </ChipRow>

      {list == null ? (
        <Empty>讀取中…</Empty>
      ) : list.length === 0 ? (
        <Empty>
          {grade != null || sort === "mine" ? "沒有符合的路線。" : kind === "gym" ? "教練還沒出岩館路線。" : "還沒有岩友路線，出第一條吧！"}
        </Empty>
      ) : (
        <>
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {list.map((r) => (
              <SprayRow
                key={r.id}
                grade={r.grade}
                name={r.name ?? r.code}
                meta={`${r.author ?? "攀岩者"} 出的・${ago(r.created_at)}`}
                sends={r.sends}
                likes={r.likes}
                done={["flash", "send"].includes(mine[r.id]?.status ?? "")}
                onClick={() => setOpen(r)}
              />
            ))}
          </ul>
          {more && (
            <Button className="mt-3" onClick={() => void load(list.length)}>
              載入更多
            </Button>
          )}
        </>
      )}

      <RouteSheet
        route={open}
        zoneName={wall.name}
        gymId={wall.gymId}
        gymCommentsOn={gym?.comments_enabled ?? true}
        ascent={open ? (mine[open.id] ?? null) : null}
        onClose={() => {
          setOpen(null);
          setPendingDelete(null);
        }}
        onSaved={(a) =>
          setMine((m) => {
            if (!open) return m;
            const n = { ...m };
            if (a) n[open.id] = a;
            else delete n[open.id];
            return n;
          })
        }
        spray={
          open
            ? {
                photo,
                author: open.author,
                likes: open.likes,
                liked: open.liked,
                onLike: () => void toggleLike(open),
                onEdit: open.mine || (open.kind === "gym" && staff) ? () => setEditor({ route: open }) : undefined,
                onDelete: open.mine || staff ? () => void remove(open) : undefined,
                deleteLabel: open.mine ? "刪除" : "下架",
              }
            : undefined
        }
      />
      {photo && (
        <SprayEditor
          open={!!editor}
          zone={zone}
          photo={photo}
          kind={editor?.route?.kind ?? kind}
          route={editor?.route}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setOpen(null);
            void load(0);
          }}
        />
      )}
    </>
  );
}
