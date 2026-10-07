// 入口頁 → 選擇攀岩館 → 館 → 區域，返回與上一頁
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
