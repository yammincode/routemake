// 路線相關的固定選項（來源：原型）

export type HoldColor = "紅" | "橙" | "黃" | "綠" | "藍" | "紫" | "粉" | "黑" | "白" | "灰" | "蒂芬妮";
export type Status = "flash" | "send" | "project";

// 岩點顏色：順序即選色盤順序
export const HOLD_COLORS: Record<HoldColor, string> = {
  紅: "#D7263D",
  橙: "#F28A1E",
  黃: "#F4D03F",
  綠: "#2E9E5B",
  藍: "#2F6FD6",
  紫: "#7B3FB5",
  粉: "#F07BB5",
  黑: "#1A1A1A",
  白: "#FAFAFA",
  灰: "#8E9196",
  蒂芬妮: "#81D8D0",
};
export const HOLD_COLOR_NAMES = Object.keys(HOLD_COLORS) as HoldColor[];

// 淺色岩點上的文字要用深色
const LIGHT_HOLDS: HoldColor[] = ["黃", "白", "粉", "蒂芬妮"];
export const holdTextColor = (c: HoldColor) => (LIGHT_HOLDS.includes(c) ? "#17201C" : "#fff");

export const GRADES = Array.from({ length: 12 }, (_, i) => i - 1); // VB（-1）、V0–V10

// 難度膠帶顏色（所有館共用，照館內的難度色卡）；null＝還沒定顏色，畫面用一般樣式
export const GRADE_COLORS: Record<number, string | null> = {
  [-1]: "#F2F1EC", // VB 白
  0: "#D8E62B", // 螢光黃
  1: "#3CC94A", // 綠
  2: "#F0368C", // 桃紅
  3: "#2E86C8", // 藍
  4: "#E59AB4", // 粉
  5: "#D9402F", // 紅
  6: "#2F6B4F", // 深綠
  7: "#1F4E9A", // 深藍
  8: "#2B2F31", // 黑
  9: null,
  10: null,
};
// 淺色膠帶上的字用深色
const LIGHT_GRADES = [-1, 0, 1, 4];
export const gradeColor = (g: number): { bg: string; fg: string } | null => {
  const bg = isYds(g) ? null : (GRADE_COLORS[g] ?? null);
  return bg ? { bg, fg: LIGHT_GRADES.includes(g) ? "#17201C" : "#fff" } : null;
};

export const STYLE_TAGS = ["力量", "指力", "技巧", "平衡", "腳法", "動態", "協調", "柔軟", "耐力"] as const;

export const STATUS_LABEL: Record<Status, string> = { flash: "Flash", send: "完攀", project: "嘗試中" };

export const FEEL = [
  { v: 1, e: "😌", t: "輕鬆" },
  { v: 2, e: "🙂", t: "剛好" },
  { v: 3, e: "😤", t: "吃力" },
] as const;

export const GRADE_FEEL = [
  { v: -1, e: "⬇", t: "偏軟" },
  { v: 0, e: "＝", t: "剛好" },
  { v: 1, e: "⬆", t: "偏硬" },
] as const;

// 人物卡：六角形能力（順序＝圖上從上方順時針）與攀岩年資選項
export const ABILITY_AXES = ["力量", "指力", "動態", "耐力", "技巧", "柔軟"] as const;
export const CLIMBING_YEARS = [
  { v: "lt1", t: "未滿 1 年" },
  { v: "1-3", t: "1–3 年" },
  { v: "3-5", t: "3–5 年" },
  { v: "5+", t: "5 年以上" },
] as const;

// 等級制：抱石 VB、V0–V10（grade -1、0–10）；上攀 YDS 5.6–5.13d（grade 100–119，跟資料庫一樣）
export type GradeSystem = "v" | "yds";
export const YDS_GRADES = [
  "5.6", "5.7", "5.8", "5.9",
  "5.10a", "5.10b", "5.10c", "5.10d",
  "5.11a", "5.11b", "5.11c", "5.11d",
  "5.12a", "5.12b", "5.12c", "5.12d",
  "5.13a", "5.13b", "5.13c", "5.13d",
] as const;
export const isYds = (g: number) => g >= 100;
export const gradeLabel = (g: number) => (isYds(g) ? (YDS_GRADES[g - 100] ?? "?") : g < 0 ? "VB" : `V${g}`);
// 起步點圓圈裡放的短標籤：V 級只寫數字，YDS 去掉「5.」
export const gradeShort = (g: number) => (isYds(g) ? (YDS_GRADES[g - 100] ?? "?").slice(2) : g < 0 ? "B" : String(g));
export const gradesFor = (s: GradeSystem): number[] => (s === "yds" ? YDS_GRADES.map((_, i) => 100 + i) : [...GRADES]);
