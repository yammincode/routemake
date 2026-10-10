"use client";

import FeedbackPanel from "@/components/admin/FeedbackPanel";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import RouteEditor, { type EditTarget } from "@/components/admin/RouteEditor";
import AuditPanel from "@/components/admin/AuditPanel";
import ScoringPanel from "@/components/admin/ScoringPanel";
import ShareQr from "@/components/admin/ShareQr";
import SprayAdmin from "@/components/admin/SprayAdmin";
import StaffPanel from "@/components/admin/StaffPanel";
import VideoPanel from "@/components/admin/VideoPanel";
import { Button, LinkButton } from "@/components/ui/Button";
import { Empty, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import FloorPlan from "@/components/ui/FloorPlan";
import { SortList } from "@/components/ui/SortList";
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
  getZoneProgress,
  getZones,
  makeMissingThumbs,
  photoUrl,
  seqTotal,
  reorderZones,
  setGymComments,
  updateZone,
  uploadZonePhoto,
  type Gym,
  type Route,
  type Zone,
} from "@/lib/data";
import { ago, daysUntil } from "@/lib/date";
import { GRADE_SYSTEMS } from "@/lib/design";
import { PLANS, planHas } from "@/lib/floorplan";
import { LIVE_GYM, SPRAY_WALLS } from "@/lib/gyms";
import { routePoints } from "@/lib/scoring";
import { useScoring } from "@/lib/useScoring";

type Confirm = { kind: "photo"; file: File } | { kind: "reset" } | { kind: "zone" } | { kind: "order"; ids: string[] } | null;

// 管理後台：選場館、全館留言開關、區域設定與照片、在照片上標路線、整區換線、員工
export default function AdminView() {
  const { access } = useAuth();
  const toast = useToast();
  const rules = useScoring();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [gymId, setGymId] = useState<string | null>(null);
  const [sprayId, setSprayId] = useState<string | null>(null); // 選了 Spray Wall 時（跟岩館分開管理）
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [sprayZones, setSprayZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [zoneCounts, setZoneCounts] = useState<Record<string, number>>({});
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
      const [all, progress] = await Promise.all([getZones(gymId), getZoneProgress(gymId)]);
      // Spray Wall 另外管理（公版照片），不放在平面圖與區域按鈕
      const zs = all.filter((z) => z.kind !== "spray");
      setSprayZones(all.filter((z) => z.kind === "spray"));
      setZones(zs);
      setZoneCounts(Object.fromEntries(progress.map((p) => [p.zone_id, p.route_count])));
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
      setZoneCounts((c) => ({ ...c, [zoneId]: rs.length }));
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
  // 可以管理的 Spray Wall：所在的館是自己能管理的館
  const walls = SPRAY_WALLS.filter((w) => gyms.some((g) => g.id === w.gymId));
  const spray = walls.find((w) => w.id === sprayId) ?? null;
  // 有平面圖的館：點圖選區域；圖上沒畫到的區域（例如新增的）放在下面的按鈕
  const plan = PLANS[gymId] ?? null;
  const offPlan = (zones ?? []).filter((z) => !planHas(plan, z.code));

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

  const saveOrder = (ids: string[]) =>
    run(async () => {
      await reorderZones(gymId, [...ids, ...sprayZones.map((z) => z.id)]); // Spray Wall 排在最後
      setConfirm(null);
      await loadZones();
      toast("已更新區域順序");
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
      {/* 目前在管理哪一館（頁首不放館名：後台不是在看某一館） */}
      <p className="mt-0 mb-3 text-sub">
        正在管理 <b>{spray ? spray.name : (gym?.name ?? "")}</b>
        <span className="text-meta text-muted">・你的身分：{roleLabel(access, gymId)}</span>
      </p>

      {(gyms.length > 1 || walls.length > 0) && (
        <ChipRow>
          {gyms.map((g) => (
            <Chip
              key={g.id}
              pressed={!spray && g.id === gymId}
              onClick={() => {
                setSprayId(null);
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
      {walls.length > 0 && (
        <>
          <p className="mt-0 mb-1.5 text-meta text-muted">Spray Wall（獨立管理）</p>
          <ChipRow>
            {walls.map((w) => (
              <Chip
                key={w.id}
                pressed={spray?.id === w.id}
                onClick={() => {
                  setSprayId(w.id);
                  setGymId(w.gymId);
                }}
              >
                {w.name}
              </Chip>
            ))}
          </ChipRow>
        </>
      )}

      {spray ? (
        <>
          <SprayAdmin key={spray.id} wall={spray} />
          <ShareQr />
        </>
      ) : (
        <>

      <SetBox>
        {manager ? (
          <Toggle checked={gym?.comments_enabled ?? true} onChange={toggleComments} label="開放顧客留言" hint="關閉後全館路線都不能留言" />
        ) : (
          <p className="my-3 text-sub">顧客留言：{gym?.comments_enabled ? "開放中" : "已關閉"}（店長可切換）</p>
        )}
      </SetBox>

      {plan && zones && zones.length > 0 && (
        <FloorPlan
          admin
          shape={plan}
          gymName={gym?.name ?? ""}
          selected={zone?.code}
          zones={zones.map((z) => ({ code: z.code, name: z.name, done: 0, total: zoneCounts[z.id] ?? 0, resetDays: daysUntil(z.next_reset_on) }))}
          onSelect={(code) => {
            const z = zones.find((x) => x.code === code);
            if (z) setZoneId(z.id);
          }}
        />
      )}

      {(offPlan.length > 0 || manager) && (
        <ChipRow>
          {offPlan.map((z) => (
            <Chip key={z.id} pressed={z.id === zoneId} onClick={() => setZoneId(z.id)}>
              {z.name}
            </Chip>
          ))}
          {manager && (
            <Chip pressed={false} onClick={() => setConfirm({ kind: "zone" })}>
              ＋ 新增區域
            </Chip>
          )}
          {manager && zones && zones.length > 1 && (
            <Chip pressed={false} onClick={() => setConfirm({ kind: "order", ids: zones.map((z) => z.id) })}>
              整理順序
            </Chip>
          )}
        </ChipRow>
      )}

      {!zones ? (
        <Empty>讀取中…</Empty>
      ) : !zone ? (
        <Empty>這間館還沒有區域{manager ? "，按「＋ 新增區域」建立。" : "，請店長先建立。"}</Empty>
      ) : (
        <>
          <SetBox>
            <Label htmlFor="zname">區域名稱{manager ? "" : "（店長可修改）"}</Label>
            <ZoneNameField key={`name-${zone.id}-${zone.name}`} name={zone.name} editable={manager} onSave={(v) => saveZone({ name: v }, "已更新區域名稱")} />
            <Label>等級制{manager ? "" : "（店長可切換）"}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {GRADE_SYSTEMS.map((g) => (
                <Chip
                  key={g.id}
                  pressed={zone.grade_system === g.id}
                  disabled={!manager || busy || (zone.grade_system !== g.id && routes.length > 0)}
                  onClick={() => zone.grade_system !== g.id && void saveZone({ grade_system: g.id }, g.done)}
                >
                  {g.label}
                </Chip>
              ))}
              {manager && routes.length > 0 && <span className="text-tiny text-muted">整區換線後才能切換</span>}
            </div>
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
                {access.can_edit_resets !== undefined && <small className="mt-1 block text-tiny text-muted">有換線公告時以公告為準（在「營運 → 📅 換線日」輸入）</small>}
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
          <Tip>
            {zone.grade_system === "endurance"
              ? "長耐力：點照片上的起攀點新增路線，再照順序點下一個點（最多 50 點）；點標記編輯、管理留言或下架。"
              : "點照片空白處新增路線，點標記編輯、管理留言或下架。"}
          </Tip>

          {routes.length ? (
            <RouteList>
              {routes.map((r) => (
                <RouteRow
                  key={r.id}
                  color={seqTotal(r) ? undefined : r.hold_color}
                  grade={r.grade}
                  title={
                    <>
                      {seqTotal(r) ? `${r.code}・${seqTotal(r)} 點` : `${r.hold_color}色 ${r.code}`}
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

          {/* 關掉時也重新讀路線：訊號差時「新增」其實可能已經存進去，要讓那個點出現，才不會在同一個位置再標一次 */}
          <RouteEditor
            zone={zone}
            photo={src}
            target={target}
            onClose={() => {
              setTarget(null);
              void loadRoutes();
            }}
            onChanged={loadRoutes}
          />
        </>
      )}

      {manager && gym && (
        <SetBox>
          <p className="mt-3 mb-1 text-meta text-muted">區域列表、Spray Wall 列表改用小縮圖，比較省流量。新上傳的照片會自動產生；之前上傳的舊照片按一次就補齊。</p>
          <LinkButton
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const n = await makeMissingThumbs(await getZones(gymId));
                toast(n ? `已補上 ${n} 張縮圖` : "所有照片都已經有縮圖了");
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "處理中…" : "幫舊照片產生縮圖"}
          </LinkButton>
        </SetBox>
      )}
      {gym && <VideoPanel gymId={gymId} gymName={gym.name} />}
      {manager && gym && <StaffPanel gymId={gymId} gymName={gym.name} />}
      {manager && gym && <AuditPanel gymId={gymId} gymName={gym.name} />}
      {access.is_owner && <ScoringPanel />}
      {access.is_owner && <FeedbackPanel />}
      <ShareQr />
        </>
      )}

      <Sheet open={!!confirm} onClose={() => setConfirm(null)}>
        {confirm?.kind === "photo" && zone && (
          <>
            <SheetTitle>更換 {zone.name} 照片</SheetTitle>
            <SheetSub>
              {zone?.grade_system === "endurance"
                ? `牆上還有 ${routes.length} 條長耐力路線，換照片後每條路線標的點都會對不上（點不能改）。請先整區換線再換照片。`
                : `牆上還有 ${routes.length} 條路線，換照片後起步點的位置可能會對不上。通常是整區換線後再換照片。`}
            </SheetSub>
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
            <SheetSub>{routes.length} 條路線會下架，顧客的紀錄和心得都會保留，顧客分享的影片會刪除。下架後記得上傳新照片、設定下次換線日。</SheetSub>
            <Button variant="danger" disabled={busy} onClick={resetZone}>
              確認下架
            </Button>
            <LinkButton onClick={() => setConfirm(null)}>取消</LinkButton>
          </>
        )}
        {confirm?.kind === "order" && zones && (
          <>
            <SheetTitle>整理區域順序</SheetTitle>
            <SheetSub>按住右邊「≡」上下拖曳，或用 ↑ ↓ 調整。顧客首頁的區域也會照這個順序；平面圖上的位置不會變。</SheetSub>
            <SortList
              items={confirm.ids.map((id) => {
                const z = zones.find((x) => x.id === id)!;
                return { id, label: z.name, sub: z.code };
              })}
              onChange={(ids) => setConfirm({ kind: "order", ids })}
            />
            <Button variant="primary" className="mt-4" disabled={busy} onClick={() => saveOrder(confirm.ids)}>
              儲存順序
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

// 區域名稱：改了之後按「儲存名稱」、鍵盤右下角的鍵（完成），或點別的地方都會存；同一個名字只送一次，存失敗可以再按
function ZoneNameField({ name, editable, onSave }: { name: string; editable: boolean; onSave: (v: string) => Promise<void> }) {
  const [value, setValue] = useState(name);
  const sent = useRef<string | null>(null);
  const v = value.trim();
  const dirty = editable && !!v && v !== name;
  const save = () => {
    if (!dirty || sent.current === v) return;
    sent.current = v;
    void onSave(v).finally(() => (sent.current = null));
  };
  return (
    <>
      <TextField
        id="zname"
        value={value}
        readOnly={!editable}
        maxLength={20}
        enterKeyHint="done"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // 注音、拼音選字時按的 Enter 只是選字，不存（打到一半的名字不會被存起來）
          if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          save();
          e.currentTarget.blur();
        }}
        onBlur={save}
      />
      {dirty && (
        <Button variant="primary" className="mt-2" onClick={save}>
          儲存名稱
        </Button>
      )}
    </>
  );
}
