// 六間店：名稱沿用原型的暫用名稱，正式館名確認後再改（第 2 步會搬進資料庫的 gyms 表）
export type Gym = { id: string; name: string; live: boolean };

export const GYMS: Gym[] = [
  { id: "mingde", name: "明德館", live: true },
  { id: "g2", name: "第二館", live: false },
  { id: "g3", name: "第三館", live: false },
  { id: "g4", name: "第四館", live: false },
  { id: "g5", name: "第五館", live: false },
  { id: "g6", name: "第六館", live: false },
];

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
