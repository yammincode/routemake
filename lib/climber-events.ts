"use client";

// 攀岩角色：記錄完看有沒有新解鎖的款式，有就讓夥伴跳出來說「解鎖新款式」，點了到人物卡換上
// 上一次的數字記在這支手機（routemake:climb-stats:使用者）；第一次只記下來不說（不知道之前是多少）
import { newlyUnlocked, type ClimbStats } from "./climber";
import { climberSupported, getClimbStats } from "./data";
import { lastEventAt, sayEvent } from "./mascot-store";

const key = (uid: string) => `routemake:climb-stats:${uid}`;
const read = (uid: string): ClimbStats | null => {
  try {
    return JSON.parse(localStorage.getItem(key(uid)) ?? "null") as ClimbStats | null;
  } catch {
    return null;
  }
};
const write = (uid: string, s: ClimbStats) => {
  try {
    localStorage.setItem(key(uid), JSON.stringify(s));
  } catch {}
};

// 這支手機還沒記過：先讀一次記下來（登入後打開 App 時；記過就不再讀，省流量）
export async function primeClimbStats(uid: string) {
  if (read(uid) || !climberSupported()) return;
  try {
    const s = await getClimbStats();
    if (s && !read(uid)) write(uid, s);
  } catch {}
}

// 記錄存好之後（沒網路排隊的不算：網路回來送出時不檢查）
export async function checkUnlocks(uid: string) {
  if (!climberSupported()) return;
  let next: ClimbStats | null;
  try {
    next = await getClimbStats();
  } catch {
    return;
  }
  if (!next) return;
  const prev = read(uid);
  // 記下來的只往上加：刪了紀錄又爬回來、兩次記錄的回覆順序顛倒，都不會再說一次已經說過的
  if (prev) next = { days: Math.max(prev.days, next.days), rope: Math.max(prev.rope, next.rope), flash: Math.max(prev.flash, next.flash), v5: Math.max(prev.v5, next.v5) };
  write(uid, next);
  if (!prev) return;
  const names = newlyUnlocked(prev, next);
  if (!names.length) return;
  // 剛記完攀夥伴正在說（完攀、破紀錄…，3 秒）：等那句說完再跳解鎖，不要蓋掉
  const wait = Math.max(0, lastEventAt() + 3000 - Date.now());
  const text = `🔓 解鎖新款式：${names.slice(0, 2).join("、")}${names.length > 2 ? " 等" : ""}！點這裡去換上`;
  setTimeout(() => sayEvent(text, true, "/card?edit=climber"), wait);
}
