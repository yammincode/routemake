"use client";

// 離線支援：
// 1. 上次讀到的資料存在手機，沒網路時先顯示（只是方便用，真正的資料都在 Supabase）
// 2. 沒網路時儲存的紀錄先排隊，連上網路後自動送出

import { useSyncExternalStore } from "react";
import { NETWORK_RE } from "./net";

const PREFIX = "routemake-cache:";
const QUEUE_KEY = "routemake-pending";
// 分享影片時記住的身高（每個帳號一個），登出時一起清掉
export const HEIGHT_KEY_PREFIX = "routemake:video-height:";

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

// 送不出去、之後可以再送一次的錯誤：沒網路、伺服器暫時出錯、登入憑證過期（不是權限或資料錯誤）
// lib/data.ts 的錯誤帶 retry；其他（例如登入）看訊息
export const isNetworkError = (e: unknown) =>
  (typeof navigator !== "undefined" && !navigator.onLine) ||
  (e as { retry?: boolean })?.retry === true ||
  /連不上網路/.test((e as Error)?.message ?? "") ||
  NETWORK_RE.test((e as Error)?.message ?? "");

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
// 手機裡有沒有這份資料（不用讀出來，例如沒網路時判斷能不能換到那一區）
export function hasCache(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) != null;
  } catch {
    return false;
  }
}

// 登出時清掉個人資料快取（含記住的身高）
// keepQueue：登入自己失效（不是按登出）時，還沒送出的紀錄留著，同一個人再登入後照樣送出
export function clearCache(keepQueue = false) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX) || (k === QUEUE_KEY && !keepQueue) || k.startsWith(HEIGHT_KEY_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  emit();
}

// ---------- 待送出的紀錄 ----------
export type PendingAscent = {
  userId: string;
  routeId: string;
  // null = 清除紀錄；highpoint：長耐力最高爬到第幾點（其他路線沒有）
  ascent: { status: string; climbed_on: string; feel: number | null; grade_feel: number | null; private_note: string | null; highpoint?: number | null } | null;
};

export const getPending = () => read<PendingAscent[]>(QUEUE_KEY) ?? [];
// 這個人還沒送出的筆數（換別人登入時，前一個人排隊的不算、也不會送出）
export const pendingCountFor = (userId: string | undefined) => (userId ? getPending().filter((p) => p.userId === userId).length : 0);

export function queueAscent(p: PendingAscent) {
  // 同一條路線只留最後一次
  write(QUEUE_KEY, [...getPending().filter((x) => !(x.userId === p.userId && x.routeId === p.routeId)), p]);
  emit();
}

let flushing = false;
export type FlushResult = { sent: number; dropped: number; reason: string | null; stuck: boolean };
// 依序送出目前登入的人排隊的紀錄
// - 沒網路、伺服器暫時出錯、登入憑證過期：留著，下次再送（stuck＝還有沒送出的）
// - 資料庫明確說存不進去（例如日期不合法、路線已下架）：再送也一樣，丟掉並告訴畫面（dropped、reason）
export async function flushPending(userId: string | undefined, send: (p: PendingAscent) => Promise<void>): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, dropped: 0, reason: null, stuck: false };
  if (!userId || flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return result;
  flushing = true;
  const done = (p: PendingAscent) => write(QUEUE_KEY, getPending().filter((x) => !(x.userId === p.userId && x.routeId === p.routeId)));
  try {
    for (const p of getPending().filter((x) => x.userId === userId)) {
      try {
        await send(p);
        done(p);
        result.sent++;
      } catch (e) {
        if (isNetworkError(e)) {
          result.stuck = true;
          break;
        }
        done(p);
        result.dropped++;
        result.reason ??= (e as Error)?.message ?? null;
      }
    }
  } finally {
    flushing = false;
    emit();
  }
  return result;
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
export const usePendingCount = (userId: string | undefined) => useSyncExternalStore(subscribe, () => pendingCountFor(userId), () => 0);

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
