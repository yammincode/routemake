// 入口頁 → 選擇攀岩館 → 館 → 區域，返回與上一頁；「‹ 選擇攀岩館」「‹ 館名」一定到那一頁；登入後回到原本的區域
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("入口頁、選館、返回都照順序", async () => {
  const mock = createMock();
  const { page, errors } = await phone(browser, mock);
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  assert.equal(await page.locator("nav").count(), 0, "入口頁不顯示分頁列");
  assert.ok(await page.isVisible('img[alt="原岩攀岩館 T-UP CLIMBING"]'), "入口頁有原岩 Logo");
  const version = fs.readFileSync(new URL("../../lib/version.ts", import.meta.url), "utf8").match(/VERSION = "([\d.]+)"/)[1];
  assert.equal(await page.locator("[data-app-version]").count(), 0, "版本號只有老闆看得到");
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const O = await phone(browser, mock);
  await login(O.page, "boss", "password1", "/");
  await O.page.goto(BASE + "/", { waitUntil: "networkidle" });
  await O.page.waitForTimeout(600);
  assert.equal(await O.page.textContent("[data-app-version]"), `v${version} 試用版`, "老闆在入口頁看得到版本號（不是 Netlify 建置的顯示試用版）");
  await O.page.goto(BASE + "/me", { waitUntil: "networkidle" });
  await O.page.waitForTimeout(600);
  assert.ok(await O.page.isVisible("[data-app-version]"), "老闆在我的紀錄也看得到");
  await O.ctx.close();

  await page.click('main a[href="/gyms"]');
  await page.waitForURL("**/gyms");
  const gyms = (await page.locator("main button[aria-pressed]").allTextContents()).map((s) => s.replace(/已上線|即將上線|大家一起出路線/, ""));
  assert.deepEqual(gyms, ["明德館", "萬華館", "中和館", "南港館", "新店館", "中壢館", "明德 SPRAY WALL", "南港 SPRAY WALL"], "六間館＋兩面 Spray Wall");
  assert.equal(await page.locator("main button[aria-pressed] img").count(), 8, "每一項都有 Logo");

  await page.click('main button:has-text("明德館")');
  await page.waitForURL("**/gym/mingde");
  await page.waitForTimeout(600);
  assert.equal(await page.textContent("main h1"), "今天爬哪一區？");

  await page.locator("main button", { hasText: "A1 區" }).first().click();
  await page.waitForURL("**/zone?id=**");
  await page.click('main button:has-text("明德館")');
  await page.waitForURL("**/gym/mingde");
  await page.goBack();
  await page.waitForURL("**/gyms");
  await page.goBack();
  await page.waitForURL(BASE + "/");

  await page.goto(BASE + "/gyms", { waitUntil: "networkidle" });
  await page.click('main button:has-text("中和館")');
  await page.waitForURL("**/gym/g3");
  await page.waitForTimeout(600);
  assert.equal(await page.textContent("main h1"), "今天爬哪一區？", "中和館已開放");
  assert.ok(await page.isVisible('svg[role=img][aria-label="中和館平面圖"]'), "中和館有平面圖");
  await page.locator('svg[role=img] g[aria-label^="速度牆"]').click();
  await page.waitForURL("**/zone?id=**");
  await page.waitForTimeout(400);
  assert.equal(await page.textContent("main h1"), "速度牆", "點平面圖進到速度牆");

  await page.goto(BASE + "/gym/g6", { waitUntil: "networkidle" });
  assert.match(await page.textContent("main strong"), /中壢館即將上線/);
  await page.goto(BASE + "/gym/g3", { waitUntil: "networkidle" });

  await page.goto(BASE + "/me", { waitUntil: "networkidle" });
  assert.equal(await page.getAttribute('nav a:has-text("館內路線")', "href"), "/gym/g3", "館內路線分頁記住上次選的館");
  await page.waitForTimeout(400);
  assert.ok((await page.textContent("main")).includes("中和館"), "我的紀錄頁首顯示上次選的館");
  assert.deepEqual(await page.locator("nav a").allTextContents(), ["館內路線", "人物卡", "我的紀錄"], "一般人看不到管理後台分頁");
  assert.deepEqual(errors, []);
});

const TITLE_UP = "「‹ 選擇攀岩館」「‹ 館名」一定到那一頁（從我的紀錄、換館、登入回來都對）；上一頁剛好是那頁才退回";
test(TITLE_UP, async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "A1");
  mock.addRoute(zA, 4, "藍", [], 50, 50);
  const { page, errors } = await phone(browser, mock);
  const up = 'main button:has-text("選擇攀岩館")';
  const histLen = () => page.evaluate(() => history.length);

  // 選館頁 → 館 → 選擇攀岩館：上一頁就是選館頁，退回去（不多疊一頁）
  await page.goto(BASE + "/gyms", { waitUntil: "networkidle" });
  await page.click('main button:has-text("明德館")');
  await page.waitForURL("**/gym/mingde");
  await page.waitForTimeout(400);
  const n = await histLen();
  await page.click(up);
  await page.waitForURL("**/gyms");
  assert.equal(await histLen(), n, "退回選館頁，不多一頁");

  // 我的紀錄 → 底部「館內路線」→ 選擇攀岩館：到選館頁（以前會退回我的紀錄）
  await page.goto(BASE + "/me", { waitUntil: "networkidle" });
  await page.click('nav a:has-text("館內路線")');
  await page.waitForURL("**/gym/mingde");
  await page.waitForTimeout(400);
  await page.click(up);
  await page.waitForURL("**/gyms");
  assert.equal(new URL(page.url()).pathname, "/gyms", "從我的紀錄進館，選擇攀岩館要到選館頁");

  // 右上角換到中和館 → 選擇攀岩館：到選館頁（以前會退回明德館）
  await page.click('main button:has-text("明德館")');
  await page.waitForURL("**/gym/mingde");
  await page.waitForTimeout(400);
  await page.click('main button:has-text("明德館"):has(img)');
  await page.click('[role=dialog] button:has-text("中和館")');
  await page.waitForURL("**/gym/g3");
  await page.waitForTimeout(400);
  await page.click(up);
  await page.waitForURL("**/gyms");
  assert.equal(new URL(page.url()).pathname, "/gyms", "換館後，選擇攀岩館要到選館頁");

  // 訪客在區域頁按 Flash → 登入 → 回到同一區；「‹ 明德館」回館首頁（以前會退回同一區）
  await page.goto(BASE + "/gym/mingde", { waitUntil: "networkidle" });
  await page.locator("main button", { hasText: "A1 區" }).first().click();
  await page.waitForURL("**/zone?id=**");
  await page.waitForTimeout(500);
  await page.click('main ul li button:has-text("藍色")');
  await page.click('[role=dialog] button:has-text("Flash")');
  await page.waitForURL("**/login?**");
  assert.equal(new URL(page.url()).searchParams.get("next"), "/zone?id=" + zA.id, "登入後要回到這一區（帶區域編號）");
  await page.fill("#username", "climber88");
  await page.fill("#password", "password1");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === "/zone");
  await page.waitForTimeout(800);
  assert.equal(new URL(page.url()).searchParams.get("id"), zA.id);
  assert.equal(await page.textContent("main h1"), "A1 區", "登入後回到同一區");
  await page.click('main button:has-text("明德館")');
  await page.waitForURL("**/gym/mingde");
  assert.equal(await page.textContent("main h1"), "今天爬哪一區？", "‹ 明德館 回到館首頁");
  assert.deepEqual(errors, []);

  // 舊手機（沒有 Navigation API）：一樣到選館頁
  const O = await phone(browser, mock);
  await O.ctx.addInitScript(() => Object.defineProperty(window, "navigation", { value: undefined, configurable: true }));
  await O.page.goto(BASE + "/gyms", { waitUntil: "networkidle" });
  await O.page.click('main button:has-text("明德館")');
  await O.page.waitForURL("**/gym/mingde");
  await O.page.waitForTimeout(400);
  assert.equal(await O.page.evaluate(() => window.navigation), undefined);
  await O.page.click(up);
  await O.page.waitForURL("**/gyms");
  assert.deepEqual(O.errors, []);
  await O.ctx.close();
});

test("找不到頁面、畫面出錯：中文說明，不是英文白畫面", async () => {
  const mock = createMock();
  const { page } = await phone(browser, mock);
  for (const path of ["/no-such-page", "/gym/nope"]) {
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
    assert.equal(res.status(), 404, path);
    assert.ok((await page.textContent("main")).includes("找不到這個頁面"), `${path} 顯示中文`);
  }
  await page.click('main button:text-is("回到選擇攀岩館")');
  await page.waitForURL("**/gyms");

  // 資料壞掉讓畫面出錯：顯示「出了點問題」和「重新整理」「回報問題」
  const zA = mock.db.zones[0];
  mock.addRoute(zA, 3, "藍", [], 50, 50).style_tags = null;
  await page.goto(BASE + "/zone?id=" + zA.id, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const main = await page.textContent("main");
  assert.ok(main.includes("出了點問題") && !/Application error|client-side exception/.test(main), "中文錯誤畫面");
  assert.ok(await page.isVisible('main button:text-is("重新整理")'));
  await page.click('main button:text-is("回報問題")');
  await page.waitForURL("**/feedback");
});
