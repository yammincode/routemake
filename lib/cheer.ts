// 夥伴說的話：館首頁、區域頁、我的紀錄上面的泡泡、右下角小夥伴、做了事情（事件）；夥伴風格選幹話、文青就只講那一種（跟平常的話分開）
import { ABILITY_AXES, gradeLabel } from "./design";
import { ARTSY_LINES, MASCOT_LINES, TROLL_LINES, mascotInfo, type MascotId, type MascotMode } from "./mascots";

export type CheerInput = {
  mascot: MascotId;
  mode: MascotMode;
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

// 幹話、文青的句子（平常＝null）
const styled = (mode: MascotMode) => (mode === "troll" ? TROLL_LINES : mode === "artsy" ? ARTSY_LINES : null);

// 挑一句：幹話、文青只講那一種（跟平常的話分開，不混）；平常紀錄、能力的話一起抽，偶爾（1/4）講夥伴自己的話，沒有可以講的就講夥伴的話
export function pickFrom(pool: string[], mascot: MascotId, mode: MascotMode, rand: () => number = Math.random): string {
  const any = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length) % xs.length];
  const only = styled(mode);
  if (only) return any(only);
  const own = MASCOT_LINES[mascot];
  if (!pool.length || rand() < 0.25) return any(own);
  return any(pool);
}
// 館首頁
export const pickCheer = (c: CheerInput, rand: () => number = Math.random) => pickFrom([...recordLines(c), ...abilityLines(c)], c.mascot, c.mode, rand);

// 區域頁：這一區還有幾條沒完攀、嘗試中、新路線、全部完攀
export type ZoneTalk = {
  zone: string;
  total: number;
  done: number;
  projects: { code: string; grade: number; hold_color: string }[];
  fresh: number; // 7 天內的新路線、自己還沒完攀
};
export function zoneLines(z: ZoneTalk): string[] {
  const out: string[] = [];
  if (!z.total) return out;
  const left = z.total - z.done;
  if (left === 0) out.push(`${z.zone}你全部完攀了！換線前再來找我。`);
  else if (left <= 3) out.push(`${z.zone}只剩 ${left} 條沒完攀，快收集完了！`);
  else out.push(`${z.zone}還有 ${left} 條你沒完攀，挑一條試試？`);
  if (z.done > 0 && left > 0) out.push(`你在${z.zone}已經完攀 ${z.done} / ${z.total} 條。`);
  for (const p of z.projects.slice(0, 2)) out.push(`${p.code}（${gradeLabel(p.grade)} ${p.hold_color}）還在嘗試中，今天再試一次？`);
  if (z.fresh > 0) out.push(`這區有 ${z.fresh} 條新路線你還沒完攀，去看看吧！`);
  return out;
}

// 我的紀錄（只看這個月）：完攀、Flash、攀爬天數、差幾條大滿貫
export type MeTalk = { sends: number; prev: number; flashes: number; days: number; near: { grade: string; left: number }[] };
export function meLines(m: MeTalk): string[] {
  const out: string[] = [];
  if (m.sends > m.prev && m.prev > 0) out.push(`這個月已經完攀 ${m.sends} 條，比上個月多 ${m.sends - m.prev} 條！`);
  else if (m.sends > 0) out.push(`這個月已經完攀 ${m.sends} 條，繼續保持！`);
  else out.push("這個月還沒有完攀，今天來開張吧！");
  if (m.flashes > 0) out.push(`這個月 Flash 了 ${m.flashes} 條，眼力很好喔！`);
  if (m.days >= 8) out.push(`這個月爬了 ${m.days} 天，你是牆上的常客！`);
  for (const n of m.near.slice(0, 2)) out.push(`再 ${n.left} 條就是 ${n.grade} 大滿貫了！`);
  return out;
}

// 右下角小夥伴（點牠、換頁時）
const BUDDY = ["今天爬哪一區？", "喝水了沒？", "爬累了就休息一下，我在這裡等你。", "要不要挑戰一條沒爬過的？", "我在這裡幫你加油！", "記得暖身喔！"];
export const buddyLine = (mascot: MascotId, mode: MascotMode, rand: () => number = Math.random) => pickFrom(BUDDY, mascot, mode, rand);

// 做了事情：記錄完攀、Flash、破自己的最高難度、連續爬好幾天、第一次留言
export type EventKind = "send" | "flash" | "best" | "streak" | "comment";
const EVENT: Record<EventKind, string[]> = {
  send: ["完攀！又收集一條。", "完攀！手感不錯喔！", "上去了！下一條是哪條？", "完攀！我就知道你可以。"],
  flash: ["Flash！一次就上，太強了吧！", "Flash！眼睛會看路線喔！", "第一次就上去，帥！"],
  best: ["新紀錄！你第一次完攀 {grade}，我要跟大家炫耀！", "{grade}！這是你最難的一條，太厲害了！"],
  streak: ["連續爬 {days} 天了，你是牆上的常客！", "第 {days} 天！記得讓手指休息一下。"],
  comment: ["謝謝分享 beta，大家會感謝你的！", "第一則留言！你的心得會幫到別人喔。"],
};
// 事件的話：幹話、文青只講那一種（要撒彩帶的照樣撒）
export function eventLine(kind: EventKind, mode: MascotMode, vars: { grade?: string; days?: number } = {}, rand: () => number = Math.random): string {
  const any = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length) % xs.length];
  const only = styled(mode);
  if (only) return any(only);
  return any(EVENT[kind]).replace("{grade}", vars.grade ?? "").replace("{days}", String(vars.days ?? ""));
}
