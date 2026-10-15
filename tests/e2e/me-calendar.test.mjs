// 我的紀錄「攀爬日」：格子下方館色點、點日期看那天在哪一館、完攀幾條、難度，「看路線 ›」列出路線、點了打開路線卡片
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createMock, launch, login, phone } from "./helpers.mjs";
import { taipeiDay } from "./mock-supabase.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("我的紀錄：攀爬日點日期，看那天在哪一館、完攀幾條、難度、積分，按看路線列出路線；換月份收起來", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = (gym, code) => mock.db.zones.find((z) => z.gym_id === gym && z.code === code);
  const created = new Date(Date.now() - 90 * 86400000).toISOString();
  const route = (gym, code, grade, color) => mock.addRoute(zone(gym, code), grade, color, [], 30, 40, created);
  const today = taipeiDay(0);
  const [y, m, d] = today.split("-").map(Number);
  // 今天：明德 V2 兩條（一條 Flash）、V4 一條（有心得），萬華 V7 一條；明德 Spray Wall 岩友路線不算條數但照樣列出來
  mock.addAscent(me, route("mingde", "A1", 2, "藍"), "flash", today);
  mock.addAscent(me, route("mingde", "A1", 2, "紅"), "send", today);
  mock.addAscent(me, route("mingde", "A2", 4, "黃"), "send", today, { private_note: "腳要踩高一點" });
  mock.addAscent(me, route("g2", "A", 7, "紫"), "send", today);
  const own = Object.assign(route("mingde", "S", 3, "白"), { kind: "community", name: "小安的路線" });
  mock.addAscent(me, own, "flash", today);
  // 上個月 15 號：南港一條
  const lastDay = m === 1 ? `${y - 1}-12-15` : `${y}-${String(m - 1).padStart(2, "0")}-15`;
  mock.addAscent(me, route("g4", "A1", 5, "綠"), "send", lastDay);

  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me");
  await page.waitForTimeout(1200);
  const main = () => page.textContent("main");
  const summary = page.locator('main section[aria-label$="攀爬紀錄"]');

  // 有紀錄的日期是按鈕，格子下方有兩館的色點；寫給讀螢幕軟體：完攀幾條、哪幾館
  const todayBtn = page.locator(`main button[aria-label^="${m}/${d} 完攀"]`);
  assert.equal(await todayBtn.getAttribute("aria-label"), `${m}/${d} 完攀 4 條，明德、萬華`, "條數只算岩館路線（跟月曆深淺一樣）");
  assert.deepEqual(await todayBtn.locator("[data-gym]").evaluateAll((els) => els.map((e) => e.dataset.gym)), ["mingde", "g2"], "兩館的色點");
  const otherDay = d === 1 ? 2 : 1;
  assert.equal(await page.locator("main .grid-cols-7 button", { hasText: new RegExp(`^${otherDay}$`) }).count(), 0, "沒紀錄的日期點不了");
  assert.equal(await page.locator("main .grid-cols-7 span", { hasText: new RegExp(`^${otherDay}$`) }).count(), 1, "沒紀錄的日期照常顯示");
  assert.ok((await main()).includes("點有顏色的日期"), "提示點日期");
  assert.equal(await summary.count(), 0, "平常收起來");

  // 點今天：摘要依館分開，難度小膠囊；路線平常收起來
  await todayBtn.click();
  await page.waitForTimeout(300);
  assert.equal(await todayBtn.getAttribute("aria-pressed"), "true");
  const text = (await summary.textContent()).replace(/\s+/g, "");
  assert.ok(text.includes("完攀4條") && text.includes("Flash1"), `完攀 4 條、Flash 1（${text}）`);
  assert.match(text, /\+\d+分/, "當天積分");
  const gyms = await summary.locator("[data-day-gym]").evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, "")));
  assert.deepEqual(gyms, ["明德3條（岩友路線1條）V2×2V4", "萬華1條V7"], `依館分開（${gyms.join("｜")}）`);
  assert.equal(await summary.locator("li").count(), 0, "路線先收起來");

  // 看路線：列出今天的 5 條（含岩友路線），點一條打開路線卡片
  await summary.getByRole("button", { name: "看路線 ›" }).click();
  await page.waitForTimeout(300);
  assert.equal(await summary.locator("li").count(), 5, "列出今天的路線");
  assert.equal(await summary.locator("li", { hasText: "小安的路線" }).count(), 1, "岩友路線照樣列出來");
  await summary.locator("li", { hasText: "黃色" }).locator("button").first().click();
  await page.waitForTimeout(600);
  assert.ok(await page.getByRole("dialog").isVisible(), "打開路線卡片");
  assert.ok((await page.getByRole("dialog").textContent()).includes("腳要踩高一點"), "卡片帶著自己的紀錄");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 再點同一天收起來；✕ 也收起來
  await todayBtn.click();
  await page.waitForTimeout(200);
  assert.equal(await summary.count(), 0, "再點一次收起來");
  await todayBtn.click();
  await page.waitForTimeout(200);
  await summary.getByRole("button", { name: "收起這一天" }).click();
  assert.equal(await summary.count(), 0, "按 ✕ 收起來");

  // 換到上個月：選的收起來；15 號有南港的點，點了寫南港
  await todayBtn.click();
  await page.click('main button[aria-label="上個月"]');
  await page.waitForTimeout(1000);
  const pm = m === 1 ? 12 : m - 1;
  assert.equal(await summary.count(), 0, "換月份收起來");
  const prevBtn = page.locator(`main button[aria-label^="${pm}/15 完攀"]`);
  assert.equal(await prevBtn.getAttribute("aria-label"), `${pm}/15 完攀 1 條，南港`);
  await prevBtn.click();
  await page.waitForTimeout(300);
  assert.ok((await summary.textContent()).replace(/\s+/g, "").includes("南港1條V5"), "上個月那天在南港");
  assert.deepEqual(errors, []);
});
