// 離線使用、離線紀錄自動送出、Service Worker 不存個人資料、雙指放大、LINE、加到主畫面、QR code
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, IPHONE_UA, createMock, launch, login, phone } from "./helpers.mjs";
import fs from "node:fs";
import { WALL } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

function seed(mock) {
  const zA = mock.db.zones[0];
  mock.db.files["mingde/zones/A-1.jpg"] = fs.readFileSync(WALL);
  zA.photo_path = "mingde/zones/A-1.jpg";
  mock.addRoute(zA, 2, "紅", [], 20, 30);
  mock.addRoute(zA, 4, "藍", [], 60, 50);
  return zA;
}

test("離線：看路線、記錄排隊、連線後送出；快取裡沒有 Supabase 個人資料", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = seed(mock);
  const { page, ctx, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/gym/mingde", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const cached = await page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) out.push(req.url);
    return out;
  });
  assert.ok(!cached.some((u) => /supabase\.co\/(rest|auth)\//.test(u)), "Service Worker 快取不能有 Supabase 資料：" + cached.filter((u) => u.includes("supabase")).join(", "));

  mock.state.offline = true;
  await ctx.setOffline(true);
  await page.goto(BASE + "/zone?id=" + zA.id);
  await page.waitForTimeout(1500);
  assert.equal(await page.textContent("h1"), "A1 區", "離線打得開區域頁");
  assert.match(await page.locator("[role=status]").first().textContent(), /沒有網路/);
  await page.click('main button[aria-label^="V4"]');
  await page.click('[role=dialog] button:has-text("Flash")');
  await page.waitForTimeout(500);
  assert.equal(mock.db.ascents.length, 0, "離線時還沒送出");
  assert.match((await page.locator("[role=status]").allTextContents()).join(" "), /1 筆紀錄會在連上網路後送出/);

  mock.state.offline = false;
  await ctx.setOffline(false);
  await page.waitForTimeout(3000);
  assert.equal(mock.db.ascents.length, 1, "連線後自動送出");
  assert.deepEqual(errors, []);
});

test("照片雙指放大、還原", async () => {
  const mock = createMock();
  const zA = seed(mock);
  const { page, errors } = await phone(browser, mock, { hasTouch: true });
  await page.goto(BASE + "/zone?id=" + zA.id, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const wall = page.locator("main div.overflow-hidden.rounded-tile").first();
  await wall.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bb = await wall.boundingBox();
  const before = await page.locator('main button[aria-label^="V4"]').boundingBox();
  await wall.evaluate((el, { cx, cy }) => {
    const ev = (type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
    ev("pointerdown", 1, cx - 40, cy);
    ev("pointerdown", 2, cx + 40, cy);
    for (let i = 1; i <= 10; i++) { ev("pointermove", 1, cx - 40 - i * 8, cy); ev("pointermove", 2, cx + 40 + i * 8, cy); }
    ev("pointerup", 1, cx - 120, cy);
    ev("pointerup", 2, cx + 120, cy);
  }, { cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 });
  await page.waitForTimeout(300);
  assert.match(await wall.evaluate((el) => el.firstElementChild.style.transform), /scale\(3\)/);
  const afterBox = await page.locator('main button[aria-label^="V4"]').boundingBox();
  assert.equal(Math.round(afterBox.width), Math.round(before.width), "標記大小不變");
  await page.click('main button:text-is("還原")');
  await page.waitForTimeout(200);
  assert.match(await wall.evaluate((el) => el.firstElementChild.style.transform), /scale\(1\)/);
  assert.deepEqual(errors, []);
});

test("LINE 內建瀏覽器改用外部瀏覽器；iPhone 第一次顯示加到主畫面", async () => {
  const mock = createMock();
  const L = await phone(browser, mock, { userAgent: IPHONE_UA + " Line/14.3.0", showInstall: true });
  await L.page.goto(BASE + "/gym/mingde", { waitUntil: "networkidle" });
  await L.page.waitForTimeout(2200);
  assert.ok(L.page.url().includes("openExternalBrowser=1"));
  assert.equal(await L.page.textContent("[role=dialog] h2"), "請用瀏覽器開啟");

  const I = await phone(browser, mock, { userAgent: IPHONE_UA, showInstall: true });
  await I.page.goto(BASE + "/gym/mingde", { waitUntil: "networkidle" });
  await I.page.waitForTimeout(2200);
  assert.equal(await I.page.textContent("[role=dialog] h2"), "加到主畫面");
  await I.page.click("[role=dialog] >> text=我知道了");
  await I.page.reload({ waitUntil: "networkidle" });
  await I.page.waitForTimeout(2200);
  assert.ok(!(await I.page.isVisible("[role=dialog]")), "第二次不再跳出");
  await I.page.goto(BASE + "/me", { waitUntil: "networkidle" });
  await I.page.click("text=怎麼加到主畫面？");
  await I.page.waitForTimeout(400);
  assert.equal(await I.page.textContent("[role=dialog] h2"), "加到主畫面");
  assert.deepEqual([...L.errors, ...I.errors], []);
});

test("櫃檯 QR code", async () => {
  const mock = createMock();
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const { page, errors } = await phone(browser, mock);
  await login(page, "boss", "password1", "/admin");
  await page.waitForTimeout(1500);
  const qr = page.locator('img[alt="原岩路線 QR code"]');
  await qr.scrollIntoViewIfNeeded();
  assert.ok(await qr.isVisible());
  assert.ok((await page.textContent("main")).includes("/?openExternalBrowser=1"));
  assert.deepEqual(errors, []);
});
