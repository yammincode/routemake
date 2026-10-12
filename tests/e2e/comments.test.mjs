// 每人每條路線只能留一則留言：可以編輯、刪除後再留；留言多時改成左右滑動
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("一則留言：留過後只能編輯或刪除再留；三則以上左右滑動", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 4, "藍");
  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(500);
  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  await c.waitForTimeout(500);
  await c.click('[role=dialog] [role=tab]:has-text("留言")');

  await c.fill('[role=dialog] textarea[placeholder^="公開留言"]', "第一次留言");
  await c.click('[role=dialog] button:text-is("送出")');
  // 等留言框收起來（電腦忙時半秒不一定夠）
  await c.locator('[role=dialog] textarea[placeholder^="公開留言"]').waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  assert.equal(mock.db.comments.length, 1);
  assert.equal(await c.locator('[role=dialog] textarea[placeholder^="公開留言"]').count(), 0, "留過後不再顯示留言框");
  assert.ok((await c.textContent("[role=dialog]")).includes("每條路線只能留一則留言"));

  await c.click('[role=dialog] button:text-is("編輯")');
  await c.fill('[role=dialog] textarea[placeholder^="公開留言"]', "改過的內容");
  await c.click('[role=dialog] button:text-is("儲存")');
  await c.waitForTimeout(500);
  assert.equal(mock.db.comments[0].body, "改過的內容", "編輯成功");
  assert.ok((await c.textContent("[role=dialog]")).includes("已編輯"));
  assert.equal(mock.db.comments.filter((x) => !x.deleted_at).length, 1, "編輯不會多一則");

  await c.click('[role=dialog] button:text-is("刪除")');
  await c.waitForTimeout(300);
  assert.equal(mock.db.comments.filter((x) => !x.deleted_at).length, 1, "刪除要按兩次：按一次還在");
  await c.click('[role=dialog] button:text-is("確定刪除？再按一次")');
  await c.waitForTimeout(500);
  assert.equal(mock.db.comments.filter((x) => !x.deleted_at).length, 0, "按第二次才刪除");
  await c.fill('[role=dialog] textarea[placeholder^="公開留言"]', "重新留言");
  await c.click('[role=dialog] button:text-is("送出")');
  await c.waitForTimeout(500);
  assert.deepEqual(mock.db.comments.filter((x) => !x.deleted_at).map((x) => x.body), ["重新留言"], "刪除後可以再留");

  // 其他人留言，三則以上改成左右滑動，自己的排第一
  for (const [name, body, likes] of [["a1", "起步右腳", 0], ["a2", "第三手好遠", 3]]) {
    const id = mock.addUser(name, "password1", { nickname: name });
    const cm = { id: crypto.randomUUID(), route_id: r.id, user_id: id, body, created_at: new Date().toISOString(), edited_at: null, deleted_at: null };
    mock.db.comments.push(cm);
    for (let i = 0; i < likes; i++) mock.db.likes.push({ comment_id: cm.id, user_id: crypto.randomUUID() });
  }
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);
  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  await c.waitForTimeout(700);
  await c.click('[role=dialog] [role=tab]:has-text("留言")');
  const strip = c.locator("[role=dialog] div.snap-x", { hasText: "重新留言" });
  assert.equal(await strip.count(), 1, "三則以上變成左右滑動");
  const order = await strip.locator("> div p").allTextContents();
  assert.deepEqual(order, ["重新留言", "第三手好遠", "起步右腳"], "自己的第一，其他依讚數");
  assert.ok((await c.textContent("[role=dialog]")).includes("共 3 則，左右滑動看更多"));
  assert.ok(mock.db.comments.some((x) => x.user_id === me));
  assert.deepEqual(C.errors, []);
});

test("留言不能放網址（避免有人冒充館方貼釣魚連結）：會說明原因，一般留言照常", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = mock.db.zones[0];
  mock.addRoute(zone, 4, "藍");
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", `/zone?id=${zone.id}`);
  await page.waitForTimeout(500);
  await page.locator("main ul li button", { hasText: "A1-01" }).click();
  await page.waitForTimeout(500);
  await page.click('[role=dialog] [role=tab]:has-text("留言")');
  await page.fill('[role=dialog] textarea[placeholder^="公開留言"]', "官方活動 https://evil.example 填資料抽年票");
  await page.click('[role=dialog] button:text-is("送出")');
  await page.waitForTimeout(500);
  assert.equal(mock.db.comments.length, 0, "沒有存進去");
  assert.ok((await page.locator("[role=status]").allTextContents()).some((t) => t.includes("留言不能放網址")), "告訴使用者原因");
  await page.fill('[role=dialog] textarea[placeholder^="公開留言"]', "起步右手很遠");
  await page.click('[role=dialog] button:text-is("送出")');
  await page.waitForTimeout(500);
  assert.equal(mock.db.comments.length, 1, "一般留言照常");
  assert.deepEqual(errors.filter((e) => !/400/.test(e)), []);
});
