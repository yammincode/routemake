"use client";

// 離線支援：
// 1. 上次讀到的資料存在手機，沒網路時先顯示（只是方便用，真正的資料都在 Supabase）
// 2. 沒網路時儲存的紀錄先排隊，連上網路後自動送出

import { useSyncExternalStore } from "react";

const PREFIX = "routemake-cache:";
const QUEUE_KEY = "routemake-pending";

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

// 網路錯誤（而不是權限或資料錯誤）
export const isNetworkError = (e: unknown) =>
  (typeof navigator !== "undefined" && !navigator.onLine) || /連不上網路|fetch|network|load failed/i.test((e as Error)?.message ?? "");

// 先抓最新資料並存起來；抓不到（離線）就用上次存的
// 有 onCached 時，手機裡有上次的資料就先交給畫面顯示（不用等網路），抓到最新的再更新
export async function withCache<T>(key: string, fetcher: () => Promise<T>, onCached?: (data: T) => void): Promise<{ data: T; stale: boolean }> {
  if (onCached) {
    const cached = read<T>(PREFIX + key);
    if (cached != null) onCached(cached);
  }
  try {
    const data = await fetcher();
    write(PREFIX + key, data);
    return { data, stale: false };
  } catch (e) {
    const cached = read<T>(PREFIX + key);
    if (cached != null && isNetworkError(e)) return { data: cached, stale: true };
    throw e;
  }
}

// 直接拿手機裡上次的資料（沒有就 null），畫面一打開就能先畫出來
export function peekCache<T>(key: string): T | null {
  return read<T>(PREFIX + key);
}

// 登出時清掉個人資料快取
export function clearCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX) || k === QUEUE_KEY)
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}

// ---------- 待送出的紀錄 ----------
export type PendingAscent = {
  userId: string;
  routeId: string;
  ascent: { status: string; climbed_on: string; feel: number | null; grade_feel: number | null; private_note: string | null } | null; // null = 清除紀錄
};

export const getPending = () => read<PendingAscent[]>(QUEUE_KEY) ?? [];

export function queueAscent(p: PendingAscent) {
  // 同一條路線只留最後一次
  write(QUEUE_KEY, [...getPending().filter((x) => !(x.userId === p.userId && x.routeId === p.routeId)), p]);
  emit();
}

let flushing = false;
// 依序送出；送不出去的留著下次再送。回傳送出幾筆
export async function flushPending(send: (p: PendingAscent) => Promise<void>): Promise<number> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const p of getPending()) {
      try {
        await send(p);
        write(QUEUE_KEY, getPending().filter((x) => !(x.userId === p.userId && x.routeId === p.routeId)));
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        // 資料錯誤（例如日期不合法）就丟掉，避免永遠卡住
        write(QUEUE_KEY, getPending().filter((x) => !(x.userId === p.userId && x.routeId === p.routeId)));
      }
    }
  } finally {
    flushing = false;
    emit();
  }
  return sent;
}

// ---------- 讓畫面知道連線狀態、待送筆數 ----------
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("online", l);
  window.addEventListener("offline", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("online", l);
    window.removeEventListener("offline", l);
  };
}
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
export const usePendingCount = () => useSyncExternalStore(subscribe, () => getPending().length, () => 0);

// 把還沒送出的紀錄疊到畫面上，讓離線記的紀錄馬上看得到
export function overlayPending<A extends { route_id: string }>(map: Record<string, A>, uid: string | undefined): Record<string, A> {
  if (!uid) return map;
  const out = { ...map };
  for (const p of getPending()) {
    if (p.userId !== uid) continue;
    if (p.ascent) out[p.routeId] = { ...(out[p.routeId] ?? {}), id: out[p.routeId]?.["id" as keyof A] ?? "", route_id: p.routeId, ...p.ascent } as unknown as A;
    else delete out[p.routeId];
  }
  return out;
}
