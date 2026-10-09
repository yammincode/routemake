// 使用狀況：登入的人看館頁會記「今天有打開」；在「營運」分頁：老闆看全部館，老闆授權的人只看指定的館；店長沒授權也看不到
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("使用狀況：記錄打開；店長要老闆授權才看得到、只看指定的館；老闆看全部館", async () => {
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

  // 店長沒授權：管理後台沒有使用狀況、沒有營運分頁，直接打網址也看不到
  const M = await phone(browser, mock);
  const m = M.page;
  await login(m, "manager1", "password1", "/admin");
  await m.waitForTimeout(1200);
  assert.equal(await m.locator('main button:has-text("使用狀況")').count(), 0, "管理後台沒有使用狀況按鈕");
  assert.equal(await m.locator('nav a:text-is("營運")').count(), 0, "沒授權沒有營運分頁");
  await m.goto(BASE + "/ops/usage", { waitUntil: "networkidle" });
  await m.waitForTimeout(800);
  assert.ok((await m.textContent("main")).includes("使用狀況要老闆授權才看得到"), "沒授權看到說明");
  assert.ok(!(await m.textContent("main")).includes("活躍人數"));

  // 老闆授權看萬華：多一個營運分頁，只看萬華
  mock.db.usageViewers.push({ user_id: mgr, gym_id: "g2" });
  await m.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await m.waitForTimeout(1000);
  await m.click('nav a:text-is("營運")');
  await m.waitForURL("**/ops");
  await m.waitForTimeout(600);
  assert.ok((await m.textContent("main")).includes("老闆授權你看萬華館的使用狀況"), "寫出可以看哪幾館");
  await m.click('main button:text-is("📊 使用狀況")');
  await m.waitForURL("**/ops/usage");
  await m.waitForTimeout(1000);
  const text = await m.textContent("main");
  assert.ok(text.includes("活躍人數") && text.includes("每天使用人數") && text.includes("註冊") && text.includes("熱門路線"), "授權後看得到使用狀況");
  assert.equal(await m.locator('main button:text-is("全部館")').count(), 0, "不能看全部館");
  assert.equal(await m.locator('main button:has-text("重新開始統計")').count(), 0, "不能重新開始統計");
  assert.equal(await m.locator('main [aria-label="最近 30 天每天使用人數"] button').count(), 30, "30 天趨勢");

  // 老闆：預設看全部館，可以重新開始統計（舊網址 /admin/usage 會轉到營運）
  const B = await phone(browser, mock);
  const b = B.page;
  await login(b, "boss", "password1", "/admin/usage");
  await b.waitForURL("**/ops/usage");
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

  await C.page.goto(BASE + "/ops/usage", { waitUntil: "networkidle" });
  await C.page.waitForTimeout(800);
  assert.ok(!(await C.page.textContent("main")).includes("活躍人數"), "顧客看不到");
  assert.deepEqual([...C.errors, ...M.errors, ...B.errors], []);
});

test("使用狀況：授權兩間館的人只看得到那兩間（可以切換），看不到別館和全部館", async () => {
  const mock = createMock();
  const v = mock.addUser("viewer1", "password1", { nickname: "小美" });
  mock.db.usageViewers.push({ user_id: v, gym_id: "g3" }, { user_id: v, gym_id: "g2" });
  const { page, errors } = await phone(browser, mock);
  await login(page, "viewer1", "password1", "/ops/usage");
  await page.waitForTimeout(1200);
  const chips = (await page.locator("main button[aria-pressed]").allTextContents()).filter((t) => t.endsWith("館"));
  assert.deepEqual(chips, ["萬華館", "中和館"], "只有授權的兩館（照館的順序），沒有全部館");
  assert.equal(await page.locator('main button[aria-pressed="true"]:text-is("萬華館")').count(), 1, "預設第一間");
  assert.ok((await page.textContent("main")).includes("活躍人數"));
  await page.click('main button:text-is("中和館")');
  await page.waitForTimeout(800);
  assert.ok((await page.textContent("main")).includes("活躍人數"), "切到中和館也看得到");
  assert.deepEqual(errors, []);
});
