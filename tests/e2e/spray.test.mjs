// Spray Wall：岩友出路線（圈圈 S／路線點／T）、修改、按讚、記錄不算積分；員工出岩館路線、下架岩友路線；一般人看不到管理後台
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, WALL, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const tapPhoto = async (page, fx, fy) => {
  const img = page.locator('[role=dialog] img[alt="Spray Wall 公版照片"]');
  await img.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(150);
  const b = await img.boundingBox();
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  await page.waitForTimeout(120);
};

test("Spray Wall：岩友出路線、員工出岩館路線與下架", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const setter = mock.addUser("setterx", "password1", { nickname: "阿定" });
  mock.db.staff_roles.push({ user_id: setter, gym_id: "mingde", role: "setter" });
  const sw = mock.db.zones.find((z) => z.gym_id === "mingde" && z.kind === "spray");
  sw.photo_path = "mingde/zones/S-1.jpg";
  mock.db.files[sw.photo_path] = fs.readFileSync(WALL);

  // ---- 岩友 ----
  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", "/gyms");
  await c.click('main button:has-text("明德 SPRAY WALL")');
  await c.waitForURL("**/spray/mingde-sw");
  await c.waitForTimeout(800);
  assert.deepEqual(await c.locator("nav a").allTextContents(), ["館內路線", "人物卡", "我的紀錄"], "一般人看不到管理後台");
  assert.ok((await c.textContent("main")).includes("教練還沒出岩館路線"));
  assert.equal(await c.locator('main button:has-text("新增岩館路線")').count(), 0, "岩友不能出岩館路線");

  await c.click('main [role=tab]:has-text("岩友路線")');
  await c.waitForTimeout(400);
  await c.click('main button:has-text("出一條岩友路線")');
  await c.waitForTimeout(400);
  await tapPhoto(c, 0.2, 0.85); // 起攀 S（預設）
  await tapPhoto(c, 0.35, 0.6); // 自動換成路線點
  await c.click('[role=dialog] button:has-text("完攀 T")');
  await tapPhoto(c, 0.5, 0.15);
  await tapPhoto(c, 0.7, 0.7); // 多點一個再刪掉
  await c.click('[role=dialog] button[aria-label="完攀 T（點一下刪除）"] >> nth=1');
  await c.fill("#sname", "下雨天的指力");
  await c.click('[role=dialog] button:text-is("V4")');
  await c.fill("#sdesc", "腳點只能用標記的");
  await c.click('[role=dialog] button:text-is("發布路線")');
  await c.waitForTimeout(800);
  const mine = mock.db.routes.find((r) => r.name === "下雨天的指力");
  assert.ok(mine, "岩友路線已新增");
  assert.equal(mine.kind, "community");
  assert.equal(mine.created_by, me);
  assert.deepEqual(mine.holds.map((h) => h.t), ["s", "h", "t"], "圈圈：起攀、路線點、完攀");

  const row = c.locator("main ul li button", { hasText: "下雨天的指力" });
  assert.ok((await row.textContent()).includes("小安 出的"), "列表顯示出題者");
  await row.click();
  await c.waitForTimeout(600);
  const sheet = c.locator("[role=dialog]");
  const text = await sheet.textContent();
  assert.ok(text.includes("下雨天的指力") && text.includes("小安 出的") && text.includes("岩友路線不算積分") && text.includes("腳點只能用標記的"));
  assert.equal(await sheet.locator('img[alt="下雨天的指力的圈圈"]').count(), 1, "卡片上有圈圈照片");
  await sheet.locator('button:has-text("👍")').click();
  await c.waitForTimeout(300);
  assert.equal(mock.db.routeLikes.length, 1, "按讚");
  await sheet.locator('button:has-text("完攀")').first().click();
  await c.waitForTimeout(500);
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("岩友路線不算積分"));

  await sheet.locator('button:text-is("修改")').click();
  await c.waitForTimeout(400);
  await c.fill("#sname", "晴天的指力");
  await c.click('[role=dialog] button:text-is("儲存修改")');
  await c.waitForTimeout(700);
  assert.equal(mine.name, "晴天的指力", "本人可以修改");

  // ---- 定線長 ----
  const S = await phone(browser, mock);
  const s = S.page;
  await login(s, "setterx", "password1", "/spray/mingde-sw");
  await s.waitForTimeout(800);
  assert.ok((await s.locator("nav a").allTextContents()).includes("管理後台"), "員工看得到管理後台");
  await s.click('main button:has-text("新增岩館路線")');
  await s.waitForTimeout(400);
  await tapPhoto(s, 0.3, 0.8);
  await s.click('[role=dialog] button:has-text("完攀 T")');
  await tapPhoto(s, 0.6, 0.2);
  await s.fill("#sname", "教練的路線");
  await s.click('[role=dialog] button:text-is("V6")');
  await s.click('[role=dialog] button:text-is("發布路線")');
  await s.waitForTimeout(700);
  assert.equal(mock.db.routes.find((r) => r.name === "教練的路線")?.kind, "gym", "員工出岩館路線");
  assert.ok((await s.textContent("main ul")).includes("教練的路線"));

  await s.click('main [role=tab]:has-text("岩友路線")');
  await s.waitForTimeout(500);
  await s.locator("main ul li button", { hasText: "晴天的指力" }).click();
  await s.waitForTimeout(500);
  await s.locator('[role=dialog] button:text-is("下架")').click();
  await s.locator('[role=dialog] button:text-is("下架")').click();
  await s.waitForTimeout(600);
  assert.ok(mine.archived_at, "員工下架岩友路線");
  assert.ok(mock.db.audit.some((a) => a.action === "route.archive" && a.target_id === mine.id), "寫操作紀錄");
  // ---- 管理後台：Spray Wall 跟岩館分開 ----
  mock.db.routes.push({ ...mine, id: crypto.randomUUID(), name: "第二條", archived_at: null, code: "S-09" });
  await s.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await s.waitForTimeout(1000);
  assert.ok(!(await s.textContent("main")).includes("公版照片"), "岩館畫面沒有 Spray Wall");
  await s.click('main button:text-is("明德 SPRAY WALL")');
  await s.waitForTimeout(800);
  const admin = await s.textContent("main");
  assert.ok(admin.includes("明德 SPRAY WALL 公版照片") && admin.includes("教練的路線"), "Spray Wall 獨立管理：照片與岩館路線");
  assert.ok(!admin.includes("開放顧客留言") && !admin.includes("整區換線"), "不會出現岩館的設定");
  await s.click('main [role=tab]:has-text("岩友路線")');
  await s.waitForTimeout(500);
  const item = s.locator("main li", { hasText: "第二條" });
  await item.locator('button:text-is("下架")').click();
  await item.locator('button:text-is("確定下架？")').click();
  await s.waitForTimeout(500);
  assert.ok(mock.db.routes.find((r) => r.name === "第二條").archived_at, "後台下架岩友路線");
  assert.deepEqual([...C.errors, ...S.errors], []);
});

test("Spray Wall：路線多時在框內滑動，滑到底自動載入下一批", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const sw = mock.db.zones.find((z) => z.gym_id === "mingde" && z.kind === "spray");
  sw.photo_path = "mingde/zones/S-1.jpg";
  mock.db.files[sw.photo_path] = fs.readFileSync(WALL);
  for (let i = 0; i < 25; i++) {
    const r = mock.addRoute(sw, i % 8, "紅", [], 50, 50, new Date(Date.now() - i * 60000).toISOString());
    Object.assign(r, { kind: "community", name: `岩友路線${i + 1}`, created_by: me, holds: [{ x: 20, y: 80, t: "s" }, { x: 60, y: 20, t: "t" }] });
  }

  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", "/spray/mingde-sw");
  await c.waitForTimeout(800);
  await c.click('main [role=tab]:has-text("岩友路線")');
  await c.waitForTimeout(800);
  const box = c.locator("main [data-scroll-list]");
  assert.equal(await box.locator("li").count(), 20, "一次先載入 20 條");
  const size = await box.evaluate((el) => ({ h: el.clientHeight, sh: el.scrollHeight }));
  assert.ok(size.h <= 480 && size.sh > size.h, "列表在固定高度的框裡滑動");
  assert.equal(await c.locator('main button:has-text("載入更多")').count(), 0, "不用按載入更多");

  await box.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await c.waitForTimeout(1200);
  assert.equal(await box.locator("li").count(), 25, "滑到底自動載入剩下的路線");
  assert.equal(new Set(await box.locator("li").allTextContents()).size, 25, "不會重複載入");
  assert.deepEqual(C.errors, []);
  await C.ctx.close();
});
