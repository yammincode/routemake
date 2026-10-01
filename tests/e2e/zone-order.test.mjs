// 店長拖曳整理區域順序；定線長看不到；日期框不會蓋到上傳照片按鈕
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const order = (mock) => mock.db.zones.filter((z) => z.gym_id === "mingde").sort((a, b) => a.sort - b.sort).map((z) => z.code).join("");

test("店長拖曳和按鈕調整區域順序，顧客首頁跟著變", async () => {
  const mock = createMock();
  const mgr = mock.addUser("manager1", "password1", { nickname: "店長" });
  const setter = mock.addUser("setter1", "password1", { nickname: "阿定" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "mingde", role: "manager" }, { user_id: setter, gym_id: "mingde", role: "setter" });
  assert.equal(order(mock), "AWBCD");

  const M = await phone(browser, mock);
  const m = M.page;
  await login(m, "manager1", "password1", "/admin");
  await m.waitForTimeout(1000);

  // 日期框和上傳照片按鈕不重疊
  const date = await m.locator("#zreset").boundingBox();
  const photo = await m.locator('main button:has-text("上傳照片")').boundingBox();
  assert.ok(date.x + date.width <= photo.x + 1, "日期框沒有蓋到上傳照片");

  await m.click('main button:text-is("整理順序")');
  await m.waitForTimeout(300);
  const labels = () => m.locator("[role=dialog] li > span").allTextContents();
  assert.deepEqual(await labels(), ["A 區A", "比賽牆W", "B 區B", "C 區C", "D 區D"]);

  // 拖曳：把 D 區拖到最上面
  const handle = m.locator('[role=dialog] button[aria-label="拖曳 D 區"]');
  const bb = await handle.boundingBox();
  await m.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await m.mouse.down();
  for (let i = 1; i <= 10; i++) await m.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 - i * 23);
  await m.mouse.up();
  await m.waitForTimeout(200);
  // 按鈕：比賽牆往下一格
  await m.click('[role=dialog] button[aria-label="比賽牆 往下"]');
  assert.equal(order(mock), "AWBCD", "按儲存前不會改");
  await m.click('[role=dialog] button:text-is("儲存順序")');
  await m.waitForTimeout(800);
  assert.equal(order(mock), "DABWC");
  assert.ok((await m.locator("[role=status]").last().textContent()).includes("已更新區域順序"));
  assert.ok(mock.db.audit.some((a) => a.action === "zone.reorder" && a.detail.zones[0] === "D 區"), "寫操作紀錄");
  const chips = await m.locator("main div.no-scrollbar", { hasText: "整理順序" }).locator("button").allTextContents();
  assert.deepEqual(chips.slice(0, 5), ["D 區", "A 區", "B 區", "比賽牆", "C 區"], "後台區域按鈕照新順序");

  // 定線長看不到「整理順序」
  const S = await phone(browser, mock);
  await login(S.page, "setter1", "password1", "/admin");
  await S.page.waitForTimeout(1000);
  assert.equal(await S.page.locator('main button:text-is("整理順序")').count(), 0);

  // 顧客首頁的區域列表跟著變
  const C = await phone(browser, mock);
  await C.page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await C.page.waitForTimeout(800);
  const cards = await C.page.locator("main button.rounded-card").allTextContents();
  assert.deepEqual(cards.map((t) => t.match(/^(.+?區|比賽牆)/)?.[1]), ["D 區", "A 區", "B 區", "比賽牆", "C 區"], "顧客首頁的區域照新順序");
  assert.deepEqual([...M.errors, ...S.errors, ...C.errors], []);
});
