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

  // 店長：從管理後台的按鈕進獨立頁面，只看自己的館
  const M = await phone(browser, mock);
  await login(M.page, "manager1", "password1", "/admin");
  await M.page.waitForTimeout(1200);
  assert.ok(!(await M.page.textContent("main")).includes("每天使用人數"), "管理後台不再塞使用狀況");
  await M.page.click('main button:has-text("使用狀況")');
  await M.page.waitForURL("**/admin/usage");
  await M.page.waitForTimeout(1000);
  const text = await M.page.textContent("main");
  assert.ok(text.includes("活躍人數") && text.includes("每天使用人數") && text.includes("註冊") && text.includes("熱門路線"), "店長看得到使用狀況");
  assert.equal(await M.page.locator('main button:text-is("全部館")').count(), 0, "店長不能看全部館");
  assert.equal(await M.page.locator('main button:has-text("重新開始統計")').count(), 0, "店長不能重新開始統計");
  assert.equal(await M.page.locator('main [aria-label="最近 30 天每天使用人數"] button').count(), 30, "30 天趨勢");

  // 老闆：預設看全部館，可以重新開始統計
  const B = await phone(browser, mock);
  const b = B.page;
  await login(b, "boss", "password1", "/admin/usage");
  await b.waitForTimeout(1200);
  const all = await b.textContent("main");
  assert.ok(all.includes("各館比較") && all.includes("使用率") && all.includes("目前算全部資料"), "老闆看得到各館比較與使用率");
  assert.ok(+(await b.locator("main strong").first().textContent()) >= 1, "今天有人使用");
  await b.click('main button:has-text("從今天重新開始統計")');
  assert.ok((await b.textContent("main")).includes("再按一次確認"), "要按兩次");
  await b.click('main button:has-text("再按一次確認")');
  await b.waitForTimeout(1200);
  const after = await b.textContent("main");
  assert.ok(after.includes("開始統計，之前的資料不算進來") && after.includes("測試期間註冊"), "顯示起始日與測試期間註冊");
  assert.equal(await b.locator("main strong").first().textContent(), "0", "之前的使用不算進來");
  assert.ok(mock.db.audit.some((x) => x.action === "usage.reset"), "寫操作紀錄");

  await C.page.goto(BASE + "/admin/usage", { waitUntil: "networkidle" });
  await C.page.waitForTimeout(800);
  assert.ok(!(await C.page.textContent("main")).includes("活躍人數"), "顧客看不到");
  assert.deepEqual([...C.errors, ...M.errors, ...B.errors], []);
});
