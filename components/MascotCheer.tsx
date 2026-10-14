"use client";

import { useEffect, useRef, useState } from "react";
import { MascotBubble } from "@/components/ui/Mascot";
import { pickCheer, type CheerInput } from "@/lib/cheer";
import { getCheerFacts, getMonthlyStats, getProfileCard } from "@/lib/data";
import { daysUntil, todayYmd } from "@/lib/date";
import { useMascot, useTroll } from "@/lib/mascot-store";

// 館首頁標題下面：每天第一次打開，夥伴說一句（看紀錄、能力；幹話模式幹話和平常的話混著講）；✕ 關掉
// 「今天說過了」記在這支手機（每個帳號分開）；讀不到紀錄（沒網路）就講夥伴自己的話
const KEY = "routemake:cheer:";
const seenToday = (uid: string) => {
  try {
    return localStorage.getItem(KEY + uid) === todayYmd();
  } catch {
    return true; // 隱私模式存不了：不要每次都跳出來
  }
};

export default function MascotCheer({ uid, gymId, gymName, goal, fresh }: { uid: string; gymId: string; gymName: string; goal: CheerInput["goal"]; fresh: number }) {
  const [show, setShow] = useState(false);
  // 今天要說才讀自己的夥伴（說過了就不多讀一次）
  const want = useMascot(show ? uid : null);
  const pick = show ? want : null;
  const [troll] = useTroll();
  const [text, setText] = useState<string | null>(null);
  const ctx = useRef({ gymName, goal, fresh });
  useEffect(() => {
    ctx.current = { gymName, goal, fresh };
  }, [gymName, goal, fresh]);

  // 今天還沒說過才說
  useEffect(() => {
    if (seenToday(uid)) return;
    void Promise.resolve().then(() => setShow(true));
  }, [uid]);
  // 真的說出來了才記「今天說過了」（還沒說完就離開館首頁，下次打開再說）
  useEffect(() => {
    if (!text) return;
    try {
      localStorage.setItem(KEY + uid, todayYmd());
    } catch {}
  }, [text, uid]);

  // 要說的時候才讀紀錄（一天一次）；夥伴讀好了才挑
  useEffect(() => {
    if (!show || !pick || text) return;
    let alive = true;
    const now = todayYmd();
    const [y, m] = [+now.slice(0, 4), +now.slice(5, 7)];
    const soft = <T,>(p: Promise<T>) => p.catch(() => null);
    void Promise.all([soft(getCheerFacts(uid, gymId)), soft(getMonthlyStats(y, m)), soft(getProfileCard(uid))]).then(([facts, month, card]) => {
      if (!alive) return;
      const away = facts?.lastClimbed ? -(daysUntil(facts.lastClimbed) ?? 0) : null;
      setText(
        pickCheer({
          mascot: pick.id,
          troll,
          ...ctx.current,
          project: facts?.project ?? null,
          daysAway: away,
          month: month ? { sends: month.sends, prev: month.prev_sends } : null,
          ability: card?.ability ?? null,
          self: card?.self_stats ?? null,
        })
      );
    });
    return () => {
      alive = false;
    };
  }, [show, pick, troll, text, uid, gymId]);

  if (!show || !pick || !text) return null;
  return <MascotBubble pick={pick} troll={troll} text={text} onClose={() => setShow(false)} />;
}
