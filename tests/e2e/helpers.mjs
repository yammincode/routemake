// 手機操作測試的共用工具
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { SB, createMock, taipeiDay } from "./mock-supabase.mjs";

export const BASE = process.env.BASE_URL ?? "http://localhost:3100";
export const WALL = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "wall.png");
export const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

// 找得到的 Chromium（CHROME_PATH → 雲端環境預裝 → playwright 下載的）
function chromePath() {
  const candidates = [process.env.CHROME_PATH, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"];
  return candidates.find((p) => p && fs.existsSync(p));
}

export async function launch() {
  const executablePath = chromePath();
  return chromium.launch(executablePath ? { executablePath } : {});
}

// 手機尺寸的瀏覽器，Supabase 由模擬程式回應；回傳頁面與收集到的錯誤
export async function phone(browser, mock, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ...opts });
  await ctx.route(SB + "/**", mock.handler);
  // 預設不跳出加到主畫面教學（需要時測試自己清掉）
  if (!opts.showInstall) await ctx.addInitScript(() => localStorage.setItem("routemake-install-seen", "1"));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (c) => {
    const t = c.text();
    if ((c.type() === "error" && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/i.test(t)) || /Content Security Policy/.test(t)) errors.push(t);
  });
  return { ctx, page, errors };
}

export async function login(page, username, password = "password1", next) {
  await page.goto(`${BASE}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, { waitUntil: "networkidle" });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.waitForTimeout(600);
}

export { createMock, taipeiDay };

// 我的紀錄「本月完攀」直條圖：點某個難度那一根（例如 "V2"、"5.11"），下面才會列出這個難度的路線
export async function monthGrade(page, label) {
  await page.locator(`main button[aria-label^="${label}，"]`).click();
  await page.waitForTimeout(300);
}

// 平面圖畫法（立體是預設）：要測平面圖的形狀、字級時，先指定用平面
export const planMode = (ctx, mode) => ctx.addInitScript((m) => localStorage.setItem("routemake-plan-mode", m), mode);

// 手指（Chrome 的觸控事件，跟真的手指一樣會捲動頁面、捲篩選列）：phone(..., { hasTouch: true }) 開的頁面才有觸控
// down／move／up 一步一步來（要在滑到一半時檢查畫面用）；two：再放第二根手指（兩指縮放）；cancel：系統手勢打斷；
// wait(ms)：手指停著不動 ms 毫秒。每個觸控事件的時間照 step（毫秒）一格一格算，不受電腦快慢影響（速度判斷才穩定）
export async function finger(page, { step = 16 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  let at = null;
  let clock = Date.now();
  const send = (type, pts) => {
    clock += step;
    return cdp.send("Input.dispatchTouchEvent", { type, timestamp: clock / 1000, touchPoints: pts.map(([x, y], i) => ({ x: Math.round(x), y: Math.round(y), id: i + 1 })) });
  };
  return {
    down: async (x, y) => send("touchStart", [(at = [x, y])]),
    move: async (x, y, extra = []) => {
      await send("touchMove", [(at = [x, y]), ...extra]);
      await page.waitForTimeout(8);
    },
    two: async (x, y) => send("touchStart", [at, [x, y]]),
    up: async () => send("touchEnd", []),
    cancel: async () => send("touchCancel", []),
    wait: async (ms) => {
      clock += ms;
      await page.waitForTimeout(ms);
    },
    done: () => cdp.detach(),
  };
}
// 從 from 滑到 to（畫面座標）：steps 次移動，每次 ms 毫秒（預設 8 次 × 16ms，約 0.13 秒滑完，算是正常速度）；hold：先按住多久才開始滑
export async function swipe(page, from, to, { steps = 8, ms = 16, hold = 0 } = {}) {
  const f = await finger(page, { step: ms });
  await f.down(...from);
  if (hold) await f.wait(hold);
  for (let i = 1; i <= steps; i++) await f.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
  await f.up();
  await f.done();
}
