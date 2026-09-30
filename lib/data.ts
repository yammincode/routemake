// 讀寫 Supabase 的資料函式；權限一律由資料庫 RLS 擋，這裡只負責呼叫
import type { HoldColor, Status } from "@/lib/design";
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
};
export type Ascent = {
  id: string;
  route_id: string;
  status: Status;
  climbed_on: string;
  feel: number | null;
  grade_feel: number | null;
  private_note: string | null;
};
export type Comment = { id: string; route_id: string; user_id: string; body: string; created_at: string; nickname: string };
export type Staff = { user_id: string; gym_id: string; role: "setter" | "manager"; nickname: string | null };

const ROUTE_COLS = "id,zone_id,code,grade,hold_color,style_tags,setter_note,pin_x,pin_y,comments_enabled,created_at,archived_at";
const ZONE_COLS = "id,gym_id,code,name,photo_path,photo_width,photo_height,next_reset_on,sort";

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
// 場館 7 天內的新路線
export async function getNewRoutes(gym: string): Promise<(Route & { zone_name: string })[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = must(
    await supabase()
      .from("routes")
      .select(`${ROUTE_COLS},zones!inner(gym_id,name)`)
      .eq("zones.gym_id", gym)
      .is("archived_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
  ) as unknown as (Route & { zones: { name: string } })[];
  return rows.map((r) => ({ ...r, zone_name: r.zones.name }));
}
// 自己在這些路線上的紀錄（RLS 只回傳自己的）
export async function getMyAscents(routeIds: string[]): Promise<Record<string, Ascent>> {
  if (!routeIds.length) return {};
  const rows = must(
    await supabase().from("ascents").select("id,route_id,status,climbed_on,feel,grade_feel,private_note").in("route_id", routeIds)
  ) as Ascent[];
  return Object.fromEntries(rows.map((a) => [a.route_id, a]));
}
export async function getComments(routeId: string): Promise<Comment[]> {
  const rows = must(
    await supabase()
      .from("comments")
      .select("id,route_id,user_id,body,created_at,profiles!comments_user_id_fkey(nickname)")
      .eq("route_id", routeId)
      .order("created_at")
  ) as unknown as (Omit<Comment, "nickname"> & { profiles: { nickname: string | null } | null })[];
  return rows.map(({ profiles, ...c }) => ({ ...c, nickname: profiles?.nickname ?? "攀岩者" }));
}
export async function getCommentCounts(routeIds: string[]): Promise<Record<string, number>> {
  if (!routeIds.length) return {};
  const rows = must(await supabase().from("comments").select("route_id").in("route_id", routeIds)) as { route_id: string }[];
  return rows.reduce<Record<string, number>>((m, r) => ((m[r.route_id] = (m[r.route_id] ?? 0) + 1), m), {});
}

// ---------- 顧客：紀錄與留言 ----------
export async function saveAscent(userId: string, routeId: string, a: Omit<Ascent, "id" | "route_id">) {
  must(
    await supabase()
      .from("ascents")
      .upsert({ user_id: userId, route_id: routeId, ...a }, { onConflict: "user_id,route_id" })
  );
}
export async function clearAscent(routeId: string) {
  must(await supabase().from("ascents").delete().eq("route_id", routeId));
}
export async function postComment(routeId: string, body: string) {
  must(await supabase().from("comments").insert({ route_id: routeId, body }));
}
export async function deleteComment(id: string) {
  must(await supabase().rpc("delete_comment", { p_comment: id }));
}

// ---------- 管理後台 ----------
export async function setGymComments(gym: string, enabled: boolean) {
  must(await supabase().from("gyms").update({ comments_enabled: enabled }).eq("id", gym));
}
export async function updateZone(id: string, patch: Partial<Pick<Zone, "name" | "next_reset_on" | "photo_path" | "photo_width" | "photo_height">>) {
  must(await supabase().from("zones").update(patch).eq("id", id));
}
export async function createZone(gym: string, code: string, name: string, sort: number): Promise<Zone> {
  return must(await supabase().from("zones").insert({ gym_id: gym, code, name, sort }).select(ZONE_COLS).single());
}
export type RouteInput = Pick<Route, "grade" | "hold_color" | "style_tags" | "setter_note" | "comments_enabled">;
export async function createRoute(zoneId: string, input: RouteInput, x: number, y: number): Promise<Route> {
  return must(
    await supabase()
      .from("routes")
      .insert({ zone_id: zoneId, ...input, pin_x: +x.toFixed(3), pin_y: +y.toFixed(3) })
      .select(ROUTE_COLS)
      .single()
  );
}
export async function updateRoute(id: string, input: RouteInput) {
  must(await supabase().from("routes").update(input).eq("id", id));
}
export async function archiveRoute(id: string) {
  must(await supabase().from("routes").update({ archived_at: new Date().toISOString() }).eq("id", id));
}
export async function archiveZone(zoneId: string): Promise<number> {
  return must(await supabase().rpc("archive_zone", { p_zone: zoneId }));
}

// 照片：瀏覽器先壓到寬 1600px 的 JPEG 再上傳
export async function shrinkImage(file: File, maxWidth = 1600): Promise<{ blob: Blob; width: number; height: number }> {
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
  await updateZone(zone.id, { photo_path: path, photo_width: width, photo_height: height });
  return path;
}

// 員工
export async function getStaff(gym: string): Promise<Staff[]> {
  const rows = must(
    await supabase().from("staff_roles").select("user_id,gym_id,role,profiles(nickname)").eq("gym_id", gym).order("role")
  ) as unknown as (Omit<Staff, "nickname"> & { profiles: { nickname: string | null } | null })[];
  return rows.map(({ profiles, ...s }) => ({ ...s, nickname: profiles?.nickname ?? null }));
}
export async function lookupUser(username: string): Promise<{ id: string; nickname: string | null }> {
  return must(await supabase().rpc("lookup_user", { p_username: username }));
}
export async function assignStaff(username: string, gym: string, role: "setter" | "manager") {
  must(await supabase().rpc("assign_staff", { p_username: username, p_gym: gym, p_role: role }));
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
  by_grade: Record<string, number>;
  by_day: Record<string, number>;
  prev_sends: number;
  total_sends: number;
};
export async function getMonthlyStats(year: number, month: number): Promise<MonthStats> {
  return must(await supabase().rpc("monthly_stats", { p_year: year, p_month: month }));
}
export type MonthAscent = Ascent & { route: Route & { zone_name: string; gym_id: string } };
// 這個月的完攀（Flash＋完攀），含路線與區域
export async function getMonthAscents(year: number, month: number): Promise<MonthAscent[]> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const rows = must(
    await supabase()
      .from("ascents")
      .select(`id,route_id,status,climbed_on,feel,grade_feel,private_note,updated_at,routes(${ROUTE_COLS},zones(name,gym_id))`)
      .in("status", ["flash", "send"])
      .gte("climbed_on", from)
      .lt("climbed_on", next)
      .order("climbed_on", { ascending: false })
      .order("updated_at", { ascending: false })
  ) as unknown as (Ascent & { routes: Route & { zones: { name: string; gym_id: string } } })[];
  return rows.map(({ routes, ...a }) => {
    const { zones, ...r } = routes;
    return { ...a, route: { ...r, zone_name: zones.name, gym_id: zones.gym_id } };
  });
}
// 場館目前牆上所有路線（算各難度進度）
export async function getGymActiveRoutes(gym: string): Promise<Route[]> {
  const rows = must(
    await supabase().from("routes").select(`${ROUTE_COLS},zones!inner(gym_id)`).eq("zones.gym_id", gym).is("archived_at", null)
  ) as unknown as (Route & { zones?: unknown })[];
  return rows.map((r) => {
    delete r.zones;
    return r;
  });
}
