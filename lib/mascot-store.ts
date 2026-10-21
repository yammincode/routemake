"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getMascots } from "./data";
import { normalizeClimber, type Climber } from "./climber";
import { normalizePick, type MascotMode, type MascotPick } from "./mascots";

// 每個人的夥伴和攀岩角色（留言、影片、人物卡共用）：同一輪畫面要的人一起讀一次，讀過的記在記憶體
// 夥伴沒選、讀不到（沒網路、資料庫還沒套用 step41）都是預設的高山猛牛；角色沒做（或還沒套用 step48）是 null
// 這次打開 App 讀過的記在 sessionStorage：重新整理、換頁不用重讀（省流量；別人換了，下次打開 App 就看到）
// （step48 起改存 routemake:people，連角色一起；舊的 routemake:mascots 沒有角色，不用）
const SAVED_KEY = "routemake:people";
const picks = new Map<string, MascotPick>();
const climbers = new Map<string, Climber | null>();
try {
  for (const [k, v] of Object.entries(JSON.parse(sessionStorage.getItem(SAVED_KEY) ?? "{}") as Record<string, { m?: unknown; c?: unknown }>)) {
    picks.set(k, normalizePick(v?.m));
    climbers.set(k, normalizeClimber(v?.c));
  }
} catch {}
const keep = () => {
  try {
    sessionStorage.setItem(SAVED_KEY, JSON.stringify(Object.fromEntries([...picks].map(([k, m]) => [k, { m, c: climbers.get(k) ?? null }]))));
  } catch {}
};
const asked = new Set<string>(picks.keys());
const failed = new Set<string>(); // 讀不到（沒網路）：頭像先畫預設的猛牛，但編輯人物卡不能拿來當自己的夥伴
let queue: string[] = [];
const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function want(userId: string) {
  if (asked.has(userId)) return;
  asked.add(userId);
  queue.push(userId);
  if (queue.length > 1) return;
  // 等這一輪畫面都登記完再一起讀（每次最多 80 人，網址不會太長）
  void Promise.resolve().then(async () => {
    const ids = queue;
    queue = [];
    for (let i = 0; i < ids.length; i += 80) {
      const part = ids.slice(i, i + 80);
      try {
        const got = await getMascots(part);
        for (const id of part) {
          picks.set(id, normalizePick(got[id]?.mascot));
          climbers.set(id, normalizeClimber(got[id]?.climber));
          failed.delete(id);
        }
      } catch {
        // 沒網路：記下來，網路回來再讀
        for (const id of part) {
          asked.delete(id);
          failed.add(id);
        }
      }
    }
    keep();
    notify();
  });
}

// 網路回來：之前讀不到的再讀一次
if (typeof window !== "undefined") window.addEventListener("online", () => [...failed].forEach(want));

// 還在讀回 null（頭像先畫空的圓，不要先閃一下猛牛再換）；沒有人（userId 空）就是預設
// 讀不到（沒網路）：頭像用預設的猛牛；exact（編輯自己的夥伴）照樣回 null，免得拿猛牛蓋掉真的夥伴
export function useMascot(userId: string | null | undefined, exact = false): MascotPick | null {
  useEffect(() => {
    if (userId) want(userId);
  }, [userId]);
  useSyncExternalStore(subscribe, () => version, () => 0);
  if (!userId) return normalizePick(null);
  return picks.get(userId) ?? (!exact && failed.has(userId) ? normalizePick(null) : null);
}
// 某個人的攀岩角色：undefined＝還在讀（或讀不到）；null＝沒做角色
export function useClimber(userId: string | null | undefined): Climber | null | undefined {
  useEffect(() => {
    if (userId) want(userId);
  }, [userId]);
  useSyncExternalStore(subscribe, () => version, () => 0);
  if (!userId) return null;
  return climbers.has(userId) ? climbers.get(userId) : undefined;
}
// 自己存了新的角色：馬上換掉畫面上所有自己的頭像
export function rememberClimber(userId: string, c: Climber | null) {
  climbers.set(userId, c);
  keep();
  notify();
}

// 自己存了新的夥伴：馬上換掉畫面上所有自己的頭像
export function rememberMascot(userId: string, pick: MascotPick) {
  picks.set(userId, pick);
  asked.add(userId);
  keep();
  notify();
}

// 夥伴風格（平常／幹話／文青）：記在這支手機，只影響自己看到的（夥伴的打扮、說的話）
// 以前的「幹話模式」開關記在 routemake:troll，開過的人自動當成選了幹話；改選之後就只看新的
const MODE_KEY = "routemake:mascot-mode";
const OLD_TROLL_KEY = "routemake:troll";
const readMode = (): MascotMode => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "troll" || v === "artsy" || v === "plain") return v;
    return localStorage.getItem(OLD_TROLL_KEY) === "1" ? "troll" : "plain";
  } catch {
    return "plain";
  }
};
export const mascotMode = readMode;
export function useMascotMode(): [MascotMode, (m: MascotMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => "plain" as const);
  return [
    mode,
    (m: MascotMode) => {
      try {
        localStorage.setItem(MODE_KEY, m);
        localStorage.removeItem(OLD_TROLL_KEY);
      } catch {}
      notify();
    },
  ];
}

// ---------- 夥伴說話：開關、今天閉嘴、頁面泡泡關掉、事件 ----------
// 「夥伴說話」關掉（人物卡開關）：一直不說；「🤫 閉嘴」：今天都不說（明天自動恢復）；都記在這支手機
const QUIET_KEY = "routemake:mascot-quiet";
const HUSH_KEY = "routemake:mascot-hush";
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
  notify();
};
const talkState = () => (read(QUIET_KEY) === "1" ? "quiet" : read(HUSH_KEY) === today() ? "hush" : "on");
// on＝會說話；hush＝今天閉嘴；quiet＝關掉了
export function useTalk(): { state: "on" | "hush" | "quiet"; setQuiet: (q: boolean) => void; hush: () => void } {
  const state = useSyncExternalStore(subscribe, talkState, () => "quiet" as const);
  return {
    state,
    setQuiet: (q) => {
      write(QUIET_KEY, q ? "1" : null);
      if (!q) write(HUSH_KEY, null);
    },
    hush: () => write(HUSH_KEY, today()),
  };
}

// 頁面上面的泡泡按 ✕：這次打開 App 不再出現（記在 sessionStorage，下次打開 App 又會說）
const CLOSED_KEY = "routemake:cheer-closed:";
export const pageClosed = (page: string) => {
  try {
    return sessionStorage.getItem(CLOSED_KEY + page) === "1";
  } catch {
    return false;
  }
};
export const closePage = (page: string) => {
  try {
    sessionStorage.setItem(CLOSED_KEY + page, "1");
  } catch {}
};

// 做了事情（記錄完攀、Flash、破紀錄…）：夥伴從上面跳出來說一句（MascotToast 接）
// href：點了跳過去（解鎖新款式「去換上」）
export type MascotEvent = { text: string; party: boolean; at: number; href?: string };
let lastEvent: MascotEvent | null = null;
export function sayEvent(text: string, party = false, href?: string) {
  if (talkState() !== "on") return;
  lastEvent = { text, party, at: Date.now(), href };
  notify();
}
// 上一句跳出來的時間（解鎖提示要等上一句說完再跳）
export const lastEventAt = () => lastEvent?.at ?? 0;
export const useMascotEvent = () => {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return lastEvent;
};
