// =====================================================================
// 測試用的模擬 Supabase（Auth、PostgREST、Storage、RPC），只涵蓋 App 用到的查詢
// 權限規則大致照資料庫的 RLS 寫（真正的權限測試在 supabase/tests，用真的 PostgreSQL 跑）
// =====================================================================
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SB = "https://ngvlymkevcqhlaphoost.supabase.co";
const uuid = () => crypto.randomUUID();
// 影片縮圖用的小圖（測試裡的縮圖內容不重要，只要瀏覽器畫得出來）
const THUMB_IMG = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "wall.png"));
// 攀岩角色（0054）：款式和開放條件跟 App、資料庫一樣（lib/climber-*.json）
const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "lib");
const CLIMBER_VALUES = JSON.parse(fs.readFileSync(path.join(LIB, "climber-values.json"), "utf8"));
const CLIMBER_RULES = JSON.parse(fs.readFileSync(path.join(LIB, "climber-rules.json"), "utf8"));
// 拆 multipart 上傳（supabase-js 上傳 Blob 時用 FormData）：取出檔案內容、格式和 cacheControl
function multipart(req) {
  const ct = req.headers()["content-type"] || "";
  const buf = req.postDataBuffer() ?? Buffer.alloc(0);
  const m = ct.match(/boundary=(.+)$/);
  if (!m) return { buf, type: ct.split(";")[0], cacheControl: (req.headers()["cache-control"] || "").replace("max-age=", "") || null };
  const b = Buffer.from("--" + m[1]);
  const out = { buf: Buffer.alloc(0), type: "", cacheControl: null };
  for (let i = buf.indexOf(b); i >= 0; ) {
    const j = buf.indexOf(b, i + b.length);
    if (j < 0) break;
    const part = buf.subarray(i + b.length + 2, j - 2);
    const h = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, h).toString();
    const body = part.subarray(h + 4);
    if (/name="cacheControl"/.test(head)) out.cacheControl = body.toString();
    else if (/filename=/.test(head) || /name=""/.test(head)) {
      out.buf = body;
      out.type = (head.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || "";
    }
    i = j;
  }
  return out;
}
const now = () => new Date().toISOString();
export const taipeiDay = (offsetDays = 0) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date(Date.now() + offsetDays * 86400000));

export function createMock() {
  const db = {
    users: {}, // email -> { id, password }
    profiles: [],
    staff_roles: [],
    gyms: [
      ["mingde", "明德館", true],
      ["g2", "萬華館", true],
      ["g3", "中和館", true],
      ["g4", "南港館", true],
      ["g5", "新店館", true],
      ["g6", "中壢館", false],
    ].map(([id, name, is_live], i) => ({ id, name, is_live, comments_enabled: true, sort: i + 1 })),
    // 明德（同 migration 0025 細分後）
    zones: [
      ["A1", "A1 區"], ["A2", "A2 區"], ["A3", "A3 區"], ["A4", "A4 區"],
      ["W1", "比賽牆 1"], ["W2", "比賽牆 2"], ["W3", "比賽牆 3"], ["W4", "比賽牆 4"],
      ["B1", "B1 區"], ["B2", "B2 區"], ["B3", "B3 區"],
      ["C1", "C1 區"], ["C2", "C2 區"], ["C3", "C3 區"],
      ["D1", "D1 區"], ["D2", "D2 區"],
    ].map(([code, name], i) => ({ id: uuid(), gym_id: "mingde", code, name, sort: i + 1, photo_path: null, photo_width: null, photo_height: null, next_reset_on: null, route_seq: 0, grade_system: "v" }))
      .concat(
        // Spray Wall（同 migration 0018）
        [["mingde", "S"], ["g4", "SW"]].map(([gym_id, code]) => ({ id: uuid(), gym_id, code, name: "Spray Wall", sort: 99, photo_path: null, photo_width: null, photo_height: null, next_reset_on: null, route_seq: 0, grade_system: "v", kind: "spray" })),
        // 其他館的區域（同 migration 0013；南港 0023、0028、0030，其他館 0025 細分）
        Object.entries({
          g2: [["A", "A 區"], ["B1", "B1 區"], ["B2", "B2 區"], ["C1", "C1 區"], ["C2", "C2 區"], ["D1", "D1 區"], ["D2", "D2 區"], ["SL", "教學區 Slab"], ["TR", "訓練區"]],
          g3: [["A", "A 區"], ["AB1", "Auto-Belay 1"], ["AB2", "Auto-Belay 2"], ["B", "B 區"], ["C", "C 區"], ["D", "D 區"], ["SP", "速度牆"], ["BO", "抱石區"]],
          g4: [["A1", "A1 區"], ["A2", "A2 區"], ["A3", "A3 區"], ["B1", "B1 區"], ["B2", "B2 區"], ["B3", "B3 區"], ["C1", "C1 區"], ["C2", "C2 區"], ["C3", "C3 區"], ["D1", "D1 區"], ["D2", "D2 區"]],
          g5: [["A1", "抱石 A1 區"], ["A2", "抱石 A2 區"], ["B1", "抱石 B1 區"], ["B2", "抱石 B2 區"], ["C1", "C1 區"], ["C2", "C2 區"], ["D", "D 區"], ["E", "上攀 E 區"]],
        }).flatMap(([gym_id, zs]) => zs.map(([code, name], i) => ({ id: uuid(), gym_id, code, name, sort: i + 1, photo_path: null, photo_width: null, photo_height: null, next_reset_on: null, route_seq: 0, grade_system: gym_id === "g3" && code !== "BO" ? "yds" : "v" })))
      ),
    routes: [],
    ascents: [],
    comments: [],
    routeLikes: [], // route_likes
    opens: [], // app_opens
    feedback: [],
    reports: [], // route_reports（step47）
    slamClaims: [], // 大滿貫兌換碼（step40）
    resetEvents: [], // 換線公告
    resetEditors: [], // 老闆授權輸入換線日的人（user_id）
    usageViewers: [], // 老闆授權看使用狀況的人和館（{ user_id, gym_id }）
    likes: [], // comment_likes
    videoLikes: [], // video_likes（step42）
    audit: [],
    files: {},
    videos: [], // route_videos
    vfiles: {}, // route-videos 檔案：path -> { buf, owner, created_at }
    tfiles: {}, // video-thumbs 縮圖（step38）：path -> { buf, type, cache, owner, created_at }
    scoring: {
      grade_points: [10, 15, 20, 30, 40, 55, 70, 90, 110, 135, 160],
      vb_points: 5,
      yds_points: [4, 5, 6, 8, 10, 11, 13, 15, 17, 20, 25, 30, 35, 40, 48, 55, 70, 80, 90, 110],
      style_bonus: { 力量: 10, 指力: 10, 動態: 15, 耐力: 10, 協調: 10, 技巧: 5, 平衡: 5, 腳法: 5, 柔軟: 5 },
      max_style_bonus: 30,
      flash_multiplier: 1.2,
    },
  };
  const state = { offline: false, ascentsFail: null, ascentsReadFail: false, routeLikesReadFail: false, readDelay: {}, refreshFail: false, signupError: null, usageSince: null, dropRouteReply: false, noCors: false, noVideoTags: false, noVideoClimb: false, noVideoFeel: false, noVideoThumb: false, noRopeVideo: false, oldVideoMax: 60, uploadMax: Infinity, tagFallbacks: 0, noResets: false, noOps: false, noHighpoint: false, noHomeGyms: false, noSlam: false, noMascot: false, noAccounts: false, noRoutePhoto: false, noInsights: false, noRouteZone: false, noReports: false, noClimber: false, slam: { enabled: false, min_routes: 10, valid_days: 30, prize: null } };
  let auditSeq = 0;

  const addUser = (username, password, extra = {}) => {
    const id = uuid();
    db.users[`${username}@users.routemake.local`] = { id, password };
    db.profiles.push({ id, username, nickname: null, is_owner: false, ...extra });
    return id;
  };
  const addRoute = (zone, grade, color, tags = [], x = 30, y = 40, createdAt = now()) => {
    zone.route_seq++;
    const r = { id: uuid(), zone_id: zone.id, code: `${zone.code}-${String(zone.route_seq).padStart(2, "0")}`, grade, hold_color: color, style_tags: tags, setter_note: null, pin_x: x, pin_y: y, comments_enabled: true, created_at: createdAt, archived_at: null, kind: "gym" };
    db.routes.push(r);
    return r;
  };
  const addAscent = (userId, route, status, climbedOn, extra = {}) =>
    db.ascents.push({ id: uuid(), user_id: userId, route_id: route.id, status, climbed_on: climbedOn, feel: null, grade_feel: null, private_note: null, updated_at: now(), ...extra });

  // extra.thumb = true：一起放一張縮圖（跟影片同名的 .webp）
  const addVideo = (userId, route, { thumb, ...extra } = {}) => {
    const z = db.zones.find((x) => x.id === route.zone_id);
    const path = `${z.gym_id}/${route.id}/${userId}/${uuid()}.mp4`;
    db.vfiles[path] = { buf: Buffer.from("fake"), owner: userId, created_at: now() };
    const thumb_path = thumb ? path.replace(/\.mp4$/, ".webp") : null;
    if (thumb_path) db.tfiles[thumb_path] = { buf: THUMB_IMG, type: "image/png", cache: "3600", owner: userId, created_at: now() };
    const v = { id: uuid(), route_id: route.id, user_id: userId, path, caption: null, status: null, duration_s: 10, size_bytes: 4, height_band: null, move: null, feel_tags: [], climbed_on: null, thumb_path, created_at: now(), ...extra };
    db.videos.push(v);
    return v;
  };
  const addComment = (userId, route, body, extra = {}) => {
    const c = { id: uuid(), route_id: route.id, user_id: userId, body, created_at: now(), edited_at: null, deleted_at: null, ...extra };
    db.comments.push(c);
    return c;
  };

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const session = (email, u) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return {
      access_token: `${b64({ alg: "HS256" })}.${b64({ sub: u.id, exp, role: "authenticated" })}.x`,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: exp,
      refresh_token: "r:" + email, // 換新登入憑證用（離線登出測試：伺服器沒收到登出，手機留著的話會自動登回去）
      user: { id: u.id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: now() },
    };
  };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
  const J = (route, status, body) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
  const empty = (route, status = 204) => route.fulfill({ status, headers: cors });
  const uidOf = (req) => {
    try {
      const t = (req.headers()["authorization"] || "").split(" ")[1];
      return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).sub;
    } catch {
      return null;
    }
  };
  const prof = (id) => db.profiles.find((p) => p.id === id);
  const zoneOf = (id) => db.zones.find((z) => z.id === id);
  const isOwner = (uid) => !!prof(uid)?.is_owner;
  const isStaff = (uid, g) => isOwner(uid) || db.staff_roles.some((s) => s.user_id === uid && s.gym_id === g);
  const canEditResets = (uid) => isOwner(uid) || db.resetEditors.includes(uid);
  // state.noOps：模擬資料庫還沒套用 step28（沒有營運權限）；step28 要在 step27 之後，所以還沒套用 step27 時也算
  const noOps = () => state.noOps || state.noResets;
  const canViewUsage = (uid, g) => isOwner(uid) || db.usageViewers.some((v) => v.user_id === uid && v.gym_id === g);
  const usageGyms = (uid) => db.gyms.filter((g) => db.usageViewers.some((v) => v.user_id === uid && v.gym_id === g.id)).map((g) => g.id);
  // 同 sync_zone_resets：區域的下次換線日＝今天以後開始的公告裡最早的開始日；沒有公告時，正是舊公告的日期就清空
  const syncZoneResets = (zoneIds, oldStart) => {
    const today = taipeiDay();
    for (const id of zoneIds ?? []) {
      const z = db.zones.find((x) => x.id === id);
      if (!z) continue;
      const next = db.resetEvents.filter((e) => e.zone_ids.includes(id) && e.starts_on >= today).map((e) => e.starts_on).sort()[0];
      z.next_reset_on = next ?? (z.next_reset_on === oldStart ? null : z.next_reset_on);
    }
  };
  // 同 zone_reset_on：顧客看到的換線日以公告為準，沒有公告才用員工設的日期（已經過去的不顯示）
  const zoneResetOn = (z) => {
    const today = taipeiDay();
    const ev = db.resetEvents.filter((e) => e.zone_ids.includes(z.id) && e.starts_on >= today).map((e) => e.starts_on).sort()[0];
    return ev ?? (z.next_reset_on && z.next_reset_on >= today ? z.next_reset_on : null);
  };
  const isMgr = (uid, g) => isOwner(uid) || db.staff_roles.some((s) => s.user_id === uid && s.gym_id === g && s.role === "manager");
  const gymOfRoute = (id) => zoneOf(db.routes.find((r) => r.id === id).zone_id).gym_id;
  // 影片、留言裡嵌的路線（New~ 用：路線全部欄位＋區域＋場館）
  const routeEmbed = (routeId) => {
    const r = db.routes.find((x) => x.id === routeId);
    const z = zoneOf(r.zone_id);
    const g = db.gyms.find((x) => x.id === z.gym_id);
    return {
      ...r,
      zones: { id: z.id, gym_id: z.gym_id, code: z.code, name: z.name, kind: z.kind ?? "wall", grade_system: z.grade_system, photo_path: z.photo_path, gyms: { id: g.id, name: g.name, is_live: g.is_live, comments_enabled: g.comments_enabled } },
    };
  };
  // 路線下架時刪掉影片資料（資料庫觸發器）
  const dropVideos = (routeId) => (db.videos = db.videos.filter((v) => v.route_id !== routeId));
  // 同 0038 的 strip_invisible、link_free：網址（全形、「。」、短網址、夾看不見的字元也算；「V5. Top」這種一般句子不算）
  const INVISIBLE = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;
  const strip = (t) => t.normalize("NFKC").replace(INVISIBLE, "");
  const TLDS = "(com|tw|net|org|io|cc|app|co|ly|gl|gle|ee|jp|hk|biz|vip|xyz)(?![a-z0-9])";
  const hasLink = (t) => {
    const a = strip(t ?? "").replace(/\s+\.\s+/g, ".");
    const b = a.replace(/\s*(。|｡|\[\.\]|\(\.\)|\[dot\]|\(dot\))\s*/gi, ".");
    return new RegExp(`(https?:|www\\.|[a-z0-9-]+\\.[a-z]{2,}/|[a-z0-9-]\\.${TLDS})`, "i").test(a) || new RegExp(`[a-z0-9-]\\.${TLDS}`, "i").test(b);
  };
  // 同 0038 的 nickname_hidden、nickname_bare、nickname_spaced、profiles_nickname_check
  const HIDDEN =
    /[\u0001-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0\uFFF0-\uFFFB\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]|(^|[A-Za-zÀ-ɏͰ-ϿЀ-ӿ\u3040-\u30FF\u3100-\u312F\u3400-\u4DBF一-鿿\uAC00-\uD7AF\uF900-\uFAFF０-ｚ])[\uFE00-\uFE0F\u200D]|[0-9]([\uFE00-\uFE0E\u200D]|\uFE0F(?!⃣))/u;
  const SPACES = /[\s\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u2800\u3000]/gu;
  const bare = (t) => strip(t).replace(SPACES, "");
  const spaced = (t) => strip(t).replace(/[\s\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u2800\u3000]+/gu, " ");
  const IMPERSONATE = /(原岩|官方|管理員|管理者|管理员|店長|店长|館長|馆长|館方|馆方|定線|定线|員工|员工|客服|老闆|老板|櫃檯|櫃台|柜台)/;
  const IMPERSONATE_EN = /(^|[^a-z])(admin|staff|official)([^a-z]|$)/i;
  // 同 0038 的 can_delete_video_file：員工；分享中的不行；自己的；岩友下架了自己出的路線
  // 同 0043 can_delete_video_thumb
  const canDeleteVideoThumb = (uid, k) => {
    if (!uid) return false;
    const [gym, routeId, owner] = k.split("/");
    if (isStaff(uid, gym)) return true;
    if (db.videos.some((v) => v.thumb_path === k)) return false;
    if (owner === uid) return true;
    const r = db.routes.find((x) => x.id === routeId);
    return !!(r && r.kind === "community" && r.archived_at && r.created_by === uid);
  };
  const canDeleteVideoFile = (uid, k) => {
    if (!uid) return false;
    const [gym, routeId, owner] = k.split("/");
    if (isStaff(uid, gym)) return true;
    if (db.videos.some((v) => v.path === k)) return false;
    if (owner === uid) return true;
    const r = db.routes.find((x) => x.id === routeId);
    return !!(r && r.kind === "community" && r.archived_at && r.created_by === uid);
  };
  const canShare = (uid, routeId) => {
    const r = db.routes.find((x) => x.id === routeId);
    const g = r && db.gyms.find((x) => x.id === zoneOf(r.zone_id).gym_id);
    return !!(uid && r && !r.archived_at && r.comments_enabled && g.comments_enabled && prof(uid)?.nickname);
  };
  const videoPathOk = (uid, routeId, path) => {
    const parts = path.split("/");
    return parts.length === 4 && parts[1] === routeId && parts[2] === uid && db.routes.some((r) => r.id === routeId) && parts[0] === gymOfRoute(routeId);
  };
  const audit = (uid, gym, action, target, detail) => db.audit.push({ id: ++auditSeq, user_id: uid, gym_id: gym, action, target_id: target, detail, created_at: now() });

  // ---- 帳號管理（step43）：停權、刪帳號、重設密碼 ----
  // suspended_until：ISO 時間或 "infinity"（永久）
  const suspended = (uid) => {
    const u = prof(uid)?.suspended_until;
    return !state.noAccounts && !!u && (u === "infinity" || u > now());
  };
  const SUSPENDED = { code: "42501", message: "帳號暫停中，暫時不能留言、分享或按讚" };
  const suspensionOf = (p) =>
    p && suspended(p.id) ? { until: p.suspended_until === "infinity" ? null : p.suspended_until, reason: p.suspended_reason } : null;
  const anyStaff = (id) => isOwner(id) || db.staff_roles.some((s) => s.user_id === id);
  const accountRow = (id, gym, uid) => {
    const p = prof(id);
    const s = suspensionOf(p);
    return {
      id: p.id, username: p.username, nickname: p.nickname, created_at: p.created_at ?? now(), staff: anyStaff(id),
      ascents: db.ascents.filter((a) => a.user_id === id).length,
      comments: db.comments.filter((c) => c.user_id === id && !c.deleted_at).length,
      comments_here: db.comments.filter((c) => c.user_id === id && !c.deleted_at && gymOfRoute(c.route_id) === gym).length,
      videos: db.videos.filter((v) => v.user_id === id).length,
      recent: db.ascents
        .filter((a) => a.user_id === id && ["flash", "send"].includes(a.status))
        .sort((x, y) => y.updated_at.localeCompare(x.updated_at))
        .slice(0, 3)
        .map((a) => {
          const r = db.routes.find((x) => x.id === a.route_id);
          const z = zoneOf(r.zone_id);
          return { gym: db.gyms.find((g) => g.id === z.gym_id).name, zone: z.name, code: r.code, color: r.hold_color, grade: r.grade, climbed_on: a.climbed_on };
        }),
      suspension: s ? { ...s, at: p.suspended_at, by: prof(p.suspended_by)?.nickname ?? null, mine: p.suspended_by === uid } : null,
    };
  };
  // 刪帳號：同 on delete cascade／set null
  const dropUser = (id) => {
    const email = Object.keys(db.users).find((e) => db.users[e].id === id);
    if (email) delete db.users[email];
    db.profiles = db.profiles.filter((p) => p.id !== id);
    db.ascents = db.ascents.filter((a) => a.user_id !== id);
    db.comments = db.comments.filter((c) => c.user_id !== id);
    db.likes = db.likes.filter((l) => l.user_id !== id);
    db.videoLikes = db.videoLikes.filter((l) => l.user_id !== id);
    db.routeLikes = db.routeLikes.filter((l) => l.user_id !== id);
    db.videos = db.videos.filter((v) => v.user_id !== id);
    db.feedback = db.feedback.filter((f) => f.user_id !== id);
    db.routes.filter((r) => r.created_by === id).forEach((r) => (r.created_by = null));
  };
  db.resets = {}; // 重設碼：user_id -> { code, expires_at, tries }

  // PostgREST 篩選（eq、is、in、gte、lt、or）
  const cond = (r, k, v) => {
    const [op, ...rest] = v.split(".");
    const val = rest.join(".");
    if (op === "not") return !cond(r, k, val);
    // 篩選可以往下好幾層（routes.zones.gyms.is_live）
    const x = k.split(".").reduce((o, p) => (o == null ? o : o[p]), r);
    if (op === "eq") return String(x) === val;
    if (op === "is") return val === "null" ? x == null : true;
    if (op === "in") return val.replace(/[()]/g, "").split(",").map((s) => s.replace(/"/g, "")).includes(String(x));
    if (op === "gte") return typeof x === "number" ? x >= Number(val) : String(x) >= val;
    if (op === "lt") return typeof x === "number" ? x < Number(val) : String(x) < val;
    return true;
  };
  const filt = (rows, sp) => {
    for (const [k, v] of sp) {
      if (["select", "order", "on_conflict", "limit", "offset"].includes(k)) continue;
      if (k === "or") {
        // 用逗號分開，但括號裡的逗號（例如 status.in.(flash,send)）不算
        const parts = [];
        let depth = 0, cur = "";
        for (const ch of v.replace(/^\(|\)$/g, "")) {
          if (ch === "," && depth === 0) (parts.push(cur), (cur = ""));
          else ((depth += ch === "(" ? 1 : ch === ")" ? -1 : 0), (cur += ch));
        }
        parts.push(cur);
        const pairs = parts.map((p) => p.split(/\.(.*)/s));
        rows = rows.filter((r) => pairs.some(([pk, pv]) => cond(r, pk, pv)));
        continue;
      }
      rows = rows.filter((r) => cond(r, k, v));
    }
    const limit = Number(sp.get("limit"));
    const offset = Number(sp.get("offset")) || 0;
    return limit ? rows.slice(offset, offset + limit) : rows.slice(offset);
  };
  const base = (g) => (g >= 100 ? db.scoring.yds_points[g - 100] : g < 0 ? db.scoring.vb_points : db.scoring.grade_points[g]);
  const rawPoints = (r) => base(r.grade) * (100 + Math.min(db.scoring.max_style_bonus, r.style_tags.reduce((s, t) => s + (db.scoring.style_bonus[t] || 0), 0)));
  // 長耐力路線：照順序標的點數（其他路線 0）
  // 長耐力路線：看路線本身（岩館路線、沒有名稱、有照順序的點），不看區域現在的規則（同 ascents_before_write）
  const seqN = (r) => (r && (r.kind ?? "gym") === "gym" && !r.name && r.holds?.length >= 2 ? r.holds.length : 0);
  const points = (a) => {
    const r = db.routes.find((x) => x.id === a.route_id);
    if (a.status === "send") return Math.round(rawPoints(r) / 100);
    if (a.status === "flash") return Math.round((rawPoints(r) * Math.round(db.scoring.flash_multiplier * 100)) / 10000);
    // 同 ascent_points 5 個參數版：長耐力嘗試中照比例
    if (a.highpoint != null && seqN(r)) return Math.round((rawPoints(r) * a.highpoint) / (100 * seqN(r)));
    return 0;
  };
  const monthBounds = (y, m) => {
    const pad = (n) => String(n).padStart(2, "0");
    return {
      from: `${y}-${pad(m)}-01`,
      to: m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`,
      prev: m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`,
    };
  };

  async function rpc(route, fn, a, uid) {
    if (fn === "my_access") {
      const p = prof(uid);
      return J(route, 200, p ? { id: p.id, username: p.username, nickname: p.nickname, avatar_url: null, is_owner: p.is_owner, ...(state.noResets ? {} : { can_edit_resets: canEditResets(uid) }), ...(noOps() ? {} : { usage_gyms: usageGyms(uid) }), roles: db.staff_roles.filter((s) => s.user_id === uid).map((s) => ({ gym_id: s.gym_id, role: s.role })), ...(state.noAccounts ? {} : { suspension: suspensionOf(p) }) } : null);
    }
    // 帳號管理（step43）：state.noAccounts 模擬資料庫還沒套用（沒有這些函式）
    const ACCOUNT_FNS = ["search_accounts", "account_info", "suspended_accounts", "account_comments", "suspend_user", "unsuspend_user", "issue_reset_code", "cancel_reset_code", "reset_password_with_code", "delete_user_videos", "delete_user", "delete_my_videos", "delete_my_account"];
    if (state.noAccounts && ACCOUNT_FNS.includes(fn)) return J(route, 404, { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` });
    if (["edit_comment", "save_my_card", "save_my_mascot", "save_my_climber"].includes(fn) && suspended(uid)) return J(route, 403, SUSPENDED);
    const noPerm = () => J(route, 403, { code: "42501", message: "沒有權限" });
    if (["search_accounts", "account_info", "suspended_accounts", "account_comments"].includes(fn) && !isStaff(uid, a.p_gym)) return noPerm();
    if (fn === "search_accounts") {
      const q = (a.p_query ?? "").trim().toLowerCase();
      if (!q || (q.length < 2 && /^[ -~]*$/.test(q))) return J(route, 200, []);
      return J(route, 200, db.profiles.filter((p) => p.username.includes(q) || (p.nickname ?? "").toLowerCase().includes(q)).slice(0, 5).map((p) => accountRow(p.id, a.p_gym, uid)));
    }
    if (fn === "account_info") return J(route, 200, prof(a.p_user) ? accountRow(a.p_user, a.p_gym, uid) : null);
    if (fn === "suspended_accounts") return J(route, 200, db.profiles.filter((p) => suspended(p.id)).map((p) => accountRow(p.id, a.p_gym, uid)));
    if (fn === "account_comments") {
      return J(route, 200, db.comments
        .filter((c) => c.user_id === a.p_user && !c.deleted_at)
        .sort((x, y) => y.created_at.localeCompare(x.created_at))
        .map((c) => {
          const r = db.routes.find((x) => x.id === c.route_id);
          const z = zoneOf(r.zone_id);
          return { id: c.id, body: c.body, created_at: c.created_at, gym: db.gyms.find((g) => g.id === z.gym_id).name, zone: z.name, code: r.code, deletable: isStaff(uid, z.gym_id) };
        }));
    }
    if (fn === "suspend_user") {
      if (!isMgr(uid, a.p_gym)) return J(route, 403, { code: "42501", message: "只有店長、老闆可以停權" });
      if (a.p_days == null && !isOwner(uid)) return J(route, 403, { code: "42501", message: "永久停權只有老闆可以設定" });
      if (!(a.p_reason ?? "").trim()) return J(route, 400, { code: "22023", message: "請寫停權原因（60 字以內）" });
      if (anyStaff(a.p_user)) return J(route, 403, { code: "42501", message: "員工和老闆不能停權，請先移除員工身分" });
      const p = prof(a.p_user);
      const until = a.p_days == null ? "infinity" : new Date(Date.now() + a.p_days * 86400000).toISOString();
      if (!isOwner(uid) && suspended(p.id) && (p.suspended_until === "infinity" || p.suspended_until > until))
        return J(route, 403, { code: "42501", message: "他已經停權到更晚的時間，要改請找老闆" });
      Object.assign(p, { suspended_until: until, suspended_reason: a.p_reason.trim(), suspended_by: uid, suspended_at: now() });
      let n = 0;
      if (a.p_delete_comments) db.comments.filter((c) => c.user_id === p.id && !c.deleted_at && (isOwner(uid) || gymOfRoute(c.route_id) === a.p_gym)).forEach((c) => ((c.deleted_at = now()), n++));
      audit(uid, a.p_gym, "user.suspend", p.id, { days: a.p_days, reason: a.p_reason.trim(), comments_deleted: n, nickname: p.nickname, username: p.username });
      return J(route, 200, { until: a.p_days == null ? null : until, comments_deleted: n });
    }
    if (fn === "unsuspend_user") {
      if (!isMgr(uid, a.p_gym)) return J(route, 403, { code: "42501", message: "只有店長、老闆可以解除停權" });
      const p = prof(a.p_user);
      if (p.suspended_until === "infinity" && !isOwner(uid)) return J(route, 403, { code: "42501", message: "永久停權只有老闆可以解除" });
      if (!isOwner(uid) && p.suspended_by !== uid) return J(route, 403, { code: "42501", message: "只能解除自己停的權，別人停的請找他或老闆" });
      Object.assign(p, { suspended_until: null, suspended_reason: null, suspended_by: null, suspended_at: null });
      audit(uid, a.p_gym, "user.unsuspend", p.id, { nickname: p.nickname, username: p.username });
      return J(route, 200, null);
    }
    if (fn === "issue_reset_code") {
      if (!isMgr(uid, a.p_gym)) return J(route, 403, { code: "42501", message: "只有店長、老闆可以產生重設碼" });
      if (anyStaff(a.p_user) && !isOwner(uid)) return J(route, 403, { code: "42501", message: "員工的帳號只有老闆可以重設密碼" });
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      const expires_at = new Date(Date.now() + 15 * 60000).toISOString();
      db.resets[a.p_user] = { code, expires_at, tries: 0 };
      audit(uid, a.p_gym, "user.reset_code", a.p_user, { nickname: prof(a.p_user).nickname, username: prof(a.p_user).username });
      return J(route, 200, { code, expires_at, username: prof(a.p_user).username });
    }
    if (fn === "cancel_reset_code") {
      if (!isMgr(uid, a.p_gym)) return J(route, 403, { code: "42501", message: "只有店長、老闆可以作廢重設碼" });
      if (anyStaff(a.p_user) && !isOwner(uid)) return J(route, 403, { code: "42501", message: "員工的帳號只有老闆可以處理" });
      delete db.resets[a.p_user];
      return J(route, 200, null);
    }
    if (fn === "reset_password_with_code") {
      if ((a.p_password ?? "").length < 8 || Buffer.byteLength(a.p_password) > 72) return J(route, 200, "short");
      const p = db.profiles.find((x) => x.username === (a.p_username ?? "").trim().toLowerCase());
      const r = p && db.resets[p.id];
      if (!r) return J(route, 200, "bad");
      if (r.expires_at <= now() || r.tries >= 5) return (delete db.resets[p.id], J(route, 200, "expired"));
      if (a.p_code !== r.code) return (r.tries++, J(route, 200, r.tries >= 5 ? "expired" : "bad"));
      const email = Object.keys(db.users).find((e) => db.users[e].id === p.id);
      db.users[email].password = a.p_password;
      delete db.resets[p.id];
      audit(null, null, "user.password_reset", p.id, { username: p.username });
      return J(route, 200, "ok");
    }
    if (fn === "delete_user_videos") {
      if (!isOwner(uid)) return J(route, 403, { code: "42501", message: "只有老闆可以刪除別人的帳號" });
      if (anyStaff(a.p_user)) return J(route, 403, { code: "42501", message: "員工和老闆不能刪除，請先移除員工身分" });
      const paths = db.videos.filter((v) => v.user_id === a.p_user).map((v) => v.path);
      db.videos = db.videos.filter((v) => v.user_id !== a.p_user);
      return J(route, 200, paths);
    }
    if (fn === "delete_user") {
      if (!isOwner(uid)) return J(route, 403, { code: "42501", message: "只有老闆可以刪除別人的帳號" });
      if (anyStaff(a.p_user)) return J(route, 403, { code: "42501", message: "員工和老闆不能刪除，請先移除員工身分" });
      audit(uid, null, "user.delete", a.p_user, { username: prof(a.p_user)?.username, nickname: prof(a.p_user)?.nickname });
      dropUser(a.p_user);
      return J(route, 200, null);
    }
    const passwordOk = () => {
      const email = Object.keys(db.users).find((e) => db.users[e].id === uid);
      return !!email && !!a.p_password && db.users[email].password === a.p_password;
    };
    if (fn === "delete_my_videos") {
      if (anyStaff(uid)) return J(route, 403, { code: "42501", message: "員工帳號不能自己刪除，請先請老闆移除員工身分" });
      if (!passwordOk()) return J(route, 200, null);
      const paths = db.videos.filter((v) => v.user_id === uid).map((v) => v.path);
      db.videos = db.videos.filter((v) => v.user_id !== uid);
      return J(route, 200, paths);
    }
    if (fn === "delete_my_account") {
      if (anyStaff(uid)) return J(route, 403, { code: "42501", message: "員工帳號不能自己刪除，請先請老闆移除員工身分" });
      if (!passwordOk()) return J(route, 200, false);
      dropUser(uid);
      return J(route, 200, true);
    }
    // state.noResets：模擬資料庫還沒套用 step27（沒有換線公告的函式），跟 PostgREST 一樣回 PGRST202
    if (state.noResets && ["reset_calendar", "reset_editor_list", "set_reset_editor"].includes(fn))
      return J(route, 404, { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` });
    if (fn === "reset_calendar") {
      const rows = db.resetEvents
        .filter((e) => e.ends_on >= a.p_from && e.starts_on <= a.p_to)
        .map((e) => ({ ...e, spray: e.zone_ids.length > 0 && e.zone_ids.every((id) => zoneOf(id)?.kind === "spray") }))
        .sort((x, y) => x.starts_on.localeCompare(y.starts_on) || x.gym_id.localeCompare(y.gym_id));
      return J(route, 200, rows.map(({ created_by, ...e }) => e));
    }
    if (fn === "reset_editor_list") {
      if (!isOwner(uid)) return J(route, 200, []);
      return J(route, 200, db.resetEditors.map((id) => ({ id, username: prof(id)?.username, nickname: prof(id)?.nickname })));
    }
    if (noOps() && ["usage_viewer_list", "set_usage_viewer"].includes(fn))
      return J(route, 404, { code: "PGRST202", message: `Could not find the function public.${fn}` });
    // 長耐力：這條路線有沒有人記錄過（資料庫還沒套用 step30 時沒有這個函式）
    if (fn === "route_has_ascents") {
      if (state.noHighpoint) return J(route, 404, { code: "PGRST202", message: "Could not find the function public.route_has_ascents" });
      return J(route, 200, db.ascents.some((x) => x.route_id === a.p_route));
    }
    if (fn === "usage_viewer_list") {
      if (!isOwner(uid)) return J(route, 200, []);
      const ids = [...new Set(db.usageViewers.map((v) => v.user_id))];
      return J(route, 200, ids.map((id) => ({ id, username: prof(id)?.username, nickname: prof(id)?.nickname, gym_ids: usageGyms(id) })));
    }
    if (fn === "set_usage_viewer") {
      if (!isOwner(uid)) return J(route, 403, { code: "42501", message: "只有老闆可以設定使用狀況權限" });
      if (!db.gyms.some((g) => g.id === a.p_gym && g.is_live)) return J(route, 404, { code: "P0002", message: "找不到這間館" });
      db.usageViewers = db.usageViewers.filter((v) => !(v.user_id === a.p_user && v.gym_id === a.p_gym));
      if (a.p_on) db.usageViewers.push({ user_id: a.p_user, gym_id: a.p_gym });
      audit(uid, a.p_gym, a.p_on ? "usage_viewer.grant" : "usage_viewer.revoke", a.p_user, { nickname: prof(a.p_user)?.nickname });
      return empty(route);
    }
    if (fn === "set_reset_editor") {
      if (!isOwner(uid)) return J(route, 403, { code: "42501", message: "只有老闆可以設定換線日權限" });
      db.resetEditors = db.resetEditors.filter((id) => id !== a.p_user);
      if (a.p_on) db.resetEditors.push(a.p_user);
      audit(uid, null, a.p_on ? "reset_editor.grant" : "reset_editor.revoke", a.p_user, { nickname: prof(a.p_user)?.nickname });
      return empty(route);
    }
    if (fn === "zone_view") {
      const z = db.zones.find((x) => x.id === a.p_zone);
      if (!z) return J(route, 200, { z: null, g: null, rs: [], as: {}, cs: {} });
      const g = db.gyms.find((x) => x.id === z.gym_id);
      const rs = db.routes.filter((r) => r.zone_id === z.id && !r.archived_at).sort((x, y) => x.grade - y.grade || x.code.localeCompare(y.code));
      const ids = new Set(rs.map((r) => r.id));
      const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k] ?? null]));
      return J(route, 200, {
        z: { ...pick(z, ["id", "gym_id", "code", "name", "photo_path", "photo_width", "photo_height", "next_reset_on", "sort", "grade_system"]), next_reset_on: zoneResetOn(z), kind: z.kind ?? "wall" },
        g: pick(g, ["id", "name", "is_live", "comments_enabled", "sort"]),
        rs: rs.map((r) => ({ kind: "gym", name: null, description: null, holds: null, created_by: null, ...r })),
        as: Object.fromEntries(db.ascents.filter((x) => x.user_id === uid && ids.has(x.route_id)).map((x) => [x.route_id, pick(x, ["id", "route_id", "status", "climbed_on", "feel", "grade_feel", "private_note", "highpoint"])])),
        cs: db.comments.filter((c) => !c.deleted_at && ids.has(c.route_id)).reduce((m, c) => ((m[c.route_id] = (m[c.route_id] ?? 0) + 1), m), {}),
        // 影片數（0044）；state.noVideoThumb 模擬還沒套用 step38（沒有 vs）
        ...(state.noVideoThumb ? {} : { vs: db.videos.filter((v) => ids.has(v.route_id)).reduce((m, v) => ((m[v.route_id] = (m[v.route_id] ?? 0) + 1), m), {}) }),
      });
    }
    if (fn === "zone_progress")
      return J(route, 200, db.zones.filter((z) => z.gym_id === a.p_gym && z.kind !== "spray").sort((x, y) => x.sort - y.sort || x.code.localeCompare(y.code)).map((z) => {
        const rs = db.routes.filter((r) => r.zone_id === z.id && !r.archived_at);
        return { zone_id: z.id, code: z.code, name: z.name, sort: z.sort, photo_path: z.photo_path, next_reset_on: zoneResetOn(z), route_count: rs.length, done_count: rs.filter((r) => db.ascents.some((x) => x.route_id === r.id && x.user_id === uid && x.status !== "project")).length };
      }));
    if (fn === "monthly_stats") {
      const { from, to, prev } = monthBounds(a.p_year, a.p_month);
      const mine = db.ascents.filter((x) => x.user_id === uid && x.status !== "project" && db.routes.find((r) => r.id === x.route_id)?.kind !== "community");
      const cur = mine.filter((x) => x.climbed_on >= from && x.climbed_on < to);
      const grade = (x) => db.routes.find((r) => r.id === x.route_id).grade;
      const by_grade = {}, by_day = {};
      cur.forEach((x) => { by_grade[grade(x)] = (by_grade[grade(x)] || 0) + 1; const d = +x.climbed_on.slice(8); by_day[d] = (by_day[d] || 0) + 1; });
      return J(route, 200, { sends: cur.length, flashes: cur.filter((x) => x.status === "flash").length, days: new Set(cur.map((x) => x.climbed_on)).size, top_grade: cur.filter((x) => grade(x) < 100).length ? Math.max(...cur.map(grade).filter((g) => g < 100)) : null, top_yds: cur.filter((x) => grade(x) >= 100).length ? Math.max(...cur.map(grade).filter((g) => g >= 100)) : null, by_grade, by_day, prev_sends: mine.filter((x) => x.climbed_on >= prev && x.climbed_on < from).length, total_sends: mine.length });
    }
    if (fn === "points_summary") {
      const { from, to, prev } = monthBounds(a.p_year, a.p_month);
      const today = taipeiDay();
      const mine = db.ascents.filter((x) => x.user_id === uid);
      const daily = {};
      mine.forEach((x) => (daily[x.climbed_on] = (daily[x.climbed_on] || 0) + points(x)));
      const inMonth = Object.entries(daily).filter(([d]) => d >= from && d < to);
      const by_day = {};
      inMonth.forEach(([d, p]) => p > 0 && (by_day[+d.slice(8)] = p));
      const best = inMonth.filter(([, p]) => p > 0).sort((x, y) => y[1] - x[1] || y[0].localeCompare(x[0]))[0];
      const shift = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
      let s = daily[today] !== undefined ? today : shift(today, -1), streak = 0;
      while (daily[s] !== undefined) { streak++; s = shift(s, -1); }
      let s7 = 0;
      for (let i = 1; i <= 7; i++) s7 += daily[shift(today, -i)] || 0;
      return J(route, 200, { by_day, month_total: inMonth.reduce((t, [, p]) => t + p, 0), prev_total: Object.entries(daily).filter(([d]) => d >= prev && d < from).reduce((t, [, p]) => t + p, 0), today: daily[today] || 0, avg7: Math.round((s7 / 7) * 10) / 10, best_day: best ? { day: best[0], points: best[1] } : null, streak, total: mine.reduce((t, x) => t + points(x), 0) });
    }
    if (fn === "archive_zone") {
      const z = zoneOf(a.p_zone);
      if (!isStaff(uid, z.gym_id)) return J(route, 403, { code: "42501", message: "沒有權限" });
      let n = 0;
      db.routes.forEach((r) => { if (r.zone_id === z.id && !r.archived_at) { r.archived_at = now(); dropVideos(r.id); n++; } });
      // 換線日改接這一區之後的下一筆公告
      z.next_reset_on = db.resetEvents.filter((e) => e.zone_ids.includes(z.id) && e.starts_on > taipeiDay()).map((e) => e.starts_on).sort()[0] ?? null;
      audit(uid, z.gym_id, "zone.archive_all", z.id, { count: n, zone: z.name });
      return J(route, 200, n);
    }
    if (fn === "delete_comment") {
      const c = db.comments.find((x) => x.id === a.p_comment);
      const r = db.routes.find((x) => x.id === c.route_id);
      const g = zoneOf(r.zone_id).gym_id;
      if (c.user_id !== uid && !isStaff(uid, g)) return J(route, 403, { code: "42501", message: "沒有權限" });
      c.deleted_at = now();
      if (c.user_id !== uid) audit(uid, g, "comment.delete", c.id, { code: r.code, body: c.body, author_nickname: prof(c.user_id)?.nickname });
      return J(route, 200, null);
    }
    if (fn === "delete_video") {
      const v = db.videos.find((x) => x.id === a.p_video);
      if (!v) return J(route, 404, { code: "P0002", message: "找不到這支影片" });
      const g = gymOfRoute(v.route_id);
      if (v.user_id !== uid && !isStaff(uid, g)) return J(route, 403, { code: "42501", message: "沒有權限" });
      db.videos = db.videos.filter((x) => x !== v);
      db.videoLikes = db.videoLikes.filter((l) => l.video_id !== v.id); // 讚跟著刪
      if (v.user_id !== uid) audit(uid, g, "video.delete", v.id, { code: db.routes.find((r) => r.id === v.route_id).code, author_nickname: prof(v.user_id)?.nickname, caption: v.caption });
      return J(route, 200, v.path);
    }
    if (fn === "video_paths_for_routes") {
      const mineCommunity = (id) => { const r = db.routes.find((x) => x.id === id); return r?.kind === "community" && r.created_by === uid; };
      return J(route, 200, db.videos.filter((v) => a.p_routes.includes(v.route_id) && (isStaff(uid, gymOfRoute(v.route_id)) || mineCommunity(v.route_id))).map((v) => v.path));
    }
    if (fn === "video_paths_for_zone") {
      const z = zoneOf(a.p_zone);
      if (!z || !isStaff(uid, z.gym_id)) return J(route, 200, []);
      const ids = db.routes.filter((r) => r.zone_id === z.id && !r.archived_at).map((r) => r.id);
      return J(route, 200, db.videos.filter((v) => ids.includes(v.route_id)).map((v) => v.path));
    }
    if (fn === "video_usage") {
      if (!isStaff(uid, a.p_gym)) return J(route, 200, null);
      const fs = Object.entries(db.vfiles).filter(([k]) => k.startsWith(a.p_gym + "/"));
      return J(route, 200, { count: fs.length, bytes: fs.reduce((t, [, f]) => t + f.buf.length, 0) });
    }
    if (fn === "orphan_video_paths") {
      if (!isStaff(uid, a.p_gym)) return J(route, 200, []);
      const hourAgo = new Date(Date.now() - 3600000).toISOString();
      return J(route, 200, Object.entries(db.vfiles).filter(([k, f]) => k.startsWith(a.p_gym + "/") && f.created_at < hourAgo && !db.videos.some((v) => v.path === k)).map(([k]) => k));
    }
    if (fn === "orphan_video_thumb_paths") {
      if (state.noVideoThumb) return J(route, 404, { code: "PGRST202", message: "Could not find the function public.orphan_video_thumb_paths" });
      if (!isStaff(uid, a.p_gym)) return J(route, 200, []);
      const hourAgo = new Date(Date.now() - 3600000).toISOString();
      return J(route, 200, Object.entries(db.tfiles).filter(([k, f]) => k.startsWith(a.p_gym + "/") && f.created_at < hourAgo && !db.videos.some((v) => v.thumb_path === k)).map(([k]) => k));
    }
    if (fn === "reorder_zones") {
      if (!isMgr(uid, a.p_gym)) return J(route, 403, { code: "42501", message: "只有店長可以調整區域順序" });
      const zs = db.zones.filter((z) => z.gym_id === a.p_gym);
      if (a.p_zones.length !== zs.length || new Set(a.p_zones).size !== zs.length || !zs.every((z) => a.p_zones.includes(z.id)))
        return J(route, 400, { code: "22023", message: "區域清單不完整，請重新整理後再試" });
      a.p_zones.forEach((id, i) => (zoneOf(id).sort = i + 1));
      audit(uid, a.p_gym, "zone.reorder", null, { zones: a.p_zones.map((id) => zoneOf(id).name) });
      return J(route, 200, null);
    }
    if (fn === "edit_comment") {
      const c = db.comments.find((x) => x.id === a.p_comment && !x.deleted_at);
      if (!c || c.user_id !== uid) return J(route, 403, { code: "42501", message: "只能編輯自己的留言" });
      if (hasLink(a.p_body)) return J(route, 400, { code: "22023", message: "留言不能放網址" });
      c.body = a.p_body.trim();
      c.edited_at = now();
      return J(route, 200, null);
    }
    if (fn === "profile_card") {
      const p = prof(a.p_user);
      if (!p) return J(route, 404, { code: "P0002", message: "找不到這個人" });
      const self = a.p_user === uid;
      if (!p.card_public && !self) return J(route, 200, { nickname: p.nickname, public: false, self: false });
      const sends = db.ascents.filter((x) => x.user_id === a.p_user && x.status !== "project").map((x) => db.routes.find((r) => r.id === x.route_id));
      const axes = [["力量"], ["指力"], ["動態", "協調"], ["耐力"], ["技巧", "腳法", "平衡"], ["柔軟"]];
      const raw = axes.map((t) => sends.filter((r) => r.style_tags.some((g) => t.includes(g))).reduce((n, r) => n + base(r.grade), 0));
      const mx = Math.max(...raw);
      // 同 0035：常去的館照場館順序；state.noHomeGyms 模擬資料庫還沒套用 step31（只有一間 home_gym）
      const homes = [...db.gyms].sort((x, y) => x.sort - y.sort).filter((g) => (p.home_gyms ?? []).includes(g.id)).map((g) => g.id);
      return J(route, 200, {
        nickname: p.nickname, public: !!p.card_public, self, bio: p.bio ?? null, years: p.climbing_years ?? null,
        ...(state.noHomeGyms ? { home_gym: p.home_gym ?? null } : { home_gym: homes[0] ?? null, home_gyms: homes }),
        self_stats: p.self_stats ?? null, ability: raw.map((v) => (mx ? Math.round((100 * v) / mx) : 0)),
        ability_sends: sends.filter((r) => r.style_tags.length).length, total_sends: sends.length, month_sends: sends.length,
        top_grade: sends.some((r) => r.grade < 100) ? Math.max(...sends.filter((r) => r.grade < 100).map((r) => r.grade)) : null,
        top_yds: sends.some((r) => r.grade >= 100) ? Math.max(...sends.filter((r) => r.grade >= 100).map((r) => r.grade)) : null,
      });
    }
    // 原岩夥伴（0047）：只能存自己的、只能選開放中的館的夥伴、顏色要在色盤裡
    if (fn === "save_my_mascot") {
      if (state.noMascot) return J(route, 404, { code: "PGRST202", message: "Could not find the function public.save_my_mascot(p_mascot) in the schema cache" });
      if (!uid) return J(route, 401, { code: "42501", message: "請先登入" });
      const v = a.p_mascot;
      const GYM_OF = { mingde: "mingde", wanhua: "g2", zhonghe: "g3", nangang: "g4", xindian: "g5", zhongli: "g6" };
      const PAL = ["#6d3540", "#6959b2", "#01bcb5", "#066d6a", "#006382", "#304562", "#d7263d", "#f28a1e", "#f4d03f", "#2e9e5b", "#2f6fd6", "#f07bb5", "#7b4b2a", "#8e9196", "#1a1a1a", "#f8c5a3", "#b5dcf2", "#a7d398", "#f5b1aa", "#f2e5dc", "#fbd8b5", "#ffe9a8", "#d9c6f0", "#ffffff"];
      const ok = v == null || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).every((k) => ["id", "colors", "bg"].includes(k)) && Object.hasOwn(GYM_OF, v.id) && (v.colors == null || Array.isArray(v.colors)) && (v.colors ?? []).length <= 3 && (v.colors ?? []).every((c) => c == null || PAL.includes(c)) && (v.bg == null || PAL.slice(0, 6).includes(v.bg)));
      if (!ok) return J(route, 400, { code: "22023", message: "夥伴或顏色不對，請重新選一次" });
      if (v && !db.gyms.find((g) => g.id === GYM_OF[v.id])?.is_live) return J(route, 400, { code: "22023", message: "這隻夥伴即將登場，現在還不能選" });
      prof(uid).mascot = v;
      return J(route, 200, null);
    }
    // 攀岩角色（0054）：自己的數字（攀爬日、上攀、Flash、V5 以上；完攀類不算岩友路線）、存角色（款式要認得、還沒解鎖的擋下）
    // state.noClimber 模擬資料庫還沒套用 step48
    const climbStats = (u) => {
      const mine = db.ascents.filter((x) => x.user_id === u);
      const sent = mine.filter((x) => x.status !== "project").map((x) => ({ x, r: db.routes.find((r) => r.id === x.route_id) })).filter(({ r }) => r && r.kind !== "community");
      return {
        days: new Set(mine.map((x) => x.climbed_on)).size,
        rope: sent.filter(({ r }) => r.grade >= 100).length,
        flash: sent.filter(({ x }) => x.status === "flash").length,
        v5: sent.filter(({ r }) => r.grade >= 5 && r.grade < 100).length,
      };
    };
    if (fn === "my_climb_stats") {
      if (state.noClimber) return J(route, 404, { code: "PGRST202", message: "Could not find the function public.my_climb_stats in the schema cache" });
      return J(route, 200, uid ? climbStats(uid) : null);
    }
    if (fn === "save_my_climber") {
      if (state.noClimber) return J(route, 404, { code: "PGRST202", message: "Could not find the function public.save_my_climber(p_climber) in the schema cache" });
      if (!uid) return J(route, 401, { code: "42501", message: "請先登入" });
      const v = a.p_climber;
      const ok = v == null || (typeof v === "object" && !Array.isArray(v) && Object.entries(v).every(([k, x]) => CLIMBER_VALUES[k]?.includes(x)));
      if (!ok) return J(route, 400, { code: "22023", message: "角色的款式不對，請重新選一次" });
      const st = climbStats(uid);
      const locked = v && Object.entries(v).some(([k, x]) => {
        const r = CLIMBER_RULES[`${k}:${x}`];
        return r && (r.sp || st[r.t] < r.n);
      });
      if (locked) return J(route, 400, { code: "22023", message: "有款式還沒解鎖，請重新選一次" });
      state.climberSaves = (state.climberSaves ?? 0) + 1;
      prof(uid).climber = v;
      return J(route, 200, null);
    }
    if (fn === "save_my_card") {
      const bio = (a.p_bio || "").trim();
      if (bio.length > 60 || /(https?:\/\/|www\.|line|instagram|\big\b|@|[0-9]{7,})/i.test(bio))
        return J(route, 400, { code: "22023", message: "自我介紹最多 60 字，而且不能放聯絡方式（網址、電話、LINE、IG 等）" });
      // 同 0035：新版送好幾間（p_home_gyms）；舊版送一間（p_home_gym），存回原本的第一間就不動清單，換別間只留那一間
      if ("p_home_gyms" in a && state.noHomeGyms) return J(route, 404, { code: "PGRST202", message: "Could not find the function public.save_my_card(p_bio, p_home_gyms, p_public, p_self, p_years) in the schema cache" });
      const me = prof(uid);
      let list;
      if ("p_home_gyms" in a) {
        const want = a.p_home_gyms ?? [];
        if (want.some((id) => !db.gyms.some((g) => g.id === id))) return J(route, 400, { code: "22023", message: "常去的館要從清單裡選" });
        list = want;
      } else {
        const first = [...db.gyms].sort((x, y) => x.sort - y.sort).find((g) => (me.home_gyms ?? []).includes(g.id))?.id;
        list = !a.p_home_gym ? [] : a.p_home_gym === first ? me.home_gyms : [a.p_home_gym];
      }
      const homes = [...db.gyms].sort((x, y) => x.sort - y.sort).filter((g) => list.includes(g.id)).map((g) => g.id);
      Object.assign(me, { card_public: !!a.p_public, bio: bio || null, climbing_years: a.p_years || null, home_gyms: homes, home_gym: homes[0] ?? null, self_stats: a.p_self });
      return J(route, 200, null);
    }
    if (fn === "clear_card_bio") {
      if (!isMgr(uid, a.p_gym)) return J(route, 403, { code: "42501", message: "只有店長可以清除自我介紹" });
      const p = prof(a.p_user);
      if (!p.card_public) return J(route, 400, { code: "22023", message: "這張人物卡沒有公開，不需要清除" });
      audit(uid, a.p_gym, "card.clear", p.id, { nickname: p.nickname, bio: p.bio });
      p.bio = null;
      return J(route, 200, null);
    }
    if (fn === "spray_list") {
      let rs = db.routes.filter((r) => r.zone_id === a.p_zone && !r.archived_at && (r.kind ?? "gym") === a.p_kind && (a.p_grade == null || r.grade === a.p_grade));
      if (a.p_sort === "mine") rs = rs.filter((r) => r.created_by === uid);
      const rows = rs.map((r) => ({
        id: r.id, code: r.code, name: r.name, grade: r.grade, description: r.description ?? null, holds: r.holds, kind: r.kind, created_at: r.created_at,
        // step44：岩館路線照片；state.noRoutePhoto 模擬還沒套用（0018 的 spray_list 沒有這個欄位）
        ...(state.noRoutePhoto ? {} : { photo_path: r.photo_path ?? null }),
        style_tags: r.style_tags, comments_enabled: r.comments_enabled, author: prof(r.created_by)?.nickname ?? null,
        sends: new Set(db.ascents.filter((x) => x.route_id === r.id && x.status !== "project").map((x) => x.user_id)).size,
        likes: db.routeLikes.filter((l) => l.route_id === r.id).length, liked: db.routeLikes.some((l) => l.route_id === r.id && l.user_id === uid),
        mine: r.created_by === uid,
      }));
      const key = a.p_sort === "sends" ? "sends" : a.p_sort === "likes" ? "likes" : null;
      rows.sort((x, y) => (key ? y[key] - x[key] : 0) || y.created_at.localeCompare(x.created_at));
      return J(route, 200, rows.slice(a.p_offset, a.p_offset + a.p_limit));
    }
    if (fn === "record_open") {
      if (!uid) return J(route, 401, { message: "JWT" });
      const day = taipeiDay();
      const ex = db.opens.find((o) => o.user_id === uid && o.day === day);
      if (ex) ex.gym_id = a.p_gym ?? ex.gym_id;
      else db.opens.push({ user_id: uid, day, gym_id: a.p_gym ?? null });
      return J(route, 200, null);
    }
    if (fn === "usage_stats") {
      // 同 usage_stats：全部館只有老闆；指定館要老闆授權（還沒套用 step28 的舊資料庫：那一館的店長）
      const ok = a.p_gym == null ? isOwner(uid) : noOps() ? isMgr(uid, a.p_gym) : canViewUsage(uid, a.p_gym);
      if (!ok) return J(route, 403, { code: "42501", message: "使用狀況要老闆授權才看得到" });
      const since = state.usageSince; // 統計起始日（null＝全部）
      const opens = db.opens.filter((o) => (a.p_gym == null || o.gym_id === a.p_gym) && (!since || o.day >= since));
      const days = Array.from({ length: 30 }, (_, i) => taipeiDay(i - 29));
      const sends = db.ascents.filter((x) => x.status !== "project" && (!since || x.climbed_on >= since));
      return J(route, 200, {
        since, registered: db.profiles.length, registered_since: since ? 0 : db.profiles.length, registered_before: since ? db.profiles.length : 0,
        new7: since ? 0 : db.profiles.length,
        today: new Set(opens.filter((o) => o.day === taipeiDay()).map((o) => o.user_id)).size,
        week: new Set(opens.map((o) => o.user_id)).size, month: new Set(opens.map((o) => o.user_id)).size, sends30: sends.length,
        daily: days.map((d) => ({ day: d, users: new Set(opens.filter((o) => o.day === d).map((o) => o.user_id)).size, sends: sends.filter((s) => s.climbed_on === d).length })),
        gyms: a.p_gym == null ? db.gyms.filter((g) => g.is_live).map((g) => ({ gym: g.id, name: g.name, users: new Set(opens.filter((o) => o.gym_id === g.id).map((o) => o.user_id)).size, sends: 0 })) : null,
        top_routes: [],
      });
    }
    // 數據分析（step45）；state.noInsights 模擬資料庫還沒套用
    if (fn === "usage_insights" || fn === "route_insights") {
      if (state.noInsights) return J(route, 404, { code: "PGRST202", message: `Could not find the function public.${fn}` });
      const gym = a.p_gym ?? null;
      const ok =
        fn === "usage_insights"
          ? gym == null ? isOwner(uid) : canViewUsage(uid, gym)
          : gym != null && (canViewUsage(uid, gym) || db.staff_roles.some((x) => x.user_id === uid && x.gym_id === gym));
      if (!ok) return J(route, 403, { code: "42501", message: fn === "usage_insights" ? "使用狀況要老闆授權才看得到" : "只有這間館的員工和老闆授權的人看得到路線分析" });
      const gymOfRoute = (rid) => zoneOf(db.routes.find((r) => r.id === rid)?.zone_id)?.gym_id;
      const tday = (ts) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date(ts));
      const today = taipeiDay();
      const daysAgo = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
      if (fn === "usage_insights") {
        const opens = db.opens.filter((o) => gym == null || o.gym_id === gym);
        const wk = (w) => new Set(opens.filter((o) => Math.floor(daysAgo(o.day) / 7) === w).map((o) => o.user_id));
        const ret = (w) => { const b = wk(w), n = wk(w - 1); return { base: b.size, back: [...b].filter((u) => n.has(u)).length }; };
        const days = new Map();
        for (const o of opens.filter((o) => daysAgo(o.day) < 30)) days.set(o.user_id, (days.get(o.user_id) ?? 0) + 1);
        const best = new Map();
        for (const x of db.ascents.filter((x) => x.status !== "project" && (gym == null || gymOfRoute(x.route_id) === gym))) {
          const g = db.routes.find((r) => r.id === x.route_id).grade;
          if (g <= 10) best.set(x.user_id, Math.max(best.get(x.user_id) ?? -9, g));
        }
        const lv = [...best.values()];
        const hours = Array(24).fill(0);
        hours[(new Date().getUTCHours() + 8) % 24] = opens.filter((o) => o.day === today).length;
        const d14 = Array.from({ length: 14 }, (_, i) => taipeiDay(i - 13));
        const mascots = {};
        if (!state.noMascot) for (const p of db.profiles) mascots[p.mascot?.id ?? ""] = (mascots[p.mascot?.id ?? ""] ?? 0) + 1;
        return J(route, 200, {
          since: state.usageSince,
          retention: { now: ret(1), prev: ret(2), cohort: null },
          newbie: { n: 0, next_day: 0, first_route: 0, two_days: 0 },
          groups: { regular: [...days.values()].filter((n) => n >= 8).length, sometimes: [...days.values()].filter((n) => n >= 2 && n < 8).length, once: [...days.values()].filter((n) => n === 1).length },
          levels: { easy: lv.filter((g) => g <= 2).length, mid: lv.filter((g) => g >= 3 && g <= 5).length, hard: lv.filter((g) => g >= 6).length },
          progress: { climbers: 0, improved: 0 },
          hours,
          daily: d14.map((d) => ({
            day: d,
            comments: db.comments.filter((c) => !c.deleted_at && tday(c.created_at) === d && (gym == null || gymOfRoute(c.route_id) === gym)).length,
            videos: db.videos.filter((v) => tday(v.created_at) === d && (gym == null || gymOfRoute(v.route_id) === gym)).length,
            likes: 0,
          })),
          top_video: null,
          top_comment: null,
          mascots: state.noMascot ? null : mascots,
        });
      }
      const zs = db.zones.filter((z) => z.gym_id === gym && z.kind !== "spray");
      const wall = db.routes.filter((r) => zs.some((z) => z.id === r.zone_id) && r.kind !== "community" && !r.archived_at);
      const ofRoute = (r) => db.ascents.filter((x) => x.route_id === r.id);
      const ref = (r) => ({ zone: zoneOf(r.zone_id).name, code: r.code, grade: r.grade, color: r.hold_color, name: r.name ?? null });
      const sends = db.ascents.filter((x) => x.status !== "project" && zs.some((z) => z.id === db.routes.find((r) => r.id === x.route_id)?.zone_id));
      const bands = [["easy", -1, 2], ["mid", 3, 5], ["hard", 6, 10], ["rope_easy", 100, 103], ["rope_mid", 104, 107], ["rope_hard", 108, 119]];
      const gradeOf = (x) => db.routes.find((r) => r.id === x.route_id).grade;
      const counts = new Map();
      for (const x of sends) counts.set(x.route_id, new Set([...(counts.get(x.route_id) ?? []), x.user_id]));
      return J(route, 200, {
        since: state.usageSince,
        routes: wall.map((r) => ({
          id: r.id, ...(state.noRouteZone ? {} : { zone_id: r.zone_id }), ...ref(r), days: daysAgo(tday(r.created_at)),
          tried: ofRoute(r).length, sent: ofRoute(r).filter((x) => x.status !== "project").length, flash: ofRoute(r).filter((x) => x.status === "flash").length,
          soft: ofRoute(r).filter((x) => x.grade_feel === -1).length, hard: ofRoute(r).filter((x) => x.grade_feel === 1).length,
        })),
        zones: zs.map((z) => ({ name: z.name, records: db.ascents.filter((x) => db.routes.find((r) => r.id === x.route_id)?.zone_id === z.id).length, users: 0, routes: wall.filter((r) => r.zone_id === z.id).length })),
        supply: bands.map(([band, lo, hi]) => ({ band, wall: wall.filter((r) => r.grade >= lo && r.grade <= hi).length, sends: sends.filter((x) => gradeOf(x) >= lo && gradeOf(x) <= hi).length })),
        resets: [],
        top: [...counts].sort((x, y) => y[1].size - x[1].size).slice(0, 5).map(([rid, us]) => ({ id: rid, ...(state.noRouteZone ? {} : { zone_id: db.routes.find((r) => r.id === rid).zone_id }), ...ref(db.routes.find((r) => r.id === rid)), n: us.size })),
      });
    }
    if (fn === "set_usage_since") {
      if (!isOwner(uid)) return J(route, 403, { code: "42501", message: "只有老闆可以重新開始統計" });
      state.usageSince = a.p_day ?? taipeiDay(1); // 測試用：設成明天，今天的使用就不算
      audit(uid, null, "usage.reset", null, { since: state.usageSince });
      return J(route, 200, state.usageSince);
    }
    if (fn === "lookup_user") {
      const p = db.profiles.find((x) => x.username === a.p_username.toLowerCase());
      return p ? J(route, 200, { id: p.id, nickname: p.nickname }) : J(route, 404, { code: "P0002", message: "找不到這個帳號，請對方先註冊" });
    }
    // 路線回報（step47）；state.noReports 模擬資料庫還沒套用（沒有這些函式和資料表）
    if (["submit_route_report", "route_reports_list", "handle_route_reports"].includes(fn)) {
      if (state.noReports) return J(route, 404, { code: "PGRST202", message: `Could not find the function public.${fn}` });
      const err = (msg, code = "22023") => J(route, code === "42501" ? 403 : 400, { code, message: msg });
      if (!uid) return err("要先登入才能回報", "42501");
      if (fn === "submit_route_report") {
        if (suspended(uid)) return err("帳號暫停中，暫時不能回報", "42501");
        const k = a.p_kind;
        if (!["missing", "color", "pin", "gone"].includes(k)) return err("回報的種類不對");
        let zid = a.p_zone;
        if (k === "missing") {
          const z = zoneOf(zid);
          if (a.p_route || !z || z.kind === "spray" || !db.gyms.find((g) => g.id === z.gym_id)?.is_live) return err("這一區不能回報");
        } else {
          const r = db.routes.find((x) => x.id === a.p_route);
          const z = r && zoneOf(r.zone_id);
          if (!r || r.archived_at || (r.kind ?? "gym") !== "gym" || z.kind === "spray" || seqN(r) || !db.gyms.find((g) => g.id === z.gym_id)?.is_live) return err("這條路線不能回報（可能已經下架）");
          zid = r.zone_id;
        }
        if (["missing", "color"].includes(k) && !a.p_color) return err("請選岩點顏色");
        if (k === "missing" && a.p_grade != null && !(zoneOf(zid).grade_system === "v" ? a.p_grade >= -1 && a.p_grade <= 10 : a.p_grade >= 100 && a.p_grade <= 119)) return err("難度不對");
        if (["missing", "pin"].includes(k) && (a.p_x == null || a.p_y == null)) return err("請在照片上點出起步點");
        const note = (a.p_note ?? "").trim() || null;
        if (note && (note.length > 100 || hasLink(note))) return err("補充說明最多 100 字，不能放網址");
        const dayAgo = new Date(Date.now() - 86400000).toISOString();
        if (db.reports.filter((x) => x.user_id === uid && x.created_at > dayAgo).length >= 10) return J(route, 400, { code: "54000", message: "今天已經回報 10 則了，明天再來，謝謝你！" });
        const id = uuid();
        db.reports.push({
          id, user_id: uid, zone_id: zid, route_id: k === "missing" ? null : a.p_route, kind: k,
          hold_color: ["missing", "color"].includes(k) ? a.p_color : null, grade_guess: k === "missing" ? (a.p_grade ?? null) : null,
          pin_x: ["missing", "pin"].includes(k) ? a.p_x : null, pin_y: ["missing", "pin"].includes(k) ? a.p_y : null,
          note, status: "new", result_route_id: null, handled_by: null, handled_at: null, created_at: now(),
        });
        return J(route, 200, id);
      }
      if (fn === "route_reports_list") {
        if (a.p_gym == null ? !isOwner(uid) : !isStaff(uid, a.p_gym)) return err("只有這間館的員工看得到回報", "42501");
        const rows = db.reports
          .filter((x) => x.status === "new" && (a.p_gym == null || zoneOf(x.zone_id).gym_id === a.p_gym) && !(x.route_id && db.routes.find((y) => y.id === x.route_id)?.archived_at))
          .map((x) => {
            const z = zoneOf(x.zone_id);
            const r = x.route_id ? db.routes.find((y) => y.id === x.route_id) : null;
            return {
              id: x.id, zone_id: x.zone_id, zone_code: z.code, zone_name: z.name, gym_id: z.gym_id,
              route_id: x.route_id, route_code: r?.code ?? null, route_color: r?.hold_color ?? null, route_grade: r?.grade ?? null, route_x: r?.pin_x ?? null, route_y: r?.pin_y ?? null,
              kind: x.kind, hold_color: x.hold_color, grade_guess: x.grade_guess, pin_x: x.pin_x, pin_y: x.pin_y, note: x.note,
              user_id: x.user_id, nickname: prof(x.user_id)?.nickname ?? null, created_at: x.created_at, _sort: z.sort,
            };
          })
          .sort((p, q) => p._sort - q._sort || p.created_at.localeCompare(q.created_at))
          .map(({ _sort, ...x }) => x);
        return J(route, 200, rows);
      }
      if (fn === "handle_route_reports") {
        if (!["added", "rejected", "fixed", "ok"].includes(a.p_status)) return err("處理狀態不對");
        if (a.p_route && a.p_status === "rejected") return err("「不是路線」不用選路線");
        let n = 0;
        for (const x of db.reports.filter((y) => (a.p_ids ?? []).includes(y.id) && y.status === "new")) {
          const z = zoneOf(x.zone_id);
          if (!isStaff(uid, z.gym_id)) return err("只有這間館的員工可以處理回報", "42501");
          const t = a.p_route ? db.routes.find((y) => y.id === a.p_route) : null;
          if (a.p_route && t?.zone_id !== x.zone_id) return err("路線不在回報的那一區");
          Object.assign(x, { status: a.p_status, result_route_id: a.p_route ?? null, handled_by: uid, handled_at: now() });
          const r0 = x.route_id ? db.routes.find((y) => y.id === x.route_id) : null;
          audit(uid, z.gym_id, "report.handle", x.id, { kind: x.kind, status: a.p_status, route: a.p_route ?? null, zone: z.name, code: t?.code ?? r0?.code ?? null, color: x.hold_color });
          n++;
        }
        return J(route, 200, n);
      }
    }
    if (fn === "feedback_list") {
      if (!isOwner(uid)) return J(route, 403, { code: "42501", message: "只有老闆可以看所有回饋" });
      const rows = db.feedback.filter((f) => !a.p_status || f.status === a.p_status).sort((x, y) => y.created_at.localeCompare(x.created_at));
      return J(route, 200, rows.map((f) => ({ ...f, nickname: prof(f.user_id)?.nickname ?? null, username: prof(f.user_id)?.username ?? null })));
    }
    if (fn === "search_users") {
      if (!(isOwner(uid) || db.staff_roles.some((s) => s.user_id === uid && s.role === "manager"))) return J(route, 403, { code: "42501", message: "沒有權限" });
      const q = (a.p_query ?? "").trim().toLowerCase();
      if (!q || (q.length < 2 && /^[ -~]*$/.test(q))) return J(route, 200, []);
      const hits = db.profiles.filter((p) => p.username.includes(q) || (p.nickname ?? "").toLowerCase().includes(q)).slice(0, 5);
      return J(route, 200, hits.map((p) => ({ id: p.id, username: p.username, nickname: p.nickname, role: db.staff_roles.find((s) => s.user_id === p.id && s.gym_id === a.p_gym)?.role ?? null })));
    }
    if (fn === "assign_staff_user") {
      const p = db.profiles.find((x) => x.id === a.p_user);
      if (!(isOwner(uid) || (a.p_role === "setter" && isMgr(uid, a.p_gym)))) return J(route, 403, { code: "42501", message: "沒有權限" });
      if (!isOwner(uid) && db.staff_roles.some((s) => s.user_id === p.id && s.gym_id === a.p_gym && s.role === "manager")) return J(route, 403, { code: "42501", message: "店長的角色只有老闆能修改" });
      db.staff_roles = db.staff_roles.filter((s) => !(s.user_id === p.id && s.gym_id === a.p_gym));
      db.staff_roles.push({ user_id: p.id, gym_id: a.p_gym, role: a.p_role });
      audit(uid, a.p_gym, "staff.assign", p.id, { role: a.p_role, nickname: p.nickname, username: p.username });
      return J(route, 200, p.id);
    }
    if (fn === "assign_staff") {
      const p = db.profiles.find((x) => x.username === a.p_username);
      if (!(isOwner(uid) || (a.p_role === "setter" && isMgr(uid, a.p_gym)))) return J(route, 403, { code: "42501", message: "沒有權限" });
      db.staff_roles = db.staff_roles.filter((s) => !(s.user_id === p.id && s.gym_id === a.p_gym));
      db.staff_roles.push({ user_id: p.id, gym_id: a.p_gym, role: a.p_role });
      audit(uid, a.p_gym, "staff.assign", p.id, { role: a.p_role, nickname: p.nickname, username: p.username });
      return J(route, 200, p.id);
    }
    if (fn === "remove_staff") {
      db.staff_roles = db.staff_roles.filter((s) => !(s.user_id === a.p_user && s.gym_id === a.p_gym));
      return J(route, 200, null);
    }
    // 大滿貫兌換（step40）；state.noSlam 模擬資料庫還沒套用（沒有這些函式）
    if (["slam_info", "claim_slam", "slam_lookup", "redeem_slam", "set_slam_settings", "slam_claim_list"].includes(fn)) {
      if (state.noSlam) return J(route, 404, { code: "PGRST202", message: `Could not find the function public.${fn}` });
      const err = (msg, code = "P0001") => J(route, code === "42501" ? 403 : 400, { code, message: msg });
      // 開放的館現在牆上的岩館路線（Spray Wall、下架、岩友路線不算），完成＝Flash 或完攀
      const progress = (user, grade) => {
        const rs = db.routes.filter((r) => {
          const z = zoneOf(r.zone_id);
          return r.grade === grade && !r.archived_at && r.kind !== "community" && z && z.kind !== "spray" && db.gyms.find((g) => g.id === z.gym_id)?.is_live;
        });
        const done = rs.map((r) => db.ascents.find((x) => x.user_id === user && x.route_id === r.id && ["flash", "send"].includes(x.status))).filter(Boolean);
        return { total: rs.length, done: done.length, achieved_on: done.map((x) => x.climbed_on).sort().pop() ?? null };
      };
      const pub = ({ code, grade, total, achieved_on, created_at, expires_at, redeemed_at, redeemed_gym }) => ({ code, grade, total, achieved_on, created_at, expires_at, redeemed_at, redeemed_gym });
      const live = (c) => !c.redeemed_at && Date.parse(c.expires_at) > Date.now();
      const norm = (c) => String(c ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
      if (fn === "slam_info") {
        if (!uid) return err("請先登入", "42501");
        const mine = db.slamClaims.filter((c) => c.user_id === uid);
        const grades = [...new Set(mine.map((c) => c.grade))].sort((a, b) => a - b);
        const claims = grades.map((g) => mine.filter((c) => c.grade === g).sort((a, b) => !!b.redeemed_at - !!a.redeemed_at || b.created_at.localeCompare(a.created_at))[0]);
        return J(route, 200, { ...state.slam, claims: claims.map(pub) });
      }
      if (fn === "claim_slam") {
        if (!uid) return err("請先登入", "42501");
        if (!state.slam.enabled && !isOwner(uid)) return err("大滿貫兌換活動還沒開始");
        const mine = db.slamClaims.filter((c) => c.user_id === uid && c.grade === a.p_grade);
        if (mine.some((c) => c.redeemed_at)) return err("這個難度已經兌換過了");
        const p = progress(uid, a.p_grade);
        if (p.total < state.slam.min_routes) return err(`這個難度牆上要有 ${state.slam.min_routes} 條以上才能兌換（現在 ${p.total} 條）`);
        if (p.done < p.total) return err(`這個難度牆上還有 ${p.total - p.done} 條沒完成（${p.done} / ${p.total}）`);
        let c = mine.filter((x) => !x.redeemed_at && Date.parse(x.expires_at) > Date.now() + 3600000).sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
        if (!c) {
          const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          const code = Array.from(crypto.randomBytes(8), (b) => abc[b % 32]).join("");
          c = { code, user_id: uid, grade: a.p_grade, total: p.total, achieved_on: p.achieved_on, created_at: now(), expires_at: new Date(Date.now() + state.slam.valid_days * 86400000).toISOString(), redeemed_at: null, redeemed_gym: null, redeemed_by: null };
          db.slamClaims.push(c);
        }
        return J(route, 200, pub(c));
      }
      if (fn === "slam_lookup") {
        if (!isOwner(uid) && !db.staff_roles.some((x) => x.user_id === uid)) return err("只有員工可以查兌換碼", "42501");
        const c = db.slamClaims.find((x) => x.code === norm(a.p_code));
        if (!c) return J(route, 200, null);
        const p = progress(c.user_id, c.grade);
        return J(route, 200, { ...pub(c), nickname: prof(c.user_id)?.nickname ?? null, redeemed_by: prof(c.redeemed_by)?.nickname ?? null, now_total: p.total, now_done: p.done, min_routes: state.slam.min_routes, enabled: state.slam.enabled });
      }
      if (fn === "redeem_slam") {
        if (!isOwner(uid) && !db.staff_roles.some((x) => x.user_id === uid && x.gym_id === a.p_gym)) return err("只有這間館的員工可以兌換", "42501");
        if (!db.gyms.some((g) => g.id === a.p_gym && g.is_live)) return err("找不到這間館", "P0002");
        if (!state.slam.enabled && !isOwner(uid)) return err("大滿貫兌換活動還沒開始");
        const c = db.slamClaims.find((x) => x.code === norm(a.p_code));
        if (!c) return err("找不到這組兌換碼", "P0002");
        if (c.redeemed_at) return err("這組兌換碼已經兌換過了");
        if (Date.parse(c.expires_at) <= Date.now()) return err("兌換碼過期了，請顧客重新打開兌換卡拿新的碼");
        if (c.user_id === uid && !isOwner(uid)) return err("不能兌換自己的兌換碼，請找其他員工", "42501");
        const p = progress(c.user_id, c.grade);
        if (p.total < state.slam.min_routes || p.done < p.total) return err(`牆上這個難度現在沒有全部完成（${p.done} / ${p.total} 條），不能兌換`);
        Object.assign(c, { redeemed_at: now(), redeemed_by: uid, redeemed_gym: a.p_gym });
        audit(uid, a.p_gym, "slam.redeem", null, { nickname: prof(c.user_id)?.nickname, grade: c.grade, code: c.code });
        return J(route, 200, pub(c));
      }
      if (fn === "set_slam_settings") {
        if (!isOwner(uid)) return err("只有老闆可以改大滿貫兌換設定", "42501");
        state.slam = { enabled: a.p_enabled, min_routes: a.p_min_routes, valid_days: a.p_valid_days, prize: (a.p_prize ?? "").trim() || null };
        return empty(route);
      }
      if (fn === "slam_claim_list") {
        if (!isOwner(uid)) return err("只有老闆可以看兌換紀錄", "42501");
        const list = [...db.slamClaims].sort((x, y) => (y.redeemed_at ?? y.created_at).localeCompare(x.redeemed_at ?? x.created_at));
        return J(route, 200, list.map((c) => ({ ...pub(c), nickname: prof(c.user_id)?.nickname ?? null, redeemed_by: prof(c.redeemed_by)?.nickname ?? null })));
      }
    }
    return J(route, 404, { message: "mock: 沒有這個 rpc " + fn });
  }

  async function handler(route) {
    if (state.offline) return route.abort("internetdisconnected");
    const req = route.request();
    const url = new URL(req.url());
    const m = req.method();
    const sp = url.searchParams;
    if (m === "OPTIONS") return empty(route);
    const uid = uidOf(req);
    let body = null;
    try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { /* 上傳檔案不是 JSON */ }
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const out = (rows) => (single ? (rows[0] ? J(route, 200, rows[0]) : J(route, 406, { message: "not found" })) : J(route, 200, rows));
    const p = url.pathname;

    // Auth
    if (p === "/auth/v1/signup") {
      if (state.signupError) return J(route, state.signupError.status, state.signupError.body);
      if (db.users[body.email]) return J(route, 422, { error_code: "user_already_exists", msg: "User already registered" });
      addUser(body.email.split("@")[0], body.password);
      return J(route, 200, session(body.email, db.users[body.email]));
    }
    if (p === "/auth/v1/token" && sp.get("grant_type") === "refresh_token") {
      // state.refreshFail：模擬收訊差、換新登入失敗（跟沒網路一樣）
      if (state.refreshFail) return route.abort("connectionreset");
      const email = (body?.refresh_token ?? "").replace(/^r:/, "");
      return db.users[email] ? J(route, 200, session(email, db.users[email])) : J(route, 400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    }
    if (p === "/auth/v1/token") {
      const u = db.users[body.email];
      if (!u || u.password !== body.password) return J(route, 400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return J(route, 200, session(body.email, u));
    }
    if (p === "/auth/v1/logout") return empty(route);
    // 改密碼（supabase.auth.updateUser）
    if (p === "/auth/v1/user" && m === "PUT") {
      const email = Object.keys(db.users).find((e) => db.users[e].id === uid);
      if (!email) return J(route, 401, { error_code: "bad_jwt", msg: "invalid JWT" });
      if (body?.password) {
        if (db.users[email].password === body.password) return J(route, 422, { error_code: "same_password", msg: "New password should be different from the old password." });
        db.users[email].password = body.password;
      }
      return J(route, 200, { id: uid, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: now() });
    }

    // Storage
    if (p.startsWith("/storage/v1/object/public/zone-photos/")) {
      const f = db.files[p.replace("/storage/v1/object/public/zone-photos/", "")];
      // state.noCors：模擬 Supabase 沒回 CORS 標頭（照片要能退回一般方式顯示）
      return f ? route.fulfill({ status: 200, headers: { ...(state.noCors ? {} : cors), "content-type": "image/jpeg" }, body: f }) : route.fulfill({ status: 404 });
    }
    if (p.startsWith("/storage/v1/object/zone-photos/") && m === "POST") {
      const path = p.replace("/storage/v1/object/zone-photos/", "");
      const [g, folder] = path.split("/");
      // 同 0050 的 can_manage_photo：zones、routes（Spray Wall 岩館路線照片）都是那間館的員工
      if (!((folder === "zones" || (folder === "routes" && !state.noRoutePhoto)) && isStaff(uid, g))) return J(route, 403, { message: "new row violates row-level security policy" });
      const buf = req.postDataBuffer();
      const i = buf.indexOf(Buffer.from([0xff, 0xd8]));
      const j = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
      db.files[path] = i >= 0 && j > i ? buf.subarray(i, j + 2) : buf; // 上傳是 multipart，取出 JPEG
      return J(route, 200, { Key: "zone-photos/" + path });
    }

    if (p.startsWith("/storage/v1/object/public/route-videos/")) {
      const f = db.vfiles[decodeURIComponent(p.replace("/storage/v1/object/public/route-videos/", ""))];
      return f ? route.fulfill({ status: 200, headers: { ...cors, "content-type": "video/mp4" }, body: f.buf }) : route.fulfill({ status: 404 });
    }
    if (p.startsWith("/storage/v1/object/route-videos/") && m === "POST") {
      if (suspended(uid)) return J(route, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      const path = decodeURIComponent(p.replace("/storage/v1/object/route-videos/", ""));
      const routeId = path.split("/")[1];
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const recent = Object.values(db.vfiles).filter((f) => f.owner === uid && f.created_at > dayAgo).length;
      if (!videoPathOk(uid, routeId, path) || !canShare(uid, routeId) || recent >= 15)
        return J(route, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      // state.uploadMax：Supabase 專案的上傳上限（還沒改成 100 MB 時，超過就回 413）
      if ((req.postDataBuffer()?.length ?? 0) > state.uploadMax)
        return J(route, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
      db.vfiles[path] = { buf: req.postDataBuffer() ?? Buffer.alloc(0), owner: uid, created_at: now() };
      return J(route, 200, { Key: "route-videos/" + path });
    }
    // 影片縮圖（step38 的 video-thumbs）：state.noVideoThumb 模擬資料庫還沒套用 step38（沒有這個 bucket）
    const noBucket = () => J(route, 400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
    if (p.startsWith("/storage/v1/object/public/video-thumbs/")) {
      const f = db.tfiles[decodeURIComponent(p.replace("/storage/v1/object/public/video-thumbs/", ""))];
      db.thumbGets = (db.thumbGets ?? 0) + 1;
      return f ? route.fulfill({ status: 200, headers: { ...cors, "content-type": f.type, "cache-control": `max-age=${f.cache ?? 3600}` }, body: f.buf }) : route.fulfill({ status: 404 });
    }
    if (p.startsWith("/storage/v1/object/video-thumbs/") && m === "POST") {
      if (suspended(uid)) return J(route, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      if (state.noVideoThumb) return noBucket();
      const path = decodeURIComponent(p.replace("/storage/v1/object/video-thumbs/", ""));
      const routeId = path.split("/")[1];
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const recent = Object.values(db.tfiles).filter((f) => f.owner === uid && f.created_at > dayAgo).length;
      // 同 0043 can_upload_video_thumb
      if (!/\.(webp|jpg)$/.test(path) || !videoPathOk(uid, routeId, path) || !canShare(uid, routeId) || recent >= 30)
        return J(route, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      const f = multipart(req);
      if (!["image/webp", "image/jpeg"].includes(f.type)) return J(route, 400, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${f.type} is not supported` });
      if (f.buf.length > 1048576) return J(route, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
      if (db.tfiles[path]) return J(route, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
      db.tfiles[path] = { buf: f.buf, type: f.type, cache: f.cacheControl, owner: uid, created_at: now() };
      return J(route, 200, { Key: "video-thumbs/" + path });
    }
    if (p === "/storage/v1/object/video-thumbs" && m === "DELETE") {
      if (state.noVideoThumb) return noBucket();
      const removed = (body?.prefixes ?? []).filter((k) => db.tfiles[k] && canDeleteVideoThumb(uid, k));
      removed.forEach((k) => delete db.tfiles[k]);
      return J(route, 200, removed.map((name) => ({ name })));
    }
    if (p === "/storage/v1/object/zone-photos" && m === "DELETE") {
      const removed = (body?.prefixes ?? []).filter((k) => db.files[k] && isStaff(uid, k.split("/")[0]));
      removed.forEach((k) => delete db.files[k]);
      return J(route, 200, removed.map((name) => ({ name })));
    }
    if (p === "/storage/v1/object/route-videos" && m === "DELETE") {
      const removed = (body?.prefixes ?? []).filter((k) => db.vfiles[k] && canDeleteVideoFile(uid, k));
      removed.forEach((k) => delete db.vfiles[k]);
      return J(route, 200, removed.map((name) => ({ name })));
    }

    if (p.startsWith("/rest/v1/rpc/")) return rpc(route, p.split("/").pop(), body || {}, uid);

    const t = p.replace("/rest/v1/", "");
    const sel = sp.get("select") || "";
    // 停權中（step43）：不能留言、按讚、分享影片、送回饋、改暱稱（同 0049 的觸發器）
    if (suspended(uid) && ((m === "POST" && ["comments", "comment_likes", "video_likes", "route_likes", "route_videos", "feedback"].includes(t)) || (m === "POST" && t === "routes" && body?.kind === "community") || (m === "PATCH" && t === "profiles")))
      return J(route, 403, t === "profiles" ? { code: "42501", message: "帳號暫停中，暫時不能修改暱稱和人物卡" } : SUSPENDED);
    // state.readDelay：讀某張表要等幾毫秒（模擬訊號差），例如 { ascents: 1500 }
    if (m === "GET" && state.readDelay[t]) await new Promise((r) => setTimeout(r, state.readDelay[t]));
    if (t === "gyms") {
      if (m === "GET") return out(filt([...db.gyms].sort((a, b) => a.sort - b.sort), sp));
      if (m === "PATCH") { filt(db.gyms, sp).filter((g) => isMgr(uid, g.id)).forEach((g) => Object.assign(g, body)); return empty(route); }
    }
    if (t === "zones") {
      if (m === "GET") return out(filt([...db.zones].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code)), sp));
      if (m === "PATCH") {
        const rows = filt(db.zones, sp).filter((z) => isStaff(uid, z.gym_id));
        if (rows.length && "name" in body && !isMgr(uid, rows[0].gym_id)) return J(route, 403, { code: "42501", message: "只有店長可以修改區域名稱、代碼、排序和平面圖位置" });
        rows.forEach((z) => {
          // 同 zones_spray_photo：換 Spray Wall 公版照片，這面牆的路線全部下架（影片資料一起刪）
          if (z.kind === "spray" && z.photo_path && "photo_path" in body && body.photo_path !== z.photo_path)
            db.routes.forEach((r) => { if (r.zone_id === z.id && !r.archived_at) { r.archived_at = now(); dropVideos(r.id); } });
          Object.assign(z, body);
        });
        return empty(route);
      }
      if (m === "POST") {
        if (!isMgr(uid, body.gym_id)) return J(route, 403, { code: "42501", message: "沒有權限" });
        const z = { id: uuid(), photo_path: null, photo_width: null, photo_height: null, next_reset_on: null, route_seq: 0, ...body };
        db.zones.push(z);
        return out([z]);
      }
    }
    if (t === "routes") {
      // step44：state.noRoutePhoto 模擬資料庫還沒套用（routes 沒有 photo_path）
      if (state.noRoutePhoto && m === "GET" && sel.includes("photo_path")) return J(route, 400, { code: "42703", message: "column routes.photo_path does not exist" });
      if (state.noRoutePhoto && body && !Array.isArray(body) && "photo_path" in body)
        return J(route, 400, { code: "PGRST204", message: "Could not find the 'photo_path' column of 'routes' in the schema cache" });
      // 同 0050 的 routes_spray_check：照片只有那間館 Spray Wall 的岩館路線可以放
      if (body && !Array.isArray(body) && body.photo_path && (m === "POST" || m === "PATCH")) {
        const zid = body.zone_id ?? filt(db.routes, sp)[0]?.zone_id;
        const z = zoneOf(zid);
        if (z.kind !== "spray" || (body.kind ?? "gym") !== "gym" || body.photo_path.split("/")[0] !== z.gym_id || !/^[a-z0-9_]+\/routes\/[A-Za-z0-9_-]+\.jpg$/.test(body.photo_path))
          return J(route, 400, { code: "22023", message: "只有這間館的岩館路線可以放照片" });
      }
      if (m === "GET") {
        let rows = db.routes.map((r) => {
          const z = zoneOf(r.zone_id);
          const g = db.gyms.find((x) => x.id === z.gym_id);
          return { ...r, zones: { gym_id: z.gym_id, name: z.name, kind: z.kind ?? "wall", gyms: { id: g.id, is_live: g.is_live } } };
        });
        rows = filt(rows, sp);
        if ((sp.get("order") || "").includes("created_at.desc")) rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
        else rows.sort((a, b) => a.grade - b.grade || a.code.localeCompare(b.code));
        if (!sel.includes("zones")) rows = rows.map(({ zones, ...r }) => r);
        return out(rows);
      }
      if (m === "POST") {
        const z = zoneOf(body.zone_id);
        const community = body.kind === "community" && z.kind === "spray" && prof(uid)?.nickname;
        if (!isStaff(uid, z.gym_id) && !community) return J(route, 403, { code: "42501", message: "沒有權限" });
        if (z.kind === "spray" && !(body.photo_path && !body.holds) && !(body.holds?.some((h) => h.t === "s") && body.holds?.some((h) => h.t === "t")))
          return J(route, 400, { code: "22023", message: "路線要有起攀（S）和完攀（T），圈圈最多 60 個" });
        // 同 routes_spray_check／routes_grade_system：長耐力要照順序 2–50 點、YDS；其他一般區域不能有點
        if (z.kind !== "spray" && z.grade_system === "endurance") {
          if (!(body.holds?.length >= 2 && body.holds.length <= 50)) return J(route, 400, { code: "22023", message: "長耐力路線要照順序標 2–50 個點" });
          if (body.grade < 100) return J(route, 400, { code: "22023", message: "這個區域是長耐力，難度要用 YDS（5.6–5.13d）" });
          body.holds = body.holds.map((h, i, all) => ({ x: Math.round(h.x * 100) / 100, y: Math.round(h.y * 100) / 100, t: i === 0 ? "s" : i === all.length - 1 ? "t" : "h" }));
          body.hold_color = "白";
          body.pin_x = body.holds[0].x;
          body.pin_y = body.holds[0].y;
        } else if (z.kind !== "spray" && body.holds) return J(route, 400, { code: "22023", message: "一般區域只能有岩館路線" });
        // 手機產生的 id 重送：跟資料庫一樣回「已經有這筆」
        if (body.id && db.routes.some((x) => x.id === body.id)) return J(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "routes_pkey"' });
        z.route_seq++;
        const first = body.holds?.find((h) => h.t === "s");
        const r = { id: uuid(), code: `${z.code}-${String(z.route_seq).padStart(2, "0")}`, style_tags: [], setter_note: null, comments_enabled: true, created_at: now(), archived_at: null, kind: "gym", created_by: uid, ...body, ...(first ? { pin_x: first.x, pin_y: first.y } : z.kind === "spray" ? { pin_x: 50, pin_y: 50 } : {}) };
        db.routes.push(r);
        // 測試用：資料存進去了，但手機沒收到回覆（訊號差）
        if (state.dropRouteReply) {
          state.dropRouteReply = false;
          return route.abort("connectionreset");
        }
        return out([r]);
      }
      if (m === "PATCH") {
        // 同資料庫：長耐力路線有人記錄過，點不能再改
        if (body.holds && filt(db.routes, sp).some((r) => seqN(r) && db.ascents.some((x) => x.route_id === r.id)))
          return J(route, 400, { code: "22023", message: "已經有人記錄過這條路線，點的位置和順序不能再改（難度、說明可以改）" });
        if (body.holds) body.holds = body.holds.map((h, i, all) => ({ x: h.x, y: h.y, t: i === 0 ? "s" : i === all.length - 1 ? "t" : "h" }));
        const targets = filt(db.routes, sp).filter((r) => isStaff(uid, zoneOf(r.zone_id).gym_id) || (r.kind === "community" && r.created_by === uid));
        // 同 0038 的 routes_before_update：岩友路線下架後出題者不能再改；留言開關只有員工
        const author = targets.find((r) => !isStaff(uid, zoneOf(r.zone_id).gym_id));
        if (author?.archived_at) return J(route, 403, { code: "42501", message: "這條岩友路線已經下架，不能再修改" });
        if (author && "comments_enabled" in body && body.comments_enabled !== author.comments_enabled) return J(route, 403, { code: "42501", message: "只有員工可以開關路線留言" });
        targets.forEach((r) => {
          if (!r.archived_at && body.archived_at) {
            if (!(r.kind === "community" && r.created_by === uid))
              audit(uid, zoneOf(r.zone_id).gym_id, "route.archive", r.id, { code: r.code, zone: zoneOf(r.zone_id).name, grade: r.grade, color: r.hold_color });
            dropVideos(r.id);
          }
          Object.assign(r, body, body.holds ? { pin_x: body.holds[0].x, pin_y: body.holds[0].y } : {});
        });
        return sel ? out(targets.map((r) => ({ id: r.id }))) : empty(route);
      }
    }
    if (t === "ascents") {
      const mine = db.ascents.filter((a) => a.user_id === uid);
      // state.noHighpoint：模擬資料庫還沒套用 step30（ascents 沒有 highpoint 欄位）
      if (state.noHighpoint && m === "GET" && (sel.includes("highpoint") || (sp.get("or") || "").includes("highpoint")))
        return J(route, 400, { code: "42703", message: "column ascents.highpoint does not exist" });
      if (state.noHighpoint && m === "POST" && body && "highpoint" in body)
        return J(route, 400, { code: "PGRST204", message: "Could not find the 'highpoint' column of 'ascents' in the schema cache" });
      if (m === "GET") {
        // state.ascentsReadFail：讀紀錄時伺服器暫時出錯
        if (state.ascentsReadFail) return J(route, 500, { message: "Internal Server Error" }); // 503 套件會自動重試約 7 秒，這裡用 500 直接失敗
        let rows = mine;
        if (/routes(!inner)?\(/.test(sel)) rows = rows.map((x) => { const r = db.routes.find((y) => y.id === x.route_id); const z = zoneOf(r.zone_id); return { ...x, routes: { ...r, zones: { name: z.name, gym_id: z.gym_id, photo_path: z.photo_path, kind: z.kind ?? "wall" } } }; }).sort((p1, p2) => p2.climbed_on.localeCompare(p1.climbed_on));
        rows = filt(rows, sp);
        return out(rows);
      }
      if (m === "POST") {
        // state.ascentsFail：模擬伺服器暫時出錯（例如 503 網頁）或資料庫拒絕（例如日期不合法）
        if (state.ascentsFail) return route.fulfill({ status: state.ascentsFail.status, headers: { ...cors, "content-type": state.ascentsFail.type ?? "application/json" }, body: state.ascentsFail.body });
        if (!uid) return J(route, 403, { code: "42501", message: "沒有權限" });
        // 跟資料庫的 ascents_before_write 一樣檢查日期（upsert 會先跑 INSERT 的檢查）
        const rt = db.routes.find((y) => y.id === body.route_id);
        const tpe = (iso) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date(iso));
        const bad = (message) => J(route, 400, { code: "22008", message });
        if (rt && body.climbed_on) {
          if (body.climbed_on < tpe(rt.created_at)) return bad("日期不能早於路線設定日");
          if (body.climbed_on > taipeiDay(0)) return bad("日期不能晚於今天");
          if (rt.archived_at && body.climbed_on > tpe(rt.archived_at)) return bad("日期不能晚於路線下架日");
        }
        // 同 ascents_before_write（upsert 改到舊紀錄時，檢查的是合併後的整筆：沒送的欄位留著舊的）：
        // 長耐力 Flash、完攀＝最後一點；嘗試中要小於最後一點（從 Flash／完攀改回來、沒選最高點就清掉）；其他路線沒有最高點
        const ex = mine.find((a) => a.route_id === body.route_id);
        const row = { ...ex, ...body };
        const n = seqN(rt);
        if (n) {
          if (row.status !== "project") row.highpoint = n;
          else if (row.highpoint != null && row.highpoint >= n) {
            if (ex && ex.status !== "project" && row.highpoint === ex.highpoint) row.highpoint = null;
            else return J(route, 400, { code: "22023", message: `爬到最後一點就是完攀，最高點要小於 ${n}` });
          }
        } else row.highpoint = null;
        if (ex) Object.assign(ex, row, { updated_at: now() });
        else db.ascents.push({ id: uuid(), updated_at: now(), ...row, user_id: uid });
        return empty(route, 201);
      }
      if (m === "DELETE") { const del = filt(mine, sp); db.ascents = db.ascents.filter((a) => !del.includes(a)); return empty(route); }
    }
    if (t === "reset_events") {
      if (state.noResets) return J(route, 404, { code: "PGRST205", message: "Could not find the table 'public.reset_events' in the schema cache" });
      // 沒權限：新增被 RLS 擋（403）；修改、刪除跟 PostgREST 一樣只是改不到（200 空陣列）
      if (!uid || !canEditResets(uid)) return m === "POST" ? J(route, 403, { code: "42501", message: 'new row violates row-level security policy for table "reset_events"' }) : J(route, 200, []);
      const check = (e) => {
        if (!e.label?.trim()) return "名稱不能空白";
        if (e.ends_on < e.starts_on) return "結束日不能早於開始日";
        if (e.zone_ids.some((id) => zoneOf(id)?.gym_id !== e.gym_id)) return "換線的區域要是這間館的";
        return null;
      };
      if (m === "POST") {
        const e = { id: uuid(), zone_ids: [], ...body, label: body.label.trim(), created_by: uid };
        const bad = check(e);
        if (bad) return J(route, 400, { code: "22023", message: bad });
        db.resetEvents.push(e);
        syncZoneResets(e.zone_ids, null);
        audit(uid, e.gym_id, "reset.add", e.id, { label: e.label, starts_on: e.starts_on, ends_on: e.ends_on });
        return J(route, 201, [{ id: e.id }]);
      }
      if (m === "PATCH") {
        const rows = filt(db.resetEvents, sp);
        for (const e of rows) {
          const old = { ...e };
          const next = { ...e, ...body, label: (body.label ?? e.label).trim() };
          const bad = check(next);
          if (bad) return J(route, 400, { code: "22023", message: bad });
          Object.assign(e, next);
          syncZoneResets(old.zone_ids, old.starts_on);
          syncZoneResets(e.zone_ids, null);
          audit(uid, e.gym_id, "reset.update", e.id, { label: e.label, starts_on: e.starts_on, ends_on: e.ends_on });
        }
        return J(route, 200, rows.map((e) => ({ id: e.id })));
      }
      if (m === "DELETE") {
        const rows = filt(db.resetEvents, sp);
        db.resetEvents = db.resetEvents.filter((e) => !rows.includes(e));
        rows.forEach((e) => {
          syncZoneResets(e.zone_ids, e.starts_on);
          audit(uid, e.gym_id, "reset.delete", e.id, { label: e.label, starts_on: e.starts_on, ends_on: e.ends_on });
        });
        return J(route, 200, rows.map((e) => ({ id: e.id })));
      }
    }
    if (t === "route_reports") {
      if (state.noReports) return J(route, 404, { code: "PGRST205", message: "Could not find the table 'public.route_reports' in the schema cache" });
      if (m === "GET") return out(filt(db.reports.filter((x) => uid && (x.user_id === uid || isStaff(uid, zoneOf(x.zone_id).gym_id))), sp));
      return J(route, 403, { code: "42501", message: "permission denied for table route_reports" });
    }
    if (t === "feedback") {
      if (!uid) return J(route, 401, { message: "JWT" });
      if (m === "GET") return out(filt(db.feedback.filter((f) => f.user_id === uid || isOwner(uid)), sp).sort((x, y) => y.created_at.localeCompare(x.created_at)));
      if (m === "POST") {
        const dayAgo = new Date(Date.now() - 86400000).toISOString();
        if (db.feedback.filter((f) => f.user_id === uid && f.created_at > dayAgo).length >= 5) return J(route, 400, { code: "54000", message: "今天已經送出 5 則回饋，明天再來，謝謝你！" });
        db.feedback.push({ id: uuid(), ...body, body: body.body.trim(), contact: body.contact?.trim() || null, user_id: uid, status: "new", created_at: now() });
        return empty(route, 201);
      }
      if (m === "PATCH") {
        if (!isOwner(uid)) return J(route, 200, []);
        filt(db.feedback, sp).forEach((f) => Object.assign(f, { status: body.status }));
        return empty(route, 204);
      }
    }
    if (t === "comments") {
      if (m === "GET") {
        let rows = db.comments
          .filter((c) => !c.deleted_at)
          .map((c) => ({
            ...c,
            profiles: { nickname: prof(c.user_id)?.nickname },
            comment_likes: db.likes.filter((l) => l.comment_id === c.id).map((l) => ({ user_id: l.user_id })),
            ...(sel.includes("routes") ? { routes: routeEmbed(c.route_id) } : {}),
          }));
        // 先照 order 排（New~ 新到舊），再篩選、取前幾筆
        const desc = /created_at\.desc/.test(sp.get("order") || "");
        rows.sort((a, b) => (desc ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)));
        rows = filt(rows, sp);
        if (!sel.includes("profiles")) rows = rows.map(({ profiles, ...c }) => c);
        return out(rows);
      }
      if (m === "POST") {
        const r = db.routes.find((x) => x.id === body.route_id);
        const g = db.gyms.find((x) => x.id === zoneOf(r.zone_id).gym_id);
        if (!uid || r.archived_at || !r.comments_enabled || !g.comments_enabled || !prof(uid).nickname) return J(route, 403, { code: "42501", message: 'new row violates row-level security policy for table "comments"' });
        if (db.comments.some((c) => c.route_id === r.id && c.user_id === uid && !c.deleted_at)) return J(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "comments_one_per_user"' });
        if (hasLink(body.body)) return J(route, 400, { code: "22023", message: "留言不能放網址" });
        db.comments.push({ id: uuid(), route_id: body.route_id, user_id: uid, body: body.body.trim(), created_at: now(), edited_at: null, deleted_at: null });
        return empty(route, 201);
      }
    }
    if (t === "route_videos") {
      // state.noVideoLikes：模擬資料庫還沒套用 step42（沒有 video_likes）；PostgREST 先檢查關聯再查欄位，所以放在缺欄位的前面
      if (state.noVideoLikes && (m === "GET" || m === "HEAD") && /video_likes/.test(sel)) {
        state.likeFallbacks = (state.likeFallbacks ?? 0) + 1;
        return J(route, 400, { code: "PGRST200", message: "Could not find a relationship between 'route_videos' and 'video_likes' in the schema cache" });
      }
      // state.noVideoThumb：模擬資料庫還沒套用 step38（沒有縮圖欄位）
      if (state.noVideoThumb && (m === "GET" || m === "HEAD") && /thumb_path/.test(sel)) {
        state.tagFallbacks++;
        return J(route, 400, { code: "42703", message: "column route_videos.thumb_path does not exist" });
      }
      if (state.noVideoThumb && m === "POST" && "thumb_path" in body) {
        state.tagFallbacks++;
        return J(route, 400, { code: "PGRST204", message: "Could not find the 'thumb_path' column of 'route_videos' in the schema cache" });
      }
      // state.noVideoFeel：模擬資料庫還沒套用 step35（沒有型態欄位）；更舊的資料庫（step34、25 之前）也沒有
      const noFeel = state.noVideoFeel || state.noVideoClimb || state.noVideoTags;
      if (noFeel && (m === "GET" || m === "HEAD") && /feel_tags/.test(sel)) {
        state.tagFallbacks++;
        return J(route, 400, { code: "42703", message: "column route_videos.feel_tags does not exist" });
      }
      if (noFeel && m === "POST" && "feel_tags" in body) {
        state.tagFallbacks++;
        return J(route, 400, { code: "PGRST204", message: "Could not find the 'feel_tags' column of 'route_videos' in the schema cache" });
      }
      // state.noVideoTags：模擬資料庫還沒套用 step25（沒有身高、動作欄位），跟 PostgREST 一樣回錯誤碼
      if (state.noVideoTags && (m === "GET" || m === "HEAD") && /height_band|move/.test(sel)) {
        state.tagFallbacks++;
        return J(route, 400, { code: "42703", message: "column route_videos.height_band does not exist" });
      }
      // state.noVideoClimb：模擬資料庫還沒套用 step34（沒有攀爬日欄位，身高、動作還在）
      if ((state.noVideoClimb || state.noVideoTags) && (m === "GET" || m === "HEAD") && /climbed_on/.test(sel)) {
        state.tagFallbacks++;
        return J(route, 400, { code: "42703", message: "column route_videos.climbed_on does not exist" });
      }
      if ((state.noVideoClimb || state.noVideoTags) && m === "POST" && "climbed_on" in body) {
        state.tagFallbacks++;
        return J(route, 400, { code: "PGRST204", message: "Could not find the 'climbed_on' column of 'route_videos' in the schema cache" });
      }
      if (state.noVideoTags && m === "POST" && ("height_band" in body || "move" in body)) {
        state.tagFallbacks++;
        return J(route, 400, { code: "PGRST204", message: "Could not find the 'height_band' column of 'route_videos' in the schema cache" });
      }
      if (m === "GET" || m === "HEAD") {
        const q = new URLSearchParams(sp);
        const gym = (q.get("routes.zones.gym_id") || "").replace(/^eq\./, "");
        q.delete("routes.zones.gym_id");
        let rows = db.videos.map((v) => {
          const r = db.routes.find((x) => x.id === v.route_id);
          const z = zoneOf(r.zone_id);
          return {
            ...v,
            profiles: { nickname: prof(v.user_id)?.nickname },
            ...(sel.includes("video_likes") ? { video_likes: db.videoLikes.filter((l) => l.video_id === v.id).map((l) => ({ user_id: l.user_id })) } : {}),
            routes: sel.includes("gyms") ? routeEmbed(r.id) : { code: r.code, zones: { gym_id: z.gym_id, name: z.name } },
          };
        });
        if (gym) rows = rows.filter((v) => v.routes.zones.gym_id === gym);
        if (state.noVideoTags) rows = rows.map(({ height_band, move, ...v }) => v); // 舊資料庫沒有這兩欄
        if (state.noVideoTags || state.noVideoClimb) rows = rows.map(({ climbed_on, ...v }) => v);
        if (noFeel) rows = rows.map(({ feel_tags, ...v }) => v);
        if (state.noVideoThumb) rows = rows.map(({ thumb_path, ...v }) => v);
        rows.sort((x, y) => y.created_at.localeCompare(x.created_at));
        rows = filt(rows, q);
        if (m === "HEAD") return route.fulfill({ status: 200, headers: { ...cors, "content-range": `*/${rows.length}` } });
        return out(rows);
      }
      if (m === "POST") {
        if (!canShare(uid, body.route_id) || !videoPathOk(uid, body.route_id, body.path))
          return J(route, 403, { code: "42501", message: 'new row violates row-level security policy for table "route_videos"' });
        // 同 0039 的 route_videos_before_insert：要先有本人上傳的檔案、24 小時 15 筆、說明不能放網址；
        // App 有送攀爬日和完成狀態時，攀爬日、完成狀態從本人在這條的紀錄帶入（App 送的日期不採用）；沒送就不記攀爬日
        if (db.vfiles[body.path]?.owner !== uid) return J(route, 400, { code: "22023", message: "找不到上傳的影片檔，請重新分享" });
        const dayAgo = new Date(Date.now() - 86400000).toISOString();
        if (db.videos.filter((v) => v.user_id === uid && v.created_at > dayAgo).length >= 15) return J(route, 400, { code: "54000", message: "每人 24 小時內最多分享 15 支影片，明天再來" });
        if (hasLink(body.caption)) return J(route, 400, { code: "22023", message: "影片說明不能放網址" });
        if ((body.height_band != null && !["lt160", "160s", "170s", "ge180"].includes(body.height_band)) || (body.move != null && !["dynamic", "static"].includes(body.move)))
          return J(route, 400, { code: "23514", message: 'new row violates check constraint "route_videos_height_band_check"' });
        // state.noRopeVideo：資料庫還沒套用 step36，所有影片都是 0011 的 60 秒上限（oldVideoMax 讓測試用短影片模擬）
        if (state.noRopeVideo && (body.duration_s ?? 0) > state.oldVideoMax)
          return J(route, 400, { code: "23514", message: 'new row violates check constraint "route_videos_duration_s_check"' });
        // 同 0041：上攀區最長 180 秒、100 MB；其他 60 秒、50 MB
        const vr = db.routes.find((x) => x.id === body.route_id);
        const rope = zoneOf(vr.zone_id).grade_system === "yds";
        if ((body.duration_s ?? 0) > (rope ? 180 : 60) || (body.size_bytes ?? 0) > (rope ? 104857600 : 52428800))
          return J(route, 400, { code: "23514", message: "影片最長 60 秒、50 MB 以內（上攀區最長 3 分鐘、100 MB）" });
        // 同 0040：型態去掉重複、只收 6 個固定選項、最多 2 個
        const feel = [...new Set(body.feel_tags ?? [])];
        if (feel.some((f) => !["power", "fingers", "hard", "risky", "footwork", "flexible"].includes(f)) || feel.length > 2)
          return J(route, 400, { code: "23514", message: 'new row violates check constraint "route_videos_feel_tags_check"' });
        const mine = body.status && body.climbed_on ? db.ascents.find((x) => x.user_id === uid && x.route_id === body.route_id) : null;
        const fromAscent = { climbed_on: mine?.climbed_on ?? null, ...(mine ? { status: mine.status } : {}) };
        // 同 0043 route_videos_thumb：縮圖要跟影片同名、本人上傳的，不對就當作沒有縮圖
        const base = body.path.replace(/\.[^./]+$/, "");
        const thumb = body.thumb_path && [base + ".webp", base + ".jpg"].includes(body.thumb_path) && db.tfiles[body.thumb_path]?.owner === uid ? body.thumb_path : null;
        db.videos.push({ id: uuid(), caption: null, status: null, duration_s: null, size_bytes: null, height_band: null, move: null, ...body, feel_tags: feel, climbed_on: null, ...fromAscent, thumb_path: thumb, user_id: uid, created_at: now() });
        return empty(route, 201);
      }
    }
    if (t === "route_likes") {
      if (m === "GET") {
        if (state.routeLikesReadFail) return J(route, 500, { message: "Internal Server Error" }); // 讀讚數時伺服器出錯
        return out(filt(db.routeLikes, sp).map((l) => ({ route_id: l.route_id, user_id: l.user_id })));
      }
      if (m === "POST") {
        if (!uid || !prof(uid)?.nickname) return J(route, 403, { code: "42501", message: "沒有權限" });
        db.routeLikes.push({ route_id: body.route_id, user_id: uid });
        return empty(route, 201);
      }
      if (m === "DELETE") {
        const del = filt(db.routeLikes.filter((l) => l.user_id === uid), sp);
        db.routeLikes = db.routeLikes.filter((l) => !del.includes(l));
        return empty(route);
      }
    }
    // 同 0048：登入有暱稱、影片還在、每人每支一個讚；只能收回自己的
    if (t === "video_likes") {
      if (m === "POST") {
        const v = db.videos.find((x) => x.id === body.video_id);
        if (state.videoLikeFail) return J(route, 500, { message: "Internal Server Error" });
        if (!uid || !v || !prof(uid)?.nickname) return J(route, 403, { code: "42501", message: 'new row violates row-level security policy for table "video_likes"' });
        if (db.videoLikes.some((l) => l.video_id === v.id && l.user_id === uid)) return J(route, 409, { code: "23505", message: "duplicate key" });
        db.videoLikes.push({ video_id: v.id, user_id: uid });
        return empty(route, 201);
      }
      if (m === "DELETE") {
        const del = filt(db.videoLikes.filter((l) => l.user_id === uid), sp);
        db.videoLikes = db.videoLikes.filter((l) => !del.includes(l));
        return empty(route);
      }
    }
    if (t === "comment_likes") {
      if (m === "POST") {
        const c = db.comments.find((x) => x.id === body.comment_id && !x.deleted_at);
        if (!uid || !c || !prof(uid)?.nickname) return J(route, 403, { code: "42501", message: 'new row violates row-level security policy for table "comment_likes"' });
        if (db.likes.some((l) => l.comment_id === c.id && l.user_id === uid)) return J(route, 409, { code: "23505", message: "duplicate key" });
        db.likes.push({ comment_id: c.id, user_id: uid });
        return empty(route, 201);
      }
      if (m === "DELETE") {
        const del = filt(db.likes.filter((l) => l.user_id === uid), sp);
        db.likes = db.likes.filter((l) => !del.includes(l));
        return empty(route);
      }
    }
    if (t === "profiles" && m === "GET") {
      // 原岩夥伴（0047）：所有人讀得到 mascot；state.noMascot 模擬資料庫還沒套用 step41（沒有這個欄位）
      if (sel.includes("mascot")) {
        if (state.noMascot) return J(route, 400, { code: "42703", message: "column profiles.mascot does not exist" });
        // 攀岩角色（0054）：跟夥伴一起讀；state.noClimber 模擬還沒套用 step48（沒有這個欄位）
        if (sel.includes("climber")) {
          if (state.noClimber) return J(route, 400, { code: "42703", message: "column profiles.climber does not exist" });
          return out(filt(db.profiles, sp).map((p) => ({ id: p.id, mascot: p.mascot ?? null, climber: p.climber ?? null })));
        }
        return out(filt(db.profiles, sp).map((p) => ({ id: p.id, mascot: p.mascot ?? null })));
      }
      return out(filt(db.profiles, sp).map((p) => ({ id: p.id, nickname: p.nickname })));
    }
    if (t === "profiles" && m === "PATCH") {
      // 同 0038 的 profiles_nickname_check：看不見的字元、網址；冒充館方的字（員工、老闆可以）
      const nick = body.nickname ?? "";
      if (HIDDEN.test(nick)) return J(route, 400, { code: "22023", message: "暱稱不能有看不見的字元（一般表情符號可以用）" });
      if (!bare(nick)) return J(route, 400, { code: "22023", message: "暱稱不能只有空白" });
      if (hasLink(nick)) return J(route, 400, { code: "22023", message: "暱稱不能放網址" });
      if ((IMPERSONATE.test(bare(nick)) || IMPERSONATE_EN.test(bare(nick)) || IMPERSONATE_EN.test(spaced(nick))) && !isOwner(uid) && !db.staff_roles.some((x) => x.user_id === uid))
        return J(route, 400, { code: "22023", message: "暱稱不能用「原岩、官方、店長、館長、定線、員工、管理員、客服、老闆、櫃檯」這類字，以免被誤會是館方" });
      Object.assign(prof(uid), { nickname: body.nickname });
      return empty(route);
    }
    if (t === "staff_roles" && m === "GET") return out(filt(db.staff_roles.filter((s) => s.user_id === uid || isMgr(uid, s.gym_id)), sp).map((s) => ({ ...s, profiles: { nickname: prof(s.user_id)?.nickname } })));
    if (t === "scoring_rules") {
      if (m === "GET") return out([db.scoring]);
      if (m === "PATCH") {
        if (isOwner(uid)) { Object.assign(db.scoring, body); audit(uid, null, "scoring.update", null, { flash_multiplier: body.flash_multiplier, max_style_bonus: body.max_style_bonus }); }
        return empty(route);
      }
    }
    if (t === "audit_log" && m === "GET") {
      const visible = db.audit.filter((a) => (a.gym_id ? isMgr(uid, a.gym_id) : isOwner(uid)));
      const rows = filt([...visible].sort((a, b) => b.id - a.id), sp).map((a) => ({ ...a, profiles: a.user_id ? { nickname: prof(a.user_id)?.nickname } : null }));
      return out(rows);
    }
    return J(route, 404, { message: `mock: 沒處理 ${m} ${p}` });
  }

  // 測試用：新增一筆換線公告（offset 是離今天幾天），區域用代碼
  const addReset = (gymId, label, codes, startOffset, endOffset = startOffset) => {
    const zone_ids = codes.map((c) => db.zones.find((z) => z.gym_id === gymId && z.code === c).id);
    const e = { id: uuid(), gym_id: gymId, label, zone_ids, starts_on: taipeiDay(startOffset), ends_on: taipeiDay(endOffset), created_by: null };
    db.resetEvents.push(e);
    syncZoneResets(zone_ids, null);
    return e;
  };
  return { db, state, addUser, addRoute, addAscent, addVideo, addComment, addReset, handler };
}
