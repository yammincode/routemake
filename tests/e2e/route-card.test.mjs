// 路線卡片（10/16 使用者選的 1A、3B、2a）：攀爬日膠囊（預設今天、先選再記、記過的直接改）；
// 卡片全螢幕、最上面照片標起步點、手機返回鍵只關卡片；Spray Wall 岩館路線員工上傳照片（圈圈可以不畫、列表縮圖、還沒套用 step44 照舊）
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, WALL, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const md = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;

test("攀爬日膠囊：預設今天；先選昨天再按完攀就記昨天；記過的直接改日期；嘗試中改完攀時自己選的日期優先；最早到路線放上 App 前 7 天、選太早寫範圍", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones[0];
  const created = new Date(Date.now() - 20 * 86400000).toISOString();
  const r1 = mock.addRoute(zA, 3, "藍", [], 40, 50, created);
  const r2 = mock.addRoute(zA, 4, "紅", [], 60, 40, created);
  const r3 = mock.addRoute(zA, 5, "綠", [], 70, 60, created);
  const fresh = mock.addRoute(zA, 2, "黃", [], 20, 30); // 今天才放上 App：最早可以選到 7 天前
  mock.addAscent(me, r3, "project", taipeiDay(-5));
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(800);
  const asc = (r) => mock.db.ascents.find((a) => a.route_id === r.id);
  const row = (color) => page.locator("main ul li button", { hasText: `${color}色` });
  const dlg = page.locator("[role=dialog]");
  const day = dlg.getByTestId("climb-day");
  const pill = day.locator("button[aria-expanded]");
  const close = async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  };

  // 沒記錄：膠囊寫今天，在三顆按鈕上面
  await row("藍").click();
  await page.waitForTimeout(400);
  assert.equal((await pill.textContent()).replace(/\s+/g, ""), `今天${md(taipeiDay(0))}▾`);
  const flashBtn = dlg.locator('button[aria-pressed]:has-text("Flash")');
  assert.ok((await day.boundingBox()).y < (await flashBtn.boundingBox()).y, "攀爬日在 Flash 上面");
  // 先選昨天再按完攀：記昨天
  await pill.click();
  await day.locator('button:text-is("昨天")').click();
  assert.equal(asc(r1), undefined, "還沒記錄只是先選日期，不會存");
  assert.ok((await pill.textContent()).includes(`昨天 ${md(taipeiDay(-1))}`));
  await dlg.locator('button:has-text("完攀")').first().click();
  await page.waitForTimeout(600);
  assert.equal(asc(r1).status, "send");
  assert.equal(asc(r1).climbed_on, taipeiDay(-1), "記在選的那天");
  // 記過的：直接改成前天，馬上存
  await pill.click();
  await day.locator('button:text-is("前天")').click();
  await page.waitForTimeout(600);
  assert.equal(asc(r1).climbed_on, taipeiDay(-2), "改日期馬上存");
  assert.match(await page.locator("[role=status]").last().textContent(), /攀爬日改成/);
  // 選日期：用日曆選 3 天前
  await pill.click();
  await day.locator('button:has-text("選日期")').click();
  await day.locator('input[type=date]').fill(taipeiDay(-3));
  await page.waitForTimeout(300);
  assert.equal(asc(r1).climbed_on, taipeiDay(-2), "選日期停一下才算選好（電腦上一格一格打字不會存到打一半的日期）");
  await page.waitForTimeout(1300);
  assert.equal(asc(r1).climbed_on, taipeiDay(-3), "用日曆選的日期");
  // 心得裡沒有第二個日期欄位
  await dlg.locator('button:has-text("＋ 加上心得與感受")').click();
  assert.equal(await dlg.locator("#ldate").count(), 0, "日期只在膠囊改");
  await close();

  // 不改日期：照舊記今天
  await row("紅").click();
  await page.waitForTimeout(400);
  await dlg.locator('button:has-text("Flash")').first().click();
  await page.waitForTimeout(600);
  assert.equal(asc(r2).climbed_on, taipeiDay(0), "預設今天");
  await close();

  // 嘗試中（5 天前）改完攀：沒選日期記今天（原本的規則）；自己選了昨天就照選的
  await row("綠").click();
  await page.waitForTimeout(400);
  assert.ok((await pill.textContent()).includes(md(taipeiDay(-5))), "記過的顯示原本的日期");
  await pill.click();
  await day.locator('button:text-is("昨天")').click();
  await page.waitForTimeout(500);
  assert.equal(asc(r3).climbed_on, taipeiDay(-1));
  await dlg.locator('button:has-text("完攀")').first().click();
  await page.waitForTimeout(600);
  assert.equal(asc(r3).status, "send");
  assert.equal(asc(r3).climbed_on, taipeiDay(-1), "自己選的日期優先，不自動改成今天");
  await close();

  // 今天才放上 App 的路線（step50）：可以選到 7 天前（定線員常常先上牆才放上 App）；8 天前不改、寫可以選的範圍
  await row("黃").click();
  await page.waitForTimeout(400);
  await pill.click();
  assert.ok(await day.locator('button:text-is("前天")').isEnabled(), "放上 App 前幾天也能選");
  await day.locator('button:has-text("選日期")').click();
  await day.locator("input[type=date]").fill(taipeiDay(-8));
  await page.waitForTimeout(1200);
  assert.match(await day.locator("[role=alert]").textContent(), new RegExp(`只能選 ${md(taipeiDay(-7))}～${md(taipeiDay(0))}`), "選太早寫可以選的範圍");
  assert.ok((await pill.textContent()).includes("今天"), "選太早不改");
  await day.locator("input[type=date]").fill(taipeiDay(-7));
  await page.waitForTimeout(1200);
  assert.equal(await day.locator("[role=alert]").count(), 0, "選對了說明就拿掉");
  assert.ok((await pill.textContent()).includes(md(taipeiDay(-7))));
  await dlg.locator('button:has-text("完攀")').first().click();
  await page.waitForTimeout(600);
  assert.equal(asc(fresh).climbed_on, taipeiDay(-7), "記在放上 App 前 7 天");
  assert.deepEqual(errors, []);
});

test("路線卡片全螢幕：最上面照片標起步點；‹ 關掉不多一層上一頁；手機返回鍵只關卡片、留在區域頁", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones[0];
  Object.assign(zA, { photo_path: `${zA.gym_id}/zones/${zA.code}-1.jpg`, photo_width: 800, photo_height: 600 });
  mock.db.files[zA.photo_path] = fs.readFileSync(WALL);
  const r = mock.addRoute(zA, 4, "藍", [], 35, 55);
  const { page, errors } = await phone(browser, mock, { viewport: { width: 390, height: 844 } });
  await login(page, "climber88", "password1", "/gyms");
  await page.goto(`${BASE}/zone?id=${zA.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const zoneUrl = page.url();
  const row = page.locator("main ul li button", { hasText: "藍色" });
  const dlg = page.locator("[role=dialog]");

  await row.click();
  await page.waitForTimeout(500);
  const b = await dlg.boundingBox();
  assert.ok(b.y <= 1 && b.height >= 840, `蓋滿整個畫面（y=${b.y}, h=${b.height}）`);
  const hero = dlg.getByTestId("route-hero");
  assert.equal(await hero.count(), 1, "最上面有照片");
  const pin = hero.locator(`button[aria-label="${r.code} 的起步點"]`);
  assert.equal(await pin.getAttribute("aria-current"), "true", "起步點用黃圈標出來");
  const hb = await hero.boundingBox();
  assert.ok(hb.y <= 1 && hb.width >= 389, "照片滿版貼齊上面和兩邊");
  const order = await dlg.evaluate((el) => {
    const t = el.innerText;
    return [t.indexOf("藍色"), t.indexOf("攀爬日"), t.indexOf("紀錄")];
  });
  assert.ok(order[0] < order[1] && order[1] < order[2], "照片 → 路線名稱 → 攀爬日 → 分頁");

  // 手機返回鍵：只關卡片，還在區域頁
  await page.goBack();
  await page.waitForTimeout(500);
  assert.equal(await dlg.count(), 0, "返回鍵關掉卡片");
  assert.equal(page.url(), zoneUrl, "還在區域頁");

  // ‹ 關掉：之後按返回直接回上一頁（不用多按一次）
  await row.click();
  await page.waitForTimeout(400);
  await dlg.locator('button[aria-label="關閉"]').click();
  await page.waitForTimeout(500);
  assert.equal(await dlg.count(), 0, "‹ 關掉");
  assert.equal(page.url(), zoneUrl);
  await page.goBack();
  await page.waitForURL((u) => !u.href.includes("/zone"));
  assert.ok(page.url().endsWith("/gyms"), "返回直接回上一頁：" + page.url());

  // 沒有照片的區域：照樣全螢幕，上面留空給 ‹
  const zB = mock.db.zones[1];
  mock.addRoute(zB, 2, "紅", [], 30, 30);
  await page.goto(`${BASE}/zone?id=${zB.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator("main ul li button", { hasText: "紅色" }).click();
  await page.waitForTimeout(400);
  assert.equal(await dlg.getByTestId("route-hero").count(), 0, "沒有照片");
  assert.ok((await dlg.boundingBox()).height >= 840, "照樣全螢幕");
  assert.deepEqual(errors, []);
});

test("Spray Wall 岩館路線（step44）：員工先放照片、圈圈可以不畫；列表放照片縮圖；卡片最上面是那張照片；換照片刪掉舊的", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const setter = mock.addUser("setterx", "password1", { nickname: "阿定" });
  mock.db.staff_roles.push({ user_id: setter, gym_id: "mingde", role: "setter" });
  const sw = mock.db.zones.find((z) => z.gym_id === "mingde" && z.kind === "spray");
  sw.photo_path = "mingde/zones/S-1.jpg";
  mock.db.files[sw.photo_path] = fs.readFileSync(WALL);

  const S = await phone(browser, mock);
  const s = S.page;
  await login(s, "setterx", "password1", "/spray/mingde-sw");
  await s.waitForTimeout(800);
  await s.click('main button:has-text("新增岩館路線")');
  await s.waitForTimeout(400);
  const dlg = s.locator("[role=dialog]");
  assert.ok((await dlg.textContent()).includes("先拍或選一張這條路線的照片"), "先放照片");
  assert.equal(await dlg.locator('img[alt="Spray Wall 公版照片"]').count(), 0, "還沒放照片前不顯示公版照片");
  await dlg.locator('button:text-is("發布路線")').click();
  await s.waitForTimeout(300);
  assert.match(await s.locator("[role=status]").last().textContent(), /先放這條路線的照片/);
  await dlg.locator("input[type=file]").setInputFiles(WALL);
  await s.waitForTimeout(500);
  assert.equal(await dlg.locator('img[alt="這條路線的照片"]').count(), 1, "預覽選的照片");
  assert.ok((await dlg.textContent()).includes("不畫也可以"));
  await s.fill("#sname", "教練的照片路線");
  await dlg.locator('button:text-is("V5")').click();
  await dlg.locator('button:text-is("發布路線")').click();
  await s.waitForTimeout(1200);
  const r = mock.db.routes.find((x) => x.name === "教練的照片路線");
  assert.ok(r, "存進去了");
  assert.equal(r.kind, "gym");
  assert.match(r.photo_path, /^mingde\/routes\/S-\d+\.jpg$/, "照片放在館的 routes 資料夾");
  assert.ok(!r.holds, "沒畫圈圈");
  assert.ok(mock.db.files[r.photo_path], "原圖上傳了");
  assert.ok(mock.db.files[r.photo_path.replace(/\.jpg$/, ".thumb.jpg")], "縮圖也上傳了");

  // 列表：照片縮圖（不是公版照片）
  const thumb = s.locator("main ul li button", { hasText: "教練的照片路線" }).locator("img");
  assert.ok((await thumb.getAttribute("src")).includes("/routes/") && (await thumb.getAttribute("src")).includes(".thumb.jpg"), "列表放這條路線的縮圖");

  // 顧客打開：卡片最上面是那張照片
  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", "/spray/mingde-sw");
  await c.waitForTimeout(800);
  await c.locator("main ul li button", { hasText: "教練的照片路線" }).click();
  await c.waitForTimeout(500);
  const heroImg = c.locator('[role=dialog] [data-testid="route-hero"] img');
  assert.ok((await heroImg.getAttribute("src")).endsWith(r.photo_path), "卡片照片是路線自己的");
  await c.keyboard.press("Escape");

  // 員工修改：換一張照片、這次畫圈圈 → 舊照片刪掉
  const oldPath = r.photo_path;
  await s.locator("main ul li button", { hasText: "教練的照片路線" }).click();
  await s.waitForTimeout(500);
  await dlg.locator('button:text-is("修改")').click();
  await s.waitForTimeout(400);
  const ed = s.locator("[role=dialog]").last(); // 修改面板疊在路線卡片上面
  assert.ok((await ed.textContent()).includes("修改路線"));
  await ed.locator('input[type=file][aria-label="路線照片"]').setInputFiles(WALL);
  await s.waitForTimeout(500);
  const img = ed.locator('img[alt="這條路線的照片"]');
  const tap = async (fx, fy) => {
    await img.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const bb = await img.boundingBox();
    await s.mouse.click(bb.x + bb.width * fx, bb.y + bb.height * fy);
    await s.waitForTimeout(120);
  };
  await tap(0.3, 0.8); // 起攀
  await ed.locator('button:text-is("儲存修改")').click();
  await s.waitForTimeout(400);
  assert.match(await s.locator("[role=status]").last().textContent(), /有畫圈圈的話要有起攀（S）和完攀（T）/, "畫了就要畫完整");
  await ed.locator('button:has-text("完攀 T")').click();
  await tap(0.6, 0.2);
  await ed.locator('button:text-is("儲存修改")').click();
  await s.waitForTimeout(1200);
  assert.notEqual(r.photo_path, oldPath, "換了新照片");
  assert.ok(!mock.db.files[oldPath] && !mock.db.files[oldPath.replace(/\.jpg$/, ".thumb.jpg")], "舊照片和縮圖刪掉");
  assert.deepEqual(r.holds.map((h) => h.t).sort(), ["s", "t"]);
  assert.deepEqual([...S.errors, ...C.errors], []);
});

test("Spray Wall 岩館路線：資料庫還沒套用 step44 照舊在公版照片上畫圈；岩友路線一直是公版照片", async () => {
  const mock = createMock();
  mock.state.noRoutePhoto = true;
  const setter = mock.addUser("setterx", "password1", { nickname: "阿定" });
  mock.db.staff_roles.push({ user_id: setter, gym_id: "mingde", role: "setter" });
  const sw = mock.db.zones.find((z) => z.gym_id === "mingde" && z.kind === "spray");
  sw.photo_path = "mingde/zones/S-1.jpg";
  mock.db.files[sw.photo_path] = fs.readFileSync(WALL);
  const { page: s, errors } = await phone(browser, mock);
  await login(s, "setterx", "password1", "/spray/mingde-sw");
  await s.waitForTimeout(800);
  const dlg = s.locator("[role=dialog]");
  const tap = async (fx, fy) => {
    const img = dlg.locator('img[alt="Spray Wall 公版照片"]');
    await img.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const bb = await img.boundingBox();
    await s.mouse.click(bb.x + bb.width * fx, bb.y + bb.height * fy);
    await s.waitForTimeout(120);
  };
  await s.click('main button:has-text("新增岩館路線")');
  await s.waitForTimeout(600);
  assert.equal(await dlg.locator("input[type=file]").count(), 0, "還沒套用 step44：沒有放照片");
  await tap(0.3, 0.8);
  await dlg.locator('button:has-text("完攀 T")').click();
  await tap(0.6, 0.2);
  await s.fill("#sname", "公版上的路線");
  await dlg.locator('button:text-is("發布路線")').click();
  await s.waitForTimeout(800);
  const r = mock.db.routes.find((x) => x.name === "公版上的路線");
  assert.ok(r && r.holds.length === 2 && !("photo_path" in r), "照舊存圈圈");

  // 岩友路線：沒有放照片的按鈕
  mock.state.noRoutePhoto = false;
  await s.click('main [role=tab]:has-text("岩友路線")');
  await s.waitForTimeout(400);
  await s.click('main button:has-text("出一條岩友路線")');
  await s.waitForTimeout(500);
  assert.equal(await dlg.locator("input[type=file]").count(), 0, "岩友路線不能放照片");
  assert.equal(await dlg.locator('img[alt="Spray Wall 公版照片"]').count(), 1);
  assert.deepEqual(errors, []);
});
