// 路線分數（跟資料庫 route_points／ascent_points 同一套算法，用整數運算避免四捨五入差異）
import { isYds, type Status } from "@/lib/design";

export type ScoringRules = {
  grade_points: number[]; // V0–V10
  vb_points?: number; // VB
  yds_points?: number[]; // 5.6–5.13d（grade 100–119）
  style_bonus: Record<string, number>; // 風格加成 %
  max_style_bonus: number; // 風格加成上限 %
  flash_multiplier: number; // Flash 倍數
};

// 風格加成（%，已套用上限）
export const styleBonus = (tags: string[], r: ScoringRules) =>
  Math.min(r.max_style_bonus, tags.reduce((s, t) => s + (r.style_bonus[t] ?? 0), 0));

// 難度基本分：V 級、YDS 各一張表
const basePoints = (grade: number, r: ScoringRules) =>
  isYds(grade) ? (r.yds_points?.[grade - 100] ?? 0) : grade < 0 ? (r.vb_points ?? 0) : (r.grade_points[grade] ?? 0);

// 路線分數
export const routePoints = (grade: number, tags: string[], r: ScoringRules) =>
  Math.round((basePoints(grade, r) * (100 + styleBonus(tags, r))) / 100);

// 一筆紀錄的得分：Flash × 倍數、完攀 ×1、嘗試中 0
export function ascentPoints(grade: number, tags: string[], status: Status | null, r: ScoringRules) {
  if (status === "send") return routePoints(grade, tags, r);
  if (status !== "flash") return 0;
  const m = Math.round(r.flash_multiplier * 100);
  return Math.round((basePoints(grade, r) * (100 + styleBonus(tags, r)) * m) / 10000);
}
