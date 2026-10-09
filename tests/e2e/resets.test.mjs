// 換線日：老闆輸入（勾區域、名稱自動帶）→ 選館頁、換線行事曆、館首頁區域卡片都更新；授權別人輸入；沒權限的人看不到
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("換線日：老闆輸入 → 選館頁、行事曆、館首頁卡片都更新，即將換線拿掉；修改、刪除（按兩次）", async () => {
  const mock = createMock();
  mock.addUser("owner1", "password1", { nickname: "老闆", is_owner: true });
  const zone = (code) => mock.db.zones.find((z) => z.gym_id === "g2" && z.code === code);
  mock.addRoute(zone("C1"), 3, "藍");

  const O = await phone(browser, mock);
  const o = O.page;
  await login(o, "owner1", "password1", "/admin");
  await o.waitForTimeout(800);
  await o.click('main button:has-text("換線日")');
  await o.waitForURL("**/admin/resets");
  await o.waitForTimeout(600);
  await o.click('main button[aria-pressed]:text-is("萬華館")');
  await o.waitForTimeout(300);
  await o.click('main button:has-text("新增萬華館換線日")');
  const sheet = o.locator("[role=dialog]");
  await sheet.waitFor();
  await sheet.locator('button[aria-pressed]:text-is("C1 區")').click();
  await sheet.locator('button[aria-pressed]:text-is("C2 區")').click();
  assert.equal(await o.inputValue("#rlabel"), "C 區", "勾 C1、C2 名稱自動變 C 區");
  await o.fill("#rstart", taipeiDay(3));
  await o.fill("#rend", taipeiDay(4));
  await sheet.locator('button:text-is("儲存")').click();
  await o.waitForTimeout(800);
  assert.equal(mock.db.resetEvents.length, 1);
  const ev = mock.db.resetEvents[0];
  assert.deepEqual([ev.label, ev.starts_on, ev.ends_on, ev.zone_ids.length], ["C 區", taipeiDay(3), taipeiDay(4), 2]);
  assert.equal(zone("C1").next_reset_on, taipeiDay(3), "區域的下次換線日一起更新");
  assert.ok((await o.textContent("main")).includes("C1 區、C2 區"), "列表寫包含哪幾區");

  // 選館頁（沒登入的人也看得到）
  const G = await phone(browser, mock);
  const g = G.page;
  await g.goto(BASE + "/gyms", { waitUntil: "networkidle" });
  await g.waitForTimeout(600);
  const row = g.locator("main button[aria-pressed]", { hasText: "萬華館" });
  assert.match((await row.textContent()).replace(/\s+/g, ""), /3天後換線・C區/, "選館頁寫幾天後換線");
  assert.ok(!(await row.textContent()).includes("已上線"), "不再寫已上線");

  // 換線行事曆
  await g.click('main a:has-text("看各館換線日")');
  await g.waitForURL("**/resets");
  await g.waitForTimeout(800);
  const bar = g.locator('main button[aria-label^="萬華館 C 區"]').first();
  assert.ok(await bar.count(), "月曆上有萬華 C 區的色塊");
  await bar.click();
  await g.waitForTimeout(300);
  const detail = (await g.textContent("main")).replace(/\s+/g, "");
  assert.ok(detail.includes("萬華館C區") && detail.includes("晚上起新路線"), "點色塊看那天的細節");
  await g.click('main button[aria-pressed]:has-text("明德")');
  await g.waitForTimeout(300);
  assert.equal(await g.locator('main button[aria-label^="萬華館 C 區"]').count(), 0, "只看明德館時萬華的色塊不見");

  // 館首頁：區域卡片寫換線，沒有「即將換線」
  await g.goto(BASE + "/gym/g2", { waitUntil: "networkidle" });
  await g.waitForTimeout(800);
  const card = (name) => g.locator("main button.rounded-card", { hasText: name });
  assert.match(await card("C1 區").textContent(), /換線・3 天後/, "C1 卡片寫換線日");
  assert.match(await card("C2 區").textContent(), /換線・3 天後/, "同一筆公告的 C2 也寫");
  assert.ok(!(await card("D1 區").textContent()).includes("換線"), "沒換線的區不寫");
  assert.ok(!(await g.textContent("main")).includes("即將換線"), "即將換線整段拿掉");

  // 修改、刪除
  await o.click('main button:text-is("修改")');
  await sheet.waitFor();
  await o.fill("#rend", taipeiDay(5));
  await sheet.locator('button:text-is("儲存")').click();
  await o.waitForTimeout(800);
  assert.equal(mock.db.resetEvents[0].ends_on, taipeiDay(5));
  await o.click('main button:text-is("刪除")');
  await o.waitForTimeout(200);
  assert.equal(mock.db.resetEvents.length, 1, "刪除要按兩次");
  await o.click('main button:text-is("確定刪除？再按一次")');
  await o.waitForTimeout(800);
  assert.equal(mock.db.resetEvents.length, 0);
  assert.equal(zone("C1").next_reset_on, null, "刪掉公告，區域的換線日清空");
  assert.ok(mock.db.audit.some((a) => a.action === "reset.delete"), "寫操作紀錄");
  assert.deepEqual([...O.errors, ...G.errors], []);
});

test("換線日權限：顧客不能輸入；老闆授權後可以，取消後不行", async () => {
  const mock = createMock();
  mock.addUser("owner1", "password1", { nickname: "老闆", is_owner: true });
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });

  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", "/admin/resets");
  await c.waitForTimeout(800);
  assert.ok((await c.textContent("main")).includes("換線日由老闆統一輸入"), "顧客看到說明");
  assert.equal(await c.locator('main button:has-text("新增")').count(), 0);
  assert.equal(await c.locator('nav a:has-text("管理後台")').count(), 0, "顧客沒有管理後台分頁");

  const O = await phone(browser, mock);
  const o = O.page;
  await login(o, "owner1", "password1", "/admin/resets");
  await o.waitForTimeout(800);
  await o.fill("#rsearch", "climber");
  await o.waitForTimeout(800);
  await o.click('main button:has-text("小安")');
  await o.waitForTimeout(600);
  assert.deepEqual(mock.db.resetEditors, [me], "老闆授權小安");
  assert.ok((await o.textContent("main")).includes("帳號 climber88"), "授權名單出現");

  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(800);
  assert.equal(await c.locator('nav a:has-text("管理後台")').count(), 1, "被授權後有管理後台分頁");
  await c.click('nav a:has-text("管理後台")');
  await c.waitForURL("**/admin");
  await c.waitForTimeout(600);
  await c.click('main button:has-text("換線日")');
  await c.waitForURL("**/admin/resets");
  await c.waitForTimeout(600);
  await c.click('main button:has-text("新增")');
  const sheet = c.locator("[role=dialog]");
  await sheet.waitFor();
  await sheet.locator('button[aria-pressed]').first().click();
  await c.fill("#rstart", taipeiDay(7));
  await c.fill("#rend", taipeiDay(7));
  await sheet.locator('button:text-is("儲存")').click();
  await c.waitForTimeout(800);
  assert.equal(mock.db.resetEvents.length, 1, "被授權的人可以新增");

  await o.click('main button:text-is("取消權限")');
  await o.click('main button:text-is("確定取消？再按一次")');
  await o.waitForTimeout(600);
  assert.deepEqual(mock.db.resetEditors, []);
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(800);
  assert.ok((await c.textContent("main")).includes("換線日由老闆統一輸入"), "取消後不能輸入");
  assert.deepEqual([...C.errors, ...O.errors], []);
});

test("選館頁：換線中、剛換好（NEW）、Spray Wall 那一列各自寫；沒有公告的館不寫", async () => {
  const mock = createMock();
  mock.addReset("mingde", "比賽牆", ["W1", "W2", "W3", "W4"], -2, -1);
  mock.addReset("mingde", "D 區", ["D1", "D2"], 3);
  mock.addReset("g3", "抱石區", ["BO"], 0, 1);
  mock.addReset("mingde", "Spray wall", ["S"], 20, 21);
  const { page, errors } = await phone(browser, mock);
  await page.goto(BASE + "/gyms", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const row = async (name) => (await page.locator("main button[aria-pressed]", { hasText: name }).first().textContent()).replace(/\s+/g, "");
  const mingde = await row("明德館");
  assert.ok(mingde.includes("比賽牆新路線") && mingde.includes("NEW"), "剛換好的寫新路線＋NEW");
  assert.ok(mingde.includes("3天後換線・D區"), "之後的換線");
  assert.ok(!mingde.includes("Spray"), "Spray Wall 的換線不寫在明德館那一列");
  assert.ok((await row("中和館")).includes("換線中・抱石區"), "換線中");
  assert.ok((await row("明德 SPRAY WALL")).includes("20天後換線"), "Spray Wall 那一列寫自己的換線");
  assert.equal(await row("萬華館"), "萬華館", "沒有公告的館不寫");
  assert.deepEqual(errors, []);
});
