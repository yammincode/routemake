// 我的紀錄「路線進度」：
// - 牆上進度：全原岩現在牆上的路線（開放的館，Spray Wall 不算），每個難度完成幾條；全部完成就是大滿貫
// - 我的進度：自己累積完攀幾條（跟「累計完攀」一樣，換線拆掉的也算）
// 抱石（V 級）、上攀（5.x，長耐力也是）分開；每個難度再依館分開，館的順序照 lib/gyms.ts 的 GYMS
import type { MySend, WallRoute } from "@/lib/data";
import { isYds } from "@/lib/design";
import { GYMS } from "@/lib/gyms";

export type GymCount = { gym: string; done: number; total: number };
export type ProgressRow = { grade: number; done: number; total: number; gyms: GymCount[] };
export type Progress = { boulder: ProgressRow[]; rope: ProgressRow[] };

const ORDER = GYMS.map((g) => g.id);
const rank = (gym: string) => (ORDER.includes(gym) ? ORDER.indexOf(gym) : ORDER.length);

function build(items: { grade: number; gym: string; done: boolean }[]): Progress {
  const byGrade = new Map<number, Map<string, GymCount>>();
  for (const it of items) {
    let gyms = byGrade.get(it.grade);
    if (!gyms) byGrade.set(it.grade, (gyms = new Map()));
    const c = gyms.get(it.gym) ?? { gym: it.gym, done: 0, total: 0 };
    c.total++;
    if (it.done) c.done++;
    gyms.set(it.gym, c);
  }
  const rows = [...byGrade]
    .sort(([a], [b]) => a - b)
    .map(([grade, m]) => {
      const gyms = [...m.values()].sort((a, b) => rank(a.gym) - rank(b.gym) || a.gym.localeCompare(b.gym));
      return { grade, done: gyms.reduce((s, g) => s + g.done, 0), total: gyms.reduce((s, g) => s + g.total, 0), gyms };
    });
  return { boulder: rows.filter((r) => !isYds(r.grade)), rope: rows.filter((r) => isYds(r.grade)) };
}

// 牆上進度：牆上每條路線算一次，done＝自己 Flash 或完攀
export const wallProgress = (routes: WallRoute[], isDone: (routeId: string) => boolean) =>
  build(routes.map((r) => ({ grade: r.grade, gym: r.gym_id, done: isDone(r.id) })));

// 我的進度：完攀過的每條路線算一次（total 跟 done 一樣）
export const myProgress = (sends: MySend[]) => build(sends.map((s) => ({ grade: s.grade, gym: s.gym_id, done: true })));

// 大滿貫：這個難度牆上的路線全部完成
export const isGrandSlam = (r: Pick<ProgressRow, "done" | "total">) => r.total > 0 && r.done === r.total;

// 出現在進度裡的館（圖例用），照 GYMS 的順序
export const progressGyms = (p: Progress) =>
  [...new Set([...p.boulder, ...p.rope].flatMap((r) => r.gyms.map((g) => g.gym)))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
