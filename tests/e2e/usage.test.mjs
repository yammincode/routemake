// 使用狀況：登入的人看館頁會記「今天有打開」；店長看自己的館，老闆可以看全部館；顧客看不到
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("使用狀況：記錄打開、店長與老闆看統計", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const mgr = mock.addUser("manager1", "password1", { nickname: "店長" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "g2", role: "manager" });

  const C = await phone(browser, mock);
  await login(C.page, "climber88", "password1", "/gyms");
  await C.page.click('main button:has-text("萬華館")');
  await C.page.waitForURL("**/gym/g2");
  await C.page.waitForTimeout(800);
  const o = mock.db.opens.find((x) => x.user_id === me);
  assert.ok(o && o.day === taipeiDay() && o.gym_id === "g2", "記下今天打開、看的是萬華館");
  const n = mock.db.opens.length;
  await C.page.reload({ waitUntil: "networkidle" });
  await C.page.waitForTimeout(600);
  assert.equal(mock.db.opens.length, n, "同一天不會重複記");

  const M = await phone(browser, mock);
  await login(M.page, "manager1", "password1", "/admin");
  await M.page.waitForTimeout(1200);
  const text = await M.page.textContent("main");
  assert.ok(text.includes("使用狀況") && text.includes("最近 30 天每天使用人數"), "店長看得到使用狀況");
  assert.equal(await M.page.locator('main button:text-is("全部館")').count(), 0, "店長不能看全部館");
  assert.equal(await M.page.locator('main [aria-label="最近 30 天每天使用人數"] button').count(), 30, "30 天趨勢");

  const B = await phone(browser, mock);
  await login(B.page, "boss", "password1", "/admin");
  await B.page.waitForTimeout(1200);
  await B.page.click('main button:text-is("全部館")');
  await B.page.waitForTimeout(800);
  const all = await B.page.textContent("main");
  assert.ok(all.includes("各館比較") && all.includes("使用率"), "老闆看得到各館比較與使用率");

  await C.page.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await C.page.waitForTimeout(800);
  assert.ok(!(await C.page.textContent("main")).includes("使用狀況"), "顧客看不到");
  assert.deepEqual([...C.errors, ...M.errors, ...B.errors], []);
});
