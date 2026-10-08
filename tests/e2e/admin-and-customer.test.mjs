// 管理後台標路線、指派員工、操作紀錄；顧客看平面圖、記錄 Flash、留言、篩選；整區換線；訊號差不會多一條路線
import assert from "node:assert/strict";
import fs from "node:fs";
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
  assert.ok(await a.isVisible('main img[alt="A1 區照片"]'), "上傳照片後顯示岩牆");

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
  await add(0.8, 0.3, "蒂芬妮", 6, [], "");
  assert.equal(mock.db.routes.find((r) => r.code === "A1-03").hold_color, "蒂芬妮", "可以選新的蒂芬妮色");
  const codes = mock.db.routes.map((r) => r.code).sort();
  assert.deepEqual(codes, ["A1-01", "A1-02", "A1-03"], "編號自動產生");
  assert.ok((await a.locator("main ul li", { hasText: "A1-01" }).textContent()).includes("50分"), "路線列顯示分數");

  await a.locator("main ul li button", { hasText: "A1-03" }).click();
  await a.click("[role=dialog] >> text=下架這條路線");
  assert.match(await a.textContent("[role=dialog] button.text-warn"), /再按一次/, "下架要按兩次");
  await a.click("[role=dialog] button.text-warn");
  await a.waitForTimeout(500);
  assert.equal(await a.locator("main ul li").count(), 2);

  await a.fill("#zreset", "2099-12-31");
  await a.waitForTimeout(400);
  assert.equal(mock.db.zones[0].next_reset_on, "2099-12-31");

  // 指派員工：打暱稱自動搜尋 → 點一下選人 → 指派；列表上直接改角色
  await a.fill("#staffsearch", "阿");
  await a.waitForTimeout(800);
  await a.locator("main li button", { hasText: "帳號 setterx" }).click();
  assert.ok((await a.textContent("main")).includes("要指派：阿定"));
  await a.click('main button:has-text("指派為明德館定線長")');
  await a.waitForTimeout(600);
  assert.ok((await a.textContent("main")).includes("阿定定線長"));
  assert.equal(await a.inputValue("#staffsearch"), "", "指派後清空搜尋");
  await a.fill("#staffsearch", "setterx");
  await a.waitForTimeout(800);
  assert.ok((await a.locator("main li button", { hasText: "帳號 setterx" }).textContent()).includes("已是定線長"), "搜尋結果顯示已是員工");
  await a.fill("#staffsearch", "");
  await a.click('main button:has-text("改成店長")');
  await a.waitForTimeout(600);
  assert.equal(mock.db.staff_roles.find((r) => r.gym_id === "mingde" && mock.db.profiles.find((p) => p.id === r.user_id)?.username === "setterx").role, "manager", "列表上直接改成店長");
  await a.click('main button:has-text("改成定線長")');
  await a.waitForTimeout(600);
  // 移除員工要按兩次
  const isStaff = () => mock.db.staff_roles.some((r) => mock.db.profiles.find((p) => p.id === r.user_id)?.username === "setterx");
  await a.click('main button:text-is("移除")');
  await a.waitForTimeout(300);
  assert.ok(isStaff(), "按一次還沒移除");
  await a.click('main button:text-is("確定移除？再按一次")');
  await a.waitForTimeout(600);
  assert.ok(!isStaff(), "按第二次才移除");

  // 操作紀錄
  await a.reload({ waitUntil: "networkidle" });
  await a.waitForTimeout(1200);
  assert.ok(/下架 A1 區 A1-03/.test(await a.textContent("main")), "操作紀錄：下架");
  assert.ok(/指派 阿定 為定線長/.test(await a.textContent("main")), "操作紀錄：指派員工");

  // ---- 顧客 ----
  const C = await phone(browser, mock);
  const c = C.page;
  await c.goto(BASE + "/gym/mingde", { waitUntil: "networkidle" });
  await c.waitForTimeout(500);
  assert.match(await c.textContent("main p"), /牆上 2 條路線/);
  await login(c, "climber88", "password1", "/gym/mingde");
  await c.locator('svg[role=img] g[aria-label^="A1 區"] text').first().click();
  await c.waitForURL("**/zone?id=**");
  await c.waitForTimeout(800);
  assert.equal(await c.locator('main button[aria-label^="V"]').count(), 2, "照片上 2 個起步點");

  await c.click('main button[aria-label^="V4"]');
  await c.waitForTimeout(400);
  assert.match((await c.locator("[role=dialog] p", { hasText: "Flash" }).first().textContent()).replace(/\s+/g, ""), /完攀50分・Flash60分/);
  await c.click('[role=dialog] button:has-text("Flash")');
  await c.waitForTimeout(500);
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("+60 分"), "點一下就記錄");
  assert.equal(mock.db.ascents[0].status, "flash");
  await c.click("[role=dialog] >> text=＋ 加上心得與感受");
  await c.fill("#lnote", "終於送了！");
  await c.click('[role=dialog] button:text-is("儲存")');
  await c.waitForTimeout(500);
  assert.equal(mock.db.ascents[0].private_note, "終於送了！");
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);

  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  await c.waitForTimeout(500);
  await c.click('[role=dialog] [role=tab]:has-text("留言")');
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
  await a.click('main button:has-text("整區換線（")');
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

test("訊號差：新增路線沒收到回覆，再按一次不會多一條；存檔時顯示儲存中", async () => {
  const mock = createMock();
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const zA = mock.db.zones[0];
  mock.db.files["mingde/zones/A-1.jpg"] = fs.readFileSync(WALL);
  zA.photo_path = "mingde/zones/A-1.jpg";
  const { page: a, errors } = await phone(browser, mock);
  await login(a, "boss", "password1", "/admin");
  await a.waitForTimeout(800);
  const wall = a.locator("main div.cursor-crosshair");
  await wall.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bb = await wall.boundingBox();
  await a.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
  await a.waitForTimeout(300);

  // 網路慢：按鈕顯示「儲存中…」
  await a.route("**/rest/v1/routes**", async (r) => {
    if (r.request().method() === "POST") await new Promise((res) => setTimeout(res, 1200));
    await r.fallback();
  });
  // 資料存進去了，但手機沒收到回覆
  mock.state.dropRouteReply = true;
  await a.click('[role=dialog] button:text-is("新增路線")');
  await a.waitForTimeout(400);
  assert.equal(await a.locator('[role=dialog] button:text-is("儲存中…")').count(), 1, "存檔時按鈕顯示儲存中");
  await a.waitForTimeout(1500);
  assert.equal(mock.db.routes.length, 1, "其實已經存進去");
  assert.ok(await a.isVisible('[role=dialog] button:text-is("新增路線")'), "手機以為失敗：面板還開著，可以再按");
  const firstGrade = mock.db.routes[0].grade;

  // 重按前改了難度：照這次選的存
  await a.click('[role=dialog] button:text-is("V5")');
  await a.click('[role=dialog] button:text-is("新增路線")');
  await a.waitForTimeout(1800);
  assert.equal(mock.db.routes.length, 1, "再按一次不會多一條");
  assert.notEqual(firstGrade, 5);
  assert.equal(mock.db.routes[0].grade, 5, "重按前改的難度有存進去");
  assert.match(await a.locator("[role=status]").last().textContent(), /已新增 A1-01（V5/);
  assert.equal(await a.locator("[role=dialog]").count(), 0, "新增完成，面板關閉");
  assert.equal(await a.locator("main ul li").count(), 1, "列表只有一條");
  assert.deepEqual(errors, []);
});

test("訊號差：新增失敗後直接關掉面板，列表會重新讀，存進去的那條會出現", async () => {
  const mock = createMock();
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const zA = mock.db.zones[0];
  mock.db.files["mingde/zones/A-1.jpg"] = fs.readFileSync(WALL);
  zA.photo_path = "mingde/zones/A-1.jpg";
  const { page: a, errors } = await phone(browser, mock);
  await login(a, "boss", "password1", "/admin");
  await a.waitForTimeout(800);
  const wall = a.locator("main div.cursor-crosshair");
  await wall.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bb = await wall.boundingBox();
  await a.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
  await a.waitForTimeout(300);
  mock.state.dropRouteReply = true;
  await a.click('[role=dialog] button:text-is("新增路線")');
  await a.waitForTimeout(800);
  assert.equal(mock.db.routes.length, 1, "其實已經存進去");
  await a.click('[role=dialog] button:text-is("取消")');
  await a.waitForTimeout(800);
  assert.equal(await a.locator("main ul li").count(), 1, "關掉後列表出現那一條，就不會在同一個位置再標一次");
  assert.equal(await a.locator('main button[aria-label="編輯 A1-01"]').count(), 1, "照片上也有那個點");
  assert.deepEqual(errors, []);
});
