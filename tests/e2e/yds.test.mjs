// 中和上攀區用 YDS 等級：列表、篩選、路線卡片、我的紀錄、後台難度選擇與等級制
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("YDS：上攀區顯示 5.11a、記錄後我的紀錄顯示最高難度；後台用 YDS 選難度", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const zA = mock.db.zones.find((z) => z.gym_id === "g3" && z.code === "A1");
  mock.addRoute(zA, 108, "紅", ["耐力"]);
  mock.addRoute(zA, 104, "藍");

  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", `/zone?id=${zA.id}`);
  await c.waitForTimeout(600);
  const list = await c.textContent("main ul");
  assert.ok(list.includes("5.11a") && list.includes("5.10a"), "列表顯示 YDS");
  assert.ok(!/V1\d?\b|V10/.test(list), "沒有 V 級");
  await c.click('main button:text-is("5.11a")');
  await c.waitForTimeout(200);
  assert.equal(await c.locator("main ul li").count(), 1, "用 5.11a 篩選");
  await c.locator("main ul li button").first().click();
  await c.waitForTimeout(500);
  assert.ok((await c.textContent("[role=dialog] h2")).includes("5.11a"), "路線卡片標題");
  await c.click('[role=dialog] button:has-text("完攀")');
  await c.waitForTimeout(500);
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("+19 分"), "YDS 分數（5.11a 17 分＋耐力 10%）");
  await c.keyboard.press("Escape");
  await c.goto(BASE + "/me", { waitUntil: "networkidle" });
  await c.waitForTimeout(800);
  assert.ok((await c.textContent("main")).includes("5.11a"), "我的紀錄顯示 5.11a");

  const B = await phone(browser, mock);
  const b = B.page;
  await login(b, "boss", "password1", "/admin");
  await b.waitForTimeout(800);
  await b.click('main button:text-is("中和館")');
  await b.waitForTimeout(800);
  await b.locator('svg[role=img] g[aria-label^="A1 區"] text').first().click();
  await b.waitForTimeout(500);
  assert.equal(await b.getAttribute('main button:text-is("上攀 YDS")', "aria-pressed"), "true", "等級制是上攀 YDS");
  assert.ok(await b.locator('main button:text-is("抱石 V 級")').isDisabled(), "有路線時不能切換");
  await b.locator("main ul li button", { hasText: "A1-01" }).click();
  await b.waitForTimeout(400);
  assert.equal(await b.getAttribute('[role=dialog] button:text-is("5.11a")', "aria-pressed"), "true", "後台用 YDS 選難度");
  assert.equal(await b.locator('[role=dialog] button:text-is("V4")').count(), 0);
  assert.deepEqual([...C.errors, ...B.errors], []);
});
