// 讀寫 Supabase 的資料函式；權限一律由資料庫 RLS 擋，這裡只負責呼叫
import type { ClimbMove, GradeSystem, HeightBand, HoldColor, Status } from "@/lib/design";
import type { ResetEvent } from "@/lib/resets";
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
  if (m.toLowerCase().includes("fetch")) return "連不上網路，請確認網路後再試";
  return "發生錯誤，請稍後再試";
}
function must<T>(r: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (r.error) throw new Error(dbError(r.error));
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
export type ZoneData = { z: Zone; g: Gym; rs: Route[]; as: Record<string, Ascent>; cs: Record<string, number> };
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
export async function getMyAscents(routeIds: string[]): Promise<Record<string, Ascent>> {
  if (!routeIds.length) return {};
  const cols: string = "id,route_id,status,climbed_on,feel,grade_feel,private_note";
  const high = hasHighpoint();
  let r = await supabase().from("ascents").select(high ? `${cols},highpoint` : cols).in("route_id", routeIds);
  if (high && NO_COLUMN.has(r.error?.code ?? "")) {
    noHighpointAt = Date.now();
    r = await supabase().from("ascents").select(cols).in("route_id", routeIds);
  }
  const rows = must(r) as unknown as Ascent[];
  return Object.fromEntries(rows.map((a) => [a.route_id, a]));
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
export async function clearAscent(routeId: string) {
  must(await supabase().from("ascents").delete().eq("route_id", routeId));
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
// 下架時資料庫會刪掉影片資料，App 再刪 Storage 的檔案（先取得路徑）
export async function archiveRoute(id: string) {
  const paths = await videoPathsFor([id]);
  must(await supabase().from("routes").update({ archived_at: new Date().toISOString() }).eq("id", id));
  await removeVideoFiles(paths);
}
export async function archiveZone(zoneId: string): Promise<number> {
  const ids = (must(await supabase().from("routes").select("id").eq("zone_id", zoneId).is("archived_at", null)) as { id: string }[]).map((r) => r.id);
  const paths = await videoPathsFor(ids);
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
  await updateZone(zone.id, { photo_path: path, photo_width: width, photo_height: height });
  return path;
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
// 場館目前牆上所有路線（算各難度進度）
export async function getGymActiveRoutes(gym: string): Promise<Route[]> {
  const rows = must(
    await supabase()
      .from("routes")
      .select(`${ROUTE_COLS},zones!inner(gym_id,kind)`)
      .eq("zones.gym_id", gym)
      .eq("zones.kind", "wall")
      .is("archived_at", null)
  ) as unknown as (Route & { zones?: unknown })[];
  return rows.map((r) => {
    delete r.zones;
    return r;
  });
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
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 60;
export const VIDEO_DAILY_LIMIT = 10;
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
  created_at: string;
  nickname: string;
};
export type GymVideo = Video & { route_code: string; zone_name: string };
const VIDEO_BASE = "id,route_id,user_id,path,caption,status,duration_s,created_at,profiles!route_videos_user_id_fkey(nickname)";
const VIDEO_COLS = `${VIDEO_BASE},height_band,move`;
type VideoRow = Omit<Video, "nickname"> & { profiles: { nickname: string | null } | null };
const toVideo = ({ profiles, ...v }: VideoRow): Video => ({ ...v, nickname: profiles?.nickname ?? "攀岩者" });
// 資料庫還沒套用 step25（沒有身高、動作欄位）：讀的時候 42703、寫的時候 PGRST204，改用原本的欄位
const noTagCols = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";
async function selectVideos<T>(q: (cols: string) => PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>): Promise<T> {
  const r = await q(VIDEO_COLS);
  return noTagCols(r.error) ? must(await q(VIDEO_BASE)) : must(r);
}

export const videoUrl = (path: string) => supabase().storage.from("route-videos").getPublicUrl(path).data.publicUrl;

export async function getVideos(routeId: string): Promise<Video[]> {
  const rows = (await selectVideos((cols) =>
    supabase().from("route_videos").select(cols).eq("route_id", routeId).order("created_at", { ascending: false })
  )) as unknown as VideoRow[];
  return rows.map(toVideo);
}

// 讀影片長度（秒）；讀不到回傳 null
function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
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
export async function checkVideo(file: File): Promise<{ ext: string; type: string; duration: number | null }> {
  const { ext } = videoKind(file);
  if (file.size > VIDEO_MAX_BYTES) throw new Error(`影片 ${Math.ceil(file.size / 1048576)} MB，超過 50 MB，請先剪短再分享`);
  const duration = await videoDuration(file);
  if (duration != null && duration > VIDEO_MAX_SECONDS + 0.5) throw new Error(`影片 ${Math.round(duration)} 秒，最長 60 秒，請先剪短再分享`);
  return { ext, type: VIDEO_TYPES[ext], duration };
}

export async function uploadVideo(
  userId: string,
  gymId: string,
  routeId: string,
  file: File,
  info: { caption: string | null; status: Status | null; height_band?: HeightBand | null; move?: ClimbMove | null },
  source?: File // 壓縮前的原檔：長度從原檔讀（壓縮後的檔有時讀不到長度）
) {
  const { duration } = await checkVideo(source ?? file);
  const { ext, type } = videoKind(file);
  if (file.size > VIDEO_MAX_BYTES) throw new Error(`影片 ${Math.ceil(file.size / 1048576)} MB，超過 50 MB，請先剪短再分享`);
  const since = new Date(Date.now() - 86400000).toISOString();
  const recent = await supabase().from("route_videos").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if ((recent.count ?? 0) >= VIDEO_DAILY_LIMIT) throw new Error(`每人 24 小時內最多分享 ${VIDEO_DAILY_LIMIT} 支影片，明天再來`);
  const path = `${gymId}/${routeId}/${userId}/${newId()}.${ext}`;
  const up = await supabase().storage.from("route-videos").upload(path, file, { contentType: type, cacheControl: "31536000" });
  if (up.error) {
    const m = up.error.message ?? "";
    if (m.includes("row-level") || m.includes("Unauthorized")) throw new Error("沒辦法分享：這條路線可能已下架或關閉留言，或今天已分享太多支");
    if (m.toLowerCase().includes("size") || m.includes("413")) throw new Error("影片超過 50 MB，請先剪短再分享");
    if (m.toLowerCase().includes("mime")) throw new Error("只能分享 MP4、MOV 或 WebM 影片");
    throw new Error("影片上傳失敗，請確認網路後再試");
  }
  const row = {
    route_id: routeId,
    path,
    caption: info.caption,
    status: info.status,
    duration_s: duration == null ? null : Math.min(VIDEO_MAX_SECONDS, Math.round(duration * 10) / 10),
    size_bytes: file.size,
  };
  // 身高、動作有選才送；資料庫還沒套用 step25 時去掉標籤再存一次（影片照樣分享出去）
  const tags = { ...(info.height_band ? { height_band: info.height_band } : {}), ...(info.move ? { move: info.move } : {}) };
  let ins = await supabase().from("route_videos").insert({ ...row, ...tags });
  if (noTagCols(ins.error)) ins = await supabase().from("route_videos").insert(row);
  if (ins.error) {
    await supabase().storage.from("route-videos").remove([path]);
    throw new Error(dbError(ins.error));
  }
}

// 刪除影片：資料庫先刪資料（本人或員工），再刪檔案
export async function deleteVideo(id: string) {
  const path = must(await supabase().rpc("delete_video", { p_video: id })) as string;
  await removeVideoFiles([path]);
}

// 刪 Storage 檔案；失敗不擋流程（之後用「清理」找出來）
export async function removeVideoFiles(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    await supabase().storage.from("route-videos").remove(paths.slice(i, i + 100));
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
// 清理漏刪的影片檔，回傳刪了幾個
export async function cleanOrphanVideos(gym: string): Promise<number> {
  const paths = must(await supabase().rpc("orphan_video_paths", { p_gym: gym })) as string[];
  await removeVideoFiles(paths);
  return paths.length;
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
export async function saveMyCard(c: { public: boolean; bio: string; years: string | null; home_gyms: string[]; self_stats: number[] | null }) {
  const base = { p_public: c.public, p_bio: c.bio, p_years: c.years, p_self: c.self_stats };
  const r = await supabase().rpc("save_my_card", { ...base, p_home_gyms: c.home_gyms });
  // 資料庫還沒套用 step31（沒有收好幾間館的版本）：先存第一間
  if (r.error?.code === "PGRST202") must(await supabase().rpc("save_my_card", { ...base, p_home_gym: c.home_gyms[0] ?? null }));
  else must(r);
}
export async function clearCardBio(userId: string, gym: string) {
  must(await supabase().rpc("clear_card_bio", { p_user: userId, p_gym: gym }));
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
