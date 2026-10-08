// 我的紀錄（月統計、積分）與計分規則；日期都用「相對今天」，不會過期
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createMock, launch, login, phone } from "./helpers.mjs";
import { taipeiDay } from "./mock-supabase.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("我的紀錄：統計、積分、成長比較、改計分規則後重算", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const zA = mock.db.zones[0];
  const created = new Date(Date.now() - 90 * 86400000).toISOString();
  const r4 = mock.addRoute(zA, 4, "藍", ["動態", "指力"], 30, 40, created); // 50 分
  const r2 = mock.addRoute(zA, 2, "紅", [], 60, 50, created); // 20 分
  const r3 = mock.addRoute(zA, 3, "綠", ["技巧"], 20, 70, created); // 32 分，Flash 38
  const r6 = mock.addRoute(zA, 6, "黃", ["力量", "動態", "指力", "耐力"], 80, 30, created); // 上限 30% → 91
  mock.addAscent(me, r4, "flash", taipeiDay(0), { private_note: "今天 Flash" }); // 60
  mock.addAscent(me, r2, "send", taipeiDay(-1)); // 20

  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(800);
  const rows = (await page.locator("main ul li").allTextContents()).map((t) => t.replace(/\s+/g, ""));
  assert.ok(rows.some((t) => t.includes("A1-0150分")) && rows.some((t) => t.includes("A1-0332分")) && rows.some((t) => t.includes("A1-0491分")), "路線分數（含風格加成上限）");

  await page.goto(page.url().replace(/\/zone.*/, "/me"), { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const tiles = async () => (await page.locator("main .grid-cols-4").nth(1).locator("> div").allTextContents()).join("｜");
  assert.ok((await tiles()).startsWith("60今天"), "今天 60 分：" + (await tiles()));
  assert.ok((await tiles()).includes("2連續天數"), "連續 2 天");
  assert.ok((await page.textContent("main")).includes("今天比最近 7 天平均"), "成長比較");
  assert.ok((await page.locator('main [role=group] button[aria-label$=" 60 分"]').count()) === 1, "每日積分長條圖有今天");
  assert.ok((await page.locator("main ul li").allTextContents()).some((t) => t.includes("+60分") && t.includes("今天 Flash")), "本月完攀列表含得分與心得");

  await page.click('button[aria-label="上個月"]');
  await page.waitForTimeout(800);
  assert.equal(await page.isDisabled('button[aria-label="下個月"]'), false, "上個月可以再回來");

  // 老闆改計分規則
  const B = await phone(browser, mock);
  await login(B.page, "boss", "password1", "/admin");
  await B.page.waitForTimeout(1500);
  assert.match(await B.page.locator("text=例：V4").textContent(), /完攀 50 分、Flash 60 分/);
  await B.page.fill("#flashx", "1.5");
  await B.page.locator("label", { hasText: "V4" }).locator("input").fill("50");
  await B.page.waitForTimeout(200);
  assert.match(await B.page.locator("text=例：V4").textContent(), /完攀 63 分、Flash 94 分/);
  await B.page.click("text=儲存計分規則");
  await B.page.waitForTimeout(500);
  assert.equal(mock.db.scoring.flash_multiplier, 1.5);

  await page.goto(page.url(), { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  assert.ok((await tiles()).startsWith("94今天"), "改規則後重算：" + (await tiles()));
  assert.deepEqual([...errors, ...B.errors], []);
});

test("「嘗試中」之後完攀：日期改成今天、分數算今天；清除紀錄要按兩次", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones[0];
  const r4 = mock.addRoute(zA, 4, "藍", [], 50, 50);
  const r2 = mock.addRoute(zA, 2, "紅", [], 20, 30);
  mock.addAscent(me, r4, "project", taipeiDay(-6), { private_note: "卡在最後一手" });
  mock.addAscent(me, r2, "project", taipeiDay(-3));
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(800);
  const asc = (r) => mock.db.ascents.find((a) => a.route_id === r.id);

  // 上週試過、今天爬完：日期要改成今天（不然分數記到第一次嘗試那天）
  await page.locator("main ul li button", { hasText: "藍色" }).click();
  await page.click('[role=dialog] button:has-text("完攀")');
  await page.waitForTimeout(600);
  assert.equal(asc(r4).status, "send");
  assert.equal(asc(r4).climbed_on, taipeiDay(0), "嘗試中改成完攀，日期是今天");
  assert.equal(asc(r4).private_note, "卡在最後一手", "心得保留");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 嘗試中改成 Flash：一樣記今天，並提醒試過幾次一般記完攀
  await page.locator("main ul li button", { hasText: "紅色" }).click();
  await page.click('[role=dialog] button:has-text("Flash")');
  await page.waitForTimeout(600);
  assert.equal(asc(r2).climbed_on, taipeiDay(0));
  assert.match(await page.locator("[role=status]").last().textContent(), /一般記「完攀」/);

  // 已經是完攀的紀錄再改狀態：日期不變（是更正，不是新的一次）
  mock.addAscent(me, mock.addRoute(zA, 3, "綠", [], 70, 60), "send", taipeiDay(-2));
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator("main ul li button", { hasText: "綠色" }).click();
  await page.click('[role=dialog] button:has-text("Flash")');
  await page.waitForTimeout(600);
  assert.equal(mock.db.ascents.find((a) => a.status === "flash" && a.climbed_on === taipeiDay(-2))?.status, "flash", "完攀改 Flash 日期不變");

  // 清除紀錄要按兩次
  await page.click('[role=dialog] button:text-is("清除紀錄")');
  await page.waitForTimeout(300);
  assert.equal(mock.db.ascents.length, 3, "按一次還沒清除");
  assert.ok(await page.isVisible('[role=dialog] button:has-text("確定清除？心得也會一起刪掉，再按一次")'));
  await page.click('[role=dialog] button:has-text("確定清除？")');
  await page.waitForTimeout(600);
  assert.equal(mock.db.ascents.length, 2, "按第二次才清除");
  assert.deepEqual(errors, []);
});
