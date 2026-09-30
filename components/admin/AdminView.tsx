"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import RouteEditor, { type EditTarget } from "@/components/admin/RouteEditor";
import ScoringPanel from "@/components/admin/ScoringPanel";
import ShareQr from "@/components/admin/ShareQr";
import StaffPanel from "@/components/admin/StaffPanel";
import { Button, LinkButton } from "@/components/ui/Button";
import { Empty, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Label, TextField, Toggle } from "@/components/ui/Form";
import { CommentCount, Points, RouteList, RouteRow, Tags } from "@/components/ui/Route";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { NoPhoto, Pin, TempPin, WallPhoto } from "@/components/ui/Wall";
import { isManagerOf, roleLabel } from "@/lib/auth";
import {
  archiveZone,
  createZone,
  getActiveRoutes,
  getCommentCounts,
  getGyms,
  getZones,
  photoUrl,
  setGymComments,
  updateZone,
  uploadZonePhoto,
  type Gym,
  type Route,
  type Zone,
} from "@/lib/data";
import { ago } from "@/lib/date";
import { LIVE_GYM } from "@/lib/gyms";
import { routePoints } from "@/lib/scoring";
import { useScoring } from "@/lib/useScoring";

type Confirm = { kind: "photo"; file: File } | { kind: "reset" } | { kind: "zone" } | null;

// 管理後台：選場館、全館留言開關、區域設定與照片、在照片上標路線、整區換線、員工
export default function AdminView() {
  const { access } = useAuth();
  const toast = useToast();
  const rules = useScoring();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [gymId, setGymId] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [target, setTarget] = useState<EditTarget>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [newZone, setNewZone] = useState({ name: "", code: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  // 可以管理的場館：老闆全部，其他人只有自己的館
  useEffect(() => {
    if (!access) return;
    getGyms()
      .then((all) => {
        const mine = access.is_owner ? all : all.filter((g) => access.roles.some((r) => r.gym_id === g.id));
        setGyms(mine);
        setGymId((cur) => cur ?? (mine.find((g) => g.id === LIVE_GYM.id) ?? mine[0])?.id ?? null);
      })
      .catch((e) => toast((e as Error).message));
  }, [access, toast]);

  const loadZones = useCallback(async () => {
    if (!gymId) return;
    try {
      const zs = await getZones(gymId);
      setZones(zs);
      setZoneId((cur) => (cur && zs.some((z) => z.id === cur) ? cur : (zs[0]?.id ?? null)));
    } catch (e) {
      toast((e as Error).message);
    }
  }, [gymId, toast]);

  const loadRoutes = useCallback(async () => {
    if (!zoneId) return setRoutes([]);
    try {
      const rs = await getActiveRoutes(zoneId);
      setRoutes(rs);
      setCounts(await getCommentCounts(rs.map((r) => r.id)));
    } catch (e) {
      toast((e as Error).message);
    }
  }, [zoneId, toast]);

  useEffect(() => {
    void Promise.resolve().then(loadZones);
  }, [loadZones]);
  useEffect(() => {
    void Promise.resolve().then(loadRoutes);
  }, [loadRoutes]);

  if (!access || !gymId) return <Empty>讀取中…</Empty>;
  const gym = gyms.find((g) => g.id === gymId);
  const zone = zones?.find((z) => z.id === zoneId) ?? null;
  const manager = isManagerOf(access, gymId);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const toggleComments = (on: boolean) =>
    run(async () => {
      await setGymComments(gymId, on);
      setGyms((gs) => gs.map((g) => (g.id === gymId ? { ...g, comments_enabled: on } : g)));
      toast(on ? "已開放留言" : "已關閉全館留言");
    });

  const saveZone = (patch: Parameters<typeof updateZone>[1], msg: string) =>
    run(async () => {
      if (!zone) return;
      await updateZone(zone.id, patch);
      await loadZones();
      toast(msg);
    });

  const upload = (file: File) =>
    run(async () => {
      if (!zone) return;
      toast("照片上傳中…");
      await uploadZonePhoto(zone, file);
      await loadZones();
      toast("照片已更新");
    });

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (routes.length) setConfirm({ kind: "photo", file });
    else void upload(file);
  };

  const addZone = () =>
    run(async () => {
      const code = newZone.code.trim().toUpperCase();
      const name = newZone.name.trim();
      if (!/^[A-Z][A-Z0-9]{0,2}$/.test(code)) throw new Error("代碼要用英文大寫開頭，最多 3 個字，例如 E");
      if (!name) throw new Error("請填區域名稱");
      const z = await createZone(gymId, code, name, Math.max(0, ...(zones ?? []).map((x) => x.sort)) + 1);
      setConfirm(null);
      setNewZone({ name: "", code: "" });
      await loadZones();
      setZoneId(z.id);
      toast(`已新增 ${name}`);
    });

  const resetZone = () =>
    run(async () => {
      if (!zone) return;
      const n = await archiveZone(zone.id);
      setConfirm(null);
      await Promise.all([loadZones(), loadRoutes()]);
      toast(`已下架 ${n} 條`);
    });

  const src = zone ? photoUrl(zone.photo_path) : null;

  return (
    <>
      <p className="mt-0 mb-3 text-meta text-muted">你的身分：{roleLabel(access, gymId)}</p>

      {gyms.length > 1 && (
        <ChipRow>
          {gyms.map((g) => (
            <Chip
              key={g.id}
              pressed={g.id === gymId}
              onClick={() => {
                setGymId(g.id);
                setZones(null);
                setZoneId(null);
              }}
            >
              {g.name}
            </Chip>
          ))}
        </ChipRow>
      )}

      <SetBox>
        {manager ? (
          <Toggle checked={gym?.comments_enabled ?? true} onChange={toggleComments} label="開放顧客留言" hint="關閉後全館路線都不能留言" />
        ) : (
          <p className="my-3 text-sub">顧客留言：{gym?.comments_enabled ? "開放中" : "已關閉"}（店長可切換）</p>
        )}
      </SetBox>

      <ChipRow>
        {(zones ?? []).map((z) => (
          <Chip key={z.id} pressed={z.id === zoneId} onClick={() => setZoneId(z.id)}>
            {z.name}
          </Chip>
        ))}
        {manager && (
          <Chip pressed={false} onClick={() => setConfirm({ kind: "zone" })}>
            ＋ 新增區域
          </Chip>
        )}
      </ChipRow>

      {!zones ? (
        <Empty>讀取中…</Empty>
      ) : !zone ? (
        <Empty>這間館還沒有區域{manager ? "，按「＋ 新增區域」建立。" : "，請店長先建立。"}</Empty>
      ) : (
        <>
          <SetBox>
            <Label htmlFor="zname">區域名稱{manager ? "" : "（店長可修改）"}</Label>
            <TextField
              id="zname"
              key={`name-${zone.id}-${zone.name}`}
              defaultValue={zone.name}
              readOnly={!manager}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (manager && v && v !== zone.name) void saveZone({ name: v }, "已更新區域名稱");
              }}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label htmlFor="zreset">下次換線日</Label>
                <TextField
                  id="zreset"
                  key={`reset-${zone.id}-${zone.next_reset_on}`}
                  type="date"
                  defaultValue={zone.next_reset_on ?? ""}
                  onChange={(e) => void saveZone({ next_reset_on: e.target.value || null }, e.target.value ? "已更新換線日" : "已清除換線日")}
                />
              </div>
              <div>
                <Label>區域照片</Label>
                <button
                  className="flex w-full cursor-pointer items-center justify-center rounded-field border border-line bg-sunk p-[11px] font-medium"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {zone.photo_path ? "更換照片" : "上傳照片"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    pickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </SetBox>

          {src ? (
            <WallPhoto src={src} alt={`${zone.name}照片`} setter onPick={(x, y) => setTarget({ x, y })}>
              {routes.map((r) => (
                <Pin
                  key={r.id}
                  x={r.pin_x}
                  y={r.pin_y}
                  color={r.hold_color}
                  grade={r.grade}
                  label={`編輯 ${r.code}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTarget({ route: r });
                  }}
                />
              ))}
              {target && "x" in target && <TempPin x={target.x} y={target.y} />}
            </WallPhoto>
          ) : (
            <NoPhoto>先上傳這區的岩牆照片，再點照片標路線</NoPhoto>
          )}
          <Tip>點照片空白處新增路線，點標記編輯、管理留言或下架。</Tip>

          {routes.length ? (
            <RouteList>
              {routes.map((r) => (
                <RouteRow
                  key={r.id}
                  color={r.hold_color}
                  grade={r.grade}
                  title={
                    <>
                      {r.hold_color}色 {r.code}
                      {rules && <Points n={routePoints(r.grade, r.style_tags, rules)} />}
                    </>
                  }
                  meta={
                    <>
                      <Tags tags={r.style_tags} /> {ago(r.created_at)}
                      <span className="ml-1.5">{r.comments_enabled ? <CommentCount n={counts[r.id] ?? 0} /> : "留言關閉"}</span>
                    </>
                  }
                  onClick={() => setTarget({ route: r })}
                />
              ))}
            </RouteList>
          ) : (
            <Empty>這區還沒有路線，點照片新增第一條。</Empty>
          )}

          <Button variant="danger" className="mt-3.5" disabled={!routes.length || busy} onClick={() => setConfirm({ kind: "reset" })}>
            整區換線（下架全部 {routes.length} 條）
          </Button>

          <RouteEditor zone={zone} target={target} onClose={() => setTarget(null)} onChanged={loadRoutes} />
        </>
      )}

      {manager && gym && <StaffPanel gymId={gymId} gymName={gym.name} />}
      {access.is_owner && <ScoringPanel />}
      <ShareQr />

      <Sheet open={!!confirm} onClose={() => setConfirm(null)}>
        {confirm?.kind === "photo" && zone && (
          <>
            <SheetTitle>更換 {zone.name} 照片</SheetTitle>
            <SheetSub>牆上還有 {routes.length} 條路線，換照片後起步點的位置可能會對不上。通常是整區換線後再換照片。</SheetSub>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                const f = confirm.file;
                setConfirm(null);
                void upload(f);
              }}
            >
              仍然更換
            </Button>
            <LinkButton onClick={() => setConfirm(null)}>取消</LinkButton>
          </>
        )}
        {confirm?.kind === "reset" && zone && (
          <>
            <SheetTitle>{zone.name} 整區換線</SheetTitle>
            <SheetSub>{routes.length} 條路線會下架，顧客的紀錄和心得都會保留。下架後記得上傳新照片、設定下次換線日。</SheetSub>
            <Button variant="danger" disabled={busy} onClick={resetZone}>
              確認下架
            </Button>
            <LinkButton onClick={() => setConfirm(null)}>取消</LinkButton>
          </>
        )}
        {confirm?.kind === "zone" && (
          <>
            <SheetTitle>新增區域</SheetTitle>
            <SheetSub>代碼用在路線編號（例如 E-01），也對應平面圖上的區塊，建立後不要隨意更改。</SheetSub>
            <Label htmlFor="nzname">區域名稱</Label>
            <TextField id="nzname" maxLength={20} value={newZone.name} onChange={(e) => setNewZone((z) => ({ ...z, name: e.target.value }))} placeholder="例如 E 區" />
            <Label htmlFor="nzcode">代碼</Label>
            <TextField
              id="nzcode"
              maxLength={3}
              autoCapitalize="characters"
              value={newZone.code}
              onChange={(e) => setNewZone((z) => ({ ...z, code: e.target.value.toUpperCase() }))}
              placeholder="例如 E"
            />
            <Button variant="primary" className="mt-4" disabled={busy} onClick={addZone}>
              新增區域
            </Button>
            <LinkButton onClick={() => setConfirm(null)}>取消</LinkButton>
          </>
        )}
      </Sheet>
    </>
  );
}
