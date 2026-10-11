// 2.5D 平面圖（斜俯視建築模型）的幾何：只算座標，不含畫面
// 投影：x 不變、y 壓扁成 0.66 倍，高度直接往上（稍微往左偏一點，像從右前方往下看）
// 1. 地板＝外框往下長出一塊厚度，看得到的側面（前面、右邊）畫深色
// 2. 外框朝後、朝左的邊畫成半透明的牆（入口、大門那段留門）；內牆畫成矮牆；櫃台等方框畫成矮方塊
// 3. 每區是一個方塊：牆上路線越多越高；前後關係用「往看的人的方向推過去會不會撞到」排出先後，由後往前畫
// 4. 前面的方塊太高會把後面的區擋掉：整張圖的高度比例會自動壓低，每區頂面至少露出 6 成
// 5. 區名和條數是正立的字，放在平面圖同樣的位置；蓋到別區的方塊就挪開，太擠會自動推開，推太遠加一條指引線；
//    字的大小固定（照卡片實際寬度換算）
// 只跟平面圖有關的計算（取樣點、前後順序）每張圖記起來，換資料、換寬度時不用重算
import { planLabel, type FloorPlanShape } from "./floorplan";

export type Pt = [number, number];
export type Face = { pts: string; f: number; depth: number };
export type Plan25dWall = { kind: "wall"; pts: string; cap: string; posts: string[] };
export type Plan25dFixture = { kind: "fixture"; faces: Face[]; top: string };
export type Plan25dZone = { kind: "zone"; code: string; tops: string[]; base: string[]; faces: Face[]; dot: Pt };
// ax, ay：推開時拉回的位置；ox, oy：平面圖原本的位置（離開太遠就畫指引線）
export type Plan25dLabel = { code: string; name: string; count: string; x: number; y: number; w: number; h: number; ax: number; ay: number; ox: number; oy: number; fixed?: boolean };
export type Plan25dInput = { code: string; name: string; total: number; count: string };

const K = 0.66; // 前後方向壓扁
const LEAN = -0.22; // 高度每往上 1，往左偏 0.22（從右前方看，左邊的外牆也看得到一點）
const VIEW = Math.hypot(LEAN, 1 / K);
// 地上往看的人的方向：同一條視線上，越往這個方向（往前、稍微往右）、越高的點越靠近看的人
const TOWARD: Pt = [-LEAN, 1 / K];
// 一個面朝向看的人的程度（-1～1）：> 0 看得到外側（畫側面），< 0 看得到內側（外框這一段畫成牆）
const facing = (nx: number, ny: number) => (-LEAN * nx + ny / K) / VIEW;
// 高度、字級、線寬都用「螢幕上的 px」寫，再依卡片寬度換成各館平面圖的座標單位（各館描圖比例不同）
export const PLAN_PX = { lift: 9, slab: 8, wall: 22, part: 12, fixture: 3, name: 13.5, count: 12, text: 11.5, pad: 4 };
// 方塊高度（px）＝ ZONE_BASE ＋ 每條的高度 × 路線數（0 條也有一點點厚度）
// 每條的高度：最多 1.2px；最高的方塊最多比 0 條的高 24px；後面的區被前面較高的方塊擋住超過 4 成就再壓低
const ZONE_BASE = 4;
const PER_ROUTE = { max: 1.2, rise: 24, hidden: 0.4 };
const MAX_NAME_EM = 5.25; // 改過的長名字最多放 5 個中文字寬，超過截短加「…」

const parse = (s: string): Pt[] => s.trim().split(/\s+/).map((p) => p.split(",").map(Number) as Pt);
const area = (ps: Pt[]) =>
  ps.reduce((a, [x1, y1], i) => {
    const [x2, y2] = ps[(i + 1) % ps.length];
    return a + x1 * y2 - x2 * y1;
  }, 0) / 2;
const inPoly = ([x, y]: Pt, ps: Pt[]) => {
  let c = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [xi, yi] = ps[i];
    const [xj, yj] = ps[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
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
// 從 q 沿 d 走（d 的長度＝1 個高度單位），第一次碰到 ps（closed：多邊形；否則折線）的距離；碰不到 Infinity
// q 在多邊形裡面算 0；q 剛好在邊上（相鄰的區共用的邊）時看往 d 走一點點是不是在裡面，不算撞到
const NUDGE = 0.3;
function rayHit(q: Pt, d: Pt, ps: Pt[], closed: boolean): number {
  if (closed && inPoly([q[0] + NUDGE * d[0], q[1] + NUDGE * d[1]], ps)) return 0;
  let best = Infinity;
  const n = closed ? ps.length : ps.length - 1;
  for (let i = 0; i < n; i++) {
    const a = ps[i];
    const b = ps[(i + 1) % ps.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const ax = a[0] - q[0];
    const ay = a[1] - q[1];
    const t = (ax * ey - ay * ex) / den;
    const s = (ax * d[1] - ay * d[0]) / den;
    if (t > NUDGE && s >= 0 && s <= 1) best = Math.min(best, t);
  }
  return best;
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
// 字寬估計（em）：中文 1.04、英文大寫 0.7、其他 0.58；數字字型（Barlow Condensed）數字 0.5、斜線 0.32
export const em = (s: string, num = false) =>
  [...s].reduce((w, c) => w + (c.charCodeAt(0) >= 0x2e80 ? 1.04 : num ? (c === "/" ? 0.32 : 0.5) : /[A-Z]/.test(c) ? 0.7 : 0.58), 0);
const clip = (s: string) => {
  if (em(s) <= MAX_NAME_EM) return s;
  const cs = [...s];
  while (cs.length > 1 && em(cs.join("") + "…") > MAX_NAME_EM) cs.pop();
  return cs.join("") + "…";
};

// 區域裡平均分布的幾個點（算被擋住幾成用）
function samples(polys: Pt[][]): Pt[] {
  const all = polys.flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (const n of [8, 16, 32]) {
    const out: Pt[] = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const p: Pt = [x0 + ((i + 0.5) / n) * (x1 - x0), y0 + ((j + 0.5) / n) * (y1 - y0)];
        if (polys.some((ps) => inPoly(p, ps))) out.push(p);
      }
    if (out.length >= 20 || n === 32) return out;
  }
  return [];
}

// 每條路線的高度（px）：見 PER_ROUTE
// 後面那區（Z）頂面上的點 q，被前面較高的 F 擋住 ⇔ 從 q 往看的人的方向走 τ 會撞到 F，而且 F 比 Z 高出 τ 以上
// 所以每個點擋住時的「每條高度」是 τ ÷ (F 的條數 − Z 的條數)；取讓每區最多擋住 4 成的最大值
// τ 只跟平面圖有關（prep 裡記好了），這裡只做加減乘除
function perRoute(prep: Prep, zs: { code: string; n: number }[], u: number): number {
  const maxN = Math.max(1, ...zs.map((z) => z.n));
  let s = Math.min(PER_ROUTE.max, PER_ROUTE.rise / maxN);
  for (const Z of zs) {
    const tau = prep.tau[Z.code];
    const k = prep.zones[Z.code].pts.length;
    if (!k) continue;
    const c: number[] = [];
    for (let i = 0; i < k; i++) {
      let m = Infinity;
      for (const F of zs) if (F.n > Z.n) m = Math.min(m, tau[F.code][i] / ((F.n - Z.n) * u));
      c.push(m);
    }
    c.sort((a, b) => a - b);
    s = Math.min(s, c[Math.floor(PER_ROUTE.hidden * k)] * 0.999);
  }
  return Math.max(0, s);
}

// 畫的先後：A 在 B 前面 ⇔ 從 B 往看的人的方向走（不超過 A 最高可能的高度）會撞到 A，或從 A 往反方向走會撞到 B
// 用拓撲排序排；兩個互相都算在前面（貼著牆的區、重疊、凹形的區域、區裡面的櫃台）時：半透明的牆先畫，再來矮的先畫、
// 一樣高就比較後面（key 小）的先畫；萬一繞成一圈，先畫牆、再畫最後面的
type Solid = { id: string; wall: boolean; shapes: { ps: Pt[]; closed: boolean }[]; h: number; key: number };
function paintOrder(items: Solid[]): number[] {
  const n = items.length;
  const pts = (it: Solid) =>
    it.shapes.flatMap(({ ps, closed }) => [...ps, ...ps.slice(0, closed ? ps.length : ps.length - 1).map((a, i) => {
      const b = ps[(i + 1) % ps.length];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt;
    })]);
  const back: Pt = [-TOWARD[0], -TOWARD[1]];
  const P = items.map(pts);
  const reach = (from: Pt[], to: Solid, d: Pt, lim: number) => from.some((q) => to.shapes.some(({ ps, closed }) => rayHit(q, d, ps, closed) <= lim));
  const front = (a: number, b: number) => reach(P[b], items[a], TOWARD, items[a].h) || reach(P[a], items[b], back, items[a].h);
  const after: number[][] = items.map(() => []); // after[b]：要畫在 b 後面的
  const need = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const ij = front(i, j); // i 在 j 前面
      const ji = front(j, i);
      if (ij === ji && !ij) continue;
      const lower = (a: Solid, b: Solid) => (a.wall !== b.wall ? a.wall : Math.abs(a.h - b.h) > 1e-6 ? a.h < b.h : a.key < b.key);
      const [first, last] = ij && ji ? (lower(items[i], items[j]) ? [i, j] : [j, i]) : ij ? [j, i] : [i, j];
      after[first].push(last);
      need[last]++;
    }
  const done = new Array(n).fill(false);
  const order: number[] = [];
  const before = (i: number, j: number) => (items[i].wall !== items[j].wall ? items[i].wall : items[i].key < items[j].key);
  while (order.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && need[i] === 0 && (pick < 0 || items[i].key < items[pick].key)) pick = i;
    // 卡住了（繞成一圈）：剩下的先挑牆、再挑最後面的
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || before(i, pick))) pick = i;
    done[pick] = true;
    order.push(pick);
    for (const k of after[pick]) need[k]--;
  }
  return order;
}

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
      if (h0 > s + 1e-6) out.push([at(s), at(h0)]); // 太短（門剛好到角落）的不畫
      s = Math.max(s, h1);
    }
    if (s < 1 - 1e-6) out.push([at(s), e.b]);
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
      l.x = clamp(l.x, x0 + l.w / 2, x1 - l.w / 2);
      l.y = clamp(l.y, y0 + l.h / 2, y1 - l.h / 2);
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

// 只跟平面圖有關的計算，每張圖算一次記起來
// zones：每區的多邊形和取樣點；tau[Z][F][k]：Z 的第 k 個取樣點往看的人的方向走多遠撞到 F（撞不到 Infinity）
// orders：畫的先後（依每 px 幾個單位記，同一支手機的寬度通常只有一兩種）
type Prep = {
  outline: Pt[];
  zones: Record<string, { polys: Pt[][]; pts: Pt[] }>;
  tau: Record<string, Record<string, number[]>>;
  orders: Map<string, string[]>;
};
const PREP = new WeakMap<FloorPlanShape, Prep>();
function prepare(shape: FloorPlanShape): Prep {
  const old = PREP.get(shape);
  if (old) return old;
  const zones = Object.fromEntries(
    Object.entries(shape.zones).map(([code, P]) => {
      const polys = P.polys.map(parse);
      return [code, { polys, pts: samples(polys) }];
    })
  );
  const tau = Object.fromEntries(
    Object.entries(zones).map(([z, Z]) => [
      z,
      Object.fromEntries(
        Object.entries(zones).map(([f, F]) => [f, z === f ? Z.pts.map(() => Infinity) : Z.pts.map((q) => Math.min(...F.polys.map((ps) => rayHit(q, TOWARD, ps, true))))])
      ),
    ])
  );
  const prep = { outline: parse(shape.outline), zones, tau, orders: new Map() };
  PREP.set(shape, prep);
  return prep;
}

// width：卡片裡平面圖實際的寬度（px），用來把 px 換成平面圖座標單位，字就固定大小
// floors：同一張卡片裡的每一層（南港 1F、2F）：每條多高用同一個比例，兩層的方塊才比得出高低
export function buildPlan25d(shape: FloorPlanShape, zones: Plan25dInput[], width: number, floors: FloorPlanShape[] = [shape]) {
  const prep = prepare(shape);
  const outline = prep.outline;
  const xs = outline.map((p) => p[0]);
  // 每 px 幾個平面圖單位（左右多出來的：左牆往左偏、地板厚度往右偏、四周留白，約 16px）
  const u = (Math.max(...xs) - Math.min(...xs)) / Math.max(120, width - 16);
  const H = Object.fromEntries(Object.entries(PLAN_PX).map(([k, v]) => [k, v * u])) as Record<keyof typeof PLAN_PX, number>;

  const floorFaces = sides(outline, -H.slab, 0);
  const floorTop = str(outline.map((p) => proj(p, 0)));
  // 前後順序的備用依據：越往看的人的方向越前面
  const keyOf = (ps: Pt[]) => Math.max(...ps.map((p) => p[0] * TOWARD[0] + p[1] * TOWARD[1]));

  const wallOf = (id: string, a: Pt, b: Pt, h: number) => ({
    item: { kind: "wall", pts: quad(a, b, 0, h), cap: str([proj(a, h), proj(b, h)]), posts: [str([proj(a, 0), proj(a, h)]), str([proj(b, 0), proj(b, h)])] } as Plan25dWall,
    solid: { id, wall: true, shapes: [{ ps: [a, b], closed: false }], h, key: keyOf([a, b]) - 0.1 },
  });
  // 入口、地上寫「門」的字（例如大門）都當作門，那段外牆留空
  const doors = [...(shape.entrance ? [shape.entrance] : []), ...(shape.texts ?? []).filter((t) => /門|入口/.test(t.t))];
  const walls = wallSegs(outline, doors, 60 * u, 40 * u).map(([a, b], i) => wallOf(`w${i}`, a, b, H.wall));
  const parts = (shape.walls ?? []).flatMap((w, j) => {
    const ps = parse(w);
    return ps.slice(1).map((b, i) => wallOf(`p${j}-${i}`, ps[i], b, H.part));
  });

  const fixtures = shape.fixtures.map(([x, y, w, h], i) => {
    const ps: Pt[] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    return {
      item: { kind: "fixture", faces: sides(ps, 0, H.fixture), top: str(ps.map((p) => proj(p, H.fixture))) } as Plan25dFixture,
      solid: { id: `f${i}`, wall: false, shapes: [{ ps, closed: true }], h: H.fixture, key: keyOf(ps) },
    };
  });

  // 每區的高度：整張圖一起算每條多高
  const drawn = zones.flatMap((z) => (shape.zones[z.code] ? [{ z, code: z.code, P: shape.zones[z.code], polys: prep.zones[z.code].polys, n: Math.max(0, z.total) }] : []));
  const per =
    Math.min(
      ...floors.map((f) => {
        const p = prepare(f);
        const fx = p.outline.map((q) => q[0]);
        const fu = (Math.max(...fx) - Math.min(...fx)) / Math.max(120, width - 16);
        return perRoute(p, zones.flatMap((z) => (f.zones[z.code] ? [{ code: z.code, n: Math.max(0, z.total) }] : [])), fu);
      })
    ) * u;
  const heightOf = (n: number) => ZONE_BASE * u + per * n;

  const labels: Plan25dLabel[] = [];
  const blocks = drawn.map(({ z, P, polys, n }) => {
    const zh = heightOf(n);
    const big = polys.reduce((m, ps) => (Math.abs(area(ps)) > Math.abs(area(m)) ? ps : m), polys[0]);
    const c: Pt = [big.reduce((s, p) => s + p[0], 0) / big.length, big.reduce((s, p) => s + p[1], 0) / big.length];
    const name = clip(planLabel(P, z.name));
    // 區名放的地方：原本（平面圖）的位置在這區裡面 → 跟著頂面浮上去；在旁邊的地上（多半是沿牆的長條區）→ 留在地上
    const onTop = polys.some((ps) => inPoly([P.lx, P.ly], ps));
    const [ax, ay] = proj([P.lx, P.ly], onTop ? zh : 0);
    const w = Math.max(em(name) * H.name, em(z.count, true) * H.count) + 2 * H.pad;
    const h = 0.86 * H.name + 0.99 * H.count + 1.2 * H.pad;
    labels.push({ code: z.code, name, count: z.count, x: ax, y: ay, w, h, ax, ay, ox: ax, oy: ay });
    const tops = polys.map((ps) => ps.map((p) => proj(p, zh)));
    const faces = polys.flatMap((ps) => sides(ps, 0, zh)).sort((p, q) => p.depth - q.depth);
    return {
      item: {
        kind: "zone",
        code: z.code,
        tops: tops.map(str),
        base: polys.map((ps) => str(ps.map((p) => proj(p, 0)))),
        faces,
        dot: proj(c, zh),
      } as Plan25dZone,
      // 畫出來佔的範圍（頂面＋側面）：區名要避開別區的
      region: [...tops, ...faces.map((f) => parse(f.pts))].map((ps) => ({ ps, x0: Math.min(...ps.map((p) => p[0])), x1: Math.max(...ps.map((p) => p[0])), y0: Math.min(...ps.map((p) => p[1])), y1: Math.max(...ps.map((p) => p[1])) })),
      solid: { id: `z${z.code}`, wall: false, shapes: polys.map((ps) => ({ ps, closed: true })), h: (ZONE_BASE + PER_ROUTE.rise) * u + H.lift, key: keyOf(polys.flat()) },
    };
  });

  // 櫃台、大門、入口等地上的字：不動，區名會讓開
  const inFixture = (x: number, y: number) => shape.fixtures.some(([fx, fy, fw, fh]) => x >= fx && x <= fx + fw && y >= fy && y <= fy + fh);
  const notes = [...(shape.texts ?? []), ...(shape.entrance ? [{ ...shape.entrance, t: "入口" }] : [])].map((t) => {
    const [x, y] = proj([t.x, t.y], inFixture(t.x, t.y) ? H.fixture : 0);
    return { t: t.t, x, y };
  });

  // 畫面範圍：地板（含厚度）、牆頂、浮起來的區域頂面
  const tallest = Math.max(0, ...drawn.map((d) => heightOf(d.n)));
  const pts: Pt[] = [
    ...outline.flatMap((p) => [proj(p, 0), proj(p, -H.slab)]),
    ...wallSegs(outline, [], 0, 0).flatMap(([a, b]) => [proj(a, H.wall), proj(b, H.wall)]),
    ...Object.values(prep.zones).flatMap((Z) => Z.polys.flat().map((p) => proj(p, tallest + H.lift))),
  ];
  const minX = Math.min(...pts.map((p) => p[0])) - H.pad;
  const maxX = Math.max(...pts.map((p) => p[0])) + H.pad;
  const minY = Math.min(...pts.map((p) => p[1])) - H.pad;
  const maxY = Math.max(...pts.map((p) => p[1])) + H.pad;

  // 區名蓋到別區的方塊（例如前面的區比較高，浮起來蓋住後面那區旁邊的地板）：在附近找蓋得最少、也不跟別的字疊的位置
  // 蓋最多的先挪；挪的距離算成本，寧可留一點蓋到也不要跑太遠
  const cover = (l: Plan25dLabel, x: number, y: number) => {
    let hit = 0;
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 3; j++) {
        const p: Pt = [x + ((i - 2) / 5) * l.w, y + ((j - 1) / 3) * l.h];
        if (blocks.some((b) => b.item.code !== l.code && b.region.some((r) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1 && inPoly(p, r.ps)))) hit++;
      }
    return hit / 15;
  };
  const clash = (l: Plan25dLabel, x: number, y: number) =>
    labels.reduce((sum, o) => {
      if (o === l) return sum;
      const ox = Math.max(0, Math.min(x + l.w / 2, o.ax + o.w / 2) - Math.max(x - l.w / 2, o.ax - o.w / 2));
      const oy = Math.max(0, Math.min(y + l.h / 2, o.ay + o.h / 2) - Math.max(y - l.h / 2, o.ay - o.h / 2));
      return sum + (ox * oy) / (l.w * l.h);
    }, 0);
  const notesBox = notes.map((n) => ({ ax: n.x, ay: n.y - 0.35 * H.text, w: em(n.t) * H.text + H.pad, h: H.text }));
  const covered = labels.map((l) => ({ l, c: cover(l, l.ax, l.ay) })).filter((x) => x.c > 0.2).sort((p, q) => q.c - p.c);
  for (const { l } of covered) {
    const cost = (x: number, y: number, d: number) =>
      cover(l, x, y) + clash(l, x, y) + notesBox.reduce((sum, o) => sum + (Math.abs(x - o.ax) < (l.w + o.w) / 2 && Math.abs(y - o.ay) < (l.h + o.h) / 2 ? 1 : 0), 0) + 0.25 * d;
    let best = { x: l.ax, y: l.ay, c: cost(l.ax, l.ay, 0) };
    for (const dx of [0, -0.5, 0.5, -1, 1])
      for (const dy of [0, -0.5, 0.5, -1, 1]) {
        const x = l.ax + dx * l.w;
        const y = l.ay + dy * l.h;
        if (x - l.w / 2 < minX || x + l.w / 2 > maxX || y - l.h / 2 < minY || y + l.h / 2 > maxY) continue;
        const c = cost(x, y, Math.hypot(dx, dy));
        if (c < best.c) best = { x, y, c };
      }
    l.x = l.ax = best.x;
    l.y = l.ay = best.y;
  }
  for (const n of notes)
    labels.push({ code: "", name: n.t, count: "", x: n.x, y: n.y - 0.35 * H.text, w: em(n.t) * H.text + H.pad, h: H.text, ax: n.x, ay: n.y, ox: n.x, oy: n.y, fixed: true });
  relax(labels, [minX, minY, maxX, maxY], 1.5 * u);
  separate(labels, 1.5 * u);
  // 畫面範圍包含所有字（被推到邊邊外的也看得到）
  const lx0 = Math.min(minX, ...labels.map((l) => l.x - l.w / 2 - H.pad / 2));
  const lx1 = Math.max(maxX, ...labels.map((l) => l.x + l.w / 2 + H.pad / 2));
  const ly0 = Math.min(minY, ...labels.map((l) => l.y - l.h / 2 - H.pad / 2));
  const ly1 = Math.max(maxY, ...labels.map((l) => l.y + l.h / 2 + H.pad / 2));

  // 畫的先後：用整張圖（所有區、最高可能的高度）排一次記起來，這次有畫的照那個順序
  // 依寬度記（門口留空的長度跟著寬度變，牆的段數可能不同）
  const key = String(u);
  if (!prep.orders.has(key)) {
    const allZones = Object.entries(prep.zones).map(([code, Z]) => ({ id: `z${code}`, wall: false, shapes: Z.polys.map((ps) => ({ ps, closed: true })), h: (ZONE_BASE + PER_ROUTE.rise) * u + H.lift, key: keyOf(Z.polys.flat()) }));
    const solids = [...walls, ...parts, ...fixtures].map((a) => a.solid).concat(allZones);
    prep.orders.set(key, paintOrder(solids).map((i) => solids[i].id));
  }
  const byId = new Map<string, Plan25dWall | Plan25dFixture | Plan25dZone>([...walls, ...parts, ...fixtures, ...blocks].map((a) => [a.solid.id, a.item]));
  const items = prep.orders.get(key)!.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  return {
    u,
    H,
    viewBox: `${lx0.toFixed(1)} ${ly0.toFixed(1)} ${(lx1 - lx0).toFixed(1)} ${(ly1 - ly0).toFixed(1)}`,
    floorFaces,
    floorTop,
    items,
    labels: labels.filter((l) => !l.fixed),
    notes,
    dots: Object.fromEntries(blocks.map((b) => [b.item.code, b.item.dot])) as Record<string, Pt>,
  };
}
