"use client";

// 做了事情夥伴說一句：記錄完攀、Flash、破自己的最高難度、連續爬 3 天以上（當天第一條完攀）、第一次留言
import { eventLine, type EventKind } from "./cheer";
import { getSendFacts, myCommentCount } from "./data";
import { gradeLabel } from "./design";
import { sayEvent, trollOn } from "./mascot-store";

const tpe = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(d);

// 連續幾天有完攀（到今天為止，今天這條算進去）
export function streakDays(days: string[], today = tpe(new Date())): number {
  const set = new Set([...days, today]);
  let n = 0;
  for (let t = new Date(`${today}T12:00:00+08:00`); set.has(tpe(t)); t = new Date(t.getTime() - 86400000)) n++;
  return n;
}

// 記錄完攀、Flash 之後（queued＝沒網路先排隊：不查紀錄，直接說完攀／Flash）
export async function cheerSend(o: { userId: string; routeId: string; grade: number; status: "flash" | "send"; climbedOn: string; queued: boolean }) {
  const troll = trollOn();
  let kind: EventKind = o.status;
  let vars: { grade?: string; days?: number } = {};
  const today = tpe(new Date());
  if (!o.queued) {
    try {
      const f = await getSendFacts(o.userId, o.routeId, o.grade);
      const days = f.days;
      if (f.best) [kind, vars] = ["best", { grade: gradeLabel(o.grade) }];
      else if (o.status === "send" && o.climbedOn === today && !days.includes(today)) {
        const n = streakDays(days, today);
        if (n >= 3) [kind, vars] = ["streak", { days: n }];
      }
    } catch {
      // 讀不到就照一般的完攀／Flash 說
    }
  }
  sayEvent(eventLine(kind, troll, vars), kind === "flash" || kind === "best");
}

// 留言送出之後：第一則留言才說；說過（或之前就留過）記在這支手機，之後不再查（刪掉留言再留也不會再說）
export async function cheerComment(userId: string) {
  const key = `routemake:commented:${userId}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch {}
  try {
    const n = await myCommentCount(userId);
    try {
      localStorage.setItem(key, "1");
    } catch {}
    if (n === 1) sayEvent(eventLine("comment", trollOn()));
  } catch {}
}
