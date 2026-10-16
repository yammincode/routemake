// 分享到 IG：客人勾選要放的資料（10/16 使用者選 A 案：預覽下面「背景｜資料」大方塊勾選）
// 勾選記在這支手機（每一種分享各記一組）；預設：完攀圖、本月成績全部勾，影片標籤勾 難度、館名、區域
// 私人心得不在選項裡，永遠不會出現在圖上

export type SendShow = { bg: "photo" | "tape"; grade: boolean; status: boolean; route: boolean; gym: boolean; date: boolean; nick: boolean; qr: boolean; mascot: boolean };
export type MonthShow = { bg: "light" | "gym"; sends: boolean; points: boolean; flash: boolean; days: boolean; top: boolean; chart: boolean; gyms: boolean; nick: boolean; mascot: boolean };
export type VideoShow = { grade: boolean; gym: boolean; zone: boolean; status: boolean; date: boolean; nick: boolean };
export type ShareKind = "send" | "month" | "video";
type ShowOf = { send: SendShow; month: MonthShow; video: VideoShow };

export const SHOW_DEFAULT: ShowOf = {
  send: { bg: "photo", grade: true, status: true, route: true, gym: true, date: true, nick: true, qr: true, mascot: true },
  month: { bg: "light", sends: true, points: true, flash: true, days: true, top: true, chart: true, gyms: true, nick: true, mascot: true },
  video: { grade: true, gym: true, zone: true, status: false, date: false, nick: false },
};

// 畫面上的選項（順序＝方塊順序）；icon 是方塊上的小圖示
export type PickOption = { key: string; label: string; icon: string };
export const SHOW_BG: Record<ShareKind, PickOption[]> = {
  send: [
    { key: "photo", label: "岩牆照片", icon: "🧗" },
    { key: "tape", label: "膠帶色", icon: "🎨" },
  ],
  month: [
    { key: "light", label: "白底", icon: "⬜" },
    { key: "gym", label: "館的顏色", icon: "🎨" },
  ],
  video: [],
};
export const SHOW_FIELDS: Record<ShareKind, PickOption[]> = {
  send: [
    { key: "grade", label: "難度", icon: "V" },
    { key: "status", label: "Flash／完攀", icon: "⚡" },
    { key: "route", label: "區域・顏色", icon: "📍" },
    { key: "gym", label: "館名", icon: "🏠" },
    { key: "date", label: "日期", icon: "📅" },
    { key: "nick", label: "暱稱", icon: "🙂" },
    { key: "qr", label: "QR code", icon: "▦" },
    { key: "mascot", label: "原岩夥伴", icon: "🐾" },
  ],
  month: [
    { key: "sends", label: "完攀條數", icon: "#" },
    { key: "points", label: "積分", icon: "★" },
    { key: "flash", label: "Flash", icon: "⚡" },
    { key: "days", label: "攀爬天數", icon: "📅" },
    { key: "top", label: "最高難度", icon: "⬆" },
    { key: "chart", label: "直條圖", icon: "📊" },
    { key: "gyms", label: "去過的館", icon: "🏠" },
    { key: "nick", label: "暱稱", icon: "🙂" },
    { key: "mascot", label: "原岩夥伴", icon: "🐾" },
  ],
  video: [
    { key: "grade", label: "難度", icon: "V" },
    { key: "gym", label: "館名", icon: "🏠" },
    { key: "zone", label: "區域・顏色", icon: "📍" },
    { key: "status", label: "Flash／完攀", icon: "⚡" },
    { key: "date", label: "日期", icon: "📅" },
    { key: "nick", label: "暱稱", icon: "🙂" },
  ],
};

const KEY = (k: ShareKind) => `routemake:share-show:${k}`;
// 讀這支手機記的勾選（沒記過、壞掉、隱私模式就用預設；之後新增的選項用預設值補上）
export function loadShow<K extends ShareKind>(kind: K): ShowOf[K] {
  const def = SHOW_DEFAULT[kind];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(kind)) ?? "null") as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return { ...def };
    const out: Record<string, unknown> = { ...def };
    for (const [k, v] of Object.entries(def)) {
      if (typeof v === "boolean" && typeof raw[k] === "boolean") out[k] = raw[k];
      if (k === "bg" && SHOW_BG[kind].some((o) => o.key === raw.bg)) out.bg = raw.bg;
    }
    return out as ShowOf[K];
  } catch {
    return { ...def };
  }
}
export function saveShow<K extends ShareKind>(kind: K, show: ShowOf[K]) {
  try {
    localStorage.setItem(KEY(kind), JSON.stringify(show));
  } catch {}
}
// 同一組勾選（判斷上傳時順便做的 IG 版能不能直接用）
export const sameShow = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
