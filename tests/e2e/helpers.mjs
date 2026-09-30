// 手機操作測試的共用工具
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { SB, createMock } from "./mock-supabase.mjs";

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

export { createMock };
