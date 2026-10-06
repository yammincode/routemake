// 店長拖曳整理區域順序；定線長看不到；日期框不會蓋到上傳照片按鈕
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const order = (mock) => mock.db.zones.filter((z) => z.gym_id === "mingde" && z.kind !== "spray").sort((a, b) => a.sort - b.sort).map((z) => z.code).join("");

test("後台點平面圖切換區域；圖上沒有的區域用按鈕", async () => {
  const mock = createMock();
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  mock.db.zones.push({ id: crypto.randomUUID(), gym_id: "mingde", code: "X", name: "臨時牆", sort: 6, photo_path: null, photo_width: null, photo_height: null, next_reset_on: null, route_seq: 0 });
  mock.addRoute(mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "B1"), 3, "紅");
  const B = await phone(browser, mock);
  const b = B.page;
  await login(b, "boss", "password1", "/admin");
  await b.waitForTimeout(1000);
  assert.equal(await b.inputValue("#zname"), "A1 區", "預設第一區");
  assert.equal(await b.getAttribute('svg[role=img] g[aria-label^="A1 區"]', "aria-pressed"), "true");
  assert.ok((await b.getAttribute('svg[role=img] g[aria-label^="B1 區"]', "aria-label")).includes("牆上 1 條"), "平面圖顯示路線數");
  await b.locator('svg[role=img] g[aria-label^="B1 區"] text').first().click();
  await b.waitForTimeout(500);
  assert.equal(await b.inputValue("#zname"), "B1 區", "點平面圖切換區域");
  assert.equal(await b.locator("main ul li").count(), 1, "顯示 B1 區的路線");
  assert.equal(await b.locator('main button:text-is("A1 區")').count(), 0, "圖上有的區域不再重複放按鈕");
  await b.click('main button:text-is("臨時牆")');
  await b.waitForTimeout(400);
  assert.equal(await b.inputValue("#zname"), "臨時牆", "圖上沒有的區域用按鈕選");
  assert.deepEqual(B.errors, []);
});

test("店長拖曳和按鈕調整區域順序，顧客首頁跟著變", async () => {
  const mock = createMock();
  const mgr = mock.addUser("manager1", "password1", { nickname: "店長" });
  const setter = mock.addUser("setter1", "password1", { nickname: "阿定" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "mingde", role: "manager" }, { user_id: setter, gym_id: "mingde", role: "setter" });
  // 只留五區，方便看順序
  mock.db.zones = mock.db.zones.filter((z) => z.gym_id !== "mingde" || ["A1", "W1", "B1", "C1", "D1", "S"].includes(z.code));
  assert.equal(order(mock), "A1W1B1C1D1");

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
  assert.deepEqual(await labels(), ["A1 區A1", "比賽牆 1W1", "B1 區B1", "C1 區C1", "D1 區D1"]);

  // 拖曳：把 D1 區拖到最上面
  const handle = m.locator('[role=dialog] button[aria-label="拖曳 D1 區"]');
  const bb = await handle.boundingBox();
  await m.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await m.mouse.down();
  for (let i = 1; i <= 10; i++) await m.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 - i * 23);
  await m.mouse.up();
  await m.waitForTimeout(200);
  // 按鈕：比賽牆往下一格
  await m.click('[role=dialog] button[aria-label="比賽牆 1 往下"]');
  assert.equal(order(mock), "A1W1B1C1D1", "按儲存前不會改");
  await m.click('[role=dialog] button:text-is("儲存順序")');
  await m.waitForTimeout(800);
  assert.equal(order(mock), "D1A1B1W1C1");
  assert.ok((await m.locator("[role=status]").last().textContent()).includes("已更新區域順序"));
  assert.ok(mock.db.audit.some((a) => a.action === "zone.reorder" && a.detail.zones[0] === "D1 區"), "寫操作紀錄");
  await m.click('main button:text-is("整理順序")');
  await m.waitForTimeout(300);
  assert.deepEqual(await labels(), ["D1 區D1", "A1 區A1", "B1 區B1", "比賽牆 1W1", "C1 區C1"], "再打開是新順序");
  await m.click('[role=dialog] >> text=取消');

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
  assert.deepEqual(cards.map((t) => t.match(/^(.+?區|比賽牆 \d)/)?.[1]), ["D1 區", "A1 區", "B1 區", "比賽牆 1", "C1 區"], "顧客首頁的區域照新順序");
  assert.deepEqual([...M.errors, ...S.errors, ...C.errors], []);
});
