// 營運分頁：使用狀況、換線日只有老闆和老闆授權的人看得到；老闆在營運授權（使用狀況指定館、換線日所有館），取消後就看不到
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const tabs = async (page) => (await page.locator("nav a").allTextContents()).map((t) => t.trim());

test("營運：老闆授權看萬華使用狀況、輸入換線日 → 對方多一個營運分頁；取消後就沒有", async () => {
  const mock = createMock();
  mock.addUser("owner1", "password1", { nickname: "老闆", is_owner: true });
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });

  const O = await phone(browser, mock);
  const o = O.page;
  await login(o, "owner1", "password1", "/admin");
  await o.waitForTimeout(1000);
  assert.deepEqual(await tabs(o), ["館內路線", "人物卡", "我的紀錄", "管理後台", "營運"], "老闆有管理後台和營運");
  assert.equal(await o.locator('main button:has-text("使用狀況")').count(), 0, "管理後台不再放使用狀況");
  assert.equal(await o.locator('main button:text-is("📅 換線日")').count(), 0, "管理後台不再放換線日");
  await o.click('nav a:text-is("營運")');
  await o.waitForURL("**/ops");
  await o.waitForTimeout(800);
  assert.equal(await o.locator('main button:text-is("📊 使用狀況")').count(), 1);
  assert.equal(await o.locator('main button:text-is("📅 換線日")').count(), 1);
  assert.ok((await o.textContent("main")).includes("目前只有老闆可以看使用狀況、輸入換線日"), "還沒授權任何人");

  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", "/gyms");
  await c.waitForTimeout(800);
  assert.deepEqual(await tabs(c), ["館內路線", "人物卡", "我的紀錄"], "顧客沒有管理後台、營運");
  await c.goto(BASE + "/ops", { waitUntil: "networkidle" });
  await c.waitForTimeout(800);
  assert.ok((await c.textContent("main")).includes("營運給老闆和老闆授權的人使用"), "直接打網址看到說明");
  assert.equal(await c.locator("main button:has-text('使用狀況')").count(), 0);

  // 老闆搜尋小安 → 點萬華館、可以輸入
  await o.fill("#osearch", "小安");
  await o.waitForTimeout(800);
  await o.click('main button:has-text("帳號 climber88")');
  const row = o.locator('main [role=group][aria-label="小安"]');
  await row.waitFor();
  await row.locator('button:text-is("萬華館")').click();
  await o.waitForTimeout(600);
  await row.locator('button:text-is("可以輸入")').click();
  await o.waitForTimeout(600);
  assert.deepEqual(mock.db.usageViewers, [{ user_id: me, gym_id: "g2" }], "授權看萬華");
  assert.deepEqual(mock.db.resetEditors, [me], "授權輸入換線日");
  assert.equal(await row.locator('button:text-is("萬華館")').getAttribute("aria-pressed"), "true");
  assert.equal(await row.locator('button:text-is("明德館")').getAttribute("aria-pressed"), "false", "其他館沒授權");
  assert.ok(mock.db.audit.some((x) => x.action === "usage_viewer.grant" && x.gym_id === "g2" && x.target_id === me), "寫在萬華館的操作紀錄");

  // 小安：多一個營運分頁（沒有管理後台），看得到兩個按鈕；進管理後台會被帶去營運
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(1000);
  assert.deepEqual(await tabs(c), ["館內路線", "人物卡", "我的紀錄", "營運"]);
  assert.ok((await c.textContent("main")).includes("老闆授權你看萬華館的使用狀況、輸入各館的換線日"));
  assert.equal(await c.locator('main button:text-is("📊 使用狀況")').count(), 1);
  assert.equal(await c.locator('main button:text-is("📅 換線日")').count(), 1);
  assert.equal(await c.locator("main #osearch").count(), 0, "不是老闆：沒有授權區");
  await c.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await c.waitForTimeout(800);
  assert.ok((await c.textContent("main")).includes("在「營運」分頁"), "管理後台說明權限在營運");
  await c.click('main button:text-is("前往營運")');
  await c.waitForURL("**/ops");

  // 老闆取消（再點一次）：人還留在名單上，小安重新整理後沒有營運分頁
  await row.locator('button:text-is("萬華館")').click();
  await o.waitForTimeout(600);
  await row.locator('button:text-is("可以輸入")').click();
  await o.waitForTimeout(600);
  assert.deepEqual(mock.db.usageViewers, []);
  assert.deepEqual(mock.db.resetEditors, []);
  assert.equal(await row.count(), 1, "取消後人還在畫面上，點錯可以點回來");
  assert.ok(mock.db.audit.some((x) => x.action === "usage_viewer.revoke" && x.gym_id === "g2"));
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(1000);
  assert.deepEqual(await tabs(c), ["館內路線", "人物卡", "我的紀錄"], "取消後沒有營運分頁");
  assert.ok((await c.textContent("main")).includes("營運給老闆和老闆授權的人使用"));

  // 重新進營運：權限都取消的人不會留在名單上
  await o.reload({ waitUntil: "networkidle" });
  await o.waitForTimeout(800);
  assert.equal(await o.locator('main [role=group][aria-label="小安"]').count(), 0);
  assert.deepEqual([...O.errors, ...C.errors], []);
});

test("營運：360 寬的小手機，老闆的五個分頁排得下、字不換行", async () => {
  const mock = createMock();
  mock.addUser("owner1", "password1", { nickname: "老闆", is_owner: true });
  const { page, errors } = await phone(browser, mock, { viewport: { width: 360, height: 740 } });
  await login(page, "owner1", "password1", "/ops");
  await page.waitForTimeout(800);
  // 每個分頁的字：只佔一行（換行的話文字範圍會有兩個矩形），而且整段字在分頁的框裡面
  const boxes = await page.locator("nav a").evaluateAll((els) =>
    els.map((e) => {
      const range = document.createRange();
      range.selectNodeContents(e);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const t = range.getBoundingClientRect();
      const b = e.getBoundingClientRect();
      return { label: e.textContent, lines, inside: t.left >= b.left - 0.5 && t.right <= b.right + 0.5, right: b.right };
    })
  );
  assert.equal(boxes.length, 5);
  assert.ok(boxes.every((b) => b.right <= 360), "沒有超出畫面");
  assert.ok(boxes.every((b) => b.lines === 1), `分頁名稱沒有換行：${JSON.stringify(boxes)}`);
  assert.ok(boxes.every((b) => b.inside), `分頁名稱沒有超出框：${JSON.stringify(boxes)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360, "沒有橫向捲動");
  assert.deepEqual(errors, []);
});

test("還沒套用 step28：老闆照常用使用狀況、換線日，授權只出現換線日；店長看不到使用狀況", async () => {
  const mock = createMock();
  mock.state.noOps = true;
  mock.addUser("owner1", "password1", { nickname: "老闆", is_owner: true });
  const mgr = mock.addUser("manager1", "password1", { nickname: "店長" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "g2", role: "manager" });
  mock.addUser("climber88", "password1", { nickname: "小安" });

  const O = await phone(browser, mock);
  const o = O.page;
  await login(o, "owner1", "password1", "/ops");
  await o.waitForTimeout(800);
  assert.equal(await o.locator('main button:text-is("📊 使用狀況")').count(), 1);
  assert.equal(await o.locator('main button:text-is("📅 換線日")').count(), 1);
  assert.ok((await o.textContent("main")).includes("使用狀況授權要先在 Supabase 執行 step28"));
  await o.fill("#osearch", "小安");
  await o.waitForTimeout(800);
  await o.click('main button:has-text("帳號 climber88")');
  const row = o.locator('main [role=group][aria-label="小安"]');
  await row.waitFor();
  assert.equal(await row.locator('button:text-is("萬華館")').count(), 0, "沒有使用狀況的館可以點");
  assert.equal(await row.locator('button:text-is("可以輸入")').count(), 1, "換線日照常可以授權");
  await o.click('main button:text-is("📊 使用狀況")');
  await o.waitForURL("**/ops/usage");
  await o.waitForTimeout(800);
  assert.ok((await o.textContent("main")).includes("各館比較"), "老闆照常看使用狀況");

  const M = await phone(browser, mock);
  await login(M.page, "manager1", "password1", "/admin");
  await M.page.waitForTimeout(1000);
  assert.deepEqual(await tabs(M.page), ["館內路線", "人物卡", "我的紀錄", "管理後台"], "店長沒有營運分頁");
  assert.equal(await M.page.locator('main button:has-text("使用狀況")').count(), 0);
  assert.deepEqual([...O.errors, ...M.errors], []);
});
