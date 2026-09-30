// 日期一律用台北時間
const TZ = "Asia/Taipei";
const DAY = 86400000;

// YYYY-MM-DD（台北時間）
export const ymd = (d: Date | string | number = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));

export const todayYmd = () => ymd();

const dayNumber = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY;

// 距離某天還有幾天（今天 = 0，已過為負數）
export const daysUntil = (date: string | null) => (date ? Math.round(dayNumber(date) - dayNumber(todayYmd())) : null);

// 幾天前（今天、N 天前）
export const ago = (ts: string) => {
  const d = Math.round(dayNumber(todayYmd()) - dayNumber(ymd(ts)));
  return d <= 0 ? "今天" : `${d} 天前`;
};

// 7 天內設定的算新路線
export const isNew = (ts: string) => Date.now() - new Date(ts).getTime() < 7 * DAY;

// 10/05 格式
export const md = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;
