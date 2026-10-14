"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getMascots } from "./data";
import { normalizePick, type MascotPick } from "./mascots";

// 每個人的夥伴（留言、影片、人物卡共用）：同一輪畫面要的人一起讀一次，讀過的記在記憶體
// 沒選、讀不到（沒網路、資料庫還沒套用 step41）都是預設的明德氂牛
const picks = new Map<string, MascotPick>();
const asked = new Set<string>();
const failed = new Set<string>(); // 讀不到（沒網路）：頭像先畫預設的氂牛，但編輯人物卡不能拿來當自己的夥伴
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
          picks.set(id, normalizePick(got[id]));
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
    notify();
  });
}

// 網路回來：之前讀不到的再讀一次
if (typeof window !== "undefined") window.addEventListener("online", () => [...failed].forEach(want));

// 還在讀回 null（頭像先畫空的圓，不要先閃一下氂牛再換）；沒有人（userId 空）就是預設
// 讀不到（沒網路）：頭像用預設的氂牛；exact（編輯自己的夥伴）照樣回 null，免得拿氂牛蓋掉真的夥伴
export function useMascot(userId: string | null | undefined, exact = false): MascotPick | null {
  useEffect(() => {
    if (userId) want(userId);
  }, [userId]);
  useSyncExternalStore(subscribe, () => version, () => 0);
  if (!userId) return normalizePick(null);
  return picks.get(userId) ?? (!exact && failed.has(userId) ? normalizePick(null) : null);
}
// 自己存了新的夥伴：馬上換掉畫面上所有自己的頭像
export function rememberMascot(userId: string, pick: MascotPick) {
  picks.set(userId, pick);
  asked.add(userId);
  notify();
}

// 幹話模式：記在這支手機，只影響自己看到的（所有夥伴加刀疤和棒棒糖、每天一句改成幹話）
const TROLL_KEY = "routemake:troll";
const readTroll = () => {
  try {
    return localStorage.getItem(TROLL_KEY) === "1";
  } catch {
    return false;
  }
};
export function useTroll(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readTroll, () => false);
  return [
    on,
    (v: boolean) => {
      try {
        if (v) localStorage.setItem(TROLL_KEY, "1");
        else localStorage.removeItem(TROLL_KEY);
      } catch {}
      notify();
    },
  ];
}
