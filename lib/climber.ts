// 攀岩角色（人物卡上的真人角色，夥伴站在旁邊）：選項、顏色、開放條件
// 選項的值和開放條件放在 climber-values.json、climber-rules.json，資料庫（step48）用一樣的內容檢查
// （tests/e2e/climber 會比對 migration 裡的值，兩邊要一起改）
import RULES_JSON from "./climber-rules.json";
import VALUES from "./climber-values.json";
import { GYM_COLORS } from "./gyms";

export type ClimberKey = keyof typeof VALUES;
export type Climber = Record<ClimberKey, string>;
export const CLIMBER_KEYS = Object.keys(VALUES) as ClimberKey[];

// 分頁（手機 360px 排得下 7 個，所以「褲鞋」寫兩個字）
export const CLIMBER_TABS = ["攀岩", "臉", "頭髮", "衣服", "褲鞋", "配件", "背景"] as const;
export type ClimberTab = (typeof CLIMBER_TABS)[number];

// 衣服、帽子的顏色：各店標準色在前面
const CLOTH: Record<string, [string, string]> = {
  mingde: ["明德", GYM_COLORS.mingde],
  wanhua: ["萬華", GYM_COLORS.g2],
  zhonghe: ["中和", GYM_COLORS.g3],
  nangang: ["南港", GYM_COLORS.g4],
  xindian: ["新店", GYM_COLORS.g5],
  zhongli: ["中壢", GYM_COLORS.g6],
  black: ["黑", "#25282d"],
  white: ["白", "#f3f2ee"],
  grey: ["灰", "#9aa0a6"],
  khaki: ["卡其", "#c8b48a"],
  orange: ["橘", "#ef8a3c"],
  pink: ["粉", "#f3a7bd"],
  sky: ["天藍", "#7cc3e8"],
  gold: ["金", "#d9a400"],
};

type Group = { tab: ClimberTab; label: string; items: Record<string, string>; colors?: Record<string, string> };
const named = (m: Record<string, [string, string]>) => ({
  items: Object.fromEntries(Object.entries(m).map(([k, [n]]) => [k, n])),
  colors: Object.fromEntries(Object.entries(m).map(([k, [, c]]) => [k, c])),
});

// 每一組：分頁、標題、選項名字；有 colors 的畫成色票
export const CLIMBER_GROUPS: Record<ClimberKey, Group> = {
  pose: {
    tab: "攀岩",
    label: "動作",
    items: { hang: "掛點", reach: "伸手抓點", heel: "腳跟勾", dyno: "Dyno 跳", belay: "確保", brush: "刷點", chalk: "沾粉", stand: "站好", thumb: "比讚", hips: "叉腰", wave: "揮手" },
  },
  holdC: {
    tab: "攀岩",
    label: "岩點顏色",
    ...named({
      yellow: ["黃", "#F5B700"],
      green: ["綠", "#3fae5a"],
      blue: ["藍", "#2f8fd0"],
      red: ["紅", "#e14b4b"],
      purple: ["紫", "#8a5bd0"],
      pink: ["粉", "#f08ab4"],
      black: ["黑", "#2b2b2f"],
      white: ["白", "#f4f2ec"],
    }),
  },
  harness: { tab: "攀岩", label: "吊帶", items: { none: "不穿", black: "黑", red: "紅", blue: "藍", orange: "橘" } },
  gear: { tab: "攀岩", label: "吊帶上掛", items: { none: "沒有", qd: "快扣", rope: "繩子斜背" } },
  hands: { tab: "攀岩", label: "手", items: { none: "一般", tape: "手指膠帶", chalk: "滿手粉" } },
  back: { tab: "攀岩", label: "背著", items: { none: "沒有", pad: "抱石墊", ropebag: "繩袋" } },
  bag: {
    tab: "攀岩",
    label: "粉袋",
    ...named({ yellow: ["黃", "#F5B700"], red: ["紅", "#e14b4b"], blue: ["藍", "#2f8fd0"], black: ["黑", "#25262b"], glass: ["琉璃", "#5fc9e6"], none: ["不帶", "transparent"] }),
  },
  effort: { tab: "攀岩", label: "表情", items: { none: "輕鬆", strain: "咬牙用力", sweat: "流汗", chalkface: "臉沾粉" } },
  skin: {
    tab: "臉",
    label: "膚色",
    ...named({ a: ["1", "#fbe0cc"], b: ["2", "#f4cfb0"], c: ["3", "#e9b993"], d: ["4", "#d29a72"], e: ["5", "#a8704c"], f: ["6", "#7a4c33"] }),
  },
  eyes: { tab: "臉", label: "眼睛", items: { dot: "圓眼", big: "大眼", smile: "瞇眼笑", wink: "眨眼", sharp: "認真" } },
  mouth: { tab: "臉", label: "嘴巴", items: { smile: "微笑", grin: "大笑", flat: "酷", o: "驚訝", tongue: "吐舌" } },
  beard: { tab: "臉", label: "鬍子", items: { none: "沒有", stubble: "鬍渣", mus: "八字鬍", full: "落腮鬍" } },
  glasses: { tab: "臉", label: "眼鏡", items: { none: "不戴", round: "圓框", square: "方框", sun: "墨鏡" } },
  hair: {
    tab: "頭髮",
    label: "髮型",
    items: {
      short: "短髮",
      crop: "瀏海短髮",
      buzz: "平頭",
      pomp: "油頭",
      spiky: "刺蝟頭",
      middle: "中分",
      bob: "鮑伯頭",
      long: "長直髮",
      pony: "馬尾",
      braids: "雙辮子",
      bun: "丸子頭",
      curly: "短捲髮",
      afro: "爆炸頭",
      bald: "光頭",
    },
  },
  hairC: {
    tab: "頭髮",
    label: "髮色",
    ...named({
      black: ["黑", "#231c1a"],
      darkbrown: ["深棕", "#4a2f22"],
      brown: ["棕", "#7a4a2c"],
      blonde: ["金", "#d8b05a"],
      grey: ["灰白", "#c4c1ba"],
      auburn: ["紅棕", "#9a3b25"],
      pink: ["粉", "#e48aa8"],
      blue: ["藍", "#3d5fa8"],
    }),
  },
  top: {
    tab: "衣服",
    label: "上衣",
    items: { tank: "攀岩背心", tech: "機能 T", tee: "寬鬆 T", sport: "運動背心", long: "薄長袖", hood: "帽 T", wind: "防風外套", flannel: "格子襯衫" },
  },
  print: { tab: "衣服", label: "圖案", items: { hold: "岩點", mtn: "山", hand: "粉手印", rope: "繩結", stripe: "橫條", none: "素面" } },
  topC: { tab: "衣服", label: "上衣顏色", ...named(CLOTH) },
  pants: {
    tab: "褲鞋",
    label: "褲子",
    items: { climb: "攀岩褲", crop: "七分捲褲管", shorts: "短褲", tights: "緊身褲", jog: "束口褲", wide: "寬褲", cargo: "工作褲", overall: "吊帶褲" },
  },
  pantsC: {
    tab: "褲鞋",
    label: "褲子顏色",
    ...named({
      charcoal: ["深灰", "#3b3f4a"],
      black: ["黑", "#1f2024"],
      khaki: ["卡其", "#b9a27a"],
      olive: ["軍綠", "#5d6b45"],
      denim: ["丹寧", "#3d5a85"],
      brick: ["磚紅", "#a2493a"],
      cream: ["米白", "#e7e0d0"],
    }),
  },
  shoe: {
    tab: "褲鞋",
    label: "攀岩鞋",
    ...named({ red: ["紅", "#e14b4b"], yellow: ["黃", "#F5B700"], blue: ["藍", "#2f8fd0"], green: ["綠", "#4fb35f"], purple: ["紫", "#7d5bc6"], black: ["黑", "#25262b"] }),
  },
  hat: { tab: "配件", label: "帽子", items: { none: "不戴", cap: "鴨舌帽", beanie: "毛帽", bucket: "漁夫帽", helmet: "頭盔", band: "頭巾" } },
  hatC: { tab: "配件", label: "帽子顏色", ...named(CLOTH) },
  bg: { tab: "背景", label: "背景", items: { longdong: "龍洞", wall: "岩壁", gym: "岩館", plain: "館色", night: "星空", wanhua: "萬華門口" } },
};

// 顏色（畫圖用）；沒有這個值就用第一個
export const climberColor = (key: ClimberKey, v: string) => {
  const c = CLIMBER_GROUPS[key].colors!;
  return c[v] ?? Object.values(c)[0];
};

// 沒做過角色的人第一次打開：龍洞（使用者選的預設背景）、掛點、手指膠帶，都是一開始就有的
export const DEFAULT_CLIMBER: Climber = {
  pose: "hang",
  holdC: "yellow",
  harness: "none",
  gear: "none",
  hands: "tape",
  back: "none",
  bag: "yellow",
  effort: "none",
  skin: "b",
  eyes: "dot",
  mouth: "smile",
  beard: "none",
  glasses: "none",
  hair: "short",
  hairC: "black",
  top: "tech",
  print: "mtn",
  topC: "mingde",
  pants: "climb",
  pantsC: "charcoal",
  shoe: "red",
  hat: "none",
  hatC: "black",
  bg: "longdong",
};

// 資料庫讀來的值：不是物件＝沒做角色（null）；少的、不認得的用預設（之後加新款式，舊 App 也不會壞）
export function normalizeClimber(v: unknown): Climber | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(
    CLIMBER_KEYS.map((k) => [k, typeof o[k] === "string" && (VALUES[k] as string[]).includes(o[k] as string) ? (o[k] as string) : DEFAULT_CLIMBER[k]])
  ) as Climber;
}

// ---------- 開放條件 ----------
// 攀爬日＝有記錄（完攀、Flash、嘗試中）的日子；上攀＝5.x 的完攀；Flash；V5 以上完攀（岩友路線不算）
export type ClimbStats = { days: number; rope: number; flash: number; v5: number };
type CountRule = { t: keyof ClimbStats; n: number };
export type ClimberRule = CountRule | { sp: string };
export const CLIMBER_RULES = RULES_JSON as Record<string, ClimberRule>;
const KIND: Record<keyof ClimbStats, [string, string]> = { days: ["攀爬", "天"], rope: ["上攀完攀", "條"], flash: ["Flash", "條"], v5: ["V5 以上完攀", "條"] };

// 這一款鎖住了嗎（鎖住回傳條件）；stats＝null（還在讀、讀不到）有條件的都當鎖住
export function climberLock(key: ClimberKey, v: string, stats: ClimbStats | null): ClimberRule | null {
  const r = CLIMBER_RULES[`${key}:${v}`];
  if (!r) return null;
  if ("sp" in r) return r;
  return !stats || stats[r.t] < r.n ? r : null;
}
// 怎麼解鎖：「攀爬 5 天」「上攀完攀 10 條」；特殊獎品寫怎麼拿
export const lockCond = (r: ClimberRule) => ("sp" in r ? r.sp : `${KIND[r.t][0]} ${r.n} ${KIND[r.t][1]}`);
// 還差多少：「再爬 2 天」「上攀再 7 條」「Flash 再 3 條」
export function lockLeft(r: ClimberRule, stats: ClimbStats | null) {
  if ("sp" in r) return "特殊獎品";
  if (!stats) return lockCond(r);
  const n = r.n - stats[r.t];
  return r.t === "days" ? `再爬 ${n} 天` : `${{ rope: "上攀", flash: "Flash ", v5: "V5 以上" }[r.t]}再 ${n} 條`;
}
// 進度（0–1；特殊獎品是 0）
export const lockProgress = (r: ClimberRule, stats: ClimbStats | null) => ("sp" in r || !stats ? 0 : Math.min(1, stats[r.t] / r.n));

// 這一款叫什麼（解鎖提示、解鎖卡標題用）：色票寫「粉袋：琉璃」、吊帶寫「紅色吊帶」
export function climberItemName(key: ClimberKey, v: string) {
  const g = CLIMBER_GROUPS[key];
  const n = g.items[v] ?? v;
  if (key === "harness") return `${n}色吊帶`;
  if (key === "bg") return `${n}背景`;
  return g.colors ? `${g.label}：${n}` : n;
}

// 這次記錄新解鎖了哪些（prev → next 跨過門檻的；同一個條件的放一起）
export function newlyUnlocked(prev: ClimbStats, next: ClimbStats): string[] {
  const out: string[] = [];
  for (const [k, r] of Object.entries(CLIMBER_RULES)) {
    if ("sp" in r) continue;
    if (prev[r.t] < r.n && next[r.t] >= r.n) {
      const [key, v] = k.split(":") as [ClimberKey, string];
      out.push(climberItemName(key, v));
    }
  }
  return out;
}

// 隨機換一套：只從已經解鎖的挑；帽子、鬍子、眼鏡多半不戴（全部亂選會很花）
export function randomClimber(stats: ClimbStats | null, rand = Math.random): Climber {
  const pick = (k: ClimberKey) => {
    const vs = (VALUES[k] as string[]).filter((v) => !climberLock(k, v, stats));
    return vs[Math.floor(rand() * vs.length)] ?? DEFAULT_CLIMBER[k];
  };
  const c = Object.fromEntries(CLIMBER_KEYS.map((k) => [k, pick(k)])) as Climber;
  if (rand() < 0.6) c.hat = "none";
  if (rand() < 0.7) c.beard = "none";
  if (rand() < 0.6) c.glasses = "none";
  return c;
}

// 已解鎖幾個／全部幾個（人物卡下面「已解鎖 18 / 31」）：只算有條件的款式
export function unlockCount(stats: ClimbStats | null) {
  const all = Object.keys(CLIMBER_RULES);
  const open = all.filter((k) => {
    const [key, v] = k.split(":") as [ClimberKey, string];
    return !climberLock(key, v, stats);
  });
  return { open: open.length, all: all.length };
}
