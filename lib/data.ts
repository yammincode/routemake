// 讀寫 Supabase 的資料函式；權限一律由資料庫 RLS 擋，這裡只負責呼叫
import { isYds, type ClimbMove, type FeelTag, type GradeSystem, type HeightBand, type HoldColor, type Status } from "@/lib/design";
import type { ResetEvent } from "@/lib/resets";
import { dayStartIso } from "@/lib/date";
import { NETWORK_RE } from "@/lib/net";
import type { ScoringRules } from "@/lib/scoring";
import { supabase } from "@/lib/supabase";

export type Gym = { id: string; name: string; is_live: boolean; comments_enabled: boolean; sort: number };
export type Zone = {
  id: string;
  gym_id: string;
  code: string;
  name: string;
  photo_path: string | null;
  photo_width: number | null;
  photo_height: number | null;
  next_reset_on: string | null;
  sort: number;
  grade_system: GradeSystem;
  kind?: "wall" | "spray";
};
export type ZoneProgress = {
  zone_id: string;
  code: string;
  name: string;
  sort: number;
  photo_path: string | null;
  next_reset_on: string | null;
  route_count: number;
  done_count: number;
};
export type Route = {
  id: string;
  zone_id: string;
  code: string;
  grade: number;
  hold_color: HoldColor;
  style_tags: string[];
  setter_note: string | null;
  pin_x: number;
  pin_y: number;
  comments_enabled: boolean;
  created_at: string;
  archived_at: string | null;
  // Spray Wall：岩館路線 gym／岩友路線 community；名稱、介紹、圈圈、出題者
  kind?: "gym" | "community";
  name?: string | null;
  description?: string | null;
  holds?: Hold[] | null;
  created_by?: string | null;
};
// Spray Wall 圈圈：x、y 是照片上的百分比；t = s 起攀／h 路線點／t 完攀；r 大小 1–3
export type Hold = { x: number; y: number; t: "s" | "h" | "t"; r?: 1 | 2 | 3 };
export type Ascent = {
  id: string;
  route_id: string;
  status: Status;
  climbed_on: string;
  feel: number | null;
  grade_feel: number | null;
  private_note: string | null;
  highpoint?: number | null; // 長耐力：最高爬到第幾點（Flash、完攀＝最後一點；其他路線沒有）
};
// 長耐力路線：照順序標的點（holds 2–50 個，第 1 點是起步點）；Spray Wall 的路線不算
export const seqTotal = (r: Pick<Route, "holds" | "name">): number => (!r.name && r.holds && r.holds.length >= 2 ? r.holds.length : 0);
// 資料庫還沒套用 step30（ascents 沒有 highpoint 欄位）：讀寫紀錄時自動退回原本的欄位
// 沒有欄位時先記住一分鐘（不用每次都多問一次）；過了再試，店長中途套用 step30 不用重開 App 也會讀到最高點
const NO_COLUMN = new Set(["42703", "PGRST204"]);
let noHighpointAt = 0;
const hasHighpoint = () => Date.now() - noHighpointAt > 60_000;
export type Comment = {
  id: string;
  route_id: string;
  user_id: string;
  body: string;
  created_at: string;
  nickname: string;
  likers: string[]; // 按讚的人（user id）
  edited_at: string | null;
};
export type Staff = { user_id: string; gym_id: string; role: "setter" | "manager"; nickname: string | null };

const ROUTE_COLS = "id,zone_id,code,grade,hold_color,style_tags,setter_note,pin_x,pin_y,comments_enabled,created_at,archived_at,kind,name,description,holds,created_by";
const ZONE_COLS = "id,gym_id,code,name,photo_path,photo_width,photo_height,next_reset_on,sort,grade_system,kind";

// 資料庫錯誤轉成中文（資料庫的中文訊息直接顯示）
export function dbError(e: { message?: string; code?: string } | null | undefined): string {
  const m = e?.message ?? "";
  if (/[一-鿿]/.test(m)) return m;
  if (e?.code === "42501" || m.includes("row-level security") || m.includes("permission denied")) return "沒有權限";
  if (e?.code === "23503") return "還有資料在使用，不能刪除";
  if (e?.code === "23505") return "已經有相同的資料";
  // 新的岩點顏色（咖啡）：資料庫還沒套用 step33 時存不進去
  if (e?.code === "23514" && m.includes("hold_color")) return "資料庫還沒套用新的岩點顏色（step33），請先請老闆在 Supabase 執行 step33";
  // 上攀影片 3 分鐘、100 MB：資料庫還沒套用 step36 時，超過 60 秒、50 MB 的存不進去
  if (e?.code === "23514" && (m.includes("duration_s") || m.includes("size_bytes"))) return "這支影片太長：目前每支最長 60 秒（上攀 3 分鐘還沒開放），請先剪短再分享";
  // 沒網路：各家瀏覽器的訊息不一樣（Chrome「Failed to fetch」、iPhone「Load failed」…）
  if (NETWORK_RE.test(m)) return "連不上網路，請確認網路後再試";
  return "發生錯誤，請稍後再試";
}
// 之後可以再送一次的錯誤：沒網路、伺服器暫時出錯（沒有錯誤代碼、連不上資料庫、逾時）、登入憑證過期（等換新）
// 其他有錯誤代碼的（日期不合法、沒有權限…）再送也一樣，不用重送
const RETRY_CODE = /^(PGRST[03]|08|40|53|57)/;
const retryable = (e: { message?: string; code?: string }) => NETWORK_RE.test(e.message ?? "") || !e.code || RETRY_CODE.test(e.code);
// 資料庫錯誤：訊息是給人看的中文；code 是原本的錯誤代碼；retry＝之後可以再送一次
export class DbError extends Error {
  code?: string;
  retry: boolean;
  constructor(e: { message?: string; code?: string }) {
    super(dbError(e));
    this.code = e.code || undefined;
    this.retry = retryable(e);
  }
}
function must<T>(r: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (r.error) throw new DbError(r.error);
  return r.data as T;
}

export const photoUrl = (path: string | null) =>
  path ? supabase().storage.from("zone-photos").getPublicUrl(path).data.publicUrl : null;
// 長耐力路線卡片的照片：下架後區域換了新照片（檔名裡的上傳時間晚於下架），舊路線的點對不上新照片，就不畫
export const seqPhotoUrl = (r: Pick<Route, "archived_at">, path: string | null) => {
  const uploaded = Number(path?.match(/-(\d{13})\.jpg$/i)?.[1] ?? 0);
  return r.archived_at && uploaded > Date.parse(r.archived_at) ? null : photoUrl(path);
};
// 小縮圖（約 720 寬、幾十 KB）：跟原圖放在一起，檔名多 .thumb；舊照片還沒有縮圖時畫面會自動改用原圖
export const THUMB_WIDTH = 720;
export const thumbPath = (path: string) => path.replace(/\.jpg$/i, ".thumb.jpg");
export const thumbUrl = (path: string | null) => (path && /\.jpg$/i.test(path) ? photoUrl(thumbPath(path)) : photoUrl(path));

// ---------- 讀取 ----------
export async function getGyms(): Promise<Gym[]> {
  return must(await supabase().from("gyms").select("id,name,is_live,comments_enabled,sort").order("sort"));
}
export async function getGym(id: string): Promise<Gym> {
  return must(await supabase().from("gyms").select("id,name,is_live,comments_enabled,sort").eq("id", id).single());
}
export async function getZoneProgress(gym: string): Promise<ZoneProgress[]> {
  return must(await supabase().rpc("zone_progress", { p_gym: gym }));
}
export async function getZones(gym: string): Promise<Zone[]> {
  return must(await supabase().from("zones").select(ZONE_COLS).eq("gym_id", gym).order("sort").order("code"));
}
// 這間館的區域順序（跟館首頁區域卡片一樣：照排序、代碼，不含 Spray Wall）：區域頁的上一區／下一區
export type ZoneLink = { id: string; name: string };
export async function getZoneOrder(gym: string): Promise<ZoneLink[]> {
  const rows = must(await supabase().from("zones").select("id,name,kind").eq("gym_id", gym).order("sort").order("code")) as (ZoneLink & { kind?: string })[];
  return rows.filter((z) => z.kind !== "spray").map(({ id, name }) => ({ id, name }));
}
export async function getZone(id: string): Promise<Zone> {
  return must(await supabase().from("zones").select(ZONE_COLS).eq("id", id).single());
}
export async function getRoute(id: string): Promise<Route> {
  return must(await supabase().from("routes").select(ROUTE_COLS).eq("id", id).single());
}
// 區域目前牆上的路線
export async function getActiveRoutes(zoneId: string): Promise<Route[]> {
  return must(
    await supabase().from("routes").select(ROUTE_COLS).eq("zone_id", zoneId).is("archived_at", null).order("grade").order("code")
  );
}
// 區域頁需要的資料一次拿齊（區域、場館、路線、自己的紀錄、留言數），只問資料庫一次
// cs 留言數、vs 影片數（資料庫還沒套用 step38 時沒有 vs）
export type ZoneData = { z: Zone; g: Gym; rs: Route[]; as: Record<string, Ascent>; cs: Record<string, number>; vs?: Record<string, number> };
// 區域頁先讀好（滑向下一區時先讀那一區）：區域頁打開時直接拿這份，不再問一次；15 秒內有效
// 每個帳號分開記（資料裡有自己的紀錄和私人心得，換帳號後不能拿到別人先讀的）
const zoneAhead = new Map<string, { p: Promise<ZoneData>; t: number }>();
const aheadKey = (zoneId: string, uid?: string) => `${uid ?? "guest"}:${zoneId}`;
export function readZoneAhead(zoneId: string, uid?: string): Promise<ZoneData> {
  const k = aheadKey(zoneId, uid);
  const old = zoneAhead.get(k);
  if (old && Date.now() - old.t < 15000) return old.p;
  const p = getZoneView(zoneId);
  zoneAhead.set(k, { p, t: Date.now() });
  p.catch(() => zoneAhead.delete(k));
  return p;
}
export function takeZoneAhead(zoneId: string, uid?: string): Promise<ZoneData> | null {
  const k = aheadKey(zoneId, uid);
  const old = zoneAhead.get(k);
  zoneAhead.delete(k);
  return old && Date.now() - old.t < 15000 ? old.p : null;
}
export async function getZoneView(zoneId: string): Promise<ZoneData> {
  const r = await supabase().rpc("zone_view", { p_zone: zoneId });
  // 資料庫還沒套用 step17（沒有 zone_view）時，改用原本分開問的方式
  if (r.error?.code === "PGRST202") return getZoneViewSlow(zoneId);
  const d = must(r) as ZoneData | null;
  if (!d?.z) throw new Error("找不到這個區域");
  return d;
}
async function getZoneViewSlow(zoneId: string): Promise<ZoneData> {
  const z = await getZone(zoneId);
  const [g, rs] = await Promise.all([getGym(z.gym_id), getActiveRoutes(zoneId)]);
  const ids = rs.map((r) => r.id);
  const uid = (await supabase().auth.getSession()).data.session?.user.id;
  const [as, cs] = await Promise.all([uid ? getMyAscents(ids) : Promise.resolve({}), getCommentCounts(ids)]);
  return { z, g, rs, as, cs };
}
// 場館 7 天內的新路線
export async function getNewRoutes(gym: string): Promise<(Route & { zone_name: string })[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = must(
    await supabase()
      .from("routes")
      .select(`${ROUTE_COLS},zones!inner(gym_id,name,kind)`)
      .eq("zones.gym_id", gym)
      .eq("zones.kind", "wall")
      .is("archived_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
  ) as unknown as (Route & { zones: { name: string } })[];
  return rows.map((r) => ({ ...r, zone_name: r.zones.name }));
}
// 場館牆上每條路線的難度和設定時間（首頁的難度色帶、全館難度分布、NEW）；只抓這幾個欄位，幾 KB 而已
export type GradeRow = { zone_id: string; grade: number; created_at: string };
export async function getGymGrades(gym: string): Promise<GradeRow[]> {
  const rows = must(
    await supabase()
      .from("routes")
      .select("zone_id,grade,created_at,zones!inner(gym_id,kind)")
      .eq("zones.gym_id", gym)
      .eq("zones.kind", "wall")
      .is("archived_at", null)
  ) as unknown as (GradeRow & { zones: unknown })[];
  return rows.map(({ zone_id, grade, created_at }) => ({ zone_id, grade, created_at }));
}
// ---------- 換線公告 ----------
// 一段日期內各館的換線公告（大家都看得到）；資料庫還沒套用 step27 時當作沒有公告
export async function getResetCalendar(from: string, to: string): Promise<ResetEvent[]> {
  const r = await supabase().rpc("reset_calendar", { p_from: from, p_to: to });
  if (r.error?.code === "PGRST202") return [];
  return must(r) as ResetEvent[];
}
export type ResetInput = { gym_id: string; label: string; zone_ids: string[]; starts_on: string; ends_on: string };
// 資料庫還沒套用 step27（沒有換線公告的表和函式）時，給看得懂的說明
const NO_RESETS = "資料庫還沒套用換線日設定（step27），請先請老闆在 Supabase 執行 step27";
function mustResets<T>(r: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (r.error?.code === "PGRST202" || r.error?.code === "PGRST205" || r.error?.code === "42P01") throw new Error(NO_RESETS);
  return must(r);
}
// 修改、刪除：權限不夠或那一筆已經被刪掉時，資料庫不會報錯、只是改不到，這裡要自己檢查
export async function saveResetEvent(input: ResetInput, id?: string) {
  if (id) {
    const rows = mustResets(await supabase().from("reset_events").update(input).eq("id", id).select("id"));
    if (!rows.length) throw new Error("沒有權限，或這筆換線日已經被刪掉了");
  } else mustResets(await supabase().from("reset_events").insert(input).select("id"));
}
export async function deleteResetEvent(id: string) {
  const rows = mustResets(await supabase().from("reset_events").delete().eq("id", id).select("id"));
  if (!rows.length) throw new Error("沒有權限，或這筆換線日已經被刪掉了");
}
// 老闆：可以輸入換線日的人
export async function getResetEditors(): Promise<{ id: string; username: string | null; nickname: string | null }[]> {
  return mustResets(await supabase().rpc("reset_editor_list"));
}
export async function setResetEditor(userId: string, on: boolean) {
  mustResets(await supabase().rpc("set_reset_editor", { p_user: userId, p_on: on }));
}

// ---------- 營運權限（老闆授權誰看哪幾館的使用狀況） ----------
const NO_OPS = "資料庫還沒套用營運權限設定（step28），請先請老闆在 Supabase 執行 step28";
function mustOps<T>(r: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (r.error?.code === "PGRST202" || r.error?.code === "PGRST205" || r.error?.code === "42P01") throw new Error(NO_OPS);
  return must(r);
}
export type UsageViewer = { id: string; username: string | null; nickname: string | null; gym_ids: string[] };
export async function getUsageViewers(): Promise<UsageViewer[]> {
  return mustOps(await supabase().rpc("usage_viewer_list")) ?? [];
}
export async function setUsageViewer(userId: string, gym: string, on: boolean) {
  mustOps(await supabase().rpc("set_usage_viewer", { p_user: userId, p_gym: gym, p_on: on }));
}

// 自己在這些路線上的紀錄（RLS 只回傳自己的）
// 路線 id 放在網址裡：一次最多 80 條（全館幾百條一起查，網址太長會被伺服器拒絕）
const IDS_PER_QUERY = 80;
export async function getMyAscents(routeIds: string[]): Promise<Record<string, Ascent>> {
  const chunks: string[][] = [];
  for (let i = 0; i < routeIds.length; i += IDS_PER_QUERY) chunks.push(routeIds.slice(i, i + IDS_PER_QUERY));
  const parts = await Promise.all(chunks.map(myAscentsIn));
  return Object.fromEntries(parts.flat().map((a) => [a.route_id, a]));
}
async function myAscentsIn(routeIds: string[]): Promise<Ascent[]> {
  const cols: string = "id,route_id,status,climbed_on,feel,grade_feel,private_note";
  const high = hasHighpoint();
  let r = await supabase().from("ascents").select(high ? `${cols},highpoint` : cols).in("route_id", routeIds);
  if (high && NO_COLUMN.has(r.error?.code ?? "")) {
    noHighpointAt = Date.now();
    r = await supabase().from("ascents").select(cols).in("route_id", routeIds);
  }
  return must(r) as unknown as Ascent[];
}
export async function getComments(routeId: string): Promise<Comment[]> {
  const rows = must(
    await supabase()
      .from("comments")
      .select("id,route_id,user_id,body,created_at,edited_at,profiles!comments_user_id_fkey(nickname),comment_likes(user_id)")
      .eq("route_id", routeId)
      .order("created_at")
  ) as unknown as (Omit<Comment, "nickname" | "likers"> & {
    profiles: { nickname: string | null } | null;
    comment_likes: { user_id: string }[] | null;
  })[];
  return rows.map(({ profiles, comment_likes, ...c }) => ({
    ...c,
    nickname: profiles?.nickname ?? "攀岩者",
    likers: (comment_likes ?? []).map((l) => l.user_id),
  }));
}
export async function getCommentCounts(routeIds: string[]): Promise<Record<string, number>> {
  if (!routeIds.length) return {};
  const rows = must(await supabase().from("comments").select("route_id").in("route_id", routeIds)) as { route_id: string }[];
  return rows.reduce<Record<string, number>>((m, r) => ((m[r.route_id] = (m[r.route_id] ?? 0) + 1), m), {});
}

// ---------- 顧客：紀錄與留言 ----------
export async function saveAscent(userId: string, routeId: string, a: Omit<Ascent, "id" | "route_id">) {
  // 只有長耐力路線才送最高點（資料庫還沒套用 step30 時，送了不存在的欄位會整筆存不進去）
  // 長耐力的嘗試中沒選最高點也要送 null：不然從完攀改回嘗試中時，資料庫會留著原本的最後一點
  const { highpoint, ...rest } = a;
  const row = highpoint !== undefined ? { ...rest, highpoint } : rest;
  must(
    await supabase()
      .from("ascents")
      .upsert({ user_id: userId, route_id: routeId, ...row }, { onConflict: "user_id,route_id" })
  );
}
// 手機現在登入的是不是這個人、而且登入有效（過期會先試著換新；換新失敗時 Supabase 不會給登入）
// 離線排隊的紀錄送出前用：登入過期時 Supabase 會改用未登入的身分送，資料庫會回「沒有權限」，紀錄就被丟掉
export async function signedInAs(userId: string): Promise<boolean> {
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id === userId;
}
// 只刪自己的（資料庫也只讓本人刪；離線排隊的「清除」送出時如果換了人登入，不會刪到別人的）
export async function clearAscent(userId: string, routeId: string) {
  must(await supabase().from("ascents").delete().eq("user_id", userId).eq("route_id", routeId));
}
// 每人每條路線只能留一則（資料庫擋），重複時提示改用編輯
export async function postComment(routeId: string, body: string) {
  const r = await supabase().from("comments").insert({ route_id: routeId, body });
  if (r.error?.code === "23505") throw new Error("每條路線只能留一則留言，可以編輯或刪除後再留");
  must(r);
}
export async function editComment(id: string, body: string) {
  must(await supabase().rpc("edit_comment", { p_comment: id, p_body: body }));
}
// 留言按讚 👍／收回
export async function likeComment(id: string) {
  must(await supabase().from("comment_likes").insert({ comment_id: id }));
}
export async function unlikeComment(id: string) {
  must(await supabase().from("comment_likes").delete().eq("comment_id", id));
}
export async function deleteComment(id: string) {
  must(await supabase().rpc("delete_comment", { p_comment: id }));
}

// ---------- 管理後台 ----------
export async function setGymComments(gym: string, enabled: boolean) {
  must(await supabase().from("gyms").update({ comments_enabled: enabled }).eq("id", gym));
}
export async function updateZone(id: string, patch: Partial<Pick<Zone, "name" | "next_reset_on" | "photo_path" | "photo_width" | "photo_height" | "grade_system">>) {
  must(await supabase().from("zones").update(patch).eq("id", id));
}
export async function createZone(gym: string, code: string, name: string, sort: number): Promise<Zone> {
  return must(await supabase().from("zones").insert({ gym_id: gym, code, name, sort }).select(ZONE_COLS).single());
}
// 區域順序：傳入這間館全部區域的 id，依序排列（只有店長、老闆）
export async function reorderZones(gym: string, ids: string[]) {
  must(await supabase().rpc("reorder_zones", { p_gym: gym, p_zones: ids }));
}
// 新的 id（UUID v4）：手機先產生，重送時資料庫認得是同一筆
// 不用 crypto.randomUUID：試用版用 http://192.168… 開時瀏覽器不提供
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// holds：長耐力路線照順序標的點（其他區域不給）
export type RouteInput = Pick<Route, "grade" | "hold_color" | "style_tags" | "setter_note" | "comments_enabled"> & { holds?: { x: number; y: number }[] };
const SAVE_WAIT_MS = 15000;
// 新增路線：id 由手機產生（同一次新增重按都用同一個 id）
// 訊號差時資料可能已經存進去、只是手機沒收到回覆：重按時資料庫回「已經有這筆」，就直接拿那一筆，不會多一條
// 最多等 15 秒，不會一直卡在「儲存中」
export async function createRoute(zoneId: string, input: RouteInput, x: number, y: number, id = newId()): Promise<Route> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SAVE_WAIT_MS);
  try {
    const r = await supabase()
      .from("routes")
      .insert({ id, zone_id: zoneId, ...input, pin_x: +x.toFixed(3), pin_y: +y.toFixed(3) })
      .select(ROUTE_COLS)
      .abortSignal(ctl.signal)
      .single();
    if (r.error?.code === "23505") {
      const got = await supabase().from("routes").select(ROUTE_COLS).eq("id", id).maybeSingle();
      if (got.data) {
        const old = got.data as Route;
        // 重按前改過顏色、難度等：照這次填的更新
        const changed = (Object.keys(input) as (keyof RouteInput)[]).some((k) => JSON.stringify(old[k]) !== JSON.stringify(input[k]));
        if (changed) await updateRoute(id, input);
        return { ...old, ...input, holds: old.holds };
      }
    }
    if (ctl.signal.aborted) throw new Error("網路太慢，請確認網路後再按一次（不會多一條）");
    return must(r) as Route;
  } finally {
    clearTimeout(timer);
  }
}
export async function updateRoute(id: string, input: RouteInput) {
  must(await supabase().from("routes").update(input).eq("id", id));
}
// 長耐力：這條路線有沒有人記錄過（有的話點不能再改）；資料庫還沒套用 step30 時當作沒有
export async function routeHasAscents(id: string): Promise<boolean> {
  const r = await supabase().rpc("route_has_ascents", { p_route: id });
  if (r.error?.code === "PGRST202") return false;
  return !!must(r);
}
// 下架時資料庫會刪掉影片資料，App 再刪 Storage 的檔案（先取得路徑；員工，或岩友下架自己出的路線）
export async function archiveRoute(id: string) {
  const paths = await videoPathsFor([id]);
  must(await supabase().from("routes").update({ archived_at: new Date().toISOString() }).eq("id", id));
  await removeVideoFiles(paths);
}
export async function archiveZone(zoneId: string): Promise<number> {
  const paths = await videoPathsForZone(zoneId);
  const n = must(await supabase().rpc("archive_zone", { p_zone: zoneId })) as number;
  await removeVideoFiles(paths);
  return n;
}

// 照片：瀏覽器先壓到寬 1600px 的 JPEG 再上傳
export async function shrinkImage(file: Blob, maxWidth = 1600): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bmp.width);
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("照片處理失敗"))), "image/jpeg", 0.82));
  return { blob, width, height };
}
export async function uploadZonePhoto(zone: Zone, file: File) {
  const { blob, width, height } = await shrinkImage(file);
  const path = `${zone.gym_id}/zones/${zone.code}-${Date.now()}.jpg`;
  const up = await supabase().storage.from("zone-photos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (up.error) throw new Error(up.error.message.includes("row-level") ? "沒有權限上傳照片" : "照片上傳失敗，請再試一次");
  await uploadThumb(path, blob).catch(() => undefined); // 縮圖失敗不影響，畫面會改用原圖
  // 換 Spray Wall 公版照片：資料庫會把整面牆的路線下架、刪掉影片資料，App 先拿到影片檔路徑，換好再刪檔
  const videoPaths = zone.kind === "spray" ? await videoPathsForZone(zone.id) : [];
  await updateZone(zone.id, { photo_path: path, photo_width: width, photo_height: height });
  await removeVideoFiles(videoPaths);
  return path;
}
// 整區在牆上路線的影片檔路徑（資料庫一次回傳整個清單，不受一次最多 1000 筆的限制）
// 資料庫還沒執行 step34（沒有這個函式）時，改用路線清單查
async function videoPathsForZone(zoneId: string): Promise<string[]> {
  const r = await supabase().rpc("video_paths_for_zone", { p_zone: zoneId });
  if (r.error?.code !== "PGRST202") return must(r) as string[];
  const ids = (must(await supabase().from("routes").select("id").eq("zone_id", zoneId).is("archived_at", null)) as { id: string }[]).map((x) => x.id);
  return videoPathsFor(ids);
}
async function uploadThumb(path: string, image: Blob) {
  const { blob } = await shrinkImage(image, THUMB_WIDTH);
  const up = await supabase().storage.from("zone-photos").upload(thumbPath(path), blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
  if (up.error) throw new Error(up.error.message);
}
// 幫還沒有縮圖的舊照片補上縮圖（店長在後台按一次）；回傳補了幾張
export async function makeMissingThumbs(zones: Zone[]): Promise<number> {
  let n = 0;
  for (const z of zones) {
    if (!z.photo_path || !/\.jpg$/i.test(z.photo_path)) continue;
    const head = await fetch(photoUrl(thumbPath(z.photo_path))!, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (head?.ok) continue;
    const full = await fetch(photoUrl(z.photo_path)!);
    if (!full.ok) continue;
    await uploadThumb(z.photo_path, await full.blob());
    n++;
  }
  return n;
}

// 員工
export async function getStaff(gym: string): Promise<Staff[]> {
  const rows = must(
    await supabase().from("staff_roles").select("user_id,gym_id,role,profiles(nickname)").eq("gym_id", gym).order("role")
  ) as unknown as (Omit<Staff, "nickname"> & { profiles: { nickname: string | null } | null })[];
  return rows.map(({ profiles, ...s }) => ({ ...s, nickname: profiles?.nickname ?? null }));
}
// 店長、老闆指派員工時搜尋會員（暱稱或帳號名稱），附上對方在這間館的角色
export type UserHit = { id: string; username: string; nickname: string | null; role: "setter" | "manager" | null };
export async function searchUsers(query: string, gym: string): Promise<UserHit[]> {
  return must(await supabase().rpc("search_users", { p_query: query, p_gym: gym })) ?? [];
}
export async function assignStaffUser(userId: string, gym: string, role: "setter" | "manager") {
  must(await supabase().rpc("assign_staff_user", { p_user: userId, p_gym: gym, p_role: role }));
}
export async function removeStaff(userId: string, gym: string) {
  must(await supabase().rpc("remove_staff", { p_user: userId, p_gym: gym }));
}

// ---------- 我的紀錄 ----------
export type MonthStats = {
  sends: number;
  flashes: number;
  days: number;
  top_grade: number | null;
  top_yds?: number | null;
  by_grade: Record<string, number>;
  by_day: Record<string, number>;
  prev_sends: number;
  total_sends: number;
};
export async function getMonthlyStats(year: number, month: number): Promise<MonthStats> {
  return must(await supabase().rpc("monthly_stats", { p_year: year, p_month: month }));
}
export type MonthAscent = Ascent & { route: Route & { zone_name: string; gym_id: string; zone_photo?: string | null } };
// 這個月的完攀（Flash＋完攀），含路線與區域
export async function getMonthAscents(year: number, month: number): Promise<MonthAscent[]> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  // 完攀、Flash，加上長耐力沒爬完但有最高點的（照比例有分數）
  const query = (withHigh: boolean) =>
    supabase()
      .from("ascents")
      .select(`id,route_id,status,climbed_on,feel,grade_feel,private_note,${withHigh ? "highpoint," : ""}updated_at,routes(${ROUTE_COLS},zones(name,gym_id,photo_path))`)
      .or(withHigh ? "status.in.(flash,send),highpoint.not.is.null" : "status.in.(flash,send)")
      .gte("climbed_on", from)
      .lt("climbed_on", next)
      .order("climbed_on", { ascending: false })
      .order("updated_at", { ascending: false });
  const high = hasHighpoint();
  let res = await query(high);
  if (high && NO_COLUMN.has(res.error?.code ?? "")) {
    noHighpointAt = Date.now();
    res = await query(false);
  }
  const rows = must(res) as unknown as (Ascent & { routes: Route & { zones: { name: string; gym_id: string; photo_path: string | null } } })[];
  return rows.map(({ routes, ...a }) => {
    const { zones, ...r } = routes;
    return { ...a, route: { ...r, zone_name: zones.name, gym_id: zones.gym_id, zone_photo: zones.photo_path } };
  });
}
// ---------- 路線進度（我的紀錄）----------
// 資料庫一次最多回 1000 筆，超過就一頁一頁讀（要照固定的順序排，換頁才不會重複或漏掉）
const PAGE_ROWS = 1000;
async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const rows = must(await page(from, from + PAGE_ROWS - 1)) as T[];
    out.push(...rows);
    if (rows.length < PAGE_ROWS) return out;
  }
}
// 牆上進度：開放的館現在牆上所有路線（Spray Wall 不算）；只抓 id、難度、館，五間館幾百條也才幾十 KB
export type WallRoute = { id: string; grade: number; gym_id: string };
export async function getLiveWallRoutes(): Promise<WallRoute[]> {
  const rows = await allPages<{ id: string; grade: number; zones: { gym_id: string } }>((from, to) =>
    supabase()
      .from("routes")
      .select("id,grade,zones!inner(gym_id,kind,gyms!inner(is_live))")
      .eq("zones.kind", "wall")
      .eq("zones.gyms.is_live", true)
      .is("archived_at", null)
      .order("id")
      .range(from, to)
  );
  return rows.map((r) => ({ id: r.id, grade: r.grade, gym_id: r.zones.gym_id }));
}
// 我的進度、牆上進度：自己 Flash 或完攀過的岩館路線（跟「累計完攀」一樣：換線拆掉的、Spray Wall 上員工出的也算，岩友路線不算）
export type MySend = { route_id: string; grade: number; gym_id: string };
export async function getMySends(uid: string): Promise<MySend[]> {
  const rows = await allPages<{ route_id: string; routes: { grade: number; zones: { gym_id: string } } }>((from, to) =>
    supabase()
      .from("ascents")
      .select("route_id,routes!inner(grade,kind,zones!inner(gym_id))")
      .eq("user_id", uid)
      .in("status", ["flash", "send"])
      .eq("routes.kind", "gym")
      .order("route_id")
      .range(from, to)
  );
  return rows.map((a) => ({ route_id: a.route_id, grade: a.routes.grade, gym_id: a.routes.zones.gym_id }));
}

// ---------- 積分 ----------
export type PointsSummary = {
  by_day: Record<string, number>;
  month_total: number;
  prev_total: number;
  today: number;
  avg7: number;
  best_day: { day: string; points: number } | null;
  streak: number;
  total: number;
};
export async function getScoringRules(): Promise<ScoringRules> {
  return must(await supabase().from("scoring_rules").select("*").eq("id", 1).single());
}
export async function updateScoringRules(r: ScoringRules) {
  const { grade_points, vb_points, yds_points, style_bonus, max_style_bonus, flash_multiplier } = r;
  must(await supabase().from("scoring_rules").update({ grade_points, vb_points, yds_points, style_bonus, max_style_bonus, flash_multiplier }).eq("id", 1));
}
export async function getPointsSummary(year: number, month: number): Promise<PointsSummary> {
  return must(await supabase().rpc("points_summary", { p_year: year, p_month: month }));
}

// ---------- 操作紀錄（店長、老闆） ----------
export type AuditEntry = {
  id: number;
  gym_id: string | null;
  action: string;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  nickname: string | null;
};
// 這間館的操作紀錄（老闆另外看得到全館共用的，例如計分規則），新的在前
export async function getAuditLog(gym: string, opts: { before?: number; actions?: string[]; limit?: number } = {}): Promise<AuditEntry[]> {
  let q = supabase()
    .from("audit_log")
    .select("id,gym_id,action,target_id,detail,created_at,profiles(nickname)")
    .or(`gym_id.eq.${gym},gym_id.is.null`)
    .order("id", { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.before) q = q.lt("id", opts.before);
  if (opts.actions?.length) q = q.in("action", opts.actions);
  const rows = must(await q) as unknown as (Omit<AuditEntry, "nickname"> & { profiles: { nickname: string | null } | null })[];
  return rows.map(({ profiles, ...a }) => ({ ...a, nickname: profiles?.nickname ?? null }));
}

// ---------- 顧客分享影片 ----------
// 影片長度、大小上限：上攀（YDS）一趟比較久，最長 3 分鐘、100 MB；抱石、長耐力、Spray Wall 60 秒、50 MB
// （資料庫依區域同樣檢查，見 migration 0041）
export type VideoLimit = { seconds: number; bytes: number };
export const VIDEO_LIMIT: VideoLimit = { seconds: 60, bytes: 50 * 1024 * 1024 };
export const ROPE_VIDEO_LIMIT: VideoLimit = { seconds: 180, bytes: 100 * 1024 * 1024 };
export const videoLimit = (r: Pick<Route, "grade" | "holds" | "name">): VideoLimit => (isYds(r.grade) && !seqTotal(r) ? ROPE_VIDEO_LIMIT : VIDEO_LIMIT);
// 測試用：調低長度上限（不用真的錄一支 60 秒以上的影片）；上攀照比例放寬
export const videoMaxSeconds = (lim: VideoLimit = VIDEO_LIMIT) => {
  const t = typeof window !== "undefined" ? (window as Window & { __RM_VIDEO_MAX?: number }).__RM_VIDEO_MAX : undefined;
  return t ? (t * lim.seconds) / VIDEO_LIMIT.seconds : lim.seconds;
};
// 「45 秒」「3 分鐘」「3 分 20 秒」
export const durText = (s: number) => {
  const t = Math.round(s);
  if (t < 120) return `${t} 秒`;
  return t % 60 ? `${Math.floor(t / 60)} 分 ${t % 60} 秒` : `${t / 60} 分鐘`;
};
const mb = (bytes: number) => Math.round(bytes / 1048576);
export const VIDEO_DAILY_LIMIT = 15;
const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

export type Video = {
  id: string;
  route_id: string;
  user_id: string;
  path: string;
  caption: string | null;
  status: Status | null;
  duration_s: number | null;
  height_band?: HeightBand | null; // 資料庫還沒套用 step25 時沒有這兩個欄位
  move?: ClimbMove | null;
  feel_tags?: FeelTag[]; // 型態（資料庫還沒套用 step35 時沒有）
  climbed_on?: string | null; // 分享者在這條的攀爬日（分享時由資料庫從本人紀錄帶入；沒有紀錄、或資料庫還沒套用 step34 時沒有）
  thumb_path?: string | null; // 縮圖（video-thumbs）；舊影片還沒補、或資料庫還沒套用 step38 時沒有
  likers?: string[]; // 按讚的人（user id）；資料庫還沒套用 step42 時沒有（不顯示讚）
  created_at: string;
  nickname: string;
};
export type GymVideo = Video & { route_code: string; zone_name: string };
const VIDEO_BASE = "id,route_id,user_id,path,caption,status,duration_s,created_at,profiles!route_videos_user_id_fkey(nickname)";
const VIDEO_TAGS = `${VIDEO_BASE},height_band,move`;
const VIDEO_DAYS = `${VIDEO_TAGS},climbed_on`;
const VIDEO_COLS = `${VIDEO_DAYS},feel_tags`;
type VideoRow = Omit<Video, "nickname" | "likers"> & { profiles: { nickname: string | null } | null; video_likes?: { user_id: string }[] | null };
const toVideo = ({ profiles, video_likes, ...v }: VideoRow): Video => ({
  ...v,
  nickname: profiles?.nickname ?? "攀岩者",
  ...(video_likes !== undefined ? { likers: (video_likes ?? []).map((l) => l.user_id) } : {}),
});
// 資料庫還沒套用新的欄位：讀的時候 42703、寫的時候 PGRST204，改用原本的欄位
const noTagCols = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";
// 資料庫有沒有影片攀爬日（step34）：讀影片時知道；沒有時分享表單不說會顯示日期、分享時也不送
let videoDays = true;
export const videoDaySupported = () => videoDays;
// 資料庫有沒有影片型態（step35）：沒有時分享不送型態
let videoFeel = true;
// 資料庫有沒有影片縮圖（step38）：跟其他欄位分開判斷（step35 沒套用、step38 套用了也要讀得到縮圖）
let videoThumbs = true;
// 資料庫有沒有影片按讚（step42）：沒有時讀影片不帶讚（PostgREST 找不到關聯回 PGRST200）
let videoLikes = true;
const VIDEO_LIKES = "video_likes(user_id)";
const missingLikes = (e: { code?: string; message?: string } | null) => e?.code === "PGRST200" && (e.message ?? "").includes("video_likes");
const missingCol = (e: { code?: string; message?: string } | null, col: string) => noTagCols(e) && (e?.message ?? "").includes(col);
// 讀影片：缺型態（還沒套用 step35）先退回攀爬日；缺攀爬日（step34）退回身高、動作；再缺（step25）退回原本的欄位
// 每一層都先帶縮圖、讚讀；缺縮圖（還沒套用 step38）、缺讚（step42）就之後都不帶
async function selectVideos<T>(q: (cols: string) => PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>): Promise<T> {
  for (const cols of [VIDEO_COLS, VIDEO_DAYS, VIDEO_TAGS, VIDEO_BASE]) {
    // 看這次有沒有帶縮圖、讚（同時有兩個讀取時，另一個可能已經把旗標改掉）
    let thumb = videoThumbs;
    let likes = videoLikes;
    let r = await q([cols, thumb && "thumb_path", likes && VIDEO_LIKES].filter(Boolean).join(","));
    for (let n = 0; n < 2; n++) {
      if (thumb && missingCol(r.error, "thumb_path")) thumb = videoThumbs = false;
      else if (likes && missingLikes(r.error)) likes = videoLikes = false;
      else break;
      r = await q([cols, thumb && "thumb_path", likes && VIDEO_LIKES].filter(Boolean).join(","));
    }
    if (cols === VIDEO_BASE || !noTagCols(r.error)) {
      if (!r.error) {
        videoFeel = cols === VIDEO_COLS;
        videoDays = cols === VIDEO_COLS || cols === VIDEO_DAYS;
      }
      return must(r);
    }
  }
  throw new Error("讀不到影片"); // 不會到這裡（最後一層一定回傳）
}

export const videoUrl = (path: string) => supabase().storage.from("route-videos").getPublicUrl(path).data.publicUrl;
// 縮圖：跟影片同名、副檔名 .webp 或 .jpg，放在 video-thumbs
export const videoThumbUrl = (path: string) => supabase().storage.from("video-thumbs").getPublicUrl(path).data.publicUrl;
const thumbNames = (videoPath: string) => {
  const base = videoPath.replace(/\.[^./]+$/, "");
  return [`${base}.webp`, `${base}.jpg`];
};

export async function getVideos(routeId: string): Promise<Video[]> {
  const rows = (await selectVideos((cols) =>
    supabase().from("route_videos").select(cols).eq("route_id", routeId).order("created_at", { ascending: false })
  )) as unknown as VideoRow[];
  return rows.map(toVideo);
}

// 讀影片長度（秒）；讀不到回傳 null
// 有些影片（例如其他 App 錄的 WebM）一開始讀到的長度是無限大：跳到最後再讀一次
export function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (d: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    const ok = () => (Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      if (ok() != null || v.duration !== Infinity) return done(ok());
      v.onseeked = () => done(ok());
      v.currentTime = 1e9;
    };
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

// 上傳前檢查：格式、大小、長度；回傳要用的副檔名、格式與長度
function videoKind(file: File): { ext: string; type: string } {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  const ext = VIDEO_TYPES[fromName] ? fromName : Object.keys(VIDEO_TYPES).find((k) => VIDEO_TYPES[k] === file.type);
  if (!ext) throw new Error("只能分享 MP4、MOV 或 WebM 影片");
  return { ext, type: VIDEO_TYPES[ext] };
}
const tooLong = (d: number | null, lim: VideoLimit) => d != null && d > videoMaxSeconds(lim) + 0.5;
const longError = (d: number, lim: VideoLimit) => new Error(`影片 ${durText(d)}，最長 ${durText(videoMaxSeconds(lim))}，請先剪短再分享`);
const bigError = (size: number, lim: VideoLimit) => new Error(`影片 ${Math.ceil(size / 1048576)} MB，超過 ${mb(lim.bytes)} MB，請先剪短再分享`);
export async function checkVideo(file: File, lim: VideoLimit = VIDEO_LIMIT): Promise<{ ext: string; type: string; duration: number | null }> {
  const { ext } = videoKind(file);
  if (file.size > lim.bytes) throw bigError(file.size, lim);
  const duration = await videoDuration(file);
  if (tooLong(duration, lim)) throw longError(duration!, lim);
  return { ext, type: VIDEO_TYPES[ext], duration };
}
// 選影片時檢查：手機能在 App 裡剪輯（editable，能重新錄影）而且讀得到長度時，太長、太大的留到剪完再檢查；
// 不能剪的手機跟原本一樣，太長、太大就請他先到相簿剪短。回傳影片長度（秒，讀不到是 null）
export async function checkPickedVideo(file: File, editable: boolean, lim: VideoLimit = VIDEO_LIMIT): Promise<number | null> {
  videoKind(file);
  const duration = editable ? await videoDuration(file) : null;
  return duration != null ? duration : (await checkVideo(file, lim)).duration;
}

export async function uploadVideo(
  userId: string,
  gymId: string,
  routeId: string,
  file: File,
  // climbed_on：本人紀錄的攀爬日，有送才表示要在影片上顯示（實際的日期、完成狀態由資料庫從本人紀錄帶入）
  // thumb：縮圖（WebP 或 JPEG）；沒有、或上傳失敗都照樣分享
  info: { caption: string | null; status: Status | null; climbed_on?: string | null; height_band?: HeightBand | null; move?: ClimbMove | null; feel_tags?: FeelTag[]; thumb?: Blob | null },
  // 長度：剪輯過的直接給（剪下來的長度）；只壓縮的從壓縮前的原檔讀（壓縮後的檔有時讀不到長度）
  len?: { source?: File; duration?: number },
  lim: VideoLimit = VIDEO_LIMIT
) {
  const duration = len?.duration ?? (await videoDuration(len?.source ?? file));
  if (tooLong(duration, lim)) throw longError(duration!, lim);
  const { ext, type } = videoKind(file);
  if (file.size > lim.bytes) throw bigError(file.size, lim);
  const since = new Date(Date.now() - 86400000).toISOString();
  const recent = await supabase().from("route_videos").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if ((recent.count ?? 0) >= VIDEO_DAILY_LIMIT) throw new Error(`每人 24 小時內最多分享 ${VIDEO_DAILY_LIMIT} 支影片，明天再來`);
  const path = `${gymId}/${routeId}/${userId}/${newId()}.${ext}`;
  // 快取 1 小時：影片刪掉後，看過的手機、CDN 不會留著太久
  const up = await supabase().storage.from("route-videos").upload(path, file, { contentType: type, cacheControl: "3600" });
  if (up.error) {
    const m = up.error.message ?? "";
    if (m.includes("row-level") || m.includes("Unauthorized")) throw new Error("沒辦法分享：這條路線可能已下架或關閉留言，或今天已分享太多支");
    // 檔案沒超過 App 的上限卻被擋：Supabase 專案的上傳上限還是 50 MB（上攀 100 MB 要老闆另外改設定，見 supabase/README step36）
    if (m.toLowerCase().includes("size") || m.includes("413"))
      throw file.size > lim.bytes ? bigError(file.size, lim) : new Error(`影片 ${Math.ceil(file.size / 1048576)} MB，目前每支最多 ${mb(VIDEO_LIMIT.bytes)} MB，請先剪短再分享`);
    if (m.toLowerCase().includes("mime")) throw new Error("只能分享 MP4、MOV 或 WebM 影片");
    throw new Error("影片上傳失敗，請確認網路後再試");
  }
  // 縮圖：跟影片同名；快取跟影片一樣 1 小時（是影片的畫面，刪掉後不留太久；手機的 Service Worker 會另外存起來，重複看不會再下載）
  // 失敗、資料庫還沒套用 step38 都不擋分享
  let thumb_path: string | null = null;
  const thumbExt = info.thumb?.type === "image/webp" ? "webp" : info.thumb?.type === "image/jpeg" ? "jpg" : null;
  if (info.thumb && thumbExt && videoThumbs) {
    const tp = thumbNames(path)[thumbExt === "webp" ? 0 : 1];
    try {
      const t = await supabase().storage.from("video-thumbs").upload(tp, info.thumb, { contentType: info.thumb.type, cacheControl: "3600" });
      if (!t.error) thumb_path = tp;
    } catch {}
  }
  const row = {
    route_id: routeId,
    path,
    caption: info.caption,
    status: info.status,
    duration_s: duration == null ? null : Math.min(lim.seconds, Math.round(duration * 10) / 10),
    size_bytes: file.size,
  };
  // 身高、動作、型態有選才送；攀爬日有紀錄才送；有縮圖才送
  // 資料庫缺欄位時（還沒套用 step38、35、34、25）去掉錯誤訊息說的那個欄位再存；看不出是哪個就從最新的去掉（影片照樣分享出去）
  const tags = { ...(info.height_band ? { height_band: info.height_band } : {}), ...(info.move ? { move: info.move } : {}) };
  const day = info.status && info.climbed_on && videoDays ? { climbed_on: info.climbed_on } : {};
  const feel = info.feel_tags?.length && videoFeel ? { feel_tags: info.feel_tags } : {};
  let body: Record<string, unknown> = { ...row, ...tags, ...day, ...feel, ...(thumb_path ? { thumb_path } : {}) };
  const groups = [["thumb_path"], ["feel_tags"], ["climbed_on"], ["height_band", "move"]];
  let ins = await supabase().from("route_videos").insert(body);
  for (let n = 0; n < groups.length && noTagCols(ins.error); n++) {
    const present = groups.filter((g) => g.some((c) => c in body));
    const drop = present.find((g) => g.some((c) => (ins.error?.message ?? "").includes(c))) ?? present[0];
    if (!drop) break;
    body = Object.fromEntries(Object.entries(body).filter(([k]) => !drop.includes(k)));
    ins = await supabase().from("route_videos").insert(body);
  }
  if (ins.error) {
    await supabase().storage.from("route-videos").remove([path]);
    if (thumb_path) await supabase().storage.from("video-thumbs").remove([thumb_path]).catch(() => undefined);
    throw new Error(dbError(ins.error));
  }
}

// 影片按讚、收回（跟留言按讚一樣：已經按過回 23505）
export async function likeVideo(id: string) {
  must(await supabase().from("video_likes").insert({ video_id: id }));
}
export async function unlikeVideo(id: string) {
  must(await supabase().from("video_likes").delete().eq("video_id", id));
}

// 刪除影片：資料庫先刪資料（本人或員工），再刪檔案
export async function deleteVideo(id: string) {
  const path = must(await supabase().rpc("delete_video", { p_video: id })) as string;
  await removeVideoFiles([path]);
}

// 刪 Storage 檔案（影片和它的縮圖）；失敗不擋流程（之後用「清理」找出來）
export async function removeVideoFiles(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    await supabase().storage.from("route-videos").remove(paths.slice(i, i + 100));
  }
  // 縮圖可能是 .webp 或 .jpg，兩個都刪（沒有的不會出錯）；資料庫還沒套用 step38 時沒有這個 bucket，錯誤不理
  const thumbs = paths.flatMap(thumbNames);
  for (let i = 0; i < thumbs.length; i += 100) {
    await supabase().storage.from("video-thumbs").remove(thumbs.slice(i, i + 100)).catch(() => undefined);
  }
}
async function videoPathsFor(routeIds: string[]): Promise<string[]> {
  if (!routeIds.length) return [];
  return must(await supabase().rpc("video_paths_for_routes", { p_routes: routeIds })) as string[];
}

// ---------- 管理後台：影片 ----------
export async function getVideoUsage(gym: string): Promise<{ count: number; bytes: number }> {
  return must(await supabase().rpc("video_usage", { p_gym: gym }));
}
export async function getGymVideos(gym: string, limit = 20): Promise<GymVideo[]> {
  const rows = (await selectVideos((cols) =>
    supabase()
      .from("route_videos")
      .select(`${cols},routes!inner(code,zones!inner(gym_id,name))`)
      .eq("routes.zones.gym_id", gym)
      .order("created_at", { ascending: false })
      .limit(limit)
  )) as unknown as (VideoRow & { routes: { code: string; zones: { name: string } } })[];
  return rows.map(({ routes, ...v }) => ({ ...toVideo(v), route_code: routes.code, zone_name: routes.zones.name }));
}
// 清理漏刪的影片檔和縮圖，回傳刪了幾個（資料庫還沒套用 step38 時只清影片）
export async function cleanOrphanVideos(gym: string): Promise<number> {
  const paths = must(await supabase().rpc("orphan_video_paths", { p_gym: gym })) as string[];
  await removeVideoFiles(paths);
  const t = await supabase().rpc("orphan_video_thumb_paths", { p_gym: gym });
  const thumbs = t.error ? [] : ((t.data ?? []) as string[]);
  for (let i = 0; i < thumbs.length; i += 100) {
    await supabase().storage.from("video-thumbs").remove(thumbs.slice(i, i + 100));
  }
  return paths.length + thumbs.length;
}

// ---------- New~：大家最新分享的影片、留言（所有開放的館） ----------
// 今天（台北時間）的各讀最多 100 筆，再讀今天以前最新的 10 筆（今天不到 10 筆時補滿用）
export const FEED_SIZE = 10;
export type FeedPlace = {
  route: Route;
  zone: { id: string; gym_id: string; code: string; name: string; kind?: "wall" | "spray"; grade_system: GradeSystem; photo_path: string | null };
  gym: { id: string; name: string; comments_enabled: boolean };
};
export type FeedVideo = Video & FeedPlace;
export type FeedComment = Comment & FeedPlace;
export type Feed<T> = { today: T[]; older: T[] };
const FEED_ROUTE = `routes!inner(${ROUTE_COLS},zones!inner(id,gym_id,code,name,kind,grade_system,photo_path,gyms!inner(id,name,is_live,comments_enabled)))`;
type FeedRouteRow = Route & { zones: FeedPlace["zone"] & { gyms: FeedPlace["gym"] } };
const toPlace = ({ zones, ...route }: FeedRouteRow): FeedPlace => {
  const { gyms, ...zone } = zones;
  return { route, zone, gym: { id: gyms.id, name: gyms.name, comments_enabled: gyms.comments_enabled } };
};
// 影片：開放的館、路線在牆上（下架時影片會一起刪掉，這裡再擋一次）
export async function getFeedVideos(): Promise<Feed<FeedVideo>> {
  const since = dayStartIso();
  const read = async (today: boolean) => {
    const rows = (await selectVideos((cols) => {
      const q = supabase().from("route_videos").select(`${cols},${FEED_ROUTE}`).eq("routes.zones.gyms.is_live", true).is("routes.archived_at", null);
      return (today ? q.gte("created_at", since) : q.lt("created_at", since)).order("created_at", { ascending: false }).limit(today ? 100 : FEED_SIZE);
    })) as unknown as (VideoRow & { routes: FeedRouteRow })[];
    return rows.map(({ routes, ...v }) => ({ ...toVideo(v), ...toPlace(routes) }));
  };
  const [today, older] = await Promise.all([read(true), read(false)]);
  return { today, older };
}
// 留言：開放的館、路線在牆上、路線和場館的留言都開著（關掉時路線卡片也看不到留言）
export async function getFeedComments(): Promise<Feed<FeedComment>> {
  const since = dayStartIso();
  const read = async (today: boolean) => {
    const q = supabase()
      .from("comments")
      .select(`id,route_id,user_id,body,created_at,edited_at,profiles!comments_user_id_fkey(nickname),comment_likes(user_id),${FEED_ROUTE}`)
      .is("deleted_at", null)
      .eq("routes.zones.gyms.is_live", true)
      .eq("routes.zones.gyms.comments_enabled", true)
      .eq("routes.comments_enabled", true)
      .is("routes.archived_at", null);
    const rows = must(
      await (today ? q.gte("created_at", since) : q.lt("created_at", since)).order("created_at", { ascending: false }).limit(today ? 100 : FEED_SIZE)
    ) as unknown as (Omit<Comment, "nickname" | "likers"> & {
      profiles: { nickname: string | null } | null;
      comment_likes: { user_id: string }[] | null;
      routes: FeedRouteRow;
    })[];
    return rows.map(({ profiles, comment_likes, routes, ...c }) => ({
      ...c,
      nickname: profiles?.nickname ?? "攀岩者",
      likers: (comment_likes ?? []).map((l) => l.user_id),
      ...toPlace(routes),
    }));
  };
  const [today, older] = await Promise.all([read(true), read(false)]);
  return { today, older };
}
// 挑要放的：今天的隨機排；今天超過 n 筆時先挑還沒看過的（seen），看完一輪才重複；今天不到 n 筆用之前最新的補滿
export function pickFeed<T extends { id: string }>(feed: Feed<T>, seen: ReadonlySet<string> = new Set(), n = FEED_SIZE): T[] {
  const shuffle = (xs: T[]) =>
    xs
      .map((x) => [Math.random(), x] as const)
      .sort((a, b) => a[0] - b[0])
      .map(([, x]) => x);
  if (feed.today.length > n) {
    const fresh = shuffle(feed.today.filter((x) => !seen.has(x.id)));
    return [...fresh, ...shuffle(feed.today.filter((x) => seen.has(x.id)))].slice(0, n);
  }
  return [...shuffle(feed.today), ...feed.older].slice(0, n);
}
// New~ 打開 Spray Wall 路線卡片要的：出題者、按讚的人
export async function getSprayExtras(route: Pick<Route, "id" | "created_by">): Promise<{ author: string | null; likers: string[] }> {
  const [author, likes] = await Promise.all([
    route.created_by ? supabase().from("profiles").select("nickname").eq("id", route.created_by).maybeSingle() : null,
    supabase().from("route_likes").select("user_id").eq("route_id", route.id),
  ]);
  return {
    author: ((author?.data ?? null) as { nickname: string | null } | null)?.nickname ?? null,
    likers: ((must(likes) as { user_id: string }[] | null) ?? []).map((l) => l.user_id),
  };
}

// ---------- 人物卡 ----------
// 沒公開時只有 nickname、public、self；公開或本人才有其他欄位
export type ProfileCard = {
  nickname: string | null;
  public: boolean;
  self: boolean;
  bio?: string | null;
  years?: string | null;
  home_gym?: string | null; // 常去的館第一間（資料庫還沒套用 step31 時只有這個）
  home_gyms?: string[] | null; // 常去的館（可以好幾間，照場館順序）
  self_stats?: number[] | null;
  ability?: number[];
  ability_sends?: number;
  total_sends?: number;
  month_sends?: number;
  top_grade?: number | null; // 抱石最高（V）
  top_yds?: number | null; // 上攀最高（YDS，grade 100–119）
};
export async function getProfileCard(userId: string): Promise<ProfileCard> {
  return must(await supabase().rpc("profile_card", { p_user: userId }));
}
// 常去的館：新版有 home_gyms；資料庫還沒套用 step31 時只有一間 home_gym
export const cardGyms = (c: Pick<ProfileCard, "home_gym" | "home_gyms">): string[] => c.home_gyms ?? (c.home_gym ? [c.home_gym] : []);
// 回傳實際存進去的館（畫面照這個顯示）
export async function saveMyCard(c: { public: boolean; bio: string; years: string | null; home_gyms: string[]; self_stats: number[] | null }): Promise<string[]> {
  const base = { p_public: c.public, p_bio: c.bio, p_years: c.years, p_self: c.self_stats };
  const r = await supabase().rpc("save_my_card", { ...base, p_home_gyms: c.home_gyms });
  if (r.error?.code !== "PGRST202") {
    must(r);
    return c.home_gyms;
  }
  // 資料庫還沒套用 step31（沒有收好幾間館的版本）：只能存一間（編輯畫面這時是單選）
  must(await supabase().rpc("save_my_card", { ...base, p_home_gym: c.home_gyms[0] ?? null }));
  return c.home_gyms.slice(0, 1);
}
export async function clearCardBio(userId: string, gym: string) {
  must(await supabase().rpc("clear_card_bio", { p_user: userId, p_gym: gym }));
}

// ---------- 原岩夥伴（人物卡、頭像） ----------
// 資料庫還沒套用 step41（profiles 沒有 mascot 欄位）：讀不到就大家都是預設的明德氂牛、不能選
export const NO_MASCOT = "資料庫還沒套用原岩夥伴（step41），請先請老闆在 Supabase 執行 step41";
let mascotDb = true;
export const mascotSupported = () => mascotDb;
// 一次讀好幾個人的夥伴（沒選的人回 null）
export async function getMascots(userIds: string[]): Promise<Record<string, unknown>> {
  if (!mascotDb || !userIds.length) return {};
  const r = await supabase().from("profiles").select("id,mascot").in("id", userIds);
  if (NO_COLUMN.has(r.error?.code ?? "")) {
    mascotDb = false;
    return {};
  }
  const rows = must(r) as { id: string; mascot: unknown }[];
  return Object.fromEntries(rows.map((x) => [x.id, x.mascot]));
}
// 館首頁每天一句要用的紀錄（一天只讀一次）：這間館牆上最近的嘗試中、最後攀爬日；讀不到的就是 null
export type CheerFacts = {
  project: { code: string; grade: number; hold_color: string; zone: string } | null;
  lastClimbed: string | null;
};
export async function getCheerFacts(userId: string, gym: string): Promise<CheerFacts> {
  const [p, last] = await Promise.all([
    supabase()
      .from("ascents")
      .select("updated_at,routes!inner(code,grade,hold_color,archived_at,kind,zones!inner(gym_id,name))")
      .eq("user_id", userId)
      .eq("status", "project")
      .eq("routes.zones.gym_id", gym)
      .eq("routes.kind", "gym")
      .is("routes.archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase().from("ascents").select("climbed_on").eq("user_id", userId).order("climbed_on", { ascending: false }).limit(1),
  ]);
  const pr = ((p.data ?? []) as unknown as { routes: { code: string; grade: number; hold_color: string; zones: { name: string } } }[])[0];
  return {
    project: pr ? { code: pr.routes.code, grade: pr.routes.grade, hold_color: pr.routes.hold_color, zone: pr.routes.zones.name } : null,
    lastClimbed: ((last.data ?? []) as { climbed_on: string }[])[0]?.climbed_on ?? null,
  };
}
export async function saveMyMascot(pick: { id: string; colors: (string | null)[]; bg: string | null }) {
  const r = await supabase().rpc("save_my_mascot", { p_mascot: pick });
  if (r.error?.code === "PGRST202") throw new Error(NO_MASCOT);
  must(r);
}

// ---------- 使用狀況（店長看自己的館；老闆可看全部 gym = null） ----------
export type UsageStats = {
  since: string | null; // 統計起始日（null＝還沒設定，算全部）
  registered: number;
  registered_since: number; // 起始日之後註冊
  registered_before: number; // 起始日之前（測試期間）註冊
  new7: number;
  today: number;
  week: number;
  month: number;
  sends30: number;
  daily: { day: string; users: number; sends: number }[];
  gyms: { gym: string; name: string; users: number; sends: number }[] | null;
  top_routes: { id: string; code: string; grade: number; color: string; name: string | null; zone: string; kind: string; n: number }[];
};
export async function getUsage(gym: string | null): Promise<UsageStats> {
  return must(await supabase().rpc("usage_stats", { p_gym: gym }));
}
// 老闆：從今天重新開始統計（資料不刪，只是之後的數字從這天開始算）
export async function resetUsageSince(): Promise<string> {
  return must(await supabase().rpc("set_usage_since", { p_day: null }));
}

// ---------- Spray Wall ----------
export type SprayKind = "gym" | "community";
export type SpraySort = "new" | "sends" | "likes" | "mine";
export type SprayRoute = Route & { author: string | null; sends: number; likes: number; liked: boolean; mine: boolean };
export const SPRAY_PAGE = 20;

export async function getSprayZone(gymId: string, code: string): Promise<Zone> {
  return must(await supabase().from("zones").select(ZONE_COLS).eq("gym_id", gymId).eq("code", code).single());
}
export async function getSprayList(zoneId: string, kind: SprayKind, grade: number | null, sort: SpraySort, offset: number): Promise<SprayRoute[]> {
  const rows = must(
    await supabase().rpc("spray_list", { p_zone: zoneId, p_kind: kind, p_grade: grade, p_sort: sort, p_offset: offset, p_limit: SPRAY_PAGE })
  ) as Omit<SprayRoute, "zone_id" | "hold_color" | "setter_note" | "pin_x" | "pin_y" | "archived_at">[];
  return rows.map((r) => ({ ...r, zone_id: zoneId, hold_color: "白", setter_note: null, pin_x: 0, pin_y: 0, archived_at: null }));
}
export type SprayInput = { name: string; grade: number; description: string; holds: Hold[] };
// 新增或修改 Spray Wall 路線（起步點位置由資料庫依第一個起攀圈設定）
export async function saveSprayRoute(zoneId: string, kind: SprayKind, input: SprayInput, id?: string) {
  const row = { name: input.name.trim(), grade: input.grade, description: input.description.trim() || null, holds: input.holds };
  if (id) must(await supabase().from("routes").update(row).eq("id", id));
  else must(await supabase().from("routes").insert({ zone_id: zoneId, kind, hold_color: "白", pin_x: 0, pin_y: 0, ...row }));
}
export async function likeRoute(id: string) {
  must(await supabase().from("route_likes").insert({ route_id: id }));
}
export async function unlikeRoute(id: string) {
  must(await supabase().from("route_likes").delete().eq("route_id", id));
}

// ---------- 意見回饋 ----------
export type FeedbackKind = "idea" | "bug" | "other";
export type FeedbackStatus = "new" | "doing" | "done";
export type Feedback = {
  id: string;
  kind: FeedbackKind;
  body: string;
  status: FeedbackStatus;
  created_at: string;
  contact?: string | null;
  gym_id?: string | null;
  app_version?: string | null;
  device?: string | null;
  nickname?: string | null;
  username?: string | null;
};
export async function sendFeedback(f: { kind: FeedbackKind; body: string; contact: string | null; gym_id: string | null; app_version: string; device: string }) {
  must(await supabase().from("feedback").insert(f));
}
// 自己送過的（老闆也只看自己的；全部回饋在管理後台看）
export async function getMyFeedback(userId: string): Promise<Feedback[]> {
  return must(
    await supabase().from("feedback").select("id,kind,body,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20)
  );
}
export async function getFeedbackList(status: FeedbackStatus | null): Promise<Feedback[]> {
  return must(await supabase().rpc("feedback_list", { p_status: status })) ?? [];
}
export async function setFeedbackStatus(id: string, status: FeedbackStatus) {
  must(await supabase().from("feedback").update({ status }).eq("id", id));
}

// ---------- 大滿貫兌換（step40） ----------
// 資料庫還沒套用 step40 時 getSlamInfo 回 null：App 不顯示兌換按鈕，其他照常
export type SlamClaim = {
  code: string;
  grade: number;
  total: number; // 拿碼時這個難度牆上幾條
  achieved_on: string;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_gym: string | null;
};
export type SlamInfo = {
  enabled: boolean;
  min_routes: number;
  valid_days: number;
  prize: string | null;
  claims: SlamClaim[];
};
export type SlamLookup = SlamClaim & {
  nickname: string | null;
  redeemed_by: string | null;
  now_total: number;
  now_done: number;
  min_routes: number;
  enabled: boolean;
};
export type SlamListItem = SlamClaim & {
  nickname: string | null;
  redeemed_by: string | null;
};
const NO_SLAM = "資料庫還沒套用大滿貫兌換（step40），請先請老闆在 Supabase 執行 step40";
function mustSlam<T>(r: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (r.error?.code === "PGRST202") throw new Error(NO_SLAM);
  return must(r);
}
export async function getSlamInfo(): Promise<SlamInfo | null> {
  const r = await supabase().rpc("slam_info");
  if (r.error?.code === "PGRST202") return null;
  return must(r) as SlamInfo | null;
}
export async function claimSlam(grade: number): Promise<SlamClaim> {
  return mustSlam(await supabase().rpc("claim_slam", { p_grade: grade })) as SlamClaim;
}
export async function lookupSlam(code: string): Promise<SlamLookup | null> {
  return mustSlam(await supabase().rpc("slam_lookup", { p_code: code })) as SlamLookup | null;
}
export async function redeemSlam(code: string, gym: string): Promise<SlamClaim> {
  return mustSlam(await supabase().rpc("redeem_slam", { p_code: code, p_gym: gym })) as SlamClaim;
}
export async function setSlamSettings(s: { enabled: boolean; min_routes: number; valid_days: number; prize: string | null }) {
  mustSlam(
    await supabase().rpc("set_slam_settings", {
      p_enabled: s.enabled,
      p_min_routes: s.min_routes,
      p_valid_days: s.valid_days,
      p_prize: s.prize,
    }),
  );
}
export async function getSlamClaims(): Promise<SlamListItem[]> {
  return (mustSlam(await supabase().rpc("slam_claim_list", { p_limit: 100 })) as SlamListItem[] | null) ?? [];
}
