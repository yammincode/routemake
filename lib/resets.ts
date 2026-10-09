// 換線公告：日期範圍、換線前／中／後的說法（日期一律台北時間，YYYY-MM-DD 字串）
// 新路線在定線當天（結束日）晚上開放
import { todayYmd } from "@/lib/date";

export type ResetEvent = {
  id: string;
  gym_id: string;
  label: string; // 公告上的名稱，例如「A 區」
  zone_ids: string[];
  starts_on: string; // 拆線
  ends_on: string; // 定線（當天晚上起新路線）
  spray: boolean; // 只有 Spray Wall
};

const DAY = 86400000;
const num = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY;
// 兩個日期差幾天（b - a）
export const dayDiff = (a: string, b: string) => Math.round(num(b) - num(a));
export const addDays = (s: string, n: number) => new Date((num(s) + n) * DAY).toISOString().slice(0, 10);
const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
export const weekday = (s: string) => WEEK[new Date(num(s) * DAY).getUTCDay()];

// 10/12、10/12–13、10/31–11/1
export function resetRange(e: Pick<ResetEvent, "starts_on" | "ends_on">) {
  if (e.starts_on === e.ends_on) return md(e.starts_on);
  return e.starts_on.slice(5, 7) === e.ends_on.slice(5, 7) ? `${md(e.starts_on)}–${+e.ends_on.slice(8, 10)}` : `${md(e.starts_on)}–${md(e.ends_on)}`;
}
// （一、二）
export const resetWeekdays = (e: Pick<ResetEvent, "starts_on" | "ends_on">) =>
  e.starts_on === e.ends_on ? `（${weekday(e.starts_on)}）` : `（${weekday(e.starts_on)}${e.ends_on > addDays(e.starts_on, 1) ? "–" : "、"}${weekday(e.ends_on)}）`;
// 10/13 晚上起新路線
export const newRoutesText = (e: Pick<ResetEvent, "ends_on">) => `${md(e.ends_on)} 晚上起新路線`;

// 換線前（upcoming）、換線中（ongoing）、換好 7 天內（fresh）、更早（done）；days：離開始還有幾天（換線前）或換好幾天（換好後）
export type ResetPhase = { phase: "upcoming" | "ongoing" | "fresh" | "done"; days: number };
export function resetPhase(e: Pick<ResetEvent, "starts_on" | "ends_on">, today = todayYmd()): ResetPhase {
  if (today < e.starts_on) return { phase: "upcoming", days: dayDiff(today, e.starts_on) };
  if (today <= e.ends_on) return { phase: "ongoing", days: 0 };
  const after = dayDiff(e.ends_on, today);
  return { phase: after <= 7 ? "fresh" : "done", days: after };
}

// 區域名稱去掉尾巴的編號，合成公告上的名稱：A1 區 → A 區、比賽牆 2 → 比賽牆、抱石 A2 區 → 抱石 A 區
export const groupName = (name: string) => name.replace(/(\D)\d+(\s*區)?$/, "$1$2").replace(/\s+區$/, " 區").trim();
// 選了哪些區域 → 建議的公告名稱：同一組就用組名，不同組用「、」接起來
export function suggestLabel(names: string[]) {
  const groups = [...new Set(names.map(groupName))];
  return groups.join("、").slice(0, 20);
}

// 文字顏色：淺色底用深字、深色底用白字（行事曆色塊）
export function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? "#17201C" : "#fff";
}
