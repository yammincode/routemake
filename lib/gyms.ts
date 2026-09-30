// 六間店：id 是系統內部代號（不要改），名稱與 Logo 顯示用；live = 已開放路線紀錄
export type Gym = { id: string; name: string; live: boolean; logo: string };

export const GYMS: Gym[] = [
  { id: "mingde", name: "明德館", live: true, logo: "/logos/mingde.svg" },
  { id: "g2", name: "萬華館", live: false, logo: "/logos/wanhua.svg" },
  { id: "g3", name: "中和館", live: false, logo: "/logos/zhonghe.svg" },
  { id: "g4", name: "南港館", live: false, logo: "/logos/nangang.svg" },
  { id: "g5", name: "新店館", live: false, logo: "/logos/xindian.svg" },
  { id: "g6", name: "中壢館", live: false, logo: "/logos/zhongli.svg" },
];

// 原岩攀岩館主 Logo（含文字）與 T 圓形標誌
export const BRAND_LOGO = "/logos/tup.svg";
export const BRAND_MARK = "/logos/tup-mark.svg";

export const LIVE_GYM = GYMS[0];

export const findGym = (id: string) => GYMS.find((g) => g.id === id);

export const gymPath = (id: string) => `/gym/${id}`;
export const DEFAULT_GYM_PATH = gymPath(LIVE_GYM.id);

// 記住上次選的館（只是方便用，存在手機）
const LAST_KEY = "routemake-last-gym";
export function saveLastGym(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {}
}
export function lastGymPath() {
  try {
    const id = localStorage.getItem(LAST_KEY);
    if (id && findGym(id)) return gymPath(id);
  } catch {}
  return DEFAULT_GYM_PATH;
}
