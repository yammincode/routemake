// 攀岩角色的圖（B 貼紙線稿：白邊＋深色細線，使用者 10/21 選的）：回傳 SVG 字串，元件用 dangerouslySetInnerHTML 畫
// 人：viewBox 0 0 120 200（腳底 y190）；頭：中心 x60、頭頂 y22、左右 x36–84、下巴 y80
// 頭髮分兩層：back 畫在頭後面、front（頭頂和瀏海）蓋在臉上；頭頂比頭大一圈、髮際線在眉毛上面；帽子最後畫，壓在頭髮上
// 背景：viewBox 0 0 400 250
import { climberColor, type Climber } from "./climber";

// 調深（f < 0）或調淺（f > 0）
export function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = f < 0 ? 0 : 255;
  const p = Math.abs(f);
  r = Math.round(r + (t - r) * p);
  g = Math.round(g + (t - g) * p);
  b = Math.round(b + (t - b) * p);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
const light = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 165;
};

// 貼紙外框：白邊 3.6＋深色線 1.5（每張圖都帶一份，同名同內容，哪張先載都一樣）
const FILTER = `<defs><filter id="clOl" x="-15%" y="-15%" width="130%" height="130%"><feMorphology in="SourceAlpha" operator="dilate" radius="3.6" result="w"/><feFlood flood-color="#ffffff"/><feComposite in2="w" operator="in" result="wo"/><feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="d"/><feFlood flood-color="#2a1d1a"/><feComposite in2="d" operator="in" result="do"/><feMerge><feMergeNode in="wo"/><feMergeNode in="do"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

// ---------- 頭髮 ----------
type Hair = {
  back?: string;
  front?: string;
  hi?: boolean; // 頭頂反光
  op?: number; // 平頭：頭髮淡一點
  tie?: [number, number]; // 馬尾的髮圈
  braids?: boolean;
  bun?: boolean;
  curls?: [number, number, number][];
  backCurls?: [number, number, number][];
  backFill?: string;
  shine?: boolean; // 光頭的反光
};
const arc = (cx: number, cy: number, R: number, a0: number, a1: number, n: number, r: number): [number, number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    return [cx + R * Math.cos(a), cy + R * Math.sin(a), r];
  });
const NAPE = `M33 50 C32 30 45 18 60 18 C75 18 88 30 87 50 L86 62 C80 66 40 66 34 62 Z`;
const PULLED = `M34 52 C32 30 45 19 60 19 C75 19 88 30 86 52 L84 52 C83 44 80 39 76 37 C68 34 52 34 44 37 C40 39 37 44 36 52 Z`;
const CURL_EDGE = "C84 44 82 40 78 38 C76 41 72 41 70 38 C67 41 63 41 60 38 C57 41 53 41 50 38 C48 41 44 41 42 38 C38 40 36 44 34 50 Z";
const HAIR: Record<string, Hair> = {
  short: { back: NAPE, front: `M33 52 C31 32 44 19 61 19 C78 19 89 31 87 52 L84 52 C83 45 81 41 78 38 C70 41 56 40 46 34 C43 39 40 44 37 52 Z`, hi: true },
  crop: {
    back: NAPE,
    front: `M32 56 C29 30 44 18 60 18 C76 18 91 30 88 56 L84 54 C83 49 82 47 80 45 C76 47 72 44 70 46 C64 48 56 44 50 47 C46 45 42 47 40 45 C38 47 37 49 36 54 Z`,
    hi: true,
  },
  buzz: { front: `M35 48 C35 30 46 21 60 21 C74 21 85 30 85 48 C82 41 79 38 75 37 C66 35 54 35 45 37 C41 38 38 41 35 48 Z`, op: 0.82 },
  pomp: {
    back: `M33 50 C32 30 45 18 60 18 C75 18 88 30 87 50 L86 60 L34 60 Z`,
    front: `M34 50 C30 30 38 12 56 10 C74 8 92 18 88 40 L86 50 L83 50 C82 43 80 39 77 37 C66 34 52 34 43 37 C40 40 38 44 37 50 Z`,
    hi: true,
  },
  spiky: {
    front: `M34 50 L30 32 L38 33 L35 17 L46 25 L49 10 L58 20 L64 7 L69 20 L79 12 L79 27 L91 25 L86 37 L87 50 L84 50 C82 43 79 39 76 38 L71 43 L66 37 L59 42 L54 36 L47 41 L44 37 C40 40 38 44 37 50 Z`,
  },
  middle: {
    back: `M32 50 C31 28 45 18 60 18 C75 18 89 28 88 50 L89 74 L31 74 Z`,
    front: `M32 72 C29 40 40 18 60 18 C80 18 91 40 88 72 L82 72 C83 54 80 43 74 37 C68 34 63 33 60 35 C57 33 52 34 46 37 C40 43 37 54 38 72 Z`,
    hi: true,
  },
  bob: {
    back: `M30 50 C29 28 44 17 60 17 C76 17 91 28 90 50 L91 80 Q60 87 29 80 Z`,
    front: `M30 80 C27 40 38 17 60 17 C82 17 93 40 90 80 L83 80 C84 64 84 53 82 45 L38 45 C36 53 36 64 37 80 Z`,
    hi: true,
  },
  long: {
    back: `M31 50 C29 26 44 17 60 17 C76 17 91 26 89 50 L95 120 Q60 128 25 120 Z`,
    front: `M31 50 C30 30 43 18 60 18 C78 18 90 30 89 50 L91 100 L83 100 C83 72 84 57 82 47 C74 43 62 41 52 34 C46 40 40 45 38 51 C37 66 38 82 38 100 L29 100 Z`,
    hi: true,
  },
  pony: { back: `${NAPE} M77 25 C98 18 106 46 99 74 C96 90 90 100 85 104 C90 86 92 64 84 44 Z`, tie: [80, 27], front: PULLED, hi: true },
  braids: {
    back: NAPE,
    front: `M34 54 C32 30 45 19 60 19 C75 19 88 30 86 54 L84 54 C83 44 78 38 70 36 L60 30 L50 36 C42 38 37 44 36 54 Z`,
    hi: true,
    braids: true,
  },
  bun: { back: NAPE, bun: true, front: PULLED, hi: true },
  curly: { back: NAPE, curls: arc(60, 44, 25, Math.PI * 1.02, Math.PI * 1.98, 9, 7.5), front: `M34 50 C32 28 46 18 60 18 C74 18 88 28 86 50 ${CURL_EDGE}` },
  afro: {
    backCurls: arc(60, 42, 30, Math.PI * 0.82, Math.PI * 2.18, 15, 12),
    backFill: `M24 44 C24 10 96 10 96 44 L94 62 L26 62 Z`,
    front: `M34 50 C32 28 46 18 60 18 C74 18 88 28 86 50 ${CURL_EDGE}`,
  },
  bald: { shine: true },
};

// ---------- 動作：手（d＝線、h＝手的位置）、腳（f＝腳尖、a＝鞋子轉的角度）；hold＝抓／踩在岩點上 ----------
type Arm = { d: string; h: [number, number]; hold?: boolean; thumb?: boolean; open?: boolean; brush?: boolean };
type Leg = { d: string; f: [number, number]; a: number; hold?: boolean };
type Pose = { arms: [Arm, Arm]; legs?: [Leg, Leg]; lift?: number; target?: [number, number]; spot?: [number, number]; belay?: boolean };
const DOWN_L: Arm = { d: "M41 95 C35 108 32 120 32 133", h: [32, 136] };
const DOWN_R: Arm = { d: "M79 95 C85 108 88 120 88 133", h: [88, 136] };
const POSES: Record<string, Pose> = {
  stand: { arms: [DOWN_L, DOWN_R] },
  thumb: { arms: [DOWN_L, { d: "M79 95 C90 96 96 86 97 74", h: [97, 70], thumb: true }] },
  hips: { arms: [{ d: "M41 95 C30 104 30 120 41 127", h: [42, 128] }, { d: "M79 95 C90 104 90 120 79 127", h: [78, 128] }] },
  wave: { arms: [DOWN_L, { d: "M79 95 C92 90 98 78 98 66", h: [98, 62], open: true }] },
  chalk: { arms: [DOWN_L, { d: "M79 95 C89 106 89 118 83 127", h: [82, 128] }] },
  hang: {
    arms: [
      { d: "M41 95 C33 84 29 70 28 54", h: [28, 50], hold: true },
      { d: "M79 95 C87 84 91 70 92 50", h: [92, 46], hold: true },
    ],
    legs: [
      { d: "M51 133 Q31 150 41 172", f: [41, 176], a: 20, hold: true },
      { d: "M69 133 Q93 138 87 156", f: [88, 160], a: -30, hold: true },
    ],
  },
  reach: {
    arms: [
      { d: "M41 95 C32 104 27 112 25 121", h: [24, 123], hold: true },
      { d: "M79 95 C88 76 95 58 99 40", h: [100, 36], hold: true },
    ],
    legs: [
      { d: "M51 133 Q48 156 47 174", f: [47, 178], a: 0, hold: true },
      { d: "M69 133 Q88 150 103 155", f: [106, 156], a: -80 },
    ],
  },
  heel: {
    arms: [
      { d: "M41 95 C34 82 32 68 32 54", h: [32, 50], hold: true },
      { d: "M79 95 C86 102 88 110 88 118", h: [88, 121], hold: true },
    ],
    legs: [
      { d: "M51 133 Q46 156 46 174", f: [46, 178], a: 0, hold: true },
      { d: "M69 133 Q96 128 105 108", f: [107, 104], a: -130, hold: true },
    ],
  },
  dyno: {
    lift: -16,
    target: [86, 22],
    arms: [
      { d: "M41 95 C48 76 60 58 70 42", h: [72, 38] },
      { d: "M79 95 C88 78 95 60 98 44", h: [99, 40] },
    ],
    legs: [
      { d: "M51 133 Q44 152 35 162", f: [33, 165], a: 40 },
      { d: "M69 133 Q77 154 88 160", f: [90, 163], a: -40 },
    ],
  },
  belay: { arms: [{ d: "M41 95 C38 104 46 108 52 108", h: [55, 108] }, { d: "M79 95 C85 112 81 132 72 146", h: [71, 148] }], belay: true },
  brush: { arms: [DOWN_L, { d: "M79 95 C88 86 94 72 96 58", h: [96, 54], brush: true }], spot: [104, 40] },
};
// 這個動作手腳抓在岩點上（背景會建議換成岩壁）
export const climbingPose = (pose: string) => !!POSES[pose]?.legs || pose === "brush";

const INK = "#2a1d1a";
const PANTS: Record<string, string> = {
  climb: `M42 130 L78 130 L78 140 L77 180 L62.5 180 L60 146 L57.5 180 L43 180 L42 140 Z`,
  tights: `M43 130 L77 130 L76 180 L63.5 180 L60 146 L56.5 180 L44 180 Z`,
  jog: `M41 130 L79 130 L79 144 L76 176 L63 176 L60 146 L57 176 L44 176 L41 144 Z`,
  wide: `M41 130 L79 130 L85 181 L62 181 L60 148 L58 181 L35 181 Z`,
  shorts: `M42 130 L78 130 L79.5 156 L62 156 L60 146 L58 156 L40.5 156 Z`,
  crop: `M42 130 L78 130 L78 140 L77.3 168 L62.7 168 L60 146 L57.3 168 L42.7 168 L42 140 Z`,
};

// 頭（耳朵、臉、表情、前面的頭髮、眼鏡、帽子）和後面的頭髮
function headParts(o: Climber) {
  const skin = climberColor("skin", o.skin);
  const hc = climberColor("hairC", o.hairC);
  const hatc = climberColor("hatC", o.hatC);
  const skinD = shade(skin, -0.16);
  const brow = shade(hc, -0.15);
  const H = HAIR[o.hair] ?? HAIR.short;
  const hatted = ["cap", "beanie", "bucket", "helmet"].includes(o.hat);
  let back = "";
  if (H.backCurls) back += `<path d="${H.backFill}" fill="${hc}"/>` + H.backCurls.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${hc}"/>`).join("");
  if (H.back) back += `<path d="${H.back}" fill="${shade(hc, -0.12)}"/>`;
  if (H.bun && !hatted) back += `<circle cx="60" cy="13" r="11" fill="${hc}"/><path d="M52 10 Q60 4 68 10" stroke="#fff" stroke-opacity=".25" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  if (H.tie) back += `<circle cx="${H.tie[0]}" cy="${H.tie[1]}" r="4" fill="#e14b4b"/>`;

  const dot = (x: number) => `<ellipse cx="${x}" cy="56" rx="3" ry="3.7" fill="${INK}"/><circle cx="${x + 1}" cy="54.7" r="1.05" fill="#fff"/>`;
  const shut = (x: number) => `<path d="M${x - 4} 57.5 Q${x} 52.5 ${x + 4} 57.5" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const EYES: Record<string, (x: number) => string> = {
    dot,
    big: (x) => `<ellipse cx="${x}" cy="56" rx="4.2" ry="5.1" fill="${INK}"/><circle cx="${x + 1.4}" cy="54.2" r="1.6" fill="#fff"/><circle cx="${x - 1.3}" cy="58" r=".7" fill="#fff"/>`,
    smile: shut,
    sharp: (x) => `<ellipse cx="${x}" cy="56.5" rx="3" ry="3" fill="${INK}"/><circle cx="${x + 1}" cy="55.5" r=".9" fill="#fff"/>`,
  };
  const eyes = o.eyes === "wink" ? dot(50) + shut(70) : (EYES[o.eyes] ?? dot)(50) + (EYES[o.eyes] ?? dot)(70);
  const brows =
    o.eyes === "sharp"
      ? `<path d="M44.5 46.5 L55 49.5 M75.5 46.5 L65 49.5" stroke="${brow}" stroke-width="2.4" stroke-linecap="round"/>`
      : `<path d="M45.5 47.5 Q50 45.5 54.5 47.5 M65.5 47.5 Q70 45.5 74.5 47.5" stroke="${brow}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  const MOUTH: Record<string, string> = {
    smile: `<path d="M54.5 67 Q60 72 65.5 67" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    grin: `<path d="M53 66 Q60 76 67 66 Z" fill="#8a2b2b"/><path d="M54.3 66.6 Q60 68.2 65.7 66.6 L65.2 68 Q60 69.6 54.8 68 Z" fill="#fff"/>`,
    flat: `<path d="M56 68 H64" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
    o: `<ellipse cx="60" cy="68.5" rx="2.6" ry="3.3" fill="#8a2b2b"/>`,
    tongue: `<path d="M54.5 66.5 Q60 71.5 65.5 66.5" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M58 69.2 Q58 73 60.3 73 Q62.6 73 62.4 69" fill="#ef7f8f"/>`,
  };
  const MUS = `<path d="M52.5 64.8 Q56 61.5 60 63.6 Q64 61.5 67.5 64.8 Q64 66.4 60 65.4 Q56 66.4 52.5 64.8 Z" fill="${hc}"/>`;
  const BEARD: Record<string, string> = {
    none: "",
    stubble: `<path d="M39 60 C41 74 50 80 60 80 C70 80 79 74 81 60 C77 70 70 74 60 74 C50 74 43 70 39 60 Z" fill="${shade(hc, 0.1)}" opacity=".32"/>`,
    mus: MUS,
    full: `<path d="M37 56 C37 74 47 85 60 85 C73 85 83 74 83 56 C81 65 77 70 71 70 Q60 65 49 70 C43 70 39 65 37 56 Z" fill="${hc}"/>${MUS}`,
  };
  const GLASSES: Record<string, string> = {
    none: "",
    round: `<g fill="none" stroke="#2b2b2b" stroke-width="1.8"><circle cx="50" cy="56" r="6.6"/><circle cx="70" cy="56" r="6.6"/><path d="M56.6 55.5 Q60 53.5 63.4 55.5 M43.4 55 L37.5 53 M76.6 55 L82.5 53"/></g>`,
    square: `<g fill="none" stroke="#2b2b2b" stroke-width="1.9"><rect x="42.5" y="50.5" width="15" height="11.5" rx="3"/><rect x="62.5" y="50.5" width="15" height="11.5" rx="3"/><path d="M57.5 55 H62.5 M42.5 54 L37.5 52.5 M77.5 54 L82.5 52.5"/></g>`,
    sun: `<g><rect x="42" y="50.5" width="16" height="11" rx="4" fill="#1f2630"/><rect x="62" y="50.5" width="16" height="11" rx="4" fill="#1f2630"/><path d="M58 54 H62 M42 53.5 L37.5 52 M78 53.5 L82.5 52" stroke="#1f2630" stroke-width="2"/><path d="M45 53.5 L49 53.5 M65 53.5 L69 53.5" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/></g>`,
  };
  const ear = (x: number) =>
    `<ellipse cx="${x}" cy="57" rx="5" ry="6.6" fill="${skin}"/><path d="M${x < 60 ? x + 1.5 : x - 1.5} 54 q${x < 60 ? -3 : 3} 3 0 6" stroke="${skinD}" stroke-width="1.4" fill="none"/>`;
  const head = `<path d="M36 50 C36 33 46 22 60 22 C74 22 84 33 84 50 C84 68 74 80 60 80 C46 80 36 68 36 50 Z" fill="${skin}"/>`;
  const cheeks = `<ellipse cx="45" cy="64" rx="4" ry="2.6" fill="#f08a8a" opacity=".35"/><ellipse cx="75" cy="64" rx="4" ry="2.6" fill="#f08a8a" opacity=".35"/>`;
  const nose = `<path d="M58.6 61.5 Q60 63.6 61.4 61.5" stroke="${skinD}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  let front = "";
  if (H.curls) front += H.curls.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${hc}"/>`).join("");
  if (H.front) front += `<path d="${H.front}" fill="${hc}"${H.op ? ` opacity="${H.op}"` : ""}/>`;
  if (H.braids)
    front += [38, 82]
      .map(
        (x) =>
          [0, 1, 2, 3, 4].map((i) => `<ellipse cx="${x + (x < 60 ? -1 : 1) * i * 0.8}" cy="${66 + i * 9}" rx="5.6" ry="5.4" fill="${i % 2 ? shade(hc, -0.12) : hc}"/>`).join("") +
          `<circle cx="${x + (x < 60 ? -4 : 4)}" cy="111" r="3" fill="#e14b4b"/>`
      )
      .join("");
  if (H.hi && !hatted) front += `<path d="M45 28 Q52 22.5 62 22" stroke="#fff" stroke-opacity=".3" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  if (H.shine) front += `<path d="M47 30 Q53 25 61 25" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const HAT: Record<string, string> = {
    none: "",
    cap: `<path d="M33 44 C32 22 46 13 60 13 C74 13 88 22 87 44 Z" fill="${hatc}"/><path d="M60 13 V44" stroke="${shade(hatc, -0.2)}" stroke-width="1"/><circle cx="60" cy="13" r="2" fill="${shade(hatc, -0.2)}"/><path d="M30 44 Q60 37 92 44 Q93 49 86 50 Q60 44 34 50 Q28 49 30 44 Z" fill="${shade(hatc, -0.22)}"/>`,
    beanie: `<path d="M32 46 C31 20 46 10 60 10 C74 10 89 20 88 46 Z" fill="${hatc}"/><path d="M31 40 Q60 34 89 40 L89 49 Q60 43 31 49 Z" fill="${shade(hatc, -0.18)}"/>${[40, 48, 56, 64, 72, 80]
      .map((x) => `<path d="M${x} ${x === 40 || x === 80 ? 41 : 39} v7" stroke="#000" stroke-opacity=".15" stroke-width="1.2"/>`)
      .join("")}<circle cx="60" cy="9" r="6.5" fill="${shade(hatc, 0.35)}"/>`,
    bucket: `<path d="M36 41 C36 21 46 14 60 14 C74 14 84 21 84 41 Z" fill="${hatc}"/><path d="M27 48 C33 38 87 38 93 48 C81 44 39 44 27 48 Z" fill="${shade(hatc, -0.18)}"/><path d="M36 37 Q60 33 84 37" stroke="${shade(hatc, -0.3)}" stroke-width="2.4" fill="none"/>`,
    helmet: `<path d="M30 46 C30 18 45 9 60 9 C75 9 90 18 90 46 Q60 40 30 46 Z" fill="${hatc}"/><path d="M30 46 Q60 40 90 46 L90 49.5 Q60 43.5 30 49.5 Z" fill="${shade(hatc, -0.3)}"/><rect x="47" y="16" width="5" height="10" rx="2.5" fill="${shade(hatc, -0.3)}"/><rect x="57.5" y="13" width="5" height="11" rx="2.5" fill="${shade(hatc, -0.3)}"/><rect x="68" y="16" width="5" height="10" rx="2.5" fill="${shade(hatc, -0.3)}"/><path d="M36 49 L47 77 M84 49 L73 77" stroke="#333" stroke-width="1.5"/><path d="M40 22 Q46 15 54 14" stroke="#fff" stroke-opacity=".4" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    band: `<path d="M33.5 37 Q60 29 86.5 37 L86.5 44 Q60 36 33.5 44 Z" fill="${hatc}"/><path d="M86 39 L94 35 L92 44 Z" fill="${hatc}"/>`,
  };
  const mouth =
    o.effort === "strain"
      ? `<rect x="53.5" y="65" width="13" height="5.6" rx="2.2" fill="#fff" stroke="${INK}" stroke-width="1.5"/><path d="M57 65 v5.6 M60 65 v5.6 M63 65 v5.6" stroke="${INK}" stroke-width=".9"/>`
      : (MOUTH[o.mouth] ?? MOUTH.smile);
  const effort =
    o.effort === "sweat"
      ? `<path d="M88 36 q-3.6 6 0 8.4 q3.6 -2.4 0 -8.4 Z" fill="#7cc3e8"/><path d="M31 44 q-2.6 4.4 0 6.2 q2.6 -1.8 0 -6.2 Z" fill="#7cc3e8"/>`
      : o.effort === "chalkface"
        ? `<ellipse cx="74" cy="64" rx="4.6" ry="2.2" fill="#fff" opacity=".75" transform="rotate(-20 74 64)"/><ellipse cx="47" cy="40" rx="3.4" ry="1.6" fill="#fff" opacity=".6"/>`
        : "";
  const parts = `${ear(37)}${ear(83)}${head}${cheeks}${brows}${eyes}${nose}${BEARD[o.beard] ?? ""}${mouth}${effort}${front}${GLASSES[o.glasses] ?? ""}${HAT[o.hat] ?? ""}`;
  return { back, parts };
}

// 小頭像：只畫頭（留言、影片旁）
export function climberHeadSvg(o: Climber) {
  const { back, parts } = headParts(o);
  return `<svg viewBox="24 4 72 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FILTER}<g filter="url(#clOl)">${back}${parts}</g></svg>`;
}

// 全身
export function climberSvg(o: Climber) {
  const skin = climberColor("skin", o.skin);
  const skinD = shade(skin, -0.16);
  const shirt = climberColor("topC", o.topC);
  const pc = climberColor("pantsC", o.pantsC);
  const sc = climberColor("shoe", o.shoe);
  const holdC = climberColor("holdC", o.holdC);
  const bagC = climberColor("bag", o.bag);
  const PO = POSES[o.pose] ?? POSES.stand;
  const top = o.top;
  const { back, parts } = headParts(o);

  const hoodBack = top === "hood" ? `<path d="M40 93 C36 76 84 76 80 93 Z" fill="${shade(shirt, -0.18)}"/>` : "";
  const neck = `<path d="M53 72 L67 72 L67 90 Q60 95 53 90 Z" fill="${skin}"/><path d="M53 74 Q60 84 67 74 L67 72 L53 72 Z" fill="${skinD}"/>`;

  // 褲子、鞋子（攀岩動作的腳會彎：畫成粗線，褲管用 dasharray 只蓋前面一段）
  const shoeOne = `<path d="M41 183 C41 177 58 176 59.5 182 C60.5 187 57 190 50 190 C44 190 41 188 41 183 Z" fill="${sc}"/><path d="M41.5 187 C45 190.6 56 190.6 59.4 186" stroke="${shade(sc, -0.45)}" stroke-width="2.2" fill="none"/><path d="M45 181 L55 182.6" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>`;
  let legs = "";
  let shoes = "";
  const cuff = (dy: number) =>
    `<rect x="43" y="${175 + dy}" width="14.5" height="5" rx="1.5" fill="${shade(pc, -0.18)}"/><rect x="62.5" y="${175 + dy}" width="14.5" height="5" rx="1.5" fill="${shade(pc, -0.18)}"/>`;
  if (PO.legs) {
    const pw = o.pants === "tights" ? 12 : o.pants === "wide" ? 17 : 14.5;
    const frac = o.pants === "shorts" ? 40 : o.pants === "crop" ? 76 : 100;
    legs = `<path d="M42 128 L78 128 L79 141 Q60 149 41 141 Z" fill="${pc}"/>`;
    PO.legs.forEach((L, i) => {
      legs += `<path d="${L.d}" stroke="${skin}" stroke-width="11" stroke-linecap="round" fill="none"/><path d="${L.d}" pathLength="100" stroke-dasharray="${frac} 200" stroke="${pc}" stroke-width="${pw}" stroke-linecap="round" fill="none"/>`;
      if (o.hands === "chalk") legs += `<path d="${L.d}" pathLength="100" stroke-dasharray="0 30 6 200" stroke="#fff" stroke-opacity=".4" stroke-width="${pw - 4}" stroke-linecap="round" fill="none"/>`;
      shoes += `<g transform="translate(${L.f[0]} ${L.f[1]}) rotate(${L.a}) ${i ? "scale(-1 1)" : ""} translate(-50 -184)">${shoeOne}</g>`;
    });
  } else {
    const shape = PANTS[{ cargo: "climb", overall: "climb" }[o.pants] ?? o.pants] ?? PANTS.climb;
    if (o.pants === "crop") legs += `<rect x="46" y="160" width="10" height="21" rx="4" fill="${skin}"/><rect x="64" y="160" width="10" height="21" rx="4" fill="${skin}"/>`;
    if (o.pants === "shorts") legs += `<rect x="45" y="150" width="11" height="31" rx="5" fill="${skin}"/><rect x="64" y="150" width="11" height="31" rx="5" fill="${skin}"/>`;
    legs += `<path d="${shape}" fill="${pc}"/><path d="M60 146 L60 136" stroke="${shade(pc, -0.25)}" stroke-width="1.2"/>`;
    if (o.pants === "jog") legs += `<rect x="44" y="172" width="13" height="8" rx="2.5" fill="${shade(pc, -0.2)}"/><rect x="63" y="172" width="13" height="8" rx="2.5" fill="${shade(pc, -0.2)}"/>`;
    if (o.pants === "crop") legs += `<rect x="42" y="164" width="16" height="6" rx="2" fill="${shade(pc, 0.18)}"/><rect x="62" y="164" width="16" height="6" rx="2" fill="${shade(pc, 0.18)}"/>`;
    // 攀岩褲：膝蓋補丁
    if (o.pants === "climb")
      legs += `<path d="M44 150 q6.5 -3 13 0 v9 q-6.5 3 -13 0 Z M63 150 q6.5 -3 13 0 v9 q-6.5 3 -13 0 Z" fill="${shade(pc, -0.2)}"/><path d="M45 151 v7 M56 151 v7 M64 151 v7 M75 151 v7" stroke="#fff" stroke-opacity=".35" stroke-width=".8" stroke-dasharray="1.4 1.4"/>`;
    if (o.pants === "climb" || o.pants === "overall") legs += cuff(0);
    if (o.pants === "cargo")
      legs += `<rect x="40" y="150" width="7" height="13" rx="1.5" fill="${shade(pc, -0.15)}"/><rect x="73" y="150" width="7" height="13" rx="1.5" fill="${shade(pc, -0.15)}"/>${cuff(0)}`;
    if (o.hands === "chalk") legs += `<ellipse cx="47" cy="150" rx="3.5" ry="6" fill="#fff" opacity=".4"/><ellipse cx="73" cy="148" rx="3" ry="5" fill="#fff" opacity=".35"/>`;
    shoes = `<g>${shoeOne}</g><g transform="translate(120 0) scale(-1 1)">${shoeOne}</g>`;
  }

  // 上衣（衣服上不放字：使用者 10/21 決定）
  const base = `M41 91 C47 86 73 86 79 91 L82 134 L38 134 Z`;
  const accent = shade(shirt, light(shirt) ? -0.3 : 0.35);
  let torso: string;
  if (top === "tank")
    torso = `<path d="M48 89 L52 88 Q60 98 68 88 L72 89 Q73 100 79 106 L80 134 L40 134 L41 106 Q47 100 48 89 Z" fill="${shirt}"/><path d="M41 106 Q47 100 48 89 M79 106 Q73 100 72 89" stroke="${shade(shirt, -0.25)}" stroke-width="1.6" fill="none"/>`;
  else if (top === "tech")
    torso = `<path d="${base}" fill="${shirt}"/><path d="M47 88 L42 100 M73 88 L78 100" stroke="${accent}" stroke-width="2.2"/><path d="M38.6 120 L44 120 L43 134 L38 134 Z M81.4 120 L76 120 L77 134 L82 134 Z" fill="${shade(shirt, light(shirt) ? -0.15 : 0.25)}"/><path d="M53 88 Q60 93 67 88" stroke="${shade(shirt, -0.25)}" stroke-width="2" fill="none"/>`;
  else if (top === "tee")
    torso = `<path d="M37 92 C45 85 75 85 83 92 L86 138 L34 138 Z" fill="${shirt}"/><path d="M52 88 Q60 95 68 88" stroke="${shade(shirt, -0.22)}" stroke-width="2" fill="none"/><path d="M40 124 Q60 128 80 124" stroke="${shade(shirt, -0.15)}" stroke-width="1.2" fill="none"/>`;
  else if (top === "sport")
    torso = `<path d="M41 112 L79 112 L81 134 L39 134 Z" fill="${skin}"/><path d="M58.5 124 a1.5 1.5 0 1 0 3 0" stroke="${skinD}" fill="none"/><path d="M44 91 L50 89 Q60 99 70 89 L76 91 L79 113 Q60 117 41 113 Z" fill="${shirt}"/>`;
  else if (top === "hood")
    torso = `<path d="M39 91 C46 86 74 86 81 91 L83 136 L37 136 Z" fill="${shirt}"/><path d="M47 116 L73 116 L75 130 L45 130 Z" fill="${shade(shirt, -0.12)}"/><path d="M55 90 L54 104 M65 90 L66 104" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`;
  else if (top === "flannel") {
    const id = `clPl${shirt.slice(1)}`;
    torso = `<defs><pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${shirt}"/><rect width="9" height="3.5" fill="${shade(shirt, -0.3)}" opacity=".55"/><rect width="3.5" height="9" fill="${shade(shirt, -0.3)}" opacity=".55"/><path d="M0 7 H9 M7 0 V9" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/></pattern></defs><path d="${base}" fill="url(#${id})"/><path d="M52 88 L60 101 L68 88" fill="${shade(shirt, -0.25)}"/><path d="M60 101 V133" stroke="${shade(shirt, -0.4)}" stroke-width="1"/><circle cx="62" cy="110" r="1.1" fill="#fff"/><circle cx="62" cy="121" r="1.1" fill="#fff"/>`;
  } else if (top === "wind")
    torso = `<path d="${base}" fill="${shirt}"/><path d="M41 91 C47 86 73 86 79 91 L80.2 108 L39.8 108 Z" fill="${shade(shirt, light(shirt) ? -0.15 : 0.3)}"/><path d="M60 92 V134" stroke="#e8e6e0" stroke-width="1.6"/><path d="M51 86 L53 93 L60 92 L67 93 L69 86" fill="none" stroke="${shade(shirt, -0.25)}" stroke-width="2.4" stroke-linejoin="round"/>`;
  else torso = `<path d="${base}" fill="${shirt}"/><path d="M52 88 Q60 95 68 88" stroke="${shade(shirt, -0.22)}" stroke-width="2" fill="none"/>`;
  torso += `<path d="M38 134 L41 91 C43 89.5 45 88.6 47 88 L45 134 Z" fill="#000" opacity=".07"/>`;
  // 圖案（運動背心、外套、格子襯衫沒有圖案）
  if (["tee", "tech", "tank", "long", "hood"].includes(top)) {
    const ink = light(shirt) ? "#2a2f33" : "#ffffff";
    const PRINT: Record<string, string> = {
      hold: `<path transform="translate(60 109) scale(.9)" d="M-8 -3 C-7 -9 5 -10 8 -4 C10 2 4 7 -2 7 C-8 7 -10 2 -8 -3 Z" fill="${ink}"/><circle cx="60.6" cy="107.6" r="1.5" fill="${shirt}"/>`,
      hand: `<g fill="#fff" opacity=".85" transform="rotate(-12 64 112)"><ellipse cx="64" cy="115" rx="5.4" ry="6"/><ellipse cx="58.6" cy="111" rx="1.5" ry="3.4" transform="rotate(-30 58.6 111)"/><ellipse cx="61.4" cy="106.5" rx="1.5" ry="3.8"/><ellipse cx="64.6" cy="105.6" rx="1.5" ry="4"/><ellipse cx="67.8" cy="106.4" rx="1.5" ry="3.8"/><ellipse cx="70.4" cy="108.4" rx="1.4" ry="3.2"/></g>`,
      rope: `<path d="M53 104 C53 98 61 98 61 104 C61 110 53 110 53 116 C53 122 61 122 61 116 M61 104 C61 98 69 98 69 104 C69 110 61 110 61 116 C61 122 69 122 69 116" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
      mtn: `<path d="M50 116 L56.5 105 L60 110 L63.5 106 L70 116 Z" fill="${ink}"/><circle cx="66" cy="102" r="2" fill="#F5B700"/>`,
      stripe: `<path d="M39.6 108 H80.4 L80.8 114 H39.2 Z" fill="${ink}" opacity=".85"/>`,
    };
    torso += PRINT[o.print] ?? "";
  }
  if (o.pants === "overall")
    torso += `<path d="M47 108 L73 108 L75 134 L45 134 Z" fill="${pc}"/><path d="M48 108 L45 91 M72 108 L75 91" stroke="${pc}" stroke-width="3.5" stroke-linecap="round"/><circle cx="49.5" cy="110.5" r="1.6" fill="#e8c547"/><circle cx="70.5" cy="110.5" r="1.6" fill="#e8c547"/><rect x="55" y="113" width="10" height="7" rx="1.5" fill="${shade(pc, -0.15)}"/>`;

  // 手＋袖子（袖子用同一條線畫前面一段）、岩點
  const sleeve = ({ tee: 46, tech: 34, long: 93, hood: 95, flannel: 93, wind: 95 } as Record<string, number>)[top] ?? 0;
  const sleeveC = top === "tech" ? accent : top === "flannel" ? shade(shirt, -0.12) : top === "wind" ? shade(shirt, light(shirt) ? -0.15 : 0.3) : shirt;
  const holdAt = (x: number, y: number) =>
    `<path transform="translate(${x} ${y}) scale(1.7)" d="M-8 -3 C-7 -9 5 -10 8 -4 C10 2 4 7 -2 7 C-8 7 -10 2 -8 -3 Z" fill="${holdC}"/><circle cx="${x + 0.8}" cy="${y - 1.7}" r="2" fill="#000" opacity=".35"/>`;
  let holds = "";
  const arm = (A: Arm) => {
    if (A.hold) holds += holdAt(A.h[0], A.h[1] + 4);
    let s = `<path d="${A.d}" stroke="${skin}" stroke-width="9.5" stroke-linecap="round" fill="none"/>`;
    if (sleeve) s += `<path d="${A.d}" pathLength="100" stroke-dasharray="${sleeve} 200" stroke="${sleeveC}" stroke-width="12.5" stroke-linecap="round" fill="none"/>`;
    const [x, y] = A.h;
    if (A.brush)
      s += `<g transform="translate(${x} ${y}) rotate(35)"><rect x="-1.7" y="-17" width="3.4" height="17" rx="1.2" fill="#c98a4a"/><rect x="-3.4" y="-23" width="6.8" height="7" rx="1.5" fill="#333"/><path d="M-2.8 -23 v-3.4 M-.9 -23 v-3.4 M.9 -23 v-3.4 M2.8 -23 v-3.4" stroke="#333" stroke-width="1"/></g>`;
    if (A.open)
      s += `<ellipse cx="${x}" cy="${y}" rx="5.4" ry="6.4" fill="${skin}"/><path d="M${x - 3.5} ${y - 6} v-3 M${x - 1} ${y - 6.5} v-4 M${x + 1.6} ${y - 6.3} v-3.6 M${x + 4} ${y - 5.2} v-2.6" stroke="${skin}" stroke-width="2.2" stroke-linecap="round"/>`;
    else s += `<circle cx="${x}" cy="${y}" r="5.4" fill="${skin}"/>`;
    if (A.thumb) s += `<rect x="${x - 2}" y="${y - 11}" width="4.6" height="8" rx="2.3" fill="${skin}"/>`;
    if (o.hands === "tape") s += `<path d="M${x - 4.2} ${y - 1.6} h8.4 M${x - 4.2} ${y + 1.8} h8.4" stroke="#fff" stroke-width="1.7"/>`;
    if (o.hands === "chalk") s += `<circle cx="${x}" cy="${y}" r="5.6" fill="#fff" opacity=".6"/><circle cx="${x - 1.5}" cy="${y - 1}" r="2" fill="#fff" opacity=".7"/>`;
    return s;
  };
  const arms = arm(PO.arms[0]) + arm(PO.arms[1]);
  PO.legs?.forEach((L) => {
    if (L.hold) holds += holdAt(L.f[0], L.f[1] + 9);
  });
  if (PO.spot) holds += holdAt(...PO.spot);
  if (PO.target) holds += holdAt(...PO.target);

  const bag =
    bagC === "transparent"
      ? ""
      : `<rect x="76" y="124" width="13" height="14" rx="4" fill="${bagC}"/><rect x="75.3" y="121.8" width="14.4" height="4.4" rx="2.2" fill="#f2efe8"/><path d="M78 131 h9" stroke="#000" stroke-opacity=".12" stroke-width="2"/>`;
  let gear = "";
  if (o.gear === "rope")
    gear = `<path d="M44 92 C52 104 66 122 78 134" stroke="#e66b2f" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M44 92 C52 104 66 122 78 134" stroke="#fff" stroke-width="5" stroke-dasharray="1.6 3.2" stroke-opacity=".55" fill="none"/>`;
  if (o.gear === "qd")
    gear =
      `<path d="M45 131 v10" stroke="#888" stroke-width="1.4"/>` +
      [
        [41, 141],
        [47, 143],
      ]
        .map(([x, y]) => `<rect x="${x - 2.3}" y="${y}" width="4.6" height="9" rx="2.3" fill="none" stroke="#c9ccd2" stroke-width="1.6"/><rect x="${x - 1.2}" y="${y - 6}" width="2.4" height="7" rx="1" fill="#e14b4b"/>`)
        .join("");
  // 吊帶（確保一定穿著黑色的）、確保器和繩子
  const hcol = ({ black: "#26272c", red: "#d23c3c", blue: "#2f6fc0", orange: "#ef7a2a" } as Record<string, string>)[o.harness] ?? (PO.belay ? "#26272c" : "");
  let harness = "";
  if (hcol) {
    harness = `<rect x="40" y="126" width="40" height="7.5" rx="2.6" fill="${hcol}"/><rect x="56" y="126.6" width="8" height="6.3" rx="1.3" fill="#c9ccd2"/><path d="M57 133.5 Q60 141 63 133.5" stroke="${hcol}" stroke-width="2.6" fill="none"/>`;
    if (!PO.legs) harness += `<path d="M43 142 Q50 146.5 58 142 M62 142 Q70 146.5 77 142" stroke="${hcol}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
  }
  const rope = PO.belay
    ? `<path d="M60 139 C59 120 56 100 55 70 C54 40 53 10 53 -40" stroke="#ef7a2a" stroke-width="2.8" fill="none"/><path d="M60 139 Q68 142 71 148 C73 162 74 182 77 205" stroke="#ef7a2a" stroke-width="2.8" fill="none"/><rect x="56" y="134" width="8" height="10" rx="2.2" fill="#6b6f78"/>`
    : "";
  let backItem = "";
  let straps = "";
  if (o.back === "pad") {
    backItem = `<rect x="27" y="80" width="66" height="58" rx="7" fill="#33475b"/><rect x="27" y="100" width="66" height="9" fill="#F5B700"/><path d="M27 92 H93" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>`;
    straps = `<path d="M47 89 L47 127 M73 89 L73 127" stroke="#1d242c" stroke-width="3.2" stroke-linecap="round"/>`;
  }
  if (o.back === "ropebag") {
    backItem = `<rect x="76" y="92" width="22" height="34" rx="7" fill="#ef7a2a"/><path d="M76 100 H98" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><path d="M80 92 Q87 84 94 92" stroke="#ef7a2a" stroke-width="3" fill="none"/>`;
    straps = `<path d="M45 91 L79 113" stroke="#1d242c" stroke-width="3" stroke-linecap="round"/>`;
  }
  const body = `${backItem}${hoodBack}${neck}${legs}${shoes}${torso}${straps}${harness}${gear}${rope}${arms}${bag}`;
  const lift = PO.lift ? ` transform="translate(0 ${PO.lift})"` : "";
  const motion = PO.lift ? `<path d="M30 182 h-12 M92 184 h12 M60 190 v10 M42 192 l-5 7 M78 192 l5 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>` : "";
  return `<svg viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="overflow:visible">${FILTER}${motion}<g${lift}><g filter="url(#clOl)">${holds}</g><g filter="url(#clOl)">${back}${body}${parts}</g></g></svg>`;
}

// ---------- 背景（人物卡上半段）----------
// plain（館色）用上衣顏色
export function climberBgSvg(o: Climber) {
  const BG: Record<string, () => string> = {
    longdong: () =>
      `<rect width="400" height="250" fill="#8fd0ee"/><circle cx="330" cy="52" r="24" fill="#ffe7a3"/><path d="M0 150 H400 V250 H0Z" fill="#2f7fb3"/><path d="M0 160 Q50 152 100 160 T200 160 T300 160 T400 160" stroke="#bfe7fa" stroke-width="4" fill="none" opacity=".8"/><path d="M0 250 L0 70 L40 40 L70 60 L95 30 L130 70 L150 150 L120 250Z" fill="#6f6a5e"/><path d="M400 250 L400 90 L360 70 L330 110 L300 150 L290 250Z" fill="#8a8373"/><path d="M90 250 Q200 215 310 250Z" fill="#d9c79f"/>`,
    wall: () => {
      const nuts = Array.from({ length: 60 }, (_, i) => `<circle cx="${(i % 10) * 40 + 20}" cy="${Math.floor(i / 10) * 40 + 12}" r="1.6" fill="#7a6a55" opacity=".5"/>`).join("");
      const far: [number, number, string][] = [
        [30, 30, "#e85d5d"],
        [350, 40, "#3aa3d9"],
        [70, 190, "#c06ad9"],
        [330, 200, "#F5B700"],
        [200, 12, "#5cc46a"],
        [380, 150, "#e85d5d"],
        [18, 120, "#F5B700"],
      ];
      return `<defs><linearGradient id="clWg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".5" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="400" height="250" fill="#d8c8ae"/><rect width="400" height="250" fill="url(#clWg)"/>${[80, 160, 240, 320]
        .map((x) => `<path d="M${x} 0 V250" stroke="#b9a88c" stroke-width="2"/>`)
        .join("")}<path d="M0 125 H400" stroke="#b9a88c" stroke-width="2"/>${nuts}${far.map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="8" fill="${c}" opacity=".85"/>`).join("")}`;
    },
    gym: () => {
      const holds: [number, number, string][] = [
        [40, 40, "#e85d5d"],
        [90, 80, "#F5B700"],
        [140, 30, "#3aa3d9"],
        [190, 70, "#5cc46a"],
        [250, 40, "#e85d5d"],
        [300, 90, "#c06ad9"],
        [350, 50, "#F5B700"],
        [60, 130, "#3aa3d9"],
        [120, 150, "#c06ad9"],
        [330, 140, "#5cc46a"],
        [280, 160, "#e85d5d"],
        [20, 170, "#F5B700"],
        [370, 170, "#3aa3d9"],
        [210, 130, "#F5B700"],
      ];
      return `<rect width="400" height="250" fill="#d9d2c6"/><path d="M0 0 L130 0 L110 205 L0 205Z" fill="#cfc7b9"/><path d="M260 0 L400 0 L400 205 L280 205Z" fill="#e2dccf"/>${holds
        .map(([x, y, c], i) => `<ellipse cx="${x}" cy="${y}" rx="${7 + (i % 3) * 2}" ry="${5 + (i % 2) * 2}" fill="${c}"/>`)
        .join("")}<rect y="205" width="400" height="45" fill="#2f5d8a"/><path d="M0 205 H400" stroke="#24486c" stroke-width="4"/>`;
    },
    plain: () => {
      const c = climberColor("topC", o.topC);
      const id = `clPg${c.slice(1)}`;
      return `<defs><radialGradient id="${id}" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${shade(c, 0.35)}"/><stop offset="1" stop-color="${c}"/></radialGradient></defs><rect width="400" height="250" fill="url(#${id})"/>${Array.from(
        { length: 40 },
        (_, i) => `<circle cx="${(i % 10) * 44 + 12}" cy="${Math.floor(i / 10) * 60 + 20 + (i % 2) * 20}" r="3" fill="#fff" opacity=".15"/>`
      ).join("")}<ellipse cx="200" cy="238" rx="150" ry="14" fill="#000" opacity=".15"/>`;
    },
    night: () =>
      `<rect width="400" height="250" fill="#1d2747"/>${Array.from({ length: 28 }, (_, i) => `<circle cx="${(i * 73) % 400}" cy="${(i * 37) % 140}" r="${i % 4 ? 1.2 : 2}" fill="#fff" opacity=".8"/>`).join("")}<circle cx="320" cy="50" r="20" fill="#f5efc8"/><circle cx="328" cy="44" r="18" fill="#1d2747"/><path d="M0 250 L0 160 L70 110 L130 150 L200 100 L270 150 L330 120 L400 160 L400 250Z" fill="#141b33"/><rect y="215" width="400" height="35" fill="#0f1528"/>`,
    wanhua: () =>
      `<rect width="400" height="250" fill="#a9d8ef"/><rect x="20" y="20" width="360" height="200" fill="#ece6dc"/><rect x="20" y="20" width="360" height="12" fill="#d8d0c2"/><rect x="40" y="44" width="320" height="38" rx="6" fill="#6959B2"/><text x="200" y="71" text-anchor="middle" font-family="Noto Sans TC,sans-serif" font-weight="900" font-size="22" fill="#fff">原岩攀岩館 萬華</text><rect x="40" y="96" width="120" height="110" rx="4" fill="#9fc3d6"/><rect x="240" y="96" width="120" height="110" rx="4" fill="#9fc3d6"/><rect x="170" y="100" width="60" height="106" fill="#5b4a3c"/><circle cx="220" cy="156" r="3" fill="#F5B700"/><rect y="206" width="400" height="44" fill="#9b9b94"/>`,
  };
  return `<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${(BG[o.bg] ?? BG.longdong)()}</svg>`;
}
