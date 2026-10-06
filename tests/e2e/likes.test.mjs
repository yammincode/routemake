// 留言按讚 👍：登入後按讚、收回；未登入看得到讚數，按了會去登入
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("留言按讚與收回；未登入按讚會去登入", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 4, "藍");
  mock.db.comments.push({ id: crypto.randomUUID(), route_id: r.id, user_id: other, body: "腳踩對就很簡單", created_at: new Date().toISOString(), deleted_at: null });
  mock.db.likes.push({ comment_id: mock.db.comments[0].id, user_id: other });

  // 未登入
  const G = await phone(browser, mock);
  const g = G.page;
  await g.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await g.waitForTimeout(500);
  await g.locator("main ul li button", { hasText: "A1-01" }).click();
  await g.waitForTimeout(600);
  const gl = g.locator('[role=dialog] button[aria-label^="按讚"]');
  assert.equal((await gl.textContent()).replace(/\s/g, ""), "👍1", "未登入看得到讚數");
  await gl.click();
  await g.waitForURL("**/login**");

  // 登入
  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(500);
  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  await c.waitForTimeout(600);
  await c.locator('[role=dialog] button[aria-label^="按讚"]').click();
  await c.waitForTimeout(500);
  const liked = c.locator('[role=dialog] button[aria-pressed="true"]');
  assert.equal((await liked.textContent()).replace(/\s/g, ""), "👍2", "按讚後變 2");
  assert.ok(mock.db.likes.some((l) => l.user_id === me), "讚有存進資料庫");
  await liked.click();
  await c.waitForTimeout(500);
  assert.equal(mock.db.likes.filter((l) => l.user_id === me).length, 0, "再按一次收回");
  assert.equal((await c.locator('[role=dialog] button[aria-label^="按讚"]').textContent()).replace(/\s/g, ""), "👍1");
  assert.deepEqual([...G.errors, ...C.errors], []);
});
