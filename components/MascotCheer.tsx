"use client";

import { useEffect, useRef, useState } from "react";
import { MascotBubble } from "@/components/ui/Mascot";
import { abilityLines, pickFrom, recordLines, type CheerInput } from "@/lib/cheer";
import { getCheerFacts, getMonthlyStats, getProfileCard } from "@/lib/data";
import { daysUntil, todayYmd } from "@/lib/date";
import { closePage, pageClosed, useMascot, useTalk, useTroll } from "@/lib/mascot-store";
import type { MascotId } from "@/lib/mascots";

// 頁面上面夥伴的泡泡（館首頁、區域頁、我的紀錄）：每次打開那一頁就說一句；✕ 關掉後這次打開 App 不再出現
// pool＝這一頁看紀錄能講的話（可以看是哪隻夥伴；null＝還在讀）；夥伴「閉嘴」或關掉說話時不出現
export type Pool = string[] | ((mascot: MascotId) => string[]) | null;
export function PageCheer({ uid, page, pool }: { uid: string; page: string; pool: Pool }) {
  const pick = useMascot(uid);
  const [troll] = useTroll();
  const { state } = useTalk();
  const [closed, setClosed] = useState(false);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "on" || text || closed || !pick || pool == null) return;
    const shut = pageClosed(page);
    const t = shut ? null : pickFrom(typeof pool === "function" ? pool(pick.id) : pool, pick.id, troll);
    void Promise.resolve().then(() => (shut ? setClosed(true) : setText(t)));
  }, [state, text, closed, pick, pool, troll, page]);

  if (state !== "on" || closed || !pick || !text || pool == null) return null;
  return (
    <MascotBubble
      pick={pick}
      troll={troll}
      text={text}
      onClose={() => {
        closePage(page);
        setClosed(true);
      }}
    />
  );
}

// 館首頁：看這間館的紀錄、能力說話；讀到的紀錄記在記憶體 30 分鐘（每次回到館首頁不用重讀，省流量）
type Facts = {
  at: number;
  facts: Awaited<ReturnType<typeof getCheerFacts>> | null;
  month: { sends: number; prev: number } | null;
  ability: number[] | null;
  self: number[] | null;
};
const factCache = new Map<string, Facts>();
async function homeFacts(uid: string, gymId: string): Promise<Facts> {
  const key = `${uid}:${gymId}`;
  const hit = factCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit;
  const now = todayYmd();
  const soft = <T,>(p: Promise<T>) => p.catch(() => null);
  const [facts, month, card] = await Promise.all([soft(getCheerFacts(uid, gymId)), soft(getMonthlyStats(+now.slice(0, 4), +now.slice(5, 7))), soft(getProfileCard(uid))]);
  const f = { at: Date.now(), facts, month: month ? { sends: month.sends, prev: month.prev_sends } : null, ability: card?.ability ?? null, self: card?.self_stats ?? null };
  // 讀不到（沒網路）不記，下次再讀
  if (facts || month || card) factCache.set(key, f);
  return f;
}

export default function MascotCheer({ uid, gymId, gymName, goal, fresh }: { uid: string; gymId: string; gymName: string; goal: CheerInput["goal"]; fresh: number }) {
  const { state } = useTalk();
  const [pool, setPool] = useState<Pool>(null);
  // 換線、新路線的資料會跟著館首頁重畫一直換物件：放在 ref，讀紀錄時才拿最新的（不要因為重畫一直重讀）
  const ctx = useRef({ gymName, goal, fresh });
  useEffect(() => {
    ctx.current = { gymName, goal, fresh };
  }, [gymName, goal, fresh]);
  useEffect(() => {
    if (state !== "on" || pool) return;
    let alive = true;
    void homeFacts(uid, gymId).then((f) => {
      if (!alive) return;
      const away = f.facts?.lastClimbed ? -(daysUntil(f.facts.lastClimbed) ?? 0) : null;
      const c = (mascot: MascotId): CheerInput => ({ mascot, troll: false, ...ctx.current, project: f.facts?.project ?? null, daysAway: away, month: f.month, ability: f.ability, self: f.self });
      setPool(() => (m: MascotId) => [...recordLines(c(m)), ...abilityLines(c(m))]);
    });
    return () => {
      alive = false;
    };
  }, [state, pool, uid, gymId]);
  return <PageCheer uid={uid} page={`home:${gymId}`} pool={pool} />;
}
