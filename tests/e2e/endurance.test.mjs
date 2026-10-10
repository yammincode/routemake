// 長耐力區域：店長切換、定線長照順序標點新增（不選顏色）、有人記錄後點不能改；
// 顧客記錄最高爬到第幾點、照比例算分、完攀；列表與我的紀錄；資料庫還沒套用 step30 時一般紀錄照常
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, WALL, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

// 萬華訓練區（TR）放一張照片
function setup() {
  const mock = createMock();
  const z = mock.db.zones.find((x) => x.gym_id === "g2" && x.code === "TR");
  Object.assign(z, { photo_path: "g2/zones/TR-1.jpg", photo_width: 800, photo_height: 600 });
  mock.db.files[z.photo_path] = fs.readFileSync(WALL);
  return { mock, z };
}
// 長耐力路線：照順序 n 個點、5.11a
function addEndurance(mock, z, n = 10) {
  z.grade_system = "endurance";
  const r = mock.addRoute(z, 108, "白");
  r.holds = Array.from({ length: n }, (_, i) => ({ x: 10 + i * 8, y: 70 - i * 4, t: i === 0 ? "s" : i === n - 1 ? "t" : "h" }));
  Object.assign(r, { pin_x: r.holds[0].x, pin_y: r.holds[0].y });
  return r;
}

test("長耐力：店長切換規則、照順序點岩點新增（不選顏色、可復原）；有人記錄過點就不能改", async () => {
  const { mock, z } = setup();
  const mgr = mock.addUser("manager1", "password1", { nickname: "萬華店長" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "g2", role: "manager" });
  const { page: m, errors } = await phone(browser, mock);
  await login(m, "manager1", "password1", "/admin");
  await m.waitForTimeout(1000);
  await m.locator('main svg [aria-label^="訓練區"]').dispatchEvent("click");
  await m.waitForTimeout(600);
  await m.click('main button:text-is("長耐力")');
  await m.waitForTimeout(800);
  assert.equal(z.grade_system, "endurance", "切換成長耐力");
  assert.equal(await m.getAttribute('main button:text-is("長耐力")', "aria-pressed"), "true");

  // 點照片：第 1 點，打開新增
  // 跟真的手指一樣點在照片上（照片上面有一層放路線點的透明層）
  const tap = async (loc, fx, fy) => {
    await loc.scrollIntoViewIfNeeded();
    const bb = await loc.boundingBox();
    await m.mouse.click(bb.x + bb.width * fx, bb.y + bb.height * fy);
  };
  await tap(m.locator(`main img[alt="訓練區照片"]`), 0.1, 0.7);
  const sheet = m.locator("[role=dialog]");
  await sheet.waitFor();
  assert.equal(await sheet.locator("text=岩點顏色").count(), 0, "長耐力不選顏色");
  assert.ok((await sheet.textContent()).includes("已標 1 點"), "剛剛點的就是第 1 點");
  const photo = sheet.locator(`img[alt="訓練區照片"]`);
  for (let i = 1; i <= 5; i++) await tap(photo, 0.1 + i * 0.13, 0.65 - i * 0.05);
  const marked = async () => +(await sheet.textContent()).match(/已標 (\d+) 點/)[1];
  const spots = () => sheet.locator('button[aria-label$="（點一下刪除）"]').evaluateAll((bs) => bs.map((b) => `${b.style.left},${b.style.top}`));
  assert.equal(await marked(), 6);
  const six = await spots();
  // 點圈圈刪掉第 3 點，按「復原」放回原位
  await sheet.locator('button[aria-label="第 3 點（點一下刪除）"]').click();
  assert.equal(await marked(), 5, "點圈圈刪掉那一點");
  await sheet.locator('button:has-text("復原")').click();
  assert.deepEqual(await spots(), six, "復原：刪掉的第 3 點回到原本的順序");
  // 點在號碼上＝點在照片上：加下一點，不會刪掉那一點
  const badge = await sheet.locator('button[aria-label="第 5 點（點一下刪除）"] span').boundingBox();
  await m.mouse.click(badge.x + badge.width / 2, badge.y + badge.height / 2);
  assert.equal(await marked(), 7, "點號碼加下一點");
  assert.deepEqual((await spots()).slice(0, 6), six, "前面的點都還在");
  await sheet.locator('button:has-text("復原")').click();
  await sheet.locator('button:has-text("復原")').click();
  assert.equal(await marked(), 5, "復原上一步（加的點拿掉）");
  await sheet.locator('button:text-is("5.11a")').click();
  await sheet.locator('button:has-text("新增路線（5 點）")').click();
  await m.waitForTimeout(800);
  const r = mock.db.routes.find((x) => x.zone_id === z.id);
  assert.ok(r, "新增了路線");
  assert.equal(r.holds.length, 5, "照順序 5 點");
  assert.deepEqual(r.holds.map((h) => h.t), ["s", "h", "h", "h", "t"], "第 1 點起攀、最後一點完攀");
  assert.equal(r.hold_color, "白", "不分顏色");
  assert.equal(r.grade, 108);
  assert.deepEqual([r.pin_x, r.pin_y], [r.holds[0].x, r.holds[0].y], "起步點是第 1 點");
  assert.ok((await m.textContent("main ul")).includes(`${r.code}・5 點`), "後台列表寫點數");

  // 有人記錄過：打開編輯，點不能改
  mock.db.ascents.push({ id: "a1", user_id: mgr, route_id: r.id, status: "project", climbed_on: "2026-10-01", highpoint: 2 });
  await m.locator("main ul li button", { hasText: r.code }).click();
  await sheet.waitFor();
  await m.waitForTimeout(500);
  assert.ok((await sheet.textContent()).includes("已經有人記錄過，點不能改"));
  assert.equal(await sheet.locator('button:has-text("復原")').count(), 0);
  assert.deepEqual(errors, []);
});

test("長耐力：顧客記錄最高爬到第幾點、照比例算分、完攀；列表和我的紀錄寫進度", async () => {
  const { mock, z } = setup();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const r = addEndurance(mock, z, 10);
  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", `/zone?id=${z.id}`);
  await c.waitForTimeout(800);
  const row = c.locator("main ul li button", { hasText: r.code });
  assert.ok((await row.textContent()).includes("10 點"), "列表寫點數");
  assert.ok(!(await row.textContent()).includes("白色"), "不寫顏色");
  assert.equal(await c.locator('main button:text-is("所有顏色")').count(), 0, "沒有顏色篩選");
  await row.click();
  const sheet = c.locator("[role=dialog]");
  await sheet.waitFor();
  assert.ok((await sheet.locator("h2").textContent()).includes("10 點"), "標題寫點數");
  assert.ok((await sheet.textContent()).includes("沒爬完照比例"));
  assert.equal(await sheet.locator('img[alt$="10 個點"]').count(), 1, "卡片上有照片和全部的點");

  // 嘗試中 → 拉到第 6 點：+10 分（17 × 6 ÷ 10）
  await sheet.locator('button:has-text("嘗試中")').click();
  await c.waitForTimeout(500);
  assert.equal(await sheet.locator("#highpoint").count(), 1, "出現最高爬到第幾點");
  for (let i = 0; i < 6; i++) await sheet.locator('button[aria-label="多一點"]').click();
  await c.waitForTimeout(1500);
  const a = () => mock.db.ascents.find((x) => x.route_id === r.id);
  assert.equal(a()?.status, "project");
  assert.equal(a()?.highpoint, 6, "記成爬到第 6 點");
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("爬到第 6 點 +10 分"), "照比例算分");
  assert.equal(await sheet.locator('button[aria-label="多一點"]').count(), 1);

  // 我的紀錄：沒爬完也列出來，寫進度和分數
  await c.keyboard.press("Escape");
  await c.goto(BASE + "/me", { waitUntil: "networkidle" });
  await c.waitForTimeout(1000);
  const me = await c.textContent("main");
  assert.ok(me.includes("爬到 6／10 點") && me.includes("+10"), "我的紀錄寫進度和比例分數");

  // 完攀：自動記成最後一點，17 分
  await c.goto(`${BASE}/zone?id=${z.id}`, { waitUntil: "networkidle" });
  await c.waitForTimeout(800);
  assert.ok((await row.textContent()).includes("你爬到 6／10"), "列表寫自己的進度");
  await row.click();
  await sheet.waitFor();
  await sheet.locator('button:has-text("完攀")').click();
  await c.waitForTimeout(800);
  assert.equal(a()?.status, "send");
  assert.equal(a()?.highpoint, 10, "完攀＝最後一點");
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("完攀 +17 分"));

  // 重新打開（已完攀）、按錯改回嘗試中：存得進去，原本的最後一點清掉，等重新拉
  await c.keyboard.press("Escape");
  await c.waitForTimeout(500);
  await row.click();
  await sheet.waitFor();
  await sheet.locator('button:has-text("嘗試中")').click();
  await c.waitForTimeout(800);
  assert.equal(a()?.status, "project", "完攀改回嘗試中");
  assert.equal(a()?.highpoint ?? null, null, "最高點清掉");
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("拉下面的桿子"));
  // 拉了桿子馬上按完攀（還沒等到自動存）：完攀不會被蓋回嘗試中
  await sheet.locator('button[aria-label="多一點"]').click();
  await sheet.locator('button:has-text("完攀")').click();
  await c.waitForTimeout(1500);
  assert.equal(a()?.status, "send", "完攀不會被剛剛拉的桿子蓋掉");
  assert.equal(a()?.highpoint, 10);
  assert.deepEqual(errors, []);
});

test("長耐力：館首頁「最新路線」打開也有照片和點；下架後區域換了照片，我的紀錄不畫對不上的點", async () => {
  const { mock, z } = setup();
  const uid = mock.addUser("climber88", "password1", { nickname: "小安" });
  const r = addEndurance(mock, z, 10);
  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", "/gym/g2");
  await c.waitForTimeout(1000);
  await c.locator("main button", { hasText: "訓練區" }).filter({ hasText: "設定" }).first().click();
  const sheet = c.locator("[role=dialog]");
  await sheet.waitFor();
  assert.equal(await sheet.locator('img[alt$="10 個點"]').count(), 1, "最新路線打開也有照片和點");
  await c.keyboard.press("Escape");

  // 嘗試中爬到第 3 點，路線下架（整區換線）
  mock.db.ascents.push({ id: "a-en", user_id: uid, route_id: r.id, status: "project", climbed_on: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date()), feel: null, grade_feel: null, private_note: null, highpoint: 3, updated_at: new Date().toISOString() });
  r.archived_at = new Date(Date.now() - 60_000).toISOString();
  const open = async () => {
    await c.goto(BASE + "/me", { waitUntil: "networkidle" });
    await c.waitForTimeout(1000);
    await c.locator("main ul li button", { hasText: r.code }).click();
    await sheet.waitFor();
    await c.waitForTimeout(300);
    const n = await sheet.locator('img[alt$="10 個點"]').count();
    await c.keyboard.press("Escape");
    return n;
  };
  // 照片是下架前上傳的：點對得上，照畫
  const before = `g2/zones/TR-${Date.now() - 3_600_000}.jpg`;
  mock.db.files[before] = mock.db.files[z.photo_path];
  z.photo_path = before;
  assert.equal(await open(), 1, "照片沒換：照畫點");
  // 下架後換了新照片：舊路線的點對不上，不畫
  const after = `g2/zones/TR-${Date.now()}.jpg`;
  mock.db.files[after] = mock.db.files[before];
  z.photo_path = after;
  assert.equal(await open(), 0, "換了新照片：不畫對不上的點");
  assert.deepEqual(errors, []);
});

test("資料庫還沒套用 step30：一般路線照常記錄、我的紀錄照常", async () => {
  const mock = createMock();
  mock.state.noHighpoint = true;
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "A1");
  const r = mock.addRoute(zA, 3, "藍");
  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", `/zone?id=${zA.id}`);
  await c.waitForTimeout(800);
  await c.locator("main ul li button", { hasText: r.code }).click();
  await c.locator('[role=dialog] button:has-text("完攀")').click();
  await c.waitForTimeout(800);
  assert.equal(mock.db.ascents.find((x) => x.route_id === r.id)?.status, "send", "照常記錄");
  await c.keyboard.press("Escape");
  await c.goto(BASE + "/me", { waitUntil: "networkidle" });
  await c.waitForTimeout(1000);
  assert.ok((await c.textContent("main")).includes("藍色"), "我的紀錄照常");
  assert.deepEqual(errors.filter((e) => !/400/.test(e)), []);
});
