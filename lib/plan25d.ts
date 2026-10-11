// 2.5D 平面圖（斜俯視建築模型）的幾何：只算座標，不含畫面
// 投影：x 不變、y 壓扁成 0.66 倍，高度直接往上（稍微往左偏一點，像從右前方往下看）
// 1. 地板＝外框往下長出一塊厚度，看得到的側面（前面、右邊）畫深色
// 2. 外框朝後、朝左的邊畫成半透明的牆（入口、大門那段留門）；內牆畫成矮牆；櫃台等方框畫成矮方塊
// 3. 每區是一個方塊：牆上路線越多越高；由後往前畫（畫家演算法）
// 4. 區名和條數是正立的字，太擠會自動推開，推太遠加一條指引線；字的大小固定（照卡片實際寬度換算）
import { planLabel, type FloorPlanShape } from "./floorplan";

export type Pt = [number, number];
export type Face = { pts: string; f: number; depth: number };
export type Plan25dWall = { kind: "wall"; depth: number; pts: string; cap: string; posts: string[] };
export type Plan25dFixture = { kind: "fixture"; depth: number; faces: Face[]; top: string };
export type Plan25dZone = { kind: "zone"; depth: number; code: string; tops: string[]; base: string[]; faces: Face[]; dot: Pt };
export type Plan25dLabel = { code: string; name: string; count: string; x: number; y: number; w: number; h: number; ax: number; ay: number; fixed?: boolean };
export type Plan25dInput = { code: string; name: string; total: number; count: string };

const K = 0.66; // 前後方向壓扁
const LEAN = -0.22; // 高度每往上 1，往左偏 0.22（從右前方看，左邊的外牆也看得到一點）
const VIEW = Math.hypot(LEAN, 1 / K);
// 一個面朝向看的人的程度（-1～1）：> 0 看得到外側（畫側面），< 0 看得到內側（外框這一段畫成牆）
const facing = (nx: number, ny: number) => (-LEAN * nx + ny / K) / VIEW;
// 高度、字級、線寬都用「螢幕上的 px」寫，再依卡片寬度換成各館平面圖的座標單位（各館描圖比例不同）
export const PLAN_PX = { lift: 9, slab: 8, wall: 22, part: 12, fixture: 3, name: 13.5, count: 12, text: 11.5, pad: 4 };
// 方塊高度（px）：牆上路線越多越高，0 條也有一點點厚度
export const zoneHeightPx = (total: number) => 4 + 1.2 * Math.min(total, 20);
const MAX_NAME_EM = 5; // 改過的長名字最多放 5 個中文字寬，超過截短加「…」

const parse = (s: string): Pt[] => s.trim().split(/\s+/).map((p) => p.split(",").map(Number) as Pt);
const area = (ps: Pt[]) =>
  ps.reduce((a, [x1, y1], i) => {
    const [x2, y2] = ps[(i + 1) % ps.length];
    return a + x1 * y2 - x2 * y1;
  }, 0) / 2;
// 每一邊和往外的法線
function edges(ps: Pt[]) {
  const s = area(ps) > 0 ? 1 : -1;
  return ps.map((a, i) => {
    const b = ps[(i + 1) % ps.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    return { a, b, nx: (s * dy) / L, ny: (-s * dx) / L };
  });
}
const proj = ([x, y]: Pt, z: number): Pt => [x + LEAN * z, y * K - z];
const str = (ps: Pt[]) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const quad = (a: Pt, b: Pt, z0: number, z1: number) => str([proj(a, z1), proj(b, z1), proj(b, z0), proj(a, z0)]);
// 看得到的側面（高度 z0～z1），由後往前排
const sides = (ps: Pt[], z0: number, z1: number): Face[] =>
  edges(ps)
    .flatMap((e) => {
      const f = facing(e.nx, e.ny);
      return f > 0.02 ? [{ pts: quad(e.a, e.b, z0, z1), f, depth: Math.max(e.a[1], e.b[1]) }] : [];
    })
    .sort((p, q) => p.depth - q.depth);
// 字寬估計（em）：中文 1、英文大寫 0.68、其他 0.56；數字字型（Barlow Condensed）數字 0.48、斜線 0.32
export const em = (s: string, num = false) =>
  [...s].reduce((w, c) => w + (c.charCodeAt(0) >= 0x2e80 ? 1.04 : num ? (c === "/" ? 0.32 : 0.5) : /[A-Z]/.test(c) ? 0.7 : 0.58), 0);
const clip = (s: string) => {
  if (em(s) <= MAX_NAME_EM) return s;
  const cs = [...s];
  while (cs.length > 1 && em(cs.join("") + "…") > MAX_NAME_EM) cs.pop();
  return cs.join("") + "…";
};

// 外框朝後、朝左的邊 → 牆；門（入口、大門）附近那一段留空
function wallSegs(ps: Pt[], doors: { x: number; y: number }[], gap: number, near: number): [Pt, Pt][] {
  return edges(ps).flatMap((e): [Pt, Pt][] => {
    if (facing(e.nx, e.ny) >= -0.02) return [];
    const dx = e.b[0] - e.a[0];
    const dy = e.b[1] - e.a[1];
    const L2 = dx * dx + dy * dy || 1;
    const at = (s: number): Pt => [e.a[0] + s * dx, e.a[1] + s * dy];
    // 這一邊上要留空的範圍（0～1）
    const holes = doors
      .map((d) => ({ t: ((d.x - e.a[0]) * dx + (d.y - e.a[1]) * dy) / L2, d }))
      .filter(({ t, d }) => t > 0 && t < 1 && Math.hypot(d.x - at(t)[0], d.y - at(t)[1]) < near)
      .map(({ t }) => [t - gap / 2 / Math.sqrt(L2), t + gap / 2 / Math.sqrt(L2)] as [number, number])
      .sort((p, q) => p[0] - q[0]);
    const out: [Pt, Pt][] = [];
    let s = 0;
    for (const [h0, h1] of holes) {
      if (h0 > s) out.push([at(s), at(h0)]);
      s = Math.max(s, h1);
    }
    if (s < 1) out.push([at(s), e.b]);
    return out;
  });
}

// 標籤太擠就互相推開（固定的字不動），同時慢慢拉回原位，最後幾輪只推不拉
function relax(ls: Plan25dLabel[], [x0, y0, x1, y1]: number[], gap: number) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  for (let it = 0; it < 140; it++) {
    for (let i = 0; i < ls.length; i++)
      for (let j = i + 1; j < ls.length; j++) {
        const A = ls[i];
        const B = ls[j];
        if (A.fixed && B.fixed) continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const ox = (A.w + B.w) / 2 + gap - Math.abs(dx);
        const oy = (A.h + B.h) / 2 + gap - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        const ma = A.fixed ? 0 : B.fixed ? 1 : 0.5;
        const mb = B.fixed ? 0 : A.fixed ? 1 : 0.5;
        if (ox < oy) {
          const s = dx >= 0 ? 1 : -1;
          A.x -= s * ox * ma;
          B.x += s * ox * mb;
        } else {
          const s = dy >= 0 ? 1 : -1;
          A.y -= s * oy * ma;
          B.y += s * oy * mb;
        }
      }
    for (const l of ls) {
      if (l.fixed) continue;
      if (it < 120) {
        l.x += (l.ax - l.x) * 0.05;
        l.y += (l.ay - l.y) * 0.05;
      }
      // 前面幾輪留在圖裡；最後只推開、不夾回去（擠在邊邊時寧可超出一點，畫面範圍會跟著放大）
      if (it < 140) {
        l.x = clamp(l.x, x0 + l.w / 2, x1 - l.w / 2);
        l.y = clamp(l.y, y0 + l.h / 2, y1 - l.h / 2);
      }
    }
  }
}
// 還有重疊的（很擠的角落）：一直推開到完全不疊為止，不管邊界
function separate(ls: Plan25dLabel[], gap: number) {
  for (let it = 0; it < 400; it++) {
    let moved = false;
    for (let i = 0; i < ls.length; i++)
      for (let j = i + 1; j < ls.length; j++) {
        const A = ls[i];
        const B = ls[j];
        if (A.fixed && B.fixed) continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const ox = (A.w + B.w) / 2 + gap - Math.abs(dx);
        const oy = (A.h + B.h) / 2 + gap - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const ma = A.fixed ? 0 : B.fixed ? 1 : 0.5;
        const mb = B.fixed ? 0 : A.fixed ? 1 : 0.5;
        if (ox < oy) {
          const s = dx >= 0 ? 1 : -1;
          A.x -= s * (ox + 0.01) * ma;
          B.x += s * (ox + 0.01) * mb;
        } else {
          const s = dy >= 0 ? 1 : -1;
          A.y -= s * (oy + 0.01) * ma;
          B.y += s * (oy + 0.01) * mb;
        }
      }
    if (!moved) return;
  }
}

// width：卡片裡平面圖實際的寬度（px），用來把 px 換成平面圖座標單位，字就固定大小
export function buildPlan25d(shape: FloorPlanShape, zones: Plan25dInput[], width: number) {
  const outline = parse(shape.outline);
  const xs = outline.map((p) => p[0]);
  // 每 px 幾個平面圖單位（左右多出來的：左牆往左偏、地板厚度往右偏、四周留白，約 16px）
  const u = (Math.max(...xs) - Math.min(...xs)) / Math.max(120, width - 16);
  const H = Object.fromEntries(Object.entries(PLAN_PX).map(([k, v]) => [k, v * u])) as Record<keyof typeof PLAN_PX, number>;

  const floorFaces = sides(outline, -H.slab, 0);
  const floorTop = str(outline.map((p) => proj(p, 0)));

  const wallOf = (a: Pt, b: Pt, h: number): Plan25dWall => ({
    kind: "wall",
    depth: Math.min(a[1], b[1]) - 0.2,
    pts: quad(a, b, 0, h),
    cap: str([proj(a, h), proj(b, h)]),
    posts: [str([proj(a, 0), proj(a, h)]), str([proj(b, 0), proj(b, h)])],
  });
  // 入口、地上寫「門」的字（例如大門）都當作門，那段外牆留空
  const doors = [...(shape.entrance ? [shape.entrance] : []), ...(shape.texts ?? []).filter((t) => /門|入口/.test(t.t))];
  const walls = wallSegs(outline, doors, 60 * u, 40 * u).map(([a, b]) => wallOf(a, b, H.wall));
  const parts = (shape.walls ?? []).flatMap((w) => {
    const ps = parse(w);
    return ps.slice(1).map((b, i) => wallOf(ps[i], b, H.part));
  });

  const fixtures: Plan25dFixture[] = shape.fixtures.map(([x, y, w, h]) => {
    const ps: Pt[] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    return { kind: "fixture", depth: y + h - 0.5, faces: sides(ps, 0, H.fixture), top: str(ps.map((p) => proj(p, H.fixture))) };
  });

  const labels: Plan25dLabel[] = [];
  const blocks: Plan25dZone[] = zones.flatMap((z) => {
    const P = shape.zones[z.code];
    if (!P) return [];
    const zh = zoneHeightPx(z.total) * u;
    const polys = P.polys.map(parse);
    const big = polys.reduce((m, ps) => (Math.abs(area(ps)) > Math.abs(area(m)) ? ps : m), polys[0]);
    const c: Pt = [big.reduce((s, p) => s + p[0], 0) / big.length, big.reduce((s, p) => s + p[1], 0) / big.length];
    const name = clip(planLabel(P, z.name));
    const [ax, ay] = proj([P.lx, P.ly], zh);
    const w = Math.max(em(name) * H.name, em(z.count, true) * H.count) + 2 * H.pad;
    const h = 0.86 * H.name + 0.99 * H.count + 1.2 * H.pad;
    labels.push({ code: z.code, name, count: z.count, x: ax, y: ay, w, h, ax, ay });
    return [
      {
        kind: "zone" as const,
        depth: Math.max(...polys.flat().map((p) => p[1])),
        code: z.code,
        tops: polys.map((ps) => str(ps.map((p) => proj(p, zh)))),
        base: polys.map((ps) => str(ps.map((p) => proj(p, 0)))),
        faces: polys.flatMap((ps) => sides(ps, 0, zh)).sort((p, q) => p.depth - q.depth),
        dot: proj(c, zh),
      },
    ];
  });

  // 櫃台、大門、入口等地上的字：不動，區名會讓開
  const inFixture = (x: number, y: number) => shape.fixtures.some(([fx, fy, fw, fh]) => x >= fx && x <= fx + fw && y >= fy && y <= fy + fh);
  const notes = [...(shape.texts ?? []), ...(shape.entrance ? [{ ...shape.entrance, t: "入口" }] : [])].map((t) => {
    const [x, y] = proj([t.x, t.y], inFixture(t.x, t.y) ? H.fixture : 0);
    return { t: t.t, x, y };
  });
  for (const n of notes)
    labels.push({ code: "", name: n.t, count: "", x: n.x, y: n.y - 0.35 * H.text, w: em(n.t) * H.text + H.pad, h: H.text, ax: n.x, ay: n.y, fixed: true });

  // 畫面範圍：地板（含厚度）、牆頂、浮起來的區域頂面
  const tallest = Math.max(0, ...zones.map((z) => zoneHeightPx(z.total) * u));
  const pts: Pt[] = [
    ...outline.flatMap((p) => [proj(p, 0), proj(p, -H.slab)]),
    ...wallSegs(outline, [], 0, 0).flatMap(([a, b]) => [proj(a, H.wall), proj(b, H.wall)]),
    ...Object.values(shape.zones).flatMap((P) => P.polys.flatMap(parse).map((p) => proj(p, tallest + H.lift))),
  ];
  const minX = Math.min(...pts.map((p) => p[0])) - H.pad;
  const maxX = Math.max(...pts.map((p) => p[0])) + H.pad;
  const minY = Math.min(...pts.map((p) => p[1])) - H.pad;
  const maxY = Math.max(...pts.map((p) => p[1])) + H.pad;
  relax(labels, [minX, minY, maxX, maxY], 1.5 * u);
  separate(labels, 1.5 * u);
  // 畫面範圍包含所有字（被推到邊邊外的也看得到）
  const lx0 = Math.min(minX, ...labels.map((l) => l.x - l.w / 2 - H.pad / 2));
  const lx1 = Math.max(maxX, ...labels.map((l) => l.x + l.w / 2 + H.pad / 2));
  const ly0 = Math.min(minY, ...labels.map((l) => l.y - l.h / 2 - H.pad / 2));
  const ly1 = Math.max(maxY, ...labels.map((l) => l.y + l.h / 2 + H.pad / 2));

  const items = [...walls, ...parts, ...fixtures, ...blocks].sort((p, q) => p.depth - q.depth);
  return {
    u,
    H,
    viewBox: `${lx0.toFixed(1)} ${ly0.toFixed(1)} ${(lx1 - lx0).toFixed(1)} ${(ly1 - ly0).toFixed(1)}`,
    floorFaces,
    floorTop,
    items,
    labels: labels.filter((l) => !l.fixed),
    notes,
    dots: Object.fromEntries(blocks.map((b) => [b.code, b.dot])) as Record<string, Pt>,
  };
}
