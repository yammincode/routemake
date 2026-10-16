// 路線回報：後台把同一件事的回報合成一則（10/16 使用者選 B）
// - 沒標到的路線：同一區、同一個顏色、起步點相距不到 8%（照片寬高的百分比）→ 同一條
// - 路線有問題：同一條路線、同一種問題
// 合起來的那一則：位置用大家點的平均、難度用最多人猜的（沒人猜就 null）
import type { ReportKind, RouteReport } from "@/lib/data";
import type { HoldColor } from "@/lib/design";

export const REPORT_KIND: Record<ReportKind, string> = { missing: "沒標到的路線", color: "顏色不對", pin: "位置標錯", gone: "已經拆了" };
export const NEAR = 8;

export type ReportGroup = {
  key: string;
  kind: ReportKind;
  zone_id: string;
  zone_name: string;
  route_id: string | null;
  route_code: string | null;
  route_color: HoldColor | null;
  route_grade: number | null;
  color: HoldColor | null;
  grade: number | null;
  x: number | null;
  y: number | null;
  items: RouteReport[];
};

const avg = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
function topGrade(items: RouteReport[]): number | null {
  const n = new Map<number, number>();
  for (const r of items) if (r.grade_guess != null) n.set(r.grade_guess, (n.get(r.grade_guess) ?? 0) + 1);
  let best: number | null = null;
  for (const [g, c] of n) if (best == null || c > n.get(best)! || (c === n.get(best)! && g < best)) best = g;
  return best;
}

// list 照資料庫的順序（區域順序、送出時間）；合起來後照同樣順序
export function groupReports(list: RouteReport[]): ReportGroup[] {
  const out: ReportGroup[] = [];
  for (const r of list) {
    const g = out.find((o) =>
      o.kind !== r.kind || o.zone_id !== r.zone_id
        ? false
        : r.kind === "missing"
          ? o.color === r.hold_color && r.pin_x != null && r.pin_y != null && Math.hypot(o.x! - r.pin_x, o.y! - r.pin_y) < NEAR
          : o.route_id === r.route_id
    );
    if (g) {
      g.items.push(r);
      const pts = g.items.filter((i) => i.pin_x != null && i.pin_y != null);
      if (pts.length) {
        g.x = avg(pts.map((i) => i.pin_x!));
        g.y = avg(pts.map((i) => i.pin_y!));
      }
      if (r.kind === "color") g.color = r.hold_color; // 顏色不對：用最新說的顏色
      g.grade = topGrade(g.items);
      continue;
    }
    out.push({
      key: r.id,
      kind: r.kind,
      zone_id: r.zone_id,
      zone_name: r.zone_name,
      route_id: r.route_id,
      route_code: r.route_code,
      route_color: r.route_color,
      route_grade: r.route_grade,
      color: r.hold_color,
      grade: r.grade_guess,
      x: r.pin_x,
      y: r.pin_y,
      items: [r],
    });
  }
  return out;
}

// 照片上要標在哪：沒標到的、位置標錯的用客人點的位置；其他用路線本來的位置
export function groupSpot(g: ReportGroup): { x: number; y: number } | null {
  const routeSpot = g.items[0].route_x != null && g.items[0].route_y != null ? { x: g.items[0].route_x, y: g.items[0].route_y } : null;
  if (g.x != null && g.y != null) return { x: g.x, y: g.y };
  return routeSpot;
}
