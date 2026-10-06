// =====================================================================
// 測試用的模擬 Supabase（Auth、PostgREST、Storage、RPC），只涵蓋 App 用到的查詢
// 權限規則大致照資料庫的 RLS 寫（真正的權限測試在 supabase/tests，用真的 PostgreSQL 跑）
// =====================================================================
import crypto from "node:crypto";

export const SB = "https://ngvlymkevcqhlaphoost.supabase.co";
const uuid = () => crypto.randomUUID();
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
    zones: [
      ["A", "A 區"],
      ["W", "比賽牆"],
      ["B", "B 區"],
      ["C", "C 區"],
      ["D", "D 區"],
    ].map(([code, name], i) => ({ id: uuid(), gym_id: "mingde", code, name, sort: i + 1, photo_path: null, photo_width: null, photo_height: null, next_reset_on: null, route_seq: 0, grade_system: "v" }))
      .concat(
        // Spray Wall（同 migration 0018）
        [["mingde", "S"], ["g4", "SW"]].map(([gym_id, code]) => ({ id: uuid(), gym_id, code, name: "Spray Wall", sort: 99, photo_path: null, photo_width: null, photo_height: null, next_reset_on: null, route_seq: 0, grade_system: "v", kind: "spray" })),
        // 其他館的區域（同 migration 0013；南港 0023 細分成 7 區）
        Object.entries({
          g2: [["A", "A 區"], ["B", "B 區"], ["C", "C 區"], ["D", "D 區"], ["TR", "訓練區"], ["SL", "教學區 Slab"]],
          g3: [["A", "A 區"], ["AB", "Auto-Belay"], ["B", "B 區"], ["C", "C 區"], ["D", "D 區"], ["SP", "速度牆"], ["BO", "抱石區"]],
          g4: [["A1", "A1 區"], ["A2", "A2 區"], ["A3", "A3 區"], ["B1", "B1 區"], ["B2", "B2 區"], ["C1", "C1 區"], ["C2", "C2 區"]],
          g5: [["A", "抱石 A 區"], ["B", "抱石 B 區"], ["C", "C 區"], ["D", "D 區"], ["E", "上攀 E 區"]],
        }).flatMap(([gym_id, zs]) => zs.map(([code, name], i) => ({ id: uuid(), gym_id, code, name, sort: i + 1, photo_path: null, photo_width: null, photo_height: null, next_reset_on: null, route_seq: 0, grade_system: gym_id === "g3" && code !== "BO" ? "yds" : "v" })))
      ),
    routes: [],
    ascents: [],
    comments: [],
    routeLikes: [], // route_likes
    opens: [], // app_opens
    likes: [], // comment_likes
    audit: [],
    files: {},
    videos: [], // route_videos
    vfiles: {}, // route-videos 檔案：path -> { buf, owner, created_at }
    scoring: {
      grade_points: [10, 15, 20, 30, 40, 55, 70, 90, 110, 135, 160],
      yds_points: [4, 5, 6, 8, 10, 11, 13, 15, 17, 20, 25, 30, 35, 40, 48, 55, 70, 80, 90, 110],
      style_bonus: { 力量: 10, 指力: 10, 動態: 15, 耐力: 10, 協調: 10, 技巧: 5, 平衡: 5, 腳法: 5, 柔軟: 5 },
      max_style_bonus: 30,
      flash_multiplier: 1.2,
    },
  };
  const state = { offline: false, signupError: null };
  let auditSeq = 0;

  const addUser = (username, password, extra = {}) => {
    const id = uuid();
    db.users[`${username}@users.routemake.local`] = { id, password };
    db.profiles.push({ id, username, nickname: null, is_owner: false, ...extra });
    return id;
  };
  const addRoute = (zone, grade, color, tags = [], x = 30, y = 40, createdAt = now()) => {
    zone.route_seq++;
    const r = { id: uuid(), zone_id: zone.id, code: `${zone.code}-${String(zone.route_seq).padStart(2, "0")}`, grade, hold_color: color, style_tags: tags, setter_note: null, pin_x: x, pin_y: y, comments_enabled: true, created_at: createdAt, archived_at: null };
    db.routes.push(r);
    return r;
  };
  const addAscent = (userId, route, status, climbedOn, extra = {}) =>
    db.ascents.push({ id: uuid(), user_id: userId, route_id: route.id, status, climbed_on: climbedOn, feel: null, grade_feel: null, private_note: null, updated_at: now(), ...extra });

  const addVideo = (userId, route, extra = {}) => {
    const z = db.zones.find((x) => x.id === route.zone_id);
    const path = `${z.gym_id}/${route.id}/${userId}/${uuid()}.mp4`;
    db.vfiles[path] = { buf: Buffer.from("fake"), owner: userId, created_at: now() };
    const v = { id: uuid(), route_id: route.id, user_id: userId, path, caption: null, status: null, duration_s: 10, size_bytes: 4, created_at: now(), ...extra };
    db.videos.push(v);
    return v;
  };

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const session = (email, u) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    return {
      access_token: `${b64({ alg: "HS256" })}.${b64({ sub: u.id, exp, role: "authenticated" })}.x`,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: exp,
      refresh_token: "r",
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
  const isMgr = (uid, g) => isOwner(uid) || db.staff_roles.some((s) => s.user_id === uid && s.gym_id === g && s.role === "manager");
  const gymOfRoute = (id) => zoneOf(db.routes.find((r) => r.id === id).zone_id).gym_id;
  // 路線下架時刪掉影片資料（資料庫觸發器）
  const dropVideos = (routeId) => (db.videos = db.videos.filter((v) => v.route_id !== routeId));
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

  // PostgREST 篩選（eq、is、in、gte、lt、or）
  const cond = (r, k, v) => {
    const [op, ...rest] = v.split(".");
    const val = rest.join(".");
    const x = k.includes(".") ? (r[k.split(".")[0]] || {})[k.split(".")[1]] : r[k];
    if (op === "eq") return String(x) === val;
    if (op === "is") return val === "null" ? x == null : true;
    if (op === "in") return val.replace(/[()]/g, "").split(",").map((s) => s.replace(/"/g, "")).includes(String(x));
    if (op === "gte") return String(x) >= val;
    if (op === "lt") return typeof x === "number" ? x < Number(val) : String(x) < val;
    return true;
  };
  const filt = (rows, sp) => {
    for (const [k, v] of sp) {
      if (["select", "order", "on_conflict", "limit", "offset"].includes(k)) continue;
      if (k === "or") {
        const parts = v.replace(/^\(|\)$/g, "").split(",").map((p) => p.split(/\.(.*)/s));
        rows = rows.filter((r) => parts.some(([pk, pv]) => cond(r, pk, pv)));
        continue;
      }
      rows = rows.filter((r) => cond(r, k, v));
    }
    const limit = Number(sp.get("limit"));
    return limit ? rows.slice(0, limit) : rows;
  };
  const rawPoints = (r) => (r.grade >= 100 ? db.scoring.yds_points[r.grade - 100] : db.scoring.grade_points[r.grade]) * (100 + Math.min(db.scoring.max_style_bonus, r.style_tags.reduce((s, t) => s + (db.scoring.style_bonus[t] || 0), 0)));
  const points = (a) => {
    const r = db.routes.find((x) => x.id === a.route_id);
    if (a.status === "send") return Math.round(rawPoints(r) / 100);
    if (a.status === "flash") return Math.round((rawPoints(r) * Math.round(db.scoring.flash_multiplier * 100)) / 10000);
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
      return J(route, 200, p ? { id: p.id, username: p.username, nickname: p.nickname, avatar_url: null, is_owner: p.is_owner, roles: db.staff_roles.filter((s) => s.user_id === uid).map((s) => ({ gym_id: s.gym_id, role: s.role })) } : null);
    }
    if (fn === "zone_view") {
      const z = db.zones.find((x) => x.id === a.p_zone);
      if (!z) return J(route, 200, { z: null, g: null, rs: [], as: {}, cs: {} });
      const g = db.gyms.find((x) => x.id === z.gym_id);
      const rs = db.routes.filter((r) => r.zone_id === z.id && !r.archived_at).sort((x, y) => x.grade - y.grade || x.code.localeCompare(y.code));
      const ids = new Set(rs.map((r) => r.id));
      const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k] ?? null]));
      return J(route, 200, {
        z: { ...pick(z, ["id", "gym_id", "code", "name", "photo_path", "photo_width", "photo_height", "next_reset_on", "sort", "grade_system"]), kind: z.kind ?? "wall" },
        g: pick(g, ["id", "name", "is_live", "comments_enabled", "sort"]),
        rs: rs.map((r) => ({ kind: "gym", name: null, description: null, holds: null, created_by: null, ...r })),
        as: Object.fromEntries(db.ascents.filter((x) => x.user_id === uid && ids.has(x.route_id)).map((x) => [x.route_id, pick(x, ["id", "route_id", "status", "climbed_on", "feel", "grade_feel", "private_note"])])),
        cs: db.comments.filter((c) => !c.deleted_at && ids.has(c.route_id)).reduce((m, c) => ((m[c.route_id] = (m[c.route_id] ?? 0) + 1), m), {}),
      });
    }
    if (fn === "zone_progress")
      return J(route, 200, db.zones.filter((z) => z.gym_id === a.p_gym && z.kind !== "spray").sort((x, y) => x.sort - y.sort).map((z) => {
        const rs = db.routes.filter((r) => r.zone_id === z.id && !r.archived_at);
        return { zone_id: z.id, code: z.code, name: z.name, sort: z.sort, photo_path: z.photo_path, next_reset_on: z.next_reset_on, route_count: rs.length, done_count: rs.filter((r) => db.ascents.some((x) => x.route_id === r.id && x.user_id === uid && x.status !== "project")).length };
      }));
    if (fn === "monthly_stats") {
      const { from, to, prev } = monthBounds(a.p_year, a.p_month);
      const mine = db.ascents.filter((x) => x.user_id === uid && x.status !== "project");
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
      z.next_reset_on = null;
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
      if (v.user_id !== uid) audit(uid, g, "video.delete", v.id, { code: db.routes.find((r) => r.id === v.route_id).code, author_nickname: prof(v.user_id)?.nickname, caption: v.caption });
      return J(route, 200, v.path);
    }
    if (fn === "video_paths_for_routes") {
      return J(route, 200, db.videos.filter((v) => a.p_routes.includes(v.route_id) && isStaff(uid, gymOfRoute(v.route_id))).map((v) => v.path));
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
      const raw = axes.map((t) => sends.filter((r) => r.style_tags.some((g) => t.includes(g))).reduce((n, r) => n + (r.grade >= 100 ? db.scoring.yds_points[r.grade - 100] : db.scoring.grade_points[r.grade]), 0));
      const mx = Math.max(...raw);
      return J(route, 200, {
        nickname: p.nickname, public: !!p.card_public, self, bio: p.bio ?? null, years: p.climbing_years ?? null, home_gym: p.home_gym ?? null,
        self_stats: p.self_stats ?? null, ability: raw.map((v) => (mx ? Math.round((100 * v) / mx) : 0)),
        ability_sends: sends.filter((r) => r.style_tags.length).length, total_sends: sends.length, month_sends: sends.length,
        top_grade: sends.some((r) => r.grade < 100) ? Math.max(...sends.filter((r) => r.grade < 100).map((r) => r.grade)) : null,
        top_yds: sends.some((r) => r.grade >= 100) ? Math.max(...sends.filter((r) => r.grade >= 100).map((r) => r.grade)) : null,
      });
    }
    if (fn === "save_my_card") {
      const bio = (a.p_bio || "").trim();
      if (bio.length > 60 || /(https?:\/\/|www\.|line|instagram|\big\b|@|[0-9]{7,})/i.test(bio))
        return J(route, 400, { code: "22023", message: "自我介紹最多 60 字，而且不能放聯絡方式（網址、電話、LINE、IG 等）" });
      Object.assign(prof(uid), { card_public: !!a.p_public, bio: bio || null, climbing_years: a.p_years || null, home_gym: a.p_home_gym || null, self_stats: a.p_self });
      return J(route, 200, null);
    }
    if (fn === "clear_card_bio") {
      if (!isMgr(uid, a.p_gym)) return J(route, 403, { code: "42501", message: "只有店長可以清除自我介紹" });
      const p = prof(a.p_user);
      audit(uid, a.p_gym, "card.clear", p.id, { nickname: p.nickname, bio: p.bio });
      p.bio = null;
      return J(route, 200, null);
    }
    if (fn === "spray_list") {
      let rs = db.routes.filter((r) => r.zone_id === a.p_zone && !r.archived_at && (r.kind ?? "gym") === a.p_kind && (a.p_grade == null || r.grade === a.p_grade));
      if (a.p_sort === "mine") rs = rs.filter((r) => r.created_by === uid);
      const rows = rs.map((r) => ({
        id: r.id, code: r.code, name: r.name, grade: r.grade, description: r.description ?? null, holds: r.holds, kind: r.kind, created_at: r.created_at,
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
      if (a.p_gym == null ? !isOwner(uid) : !isMgr(uid, a.p_gym)) return J(route, 403, { code: "42501", message: "只有店長可以看使用狀況" });
      const opens = db.opens.filter((o) => a.p_gym == null || o.gym_id === a.p_gym);
      const days = Array.from({ length: 30 }, (_, i) => taipeiDay(i - 29));
      const sends = db.ascents.filter((x) => x.status !== "project");
      return J(route, 200, {
        registered: db.profiles.length, new7: db.profiles.length,
        today: new Set(opens.filter((o) => o.day === taipeiDay()).map((o) => o.user_id)).size,
        week: new Set(opens.map((o) => o.user_id)).size, month: new Set(opens.map((o) => o.user_id)).size, sends30: sends.length,
        daily: days.map((d) => ({ day: d, users: new Set(opens.filter((o) => o.day === d).map((o) => o.user_id)).size, sends: sends.filter((s) => s.climbed_on === d).length })),
        gyms: a.p_gym == null ? db.gyms.filter((g) => g.is_live).map((g) => ({ gym: g.id, name: g.name, users: new Set(db.opens.filter((o) => o.gym_id === g.id).map((o) => o.user_id)).size, sends: 0 })) : null,
        top_routes: [],
      });
    }
    if (fn === "lookup_user") {
      const p = db.profiles.find((x) => x.username === a.p_username.toLowerCase());
      return p ? J(route, 200, { id: p.id, nickname: p.nickname }) : J(route, 404, { code: "P0002", message: "找不到這個帳號，請對方先註冊" });
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
    if (p === "/auth/v1/token") {
      const u = db.users[body.email];
      if (!u || u.password !== body.password) return J(route, 400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return J(route, 200, session(body.email, u));
    }
    if (p === "/auth/v1/logout") return empty(route);

    // Storage
    if (p.startsWith("/storage/v1/object/public/zone-photos/")) {
      const f = db.files[p.replace("/storage/v1/object/public/zone-photos/", "")];
      return f ? route.fulfill({ status: 200, headers: { ...cors, "content-type": "image/jpeg" }, body: f }) : route.fulfill({ status: 404 });
    }
    if (p.startsWith("/storage/v1/object/zone-photos/") && m === "POST") {
      const path = p.replace("/storage/v1/object/zone-photos/", "");
      const [g, folder] = path.split("/");
      if (!(folder === "zones" && isStaff(uid, g))) return J(route, 403, { message: "new row violates row-level security policy" });
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
      const path = decodeURIComponent(p.replace("/storage/v1/object/route-videos/", ""));
      const routeId = path.split("/")[1];
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const recent = Object.values(db.vfiles).filter((f) => f.owner === uid && f.created_at > dayAgo).length;
      if (!videoPathOk(uid, routeId, path) || !canShare(uid, routeId) || recent >= 10)
        return J(route, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      db.vfiles[path] = { buf: req.postDataBuffer() ?? Buffer.alloc(0), owner: uid, created_at: now() };
      return J(route, 200, { Key: "route-videos/" + path });
    }
    if (p === "/storage/v1/object/route-videos" && m === "DELETE") {
      const removed = (body?.prefixes ?? []).filter((k) => db.vfiles[k] && (k.split("/")[2] === uid || isStaff(uid, k.split("/")[0])));
      removed.forEach((k) => delete db.vfiles[k]);
      return J(route, 200, removed.map((name) => ({ name })));
    }

    if (p.startsWith("/rest/v1/rpc/")) return rpc(route, p.split("/").pop(), body || {}, uid);

    const t = p.replace("/rest/v1/", "");
    const sel = sp.get("select") || "";
    if (t === "gyms") {
      if (m === "GET") return out(filt([...db.gyms].sort((a, b) => a.sort - b.sort), sp));
      if (m === "PATCH") { filt(db.gyms, sp).filter((g) => isMgr(uid, g.id)).forEach((g) => Object.assign(g, body)); return empty(route); }
    }
    if (t === "zones") {
      if (m === "GET") return out(filt([...db.zones].sort((a, b) => a.sort - b.sort), sp));
      if (m === "PATCH") {
        const rows = filt(db.zones, sp).filter((z) => isStaff(uid, z.gym_id));
        if (rows.length && "name" in body && !isMgr(uid, rows[0].gym_id)) return J(route, 403, { code: "42501", message: "只有店長可以修改區域名稱、代碼、排序和平面圖位置" });
        rows.forEach((z) => Object.assign(z, body));
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
      if (m === "GET") {
        let rows = db.routes.map((r) => ({ ...r, zones: { gym_id: zoneOf(r.zone_id).gym_id, name: zoneOf(r.zone_id).name, kind: zoneOf(r.zone_id).kind ?? "wall" } }));
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
        if (z.kind === "spray" && !(body.holds?.some((h) => h.t === "s") && body.holds?.some((h) => h.t === "t")))
          return J(route, 400, { code: "22023", message: "路線要有起攀（S）和完攀（T），圈圈最多 60 個" });
        z.route_seq++;
        const first = body.holds?.find((h) => h.t === "s");
        const r = { id: uuid(), code: `${z.code}-${String(z.route_seq).padStart(2, "0")}`, style_tags: [], setter_note: null, comments_enabled: true, created_at: now(), archived_at: null, kind: "gym", created_by: uid, ...body, ...(first ? { pin_x: first.x, pin_y: first.y } : {}) };
        db.routes.push(r);
        return out([r]);
      }
      if (m === "PATCH") {
        filt(db.routes, sp).filter((r) => isStaff(uid, zoneOf(r.zone_id).gym_id) || (r.kind === "community" && r.created_by === uid)).forEach((r) => {
          if (!r.archived_at && body.archived_at && !(r.kind === "community" && r.created_by === uid)) {
            audit(uid, zoneOf(r.zone_id).gym_id, "route.archive", r.id, { code: r.code, zone: zoneOf(r.zone_id).name, grade: r.grade, color: r.hold_color });
            dropVideos(r.id);
          }
          Object.assign(r, body);
        });
        return empty(route);
      }
    }
    if (t === "ascents") {
      const mine = db.ascents.filter((a) => a.user_id === uid);
      if (m === "GET") {
        let rows = filt(mine, sp);
        if (sel.includes("routes(")) rows = rows.map((x) => { const r = db.routes.find((y) => y.id === x.route_id); const z = zoneOf(r.zone_id); return { ...x, routes: { ...r, zones: { name: z.name, gym_id: z.gym_id } } }; }).sort((p1, p2) => p2.climbed_on.localeCompare(p1.climbed_on));
        return out(rows);
      }
      if (m === "POST") {
        if (!uid) return J(route, 403, { code: "42501", message: "沒有權限" });
        const ex = mine.find((a) => a.route_id === body.route_id);
        if (ex) Object.assign(ex, body, { updated_at: now() });
        else db.ascents.push({ id: uuid(), updated_at: now(), ...body, user_id: uid });
        return empty(route, 201);
      }
      if (m === "DELETE") { const del = filt(mine, sp); db.ascents = db.ascents.filter((a) => !del.includes(a)); return empty(route); }
    }
    if (t === "comments") {
      if (m === "GET") {
        let rows = filt(db.comments.filter((c) => !c.deleted_at), sp).map((c) => ({ ...c, profiles: { nickname: prof(c.user_id)?.nickname }, comment_likes: db.likes.filter((l) => l.comment_id === c.id).map((l) => ({ user_id: l.user_id })) }));
        rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
        if (!sel.includes("profiles")) rows = rows.map(({ profiles, ...c }) => c);
        return out(rows);
      }
      if (m === "POST") {
        const r = db.routes.find((x) => x.id === body.route_id);
        const g = db.gyms.find((x) => x.id === zoneOf(r.zone_id).gym_id);
        if (!uid || r.archived_at || !r.comments_enabled || !g.comments_enabled || !prof(uid).nickname) return J(route, 403, { code: "42501", message: 'new row violates row-level security policy for table "comments"' });
        if (db.comments.some((c) => c.route_id === r.id && c.user_id === uid && !c.deleted_at)) return J(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "comments_one_per_user"' });
        db.comments.push({ id: uuid(), route_id: body.route_id, user_id: uid, body: body.body.trim(), created_at: now(), edited_at: null, deleted_at: null });
        return empty(route, 201);
      }
    }
    if (t === "route_videos") {
      if (m === "GET" || m === "HEAD") {
        const q = new URLSearchParams(sp);
        const gym = (q.get("routes.zones.gym_id") || "").replace(/^eq\./, "");
        q.delete("routes.zones.gym_id");
        let rows = db.videos.map((v) => {
          const r = db.routes.find((x) => x.id === v.route_id);
          const z = zoneOf(r.zone_id);
          return { ...v, profiles: { nickname: prof(v.user_id)?.nickname }, routes: { code: r.code, zones: { gym_id: z.gym_id, name: z.name } } };
        });
        if (gym) rows = rows.filter((v) => v.routes.zones.gym_id === gym);
        rows.sort((x, y) => y.created_at.localeCompare(x.created_at));
        rows = filt(rows, q);
        if (m === "HEAD") return route.fulfill({ status: 200, headers: { ...cors, "content-range": `*/${rows.length}` } });
        return out(rows);
      }
      if (m === "POST") {
        if (!canShare(uid, body.route_id) || !videoPathOk(uid, body.route_id, body.path))
          return J(route, 403, { code: "42501", message: 'new row violates row-level security policy for table "route_videos"' });
        db.videos.push({ id: uuid(), caption: null, status: null, duration_s: null, size_bytes: null, ...body, user_id: uid, created_at: now() });
        return empty(route, 201);
      }
    }
    if (t === "route_likes") {
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
    if (t === "profiles" && m === "PATCH") { Object.assign(prof(uid), { nickname: body.nickname }); return empty(route); }
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

  return { db, state, addUser, addRoute, addAscent, addVideo, handler };
}
