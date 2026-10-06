// 意見回饋：要登入才能送、附上版本與館、看得到自己送的與處理狀態；只有老闆在後台看到全部並改狀態
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("意見回饋：顧客送出、老闆在後台處理", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const mgr = mock.addUser("manager1", "password1", { nickname: "店長" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "mingde", role: "manager" });

  // 未登入：要先登入
  const C = await phone(browser, mock);
  const c = C.page;
  await c.goto(BASE + "/feedback", { waitUntil: "networkidle" });
  await c.waitForTimeout(500);
  assert.ok((await c.textContent("main")).includes("登入後就能寫回饋"));

  // 從我的紀錄進來
  await login(c, "climber88", "password1", "/me");
  await c.waitForTimeout(600);
  await c.click('main a:has-text("意見回饋")');
  await c.waitForURL("**/feedback");
  await c.waitForTimeout(600);
  assert.ok((await c.textContent("main")).includes("還沒有送過回饋"));
  assert.ok(await c.isDisabled('main button:has-text("送出回饋")'), "沒寫內容不能送");
  await c.click('main button:has-text("問題回報")');
  await c.fill("#fbbody", "在 LINE 裡打開會一直要重新登入");
  assert.ok((await c.textContent("main")).includes("18 / 1000"), "顯示字數");
  await c.fill("#fbcontact", "line: annie77");
  await c.click('main button:has-text("送出回饋")');
  await c.waitForTimeout(700);
  const f = mock.db.feedback[0];
  assert.equal(f.kind, "bug");
  assert.equal(f.contact, "line: annie77");
  assert.match(f.app_version, /^\d+\.\d+$/, "附上版本號");
  assert.equal(f.gym_id, "mingde");
  assert.ok(f.device.length > 0, "附上手機類型");
  assert.equal(await c.inputValue("#fbbody"), "", "送出後清空");
  const item = c.locator("main li", { hasText: "一直要重新登入" });
  assert.ok((await item.textContent()).includes("問題回報") && (await item.textContent()).includes("未讀"), "看得到自己送的和狀態");

  // 店長看不到回饋
  const M = await phone(browser, mock);
  await login(M.page, "manager1", "password1", "/admin");
  await M.page.waitForTimeout(1200);
  assert.ok(!(await M.page.textContent("main")).includes("使用者回饋"), "店長沒有回饋區");

  // 老闆在後台處理
  const B = await phone(browser, mock);
  const b = B.page;
  await login(b, "boss", "password1", "/admin");
  await b.waitForTimeout(1200);
  const row = b.locator("main li", { hasText: "一直要重新登入" });
  const t = await row.textContent();
  assert.ok(t.includes("小安（帳號 climber88）") && t.includes("聯絡：line: annie77") && t.includes("明德館"), "附上送出者、聯絡方式、館");
  await row.locator('button:has-text("標成處理中")').click();
  await b.waitForTimeout(600);
  assert.equal(mock.db.feedback[0].status, "doing");
  assert.equal(await b.locator("main li", { hasText: "一直要重新登入" }).count(), 0, "未讀篩選裡不見了");

  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  assert.ok((await c.locator("main li", { hasText: "一直要重新登入" }).textContent()).includes("處理中"), "顧客看得到處理進度");
  assert.deepEqual([...C.errors, ...B.errors, ...M.errors], []);
  await Promise.all([C.ctx.close(), B.ctx.close(), M.ctx.close()]);
});
