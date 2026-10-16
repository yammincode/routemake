// 路線回報（step47）：區域頁最下面回報沒標到的路線、路線卡片回報有問題；那一館的員工在後台處理；還沒套用 step47 不顯示
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, WALL, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const withPhoto = (mock, z) => {
  Object.assign(z, { photo_path: `${z.gym_id}/zones/${z.code}-1.jpg`, photo_width: 800, photo_height: 600 });
  mock.db.files[z.photo_path] = fs.readFileSync(WALL);
};
// 點照片上的某個位置（百分比）
async function tapPhoto(sheet, x, y) {
  const img = sheet.locator("img").first();
  const b = await img.boundingBox();
  await sheet.page().mouse.click(b.x + (b.width * x) / 100, b.y + (b.height * y) / 100);
  await sheet.page().waitForTimeout(150);
}
const lastSheet = (page) => page.locator("[role=dialog]").last();

test("回報沒標到的路線：區域頁最下面、要登入、點位置選顏色猜難度、說明不能放網址", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones[0];
  withPhoto(mock, zA);
  mock.addRoute(zA, 3, "藍", [], 30, 60);
  const { page, errors } = await phone(browser, mock);

  // 沒登入：點了去登入
  await page.goto(`${BASE}/zone?id=${zA.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const link = page.locator("main button", { hasText: "找不到你爬的路線？" });
  assert.equal(await link.count(), 1, "區域頁有回報入口");
  const order = await page.locator("main").evaluate((el) => {
    const t = el.innerText;
    return [t.indexOf("藍色"), t.indexOf("找不到你爬的路線？")];
  });
  assert.ok(order[0] >= 0 && order[0] < order[1], "入口在路線列表下面（最下面）");
  await link.click();
  await page.waitForURL("**/login**");
  assert.ok(decodeURIComponent(page.url()).includes(`/zone?id=${zA.id}`), "登入後回到這一區");

  await login(page, "climber88", "password1", `/zone?id=${zA.id}`);
  await page.waitForTimeout(500);
  await page.locator("main button", { hasText: "找不到你爬的路線？" }).click();
  await page.waitForTimeout(300);
  const s = lastSheet(page);
  assert.ok((await s.textContent()).includes("回報沒標到的路線"));
  const send = s.locator("button", { hasText: /送出|請先|請選/ });
  assert.equal((await send.textContent()).trim(), "請先在照片上點位置");
  assert.ok(await send.isDisabled());
  assert.equal(await s.getByTestId("report-spot").count(), 0);
  await tapPhoto(s, 60, 30);
  assert.equal(await s.getByTestId("report-spot").count(), 1, "點的位置出現虛線圈");
  assert.equal((await send.textContent()).trim(), "請選顏色");
  await s.locator('button[aria-label="紫"]').click();
  assert.equal(await s.locator('button:has-text("不知道")').getAttribute("aria-pressed"), "true", "難度預設不知道");
  await s.locator("button", { hasText: /^V4$/ }).click();
  assert.equal(await s.locator('button:has-text("不知道")').getAttribute("aria-pressed"), "false");
  await s.locator("#rpnote").fill("在大斜面那邊 example.com");
  await send.click();
  await page.waitForTimeout(500);
  assert.ok((await page.textContent("[role=status]")).includes("不能放網址"));
  assert.equal(mock.db.reports.length, 0);
  await s.locator("#rpnote").fill("  在大斜面那邊  ");
  await send.click();
  await page.waitForTimeout(600);
  assert.ok((await page.textContent("[role=status]")).includes("已送出"));
  assert.equal(await page.locator("[role=dialog]").count(), 0, "送出後關掉");
  const r = mock.db.reports[0];
  assert.equal(r.kind, "missing");
  assert.equal(r.zone_id, zA.id);
  assert.equal(r.hold_color, "紫");
  assert.equal(r.grade_guess, 4);
  assert.equal(r.note, "在大斜面那邊");
  assert.ok(Math.abs(r.pin_x - 60) < 2 && Math.abs(r.pin_y - 30) < 2, `位置對（${r.pin_x}, ${r.pin_y}）`);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("回報這條有問題：路線卡片分頁下面；顏色不對、位置標錯、已經拆了；停權、每天 10 則", async () => {
  const mock = createMock();
  const uid = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones[0];
  withPhoto(mock, zA);
  const rt = mock.addRoute(zA, 3, "藍", [], 30, 60);
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", `/zone?id=${zA.id}`);
  await page.waitForTimeout(500);
  await page.locator("main ul li button", { hasText: "藍色" }).click();
  await page.waitForTimeout(500);
  const card = page.locator("[role=dialog]").first();
  const pos = await card.evaluate((el) => {
    const t = el.innerText;
    return [t.indexOf("留言"), t.indexOf("回報這條有問題")];
  });
  assert.ok(pos[0] >= 0 && pos[0] < pos[1], "入口在分頁下面");

  const open = async () => {
    await card.locator("button", { hasText: "回報這條有問題" }).click();
    await page.waitForTimeout(300);
    return lastSheet(page);
  };
  // 顏色不對
  let s = await open();
  assert.ok((await s.textContent()).includes(`${rt.code}（藍色 V3）`));
  assert.equal(await s.locator("button", { hasText: "難度" }).count(), 0, "不能回報難度");
  await s.locator("button", { hasText: "顏色不對" }).click();
  await s.locator('button[aria-label="紫"]').click();
  await s.locator("button", { hasText: "送出回報" }).click();
  await page.waitForTimeout(600);
  assert.deepEqual(
    { kind: mock.db.reports[0].kind, color: mock.db.reports[0].hold_color, route: mock.db.reports[0].route_id, zone: mock.db.reports[0].zone_id },
    { kind: "color", color: "紫", route: rt.id, zone: zA.id }
  );
  // 位置標錯：點正確位置
  s = await open();
  await s.locator("button", { hasText: "位置標錯" }).click();
  assert.ok(await s.locator("button", { hasText: "請先在照片上點位置" }).isDisabled());
  await tapPhoto(s, 45, 70);
  await s.locator("button", { hasText: "送出回報" }).click();
  await page.waitForTimeout(600);
  const pin = mock.db.reports[1];
  assert.equal(pin.kind, "pin");
  assert.ok(Math.abs(pin.pin_x - 45) < 2 && Math.abs(pin.pin_y - 70) < 2);
  // 已經拆了
  s = await open();
  await s.locator("button", { hasText: "已經拆了" }).click();
  await s.locator("button", { hasText: "送出回報" }).click();
  await page.waitForTimeout(600);
  assert.equal(mock.db.reports[2].kind, "gone");

  // 每天 10 則
  for (let i = 0; i < 7; i++) mock.db.reports.push({ ...mock.db.reports[2], id: `x${i}` });
  s = await open();
  await s.locator("button", { hasText: "已經拆了" }).click();
  await s.locator("button", { hasText: "送出回報" }).click();
  await page.waitForTimeout(600);
  assert.ok((await page.textContent("[role=status]")).includes("10 則"));
  assert.equal(mock.db.reports.length, 10);
  await s.locator("button", { hasText: "取消" }).click();

  // 停權中不能回報
  mock.db.reports.length = 0;
  mock.db.profiles.find((p) => p.id === uid).suspended_until = new Date(Date.now() + 86400000).toISOString();
  s = await open();
  await s.locator("button", { hasText: "已經拆了" }).click();
  await s.locator("button", { hasText: "送出回報" }).click();
  await page.waitForTimeout(600);
  assert.ok((await page.textContent("[role=status]")).includes("暫停"));
  assert.equal(mock.db.reports.length, 0);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("後台路線回報：合成一則、照片標位置、新增這條帶入、改顏色、移位置、下架、沒問題、不是路線；別館看不到", async () => {
  const mock = createMock();
  const a = mock.addUser("climber_a", "password1", { nickname: "小安" });
  const b = mock.addUser("climber_b", "password1", { nickname: "阿凱" });
  const st = mock.addUser("setter1", "password1", { nickname: "定線員" });
  const mg = mock.addUser("manager1", "password1", { nickname: "店長" });
  const st2 = mock.addUser("setter2", "password1", { nickname: "萬華定線" });
  mock.db.staff_roles.push({ user_id: st, gym_id: "mingde", role: "setter" }, { user_id: mg, gym_id: "mingde", role: "manager" }, { user_id: st2, gym_id: "g2", role: "setter" });
  const zA = mock.db.zones[0];
  withPhoto(mock, zA);
  const r1 = mock.addRoute(zA, 3, "藍", [], 30, 60);
  const r2 = mock.addRoute(zA, 5, "紅", [], 70, 40);
  const r3 = mock.addRoute(zA, 2, "黃", [], 50, 80);
  const r4 = mock.addRoute(zA, 6, "綠", [], 20, 20);
  const t0 = Date.now() - 3600000;
  const rep = (user, i, f) => mock.db.reports.push({ id: `rp${mock.db.reports.length}`, user_id: user, zone_id: zA.id, route_id: null, kind: "missing", hold_color: null, grade_guess: null, pin_x: null, pin_y: null, note: null, status: "new", result_route_id: null, handled_by: null, handled_at: null, created_at: new Date(t0 + i * 60000).toISOString(), ...f });
  // 兩個人回報同一條紫色（位置很近）→ 合成一則；另一條橘色離很遠
  rep(a, 0, { hold_color: "紫", grade_guess: 4, pin_x: 60, pin_y: 30, note: "大斜面起步" });
  rep(b, 1, { hold_color: "紫", grade_guess: 4, pin_x: 63, pin_y: 33 });
  rep(b, 2, { hold_color: "橙", pin_x: 10, pin_y: 90 });
  rep(a, 3, { kind: "color", route_id: r1.id, hold_color: "紫" });
  rep(a, 4, { kind: "pin", route_id: r2.id, pin_x: 75, pin_y: 55 });
  rep(a, 5, { kind: "gone", route_id: r3.id });
  rep(b, 6, { kind: "gone", route_id: r4.id });

  const { page, errors } = await phone(browser, mock);
  await login(page, "setter1", "password1", "/admin");
  await page.waitForTimeout(1200);
  const main = page.locator("main");
  assert.ok((await main.textContent()).includes("路線回報7"), "標題旁寫還沒處理的則數");
  const item = (t) => main.locator("li", { hasText: t });
  const purple = item("紫色・猜 V4");
  assert.ok((await purple.textContent()).includes("2 人回報") && (await purple.textContent()).includes("小安、阿凱"), "同一條合成一則、寫誰回報");
  assert.ok((await purple.textContent()).includes("小安：大斜面起步"), "說明寫出來");
  // 照片上的回報標記
  assert.equal(await main.locator('button[aria-label^="回報："]').count(), 6);
  await purple.locator("button[aria-pressed]").first().click();
  await page.waitForTimeout(300);
  assert.equal(await main.locator('button[aria-label="回報：沒標到的路線"][aria-pressed="true"]').textContent(), "2", "選中的標記加框、數字是幾個人");

  // ＋ 新增這條：帶入位置、顏色、難度，存好後回報標成已新增
  await purple.locator("button", { hasText: "＋ 新增這條" }).click();
  await page.waitForTimeout(400);
  const ed = lastSheet(page);
  assert.ok((await ed.textContent()).includes("照客人回報帶入位置、顏色、難度"));
  assert.equal(await ed.locator('button[aria-label="紫"]').getAttribute("aria-pressed"), "true");
  assert.equal(await ed.locator("button", { hasText: /^V4$/ }).getAttribute("aria-pressed"), "true");
  await ed.locator("button", { hasText: "新增路線" }).click();
  await page.waitForTimeout(800);
  const added = mock.db.routes.find((r) => r.hold_color === "紫");
  assert.ok(added && Math.abs(added.pin_x - 61.5) < 0.1 && Math.abs(added.pin_y - 31.5) < 0.1, "位置用兩人點的平均");
  assert.equal(added.grade, 4);
  assert.deepEqual(mock.db.reports.filter((r) => r.result_route_id === added.id).map((r) => r.status), ["added", "added"]);
  assert.ok((await main.textContent()).includes("路線回報5"));

  // 不是路線
  await item("橙色").locator("button", { hasText: "不是路線" }).click();
  await page.waitForTimeout(500);
  assert.equal(mock.db.reports[2].status, "rejected");
  // 顏色不對 → 改成紫色
  await item("顏色不對").locator("button", { hasText: "改成紫色" }).click();
  await page.waitForTimeout(500);
  assert.equal(r1.hold_color, "紫");
  assert.equal(mock.db.reports[3].status, "fixed");
  // 位置標錯 → 移到回報的位置
  await item("位置標錯").locator("button", { hasText: "移到回報的位置" }).click();
  await page.waitForTimeout(500);
  assert.deepEqual([r2.pin_x, r2.pin_y], [75, 55]);
  assert.equal(mock.db.reports[4].status, "fixed");
  // 已經拆了 → 下架（按兩次）
  const gone = item(`${r3.code}（黃色`);
  await gone.locator("button", { hasText: "下架這條" }).click();
  await page.waitForTimeout(200);
  assert.equal(r3.archived_at, null, "按一次還沒下架");
  await gone.locator("button", { hasText: "再按一次" }).click();
  await page.waitForTimeout(600);
  assert.ok(r3.archived_at, "按兩次才下架");
  assert.equal(mock.db.reports[5].status, "fixed");
  // 沒問題
  await item(`${r4.code}（綠色`).locator("button", { hasText: "沒問題" }).click();
  await page.waitForTimeout(500);
  assert.equal(mock.db.reports[6].status, "ok");
  assert.ok((await main.textContent()).includes("目前沒有還沒處理的回報"));
  assert.equal(mock.db.audit.filter((x) => x.action === "report.handle").length, 7, "寫進操作紀錄");
  await page.context().close();

  // 店長在操作紀錄看得到
  const M = await phone(browser, mock);
  await login(M.page, "manager1", "password1", "/admin");
  await M.page.waitForTimeout(1500);
  const mt = await M.page.textContent("main");
  assert.ok(mt.includes("處理路線回報（沒標到的路線：A1 區") && mt.includes("：已新增"), "操作紀錄寫成看得懂的話");
  await M.ctx.close();

  // 別館的定線員看不到明德的回報
  rep(a, 7, { hold_color: "粉", pin_x: 40, pin_y: 40 });
  const O = await phone(browser, mock);
  await login(O.page, "setter2", "password1", "/admin");
  await O.page.waitForTimeout(1200);
  const ot = await O.page.textContent("main");
  assert.ok(ot.includes("目前沒有還沒處理的回報") && !ot.includes("粉色"));
  assert.deepEqual([...errors, ...M.errors, ...O.errors], []);
  await O.ctx.close();
});

test("還沒套用 step47：區域頁、路線卡片沒有入口，後台說明要執行 step47；沒照片的區沒有入口", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const st = mock.addUser("setter1", "password1", { nickname: "定線員" });
  mock.db.staff_roles.push({ user_id: st, gym_id: "mingde", role: "setter" });
  const zA = mock.db.zones[0];
  withPhoto(mock, zA);
  mock.addRoute(zA, 3, "藍", [], 30, 60);
  const zB = mock.db.zones[1];
  mock.addRoute(zB, 3, "紅", [], 30, 60);
  mock.state.noReports = true;
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", `/zone?id=${zA.id}`);
  await page.waitForTimeout(800);
  assert.equal(await page.locator("main button", { hasText: "找不到你爬的路線？" }).count(), 0);
  await page.locator("main ul li button", { hasText: "藍色" }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[role=dialog] button", { hasText: "回報這條有問題" }).count(), 0);
  await page.context().close();

  mock.state.noReports = false;
  const P = await phone(browser, mock);
  await login(P.page, "climber88", "password1", `/zone?id=${zB.id}`);
  await P.page.waitForTimeout(800);
  assert.equal(await P.page.locator("main button", { hasText: "找不到你爬的路線？" }).count(), 0, "沒照片的區沒有入口");
  await P.ctx.close();

  mock.state.noReports = true;
  const S = await phone(browser, mock);
  await login(S.page, "setter1", "password1", "/admin");
  await S.page.waitForTimeout(1200);
  assert.ok((await S.page.textContent("main")).includes("請老闆在 Supabase 執行 step47"));
  assert.deepEqual([...errors, ...P.errors, ...S.errors], []);
  await S.ctx.close();
});
