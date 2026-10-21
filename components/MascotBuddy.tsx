"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { MascotBuddyView, MascotToastView } from "@/components/ui/Mascot";
import { buddyLine } from "@/lib/cheer";
import { primeClimbStats } from "@/lib/climber-events";
import { useMascot, useMascotEvent, useTalk, useMascotMode } from "@/lib/mascot-store";

// 顧客的頁面右下角站著小夥伴（館首頁、區域頁、New~、人物卡、我的紀錄、Spray Wall）
const BUDDY_PAGES = ["/gym", "/zone", "/new", "/card", "/me", "/spray"];
// 換到這些頁面時小夥伴先說一句（館首頁、區域頁、我的紀錄上面已經有泡泡，小夥伴不搶著說，點牠才說）
const SPEAK_ON_OPEN = ["/new", "/card", "/spray"];
const on = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

export default function MascotBuddy() {
  const pathname = usePathname();
  const { session } = useAuth();
  const uid = session?.user.id;
  const pick = useMascot(uid ?? null);
  const [mode] = useMascotMode();
  const talk = useTalk();
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = !!uid && !!pick && talk.state === "on" && on(pathname, BUDDY_PAGES);

  // 說一句，5 秒後收起來
  const say = useCallback(() => {
    if (!pick) return;
    setText(buddyLine(pick.id, mode));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 5000);
  }, [pick, mode]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // 換頁：先把上一頁的話收起來；New~、人物卡、Spray Wall 打開時說一句
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (!shown) {
      lastPath.current = null; // 回到有小夥伴的頁面時照樣先說一句
      return;
    }
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    void Promise.resolve().then(() => (on(pathname, SPEAK_ON_OPEN) ? say() : setText(null)));
  }, [shown, pathname, say]);

  if (!shown || !pick) return null;
  return (
    <MascotBuddyView
      fixed
      pick={pick}
      mode={mode}
      text={text}
      onTap={say}
      onHush={() => {
        setText(null);
        talk.hush();
      }}
    />
  );
}

// 做了事情夥伴跳出來說一句（記錄完攀、Flash、破紀錄、連續爬、第一次留言），3 秒後收起；點一下也收起
// 解鎖新款式（攀岩角色）：多停一下（6 秒），點了到人物卡換上
export function MascotToast() {
  const { session } = useAuth();
  const router = useRouter();
  const uid = session?.user.id ?? null;
  const ev = useMascotEvent();
  const pick = useMascot(uid);
  const [mode] = useMascotMode();
  const [hidden, setHidden] = useState<number | null>(null);
  useEffect(() => {
    if (!ev) return;
    const t = setTimeout(() => setHidden(ev.at), ev.href ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [ev]);
  // 這支手機第一次：先記下現在的攀岩數字，之後記錄完才比得出新解鎖了什麼
  useEffect(() => {
    if (uid) void primeClimbStats(uid);
  }, [uid]);
  if (!ev || !pick || hidden === ev.at) return null;
  return (
    <MascotToastView
      key={ev.at}
      pick={pick}
      mode={mode}
      text={ev.text}
      party={ev.party}
      onClose={() => {
        setHidden(ev.at);
        if (ev.href) router.push(ev.href);
      }}
    />
  );
}
