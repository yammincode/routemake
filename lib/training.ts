// 訓練日誌（step51）：我的紀錄四個分頁、每天的紀錄、專案、難度金字塔的計算（不碰畫面、不讀資料庫）
import type { ClimbDayRow, HomeTab, Milestone, MySend, TrainingDay } from "@/lib/data";
import { daysAgoYmd, todayYmd } from "@/lib/date";
import { GYMS } from "@/lib/gyms";

// 四個分頁：名稱、膠帶色的難度（這週 V2 桃紅、日誌 V3 藍、這個月 V1 綠、全部 V5 紅）
export const ME_TABS: readonly { key: HomeTab; label: string; tape: number }[] = [
  { key: "week", label: "這週", tape: 2 },
  { key: "log", label: "日誌", tape: 3 },
  { key: "month", label: "這個月", tape: 1 },
  { key: "all", label: "全部", tape: 5 },
];
export const tabLabel = (t: HomeTab) => ME_TABS.find((x) => x.key === t)?.label ?? "";

// 換線前幾天開始提醒（使用者 10/23 決定 3 天）
export const PROJECT_WARN_DAYS = 3;

// 這週一（台北時間，YYYY-MM-DD）
export function weekStart(today = todayYmd()): string {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 週一 0 … 週日 6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
// 今天是週幾（1＝週一…7＝週日）
export const isoDow = (today = todayYmd()) => ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

// 每天的紀錄分成一天一天（日期由新到舊），同一天的照館的順序排
export type LogDay = { day: string; climbs: ClimbDayRow[]; diary: TrainingDay | null; milestones: Milestone[] };
const gymOrder = (id: string) => GYMS.findIndex((g) => g.id === id) >>> 0;
export function groupDays(climbs: ClimbDayRow[], diaries: Record<string, TrainingDay>, milestones: Milestone[] = []): LogDay[] {
  const days = new Map<string, ClimbDayRow[]>();
  for (const c of climbs) (days.get(c.day) ?? days.set(c.day, []).get(c.day)!).push(c);
  // 只寫了日誌、沒記路線的那天也要出現
  for (const d of Object.keys(diaries)) if (!days.has(d)) days.set(d, []);
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, cs]) => ({
      day,
      climbs: [...cs].sort((x, y) => gymOrder(x.route.gym_id) - gymOrder(y.route.gym_id) || statusRank(x.status) - statusRank(y.status) || y.route.grade - x.route.grade),
      diary: diaries[day] ?? null,
      milestones: milestones.filter((m) => m.day === day),
    }));
}
const statusRank = (s: string) => (s === "flash" ? 0 : s === "send" ? 1 : 2);
// 那天去了哪幾館（照館的順序）
export const dayGyms = (d: LogDay) => [...new Set(d.climbs.map((c) => c.route.gym_id))].sort((x, y) => gymOrder(x) - gymOrder(y));

// 同一條路線試了好幾天：每一天的次數（日期由舊到新），給日誌寫「10/18 試 6 次 → 10/20 試 4 次 → 今天 2 次」
export function routeHistory(climbs: ClimbDayRow[], routeId: string, upTo: string): { day: string; tries: number | null; status: string }[] {
  return climbs
    .filter((c) => c.route.id === routeId && c.day <= upTo)
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((c) => ({ day: c.day, tries: c.tries, status: c.status }));
}

// 難度金字塔（全部完攀過的岩館抱石路線）：最難的那個難度在最上面，往下每一層的目標是上一層的兩倍
// 下一步：從最下面往上，第一個還沒達到目標的那層（先把底打穩）；都達到了就是再往上一個難度
export type PyramidLevel = { grade: number; done: number; goal: number };
export function pyramid(sends: Pick<MySend, "grade">[], levels = 5): { rows: PyramidLevel[]; next: number | null } | null {
  const v = sends.filter((s) => s.grade < 100);
  if (!v.length) return null;
  const top = Math.max(...v.map((s) => s.grade));
  const low = Math.min(...v.map((s) => s.grade)); // 比爬過最簡單的還簡單的不列（從 V3 開始爬的人不用看 V0 0/16）
  const rows: PyramidLevel[] = [];
  for (let i = 0; i < levels && top - i >= Math.max(-1, low); i++) {
    const g = top - i;
    rows.push({ grade: g, done: v.filter((s) => s.grade === g).length, goal: 2 ** i });
  }
  // 由下往上找第一個沒達到的；都達到了，下一步是再難一級
  const short = [...rows].reverse().find((r) => r.done < r.goal);
  return { rows, next: short ? short.grade : top < 10 ? top + 1 : null };
}

// 日誌分頁一次讀幾天的紀錄（一次最多 200 筆，畫面分成一天一天）
export const LOG_PAGE_DAYS = 10;
// 預設：最近 120 天內（之前的按「再看更早的」）
export const logFrom = () => daysAgoYmd(120);
