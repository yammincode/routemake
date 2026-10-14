// 館首頁每天一句：夥伴看紀錄、能力說話；幹話模式從老闆給的句子隨機挑
import { ABILITY_AXES, gradeLabel } from "./design";
import { MASCOT_LINES, TROLL_LINES, mascotInfo, type MascotId } from "./mascots";

export type CheerInput = {
  mascot: MascotId;
  troll: boolean;
  gymName: string;
  goal?: { zone: string; days: number; left: number } | null; // 快換線、還有沒完攀的區（館首頁「下一個目標」）
  project?: { code: string; grade: number; hold_color: string } | null; // 這間館牆上最近的嘗試中
  daysAway?: number | null; // 距離上次攀爬幾天
  month?: { sends: number; prev: number } | null; // 本月、上個月完攀
  fresh?: number; // 這間館這週的新路線
  ability?: number[] | null; // 人物卡能力（0–100，依完攀）
  self?: number[] | null; // 人物卡自評（1–5）
};

// 看紀錄能講的話
export function recordLines(c: CheerInput): string[] {
  const out: string[] = [];
  if (c.goal && c.goal.left > 0) out.push(`${c.goal.zone}${c.goal.days === 0 ? "今天" : ` ${c.goal.days} 天後`}要換線了，你還有 ${c.goal.left} 條沒完攀，今天去收集吧！`);
  if (c.project) out.push(`上次 ${c.project.code}（${gradeLabel(c.project.grade)} ${c.project.hold_color}）還在嘗試中，今天再試一次？`);
  if (c.daysAway != null && c.daysAway >= 14) out.push(`${c.daysAway} 天沒見了，好想你！今天來爬一下嗎？`);
  if (c.month && c.month.prev > 0 && c.month.sends > c.month.prev) out.push(`這個月已經完攀 ${c.month.sends} 條，比上個月多 ${c.month.sends - c.month.prev} 條！`);
  if (c.fresh && c.fresh > 0) out.push(`${c.gymName}這週有 ${c.fresh} 條新路線，去看看吧。`);
  return out;
}

// 看能力（人物卡六角形）能講的話
export function abilityLines(c: CheerInput): string[] {
  const a = c.ability;
  if (!a || a.length !== 6 || !a.some((v) => v > 0)) return [];
  const hi = a.indexOf(Math.max(...a));
  const lo = a.indexOf(Math.min(...a));
  const mine = mascotInfo(c.mascot).ability;
  const out: string[] = [];
  if (Math.max(...a) - Math.min(...a) < 25) out.push("六項能力都很平均，你是全能型！要不要挑一項衝到最強？");
  else {
    out.push(hi === mine ? `你的${ABILITY_AXES[hi]}是六項最強，跟我一樣！我們果然是同一國的。` : `${ABILITY_AXES[hi]}是你最強的一項。我的專長是${ABILITY_AXES[mine]}，要不要也練練看？`);
    out.push(`${ABILITY_AXES[lo]}是你練最少的，今天找一條${ABILITY_AXES[lo]}的路線試試？`);
  }
  if (c.self && c.self.length === 6) {
    let gap = 0;
    let at = -1;
    c.self.forEach((v, i) => {
      const d = v * 20 - a[i];
      if (d > gap) [gap, at] = [d, i];
    });
    if (at >= 0 && gap >= 40) out.push(`你覺得自己${ABILITY_AXES[at]}有 ${c.self[at]} 分，但完攀紀錄裡${ABILITY_AXES[at]}的路線還不多，來證明給我看！`);
  }
  return out;
}

// 挑一句：幹話模式幹話和平常的話混著講（一半一半）；平常紀錄、能力的話一起抽，偶爾（1/4）講夥伴自己的話，沒有可以講的就講夥伴的話
export function pickCheer(c: CheerInput, rand: () => number = Math.random): string {
  const any = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length) % xs.length];
  if (c.troll && rand() < 0.5) return any(TROLL_LINES);
  const pool = [...recordLines(c), ...abilityLines(c)];
  const own = MASCOT_LINES[c.mascot];
  if (!pool.length || rand() < 0.25) return any(own);
  return any(pool);
}
