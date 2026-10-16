// 使用狀況的數據分析：判斷路線太難／太簡單、冷門路線、難度供需落差、本週重點（純計算，畫面在 components/admin/Insights*.tsx）
import type { InsightRoute, RouteInsights, SupplyBand, UsageInsights } from "@/lib/data";
import { GRADE_BANDS, ROPE_BANDS, gradeLabel } from "@/lib/design";

export const MIN_TRIED = 5; // 少於 5 人試過的路線不判斷太難、太簡單
export const COLD_DAYS = 14; // 上牆 14 天以上
export const COLD_MAX = 2; // 記錄 2 筆以下＝冷門
export const FEEL_MIN = 3; // 至少 3 人回報難度體感才標

export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

const bandOf = (g: number) => [...GRADE_BANDS, ...ROPE_BANDS].find((b) => (g >= 100) === !!b.rope && g >= b.min && g <= b.max);

export const SUPPLY_LABEL: Record<SupplyBand, string> = {
  easy: "入門 VB–V2",
  mid: "進階 V3–V5",
  hard: "挑戰 V6+",
  rope_easy: "上攀 5.9 以下",
  rope_mid: "上攀 5.10",
  rope_hard: "上攀 5.11+",
};

export type RouteFlag = "hard" | "easy" | null;
export type FeelFlag = "soft" | "hard" | null;
export type FlaggedRoute = InsightRoute & { rate: number; flag: RouteFlag; feel: FeelFlag };

// 完攀率跟同一段難度的平均比：低 30% 以上＝可能太難；Flash 六成以上＝可能太簡單（至少 5 人試過才判斷）
// 難度體感：至少 3 人回報，而且偏硬（偏軟）是另一邊的兩倍以上
export function flagRoutes(routes: InsightRoute[]): FlaggedRoute[] {
  const avg = new Map<string, number>();
  for (const b of [...GRADE_BANDS, ...ROPE_BANDS]) {
    const rs = routes.filter((r) => r.tried >= MIN_TRIED && bandOf(r.grade) === b);
    const tried = rs.reduce((n, r) => n + r.tried, 0);
    if (tried) avg.set(`${b.rope ? "r" : "v"}${b.id}`, rs.reduce((n, r) => n + r.sent, 0) / tried);
  }
  return routes.map((r) => {
    const b = bandOf(r.grade);
    const a = b ? avg.get(`${b.rope ? "r" : "v"}${b.id}`) : undefined;
    const rate = r.tried ? r.sent / r.tried : 0;
    let flag: RouteFlag = null;
    if (r.tried >= MIN_TRIED) {
      if (r.flash / r.tried >= 0.6) flag = "easy";
      else if (a != null && rate <= a - 0.3) flag = "hard";
    }
    const votes = r.soft + r.hard;
    const feel: FeelFlag = votes >= FEEL_MIN && r.hard >= r.soft * 2 && r.hard > 0 ? "hard" : votes >= FEEL_MIN && r.soft >= r.hard * 2 && r.soft > 0 ? "soft" : null;
    return { ...r, rate, flag, feel };
  });
}

// 冷門：上牆 14 天以上、記錄 2 筆以下（上牆最久的排前面）
export const coldRoutes = (routes: InsightRoute[]) =>
  routes.filter((r) => r.days >= COLD_DAYS && r.tried <= COLD_MAX).sort((a, b) => b.days - a.days || a.tried - b.tried);

// 難度供需：每一段「牆上佔幾 %」和「完攀佔幾 %」（抱石、上攀各自算比例）；只回傳牆上或完攀有東西的段
export function supplyShares(supply: RouteInsights["supply"]) {
  const out: { band: SupplyBand; wall: number; sends: number; wallPct: number; sendPct: number }[] = [];
  for (const rope of [false, true]) {
    const rows = supply.filter((s) => s.band.startsWith("rope") === rope);
    const w = rows.reduce((n, s) => n + s.wall, 0);
    const c = rows.reduce((n, s) => n + s.sends, 0);
    if (!w && !c) continue;
    for (const s of rows) out.push({ ...s, wallPct: pct(s.wall, w), sendPct: pct(s.sends, c) });
  }
  return out;
}

export type Highlight = { key: string; big: string; title: string; detail: string; tab: "people" | "routes" | "social"; section: string; score: number };

const routeName = (r: { zone: string; code: string; grade: number; color: string; name: string | null }) =>
  `${r.zone} ${r.name ?? `${r.color}色 ${r.code}`}（${gradeLabel(r.grade)}）`;

// 本週重點：從各項分析挑變化最大的 3 件（數字太少的不挑）
export function pickHighlights(u: UsageInsights | null, ri: RouteInsights | null): Highlight[] {
  const out: Highlight[] = [];
  if (u) {
    const now = u.retention.now;
    const prev = u.retention.prev;
    if (now && now.base >= 5) {
      const r = pct(now.back, now.base);
      const diff = prev && prev.base >= 5 ? r - pct(prev.back, prev.base) : null;
      out.push({
        key: "retention",
        big: `${r}%`,
        title: diff == null || diff === 0 ? "上週的人這週有回來" : `回頭率比前一週${diff > 0 ? "好" : "少"} ${Math.abs(diff)}%`,
        detail: `上週用過的 ${now.base} 人，這週有 ${now.back} 人回來`,
        tab: "people",
        section: "retention",
        score: 10 + Math.abs(diff ?? 0) * 2,
      });
    }
    if (u.newbie.n >= 5) {
      const r = pct(u.newbie.first_route, u.newbie.n);
      out.push({
        key: "newbie",
        big: `${r}%`,
        title: "新客人第一週就記了路線",
        detail: `最近註冊的 ${u.newbie.n} 人，${u.newbie.first_route} 人第一週記了第一條路線`,
        tab: "people",
        section: "newbie",
        score: 8 + Math.abs(50 - r) / 2,
      });
    }
    if (u.progress.improved >= 1) {
      out.push({
        key: "progress",
        big: `${u.progress.improved}`,
        title: "人這 30 天破了自己的最高難度",
        detail: `之前就有完攀紀錄的 ${u.progress.climbers} 人裡面（抱石）`,
        tab: "people",
        section: "levels",
        score: 6 + u.progress.improved * 2,
      });
    }
    const last = u.daily.slice(-7);
    const before = u.daily.slice(-14, -7);
    const sum = (d: typeof last) => d.reduce((n, x) => n + x.comments + x.videos, 0);
    if (before.length === 7 && sum(before) >= 5) {
      const diff = pct(sum(last) - sum(before), sum(before));
      if (Math.abs(diff) >= 20)
        out.push({
          key: "social",
          big: `${diff > 0 ? "+" : ""}${diff}%`,
          title: `留言和影片比前一週${diff > 0 ? "多" : "少"}`,
          detail: `最近 7 天 ${sum(last)} 則，前 7 天 ${sum(before)} 則`,
          tab: "social",
          section: "social",
          score: 6 + Math.abs(diff) / 5,
        });
    }
  }
  if (ri) {
    const flagged = flagRoutes(ri.routes).filter((r) => r.flag);
    if (flagged.length) {
      const first = flagged.find((r) => r.flag === "hard") ?? flagged[0];
      out.push({
        key: "flagged",
        big: `${flagged.length}`,
        title: "條路線可能太難或太簡單",
        detail: `例如 ${routeName(first)} ${first.flag === "hard" ? `完攀率只有 ${pct(first.sent, first.tried)}%` : `Flash ${pct(first.flash, first.tried)}%`}`,
        tab: "routes",
        section: "rates",
        score: 9 + flagged.length * 3,
      });
    }
    const cold = coldRoutes(ri.routes);
    if (cold.length) {
      out.push({
        key: "cold",
        big: `${cold.length}`,
        title: `條路線上牆 ${COLD_DAYS} 天以上很少人爬`,
        detail: `例如 ${routeName(cold[0])} 上牆 ${cold[0].days} 天、${cold[0].tried} 人記錄，換線時可以先換`,
        tab: "routes",
        section: "cold",
        score: 7 + cold.length * 2,
      });
    }
    const gap = supplyShares(ri.supply)
      .filter((s) => s.sends >= 5)
      .map((s) => ({ ...s, gap: s.sendPct - s.wallPct }))
      .sort((a, b) => b.gap - a.gap)[0];
    if (gap && gap.gap >= 10)
      out.push({
        key: "supply",
        big: `+${gap.gap}%`,
        title: `${SUPPLY_LABEL[gap.band]} 爬的人多、牆上比較少`,
        detail: `完攀佔 ${gap.sendPct}%，牆上只佔 ${gap.wallPct}%，下次換線可以多出幾條`,
        tab: "routes",
        section: "supply",
        score: 6 + gap.gap / 2,
      });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}
