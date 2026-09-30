// 路線相關的固定選項（來源：原型）

export type HoldColor = "紅" | "橙" | "黃" | "綠" | "藍" | "紫" | "粉" | "黑" | "白";
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
};
export const HOLD_COLOR_NAMES = Object.keys(HOLD_COLORS) as HoldColor[];

// 淺色岩點上的文字要用深色
const LIGHT_HOLDS: HoldColor[] = ["黃", "白", "粉"];
export const holdTextColor = (c: HoldColor) => (LIGHT_HOLDS.includes(c) ? "#17201C" : "#fff");

export const GRADES = Array.from({ length: 11 }, (_, i) => i); // V0–V10

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
