// 管理後台標路線、指派員工、操作紀錄；顧客看平面圖、記錄 Flash、留言、篩選；整區換線
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, WALL, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("老闆標路線、顧客記錄與留言、整區換線", async () => {
  const mock = createMock();
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  mock.addUser("climber88", "password1", { nickname: "小安" });
  mock.addUser("setterx", "password1", { nickname: "阿定" });

  // ---- 老闆 ----
  const A = await phone(browser, mock);
  const a = A.page;
  await login(a, "boss", "password1", "/admin");
  await a.waitForTimeout(800);
  assert.ok(await a.isVisible("text=你的身分：老闆"));

  await a.setInputFiles("input[type=file]", WALL);
  await a.waitForTimeout(1500);
  assert.ok(await a.isVisible('main img[alt="A 區照片"]'), "上傳照片後顯示岩牆");

  const wall = a.locator("main div.cursor-crosshair");
  const add = async (fx, fy, color, grade, tags, note) => {
    await wall.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await a.waitForTimeout(200);
    const bb = await wall.boundingBox();
    await a.mouse.click(bb.x + bb.width * fx, bb.y + bb.height * fy);
    await a.waitForTimeout(300);
    await a.click(`[role=dialog] button[aria-label="${color}"]`);
    await a.click(`[role=dialog] button:text-is("V${grade}")`);
    for (const t of tags) await a.click(`[role=dialog] button:text-is("${t}")`);
    if (note) await a.fill("#rnote", note);
    await a.click('[role=dialog] button:text-is("新增路線")');
    await a.waitForTimeout(600);
  };
  await add(0.25, 0.4, "藍", 4, ["動態", "指力"], "最後一手要果斷");
  await add(0.6, 0.55, "紅", 2, [], "");
  await add(0.8, 0.3, "黃", 6, [], "");
  const codes = mock.db.routes.map((r) => r.code).sort();
  assert.deepEqual(codes, ["A-01", "A-02", "A-03"], "編號自動產生");
  assert.ok((await a.locator("main ul li", { hasText: "A-01" }).textContent()).includes("50分"), "路線列顯示分數");

  await a.locator("main ul li button", { hasText: "A-03" }).click();
  await a.click("[role=dialog] >> text=下架這條路線");
  assert.match(await a.textContent("[role=dialog] button.text-warn"), /再按一次/, "下架要按兩次");
  await a.click("[role=dialog] button.text-warn");
  await a.waitForTimeout(500);
  assert.equal(await a.locator("main ul li").count(), 2);

  await a.fill("#zreset", "2099-12-31");
  await a.waitForTimeout(400);
  assert.equal(mock.db.zones[0].next_reset_on, "2099-12-31");

  await a.fill("#staffname", "SetterX");
  await a.click("text=查詢");
  await a.waitForTimeout(400);
  assert.ok((await a.textContent("main")).includes("暱稱：阿定"));
  await a.click("text=指派為定線長");
  await a.waitForTimeout(600);
  assert.ok((await a.textContent("main")).includes("阿定定線長"));

  // 操作紀錄
  await a.reload({ waitUntil: "networkidle" });
  await a.waitForTimeout(1200);
  assert.ok(/下架 A 區 A-03/.test(await a.textContent("main")), "操作紀錄：下架");
  assert.ok(/指派 阿定 為定線長/.test(await a.textContent("main")), "操作紀錄：指派員工");

  // ---- 顧客 ----
  const C = await phone(browser, mock);
  const c = C.page;
  await c.goto(BASE + "/gym/mingde", { waitUntil: "networkidle" });
  await c.waitForTimeout(500);
  assert.match(await c.textContent("main p"), /牆上 2 條路線/);
  await login(c, "climber88", "password1", "/gym/mingde");
  await c.locator('svg[role=img] g[aria-label^="A 區"] text').first().click();
  await c.waitForURL("**/zone?id=**");
  await c.waitForTimeout(800);
  assert.equal(await c.locator('main button[aria-label^="V"]').count(), 2, "照片上 2 個起步點");

  await c.click('main button[aria-label^="V4"]');
  await c.waitForTimeout(400);
  assert.match((await c.locator("[role=dialog] p", { hasText: "Flash" }).first().textContent()).replace(/\s+/g, ""), /完攀50分・Flash60分/);
  await c.click('[role=dialog] button:has-text("Flash")');
  await c.fill("#lnote", "終於送了！");
  await c.click("[role=dialog] >> text=儲存紀錄");
  await c.waitForTimeout(500);
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("+60 分"));
  assert.equal(mock.db.ascents[0].status, "flash");
  assert.equal(mock.db.ascents[0].private_note, "終於送了！");

  await c.locator("main ul li button", { hasText: "A-01" }).click();
  await c.waitForTimeout(500);
  await c.fill('[role=dialog] textarea[placeholder^="公開留言"]', "腳踩對就很簡單");
  await c.click("[role=dialog] >> text=送出");
  await c.waitForTimeout(500);
  assert.equal(mock.db.comments.length, 1);
  await c.keyboard.press("Escape");

  await c.click('main button:text-is("V2")');
  await c.waitForTimeout(200);
  assert.equal(await c.locator("main ul li").count(), 1, "篩選 V2");
  assert.equal(await c.locator("main button.opacity-\\[0\\.16\\]").count(), 1, "不符合的標記變淡");

  // ---- 老闆整區換線 ----
  await a.reload({ waitUntil: "networkidle" });
  await a.waitForTimeout(800);
  await a.click("text=整區換線");
  await a.click("[role=dialog] >> text=確認下架");
  await a.waitForTimeout(600);
  assert.equal(await a.locator("main ul li").count(), 0);
  assert.equal(mock.db.ascents.length, 1, "顧客紀錄保留");
  assert.ok(mock.db.audit.some((x) => x.action === "zone.archive_all" && x.detail.count === 2));
  assert.deepEqual([...A.errors, ...C.errors], []);
});

test("操作紀錄：店長看得到，篩選可用；定線長看不到", async () => {
  const mock = createMock();
  const mgr = mock.addUser("manager1", "password1", { nickname: "店長" });
  const setter = mock.addUser("setter1", "password1", { nickname: "阿定" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "mingde", role: "manager" }, { user_id: setter, gym_id: "mingde", role: "setter" });
  mock.db.audit.push(
    { id: 1, user_id: setter, gym_id: "mingde", action: "route.archive", target_id: null, detail: { code: "A-07", zone: "A 區", grade: 4, color: "藍" }, created_at: new Date().toISOString() },
    { id: 2, user_id: mgr, gym_id: "mingde", action: "comment.delete", target_id: null, detail: { code: "A-02", body: "這條好難", author_nickname: "小安" }, created_at: new Date().toISOString() }
  );
  const M = await phone(browser, mock);
  await login(M.page, "manager1", "password1", "/admin");
  await M.page.waitForTimeout(1200);
  const text = await M.page.textContent("main");
  assert.ok(text.includes("明德館操作紀錄"));
  assert.ok(text.includes("下架 A 區 A-07（V4 藍色）") && text.includes("刪除 小安 在 A-02 的留言「這條好難」"));
  await M.page.getByRole("button", { name: "留言", exact: true }).click();
  await M.page.waitForTimeout(500);
  const filtered = await M.page.textContent("main");
  assert.ok(filtered.includes("刪除 小安") && !filtered.includes("下架 A 區 A-07"), "篩選「留言」");

  const S = await phone(browser, mock);
  await login(S.page, "setter1", "password1", "/admin");
  await S.page.waitForTimeout(1000);
  assert.ok(!(await S.page.textContent("main")).includes("操作紀錄"), "定線長看不到操作紀錄");
  assert.deepEqual([...M.errors, ...S.errors], []);
});
