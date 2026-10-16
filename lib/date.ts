// 日期一律用台北時間
const TZ = "Asia/Taipei";
const DAY = 86400000;

// YYYY-MM-DD（台北時間）
export const ymd = (d: Date | string | number = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));

export const todayYmd = () => ymd();

// 台北某天 00:00 的 UTC 時間（ISO，預設今天）；台灣沒有日光節約時間
export const dayStartIso = (d: string = todayYmd()) => new Date(`${d}T00:00:00+08:00`).toISOString();

const dayNumber = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY;

// 距離某天還有幾天（今天 = 0，已過為負數）
export const daysUntil = (date: string | null) => (date ? Math.round(dayNumber(date) - dayNumber(todayYmd())) : null);

// 幾天前（今天、N 天前）
export const ago = (ts: string) => {
  const d = Math.round(dayNumber(todayYmd()) - dayNumber(ymd(ts)));
  return d <= 0 ? "今天" : `${d} 天前`;
};

// 7 天內設定的算新路線（館首頁的區域 NEW 用 3 天）
export const isNew = (ts: string, days = 7) => Date.now() - new Date(ts).getTime() < days * DAY;

// 10/05 格式
export const md = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;

// 影片的時間：有攀爬日顯示攀爬日（今天、10/05）；沒有紀錄時寫明是分享時間（今天分享、3 天前分享）
export const videoWhen = (climbedOn: string | null | undefined, sharedAt: string) =>
  climbedOn ? (climbedOn === todayYmd() ? "今天" : md(climbedOn)) : `${ago(sharedAt)}分享`;

// 幾天前的日期（0 = 今天，台北時間）
export const daysAgoYmd = (n: number) => ymd(Date.now() - n * DAY);
