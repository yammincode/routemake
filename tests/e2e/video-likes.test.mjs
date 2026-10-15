// 影片按讚 👍（step42）：New~ 和路線卡片「影片」分頁，每列右下角按讚、全螢幕播放也能按；
// 按讚不會開始播放；沒登入看得到讚數，按了帶去登入；送不出去改回來；還沒套用 step42 照常顯示影片、沒有讚
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const todayMin = () => {
  const t = new Date(Date.now() + 8 * 3600000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
};
const within = (i) => Math.min(i, Math.max(0, todayMin() - 1)); // 今天第 i 分鐘前（凌晨也還在今天）
const text = async (l) => (await l.textContent()).replace(/\s/g, "");

test("New~ 影片按讚：列表右下角按讚不會播放、全螢幕播放裡收回、送不出去改回來；沒登入看得到讚數，按了去登入", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const r = mock.addRoute(mock.db.zones[0], 4, "藍");
  const v1 = mock.addVideo(other, r, { caption: "有一個讚", created_at: ago(within(1)) });
  mock.addVideo(other, r, { caption: "沒人按過", created_at: ago(within(2)) });
  mock.db.videoLikes.push({ video_id: v1.id, user_id: other });
  const row = (page, caption) => page.locator("[role=tabpanel]:not([hidden]) li", { hasText: caption });

  // 沒登入：看得到讚數；按了去登入（不會打開播放）
  const G = await phone(browser, mock);
  const g = G.page;
  await g.goto(`${BASE}/new`, { waitUntil: "networkidle" });
  await row(g, "有一個讚").waitFor();
  assert.equal(await text(row(g, "有一個讚").locator('button[aria-label^="按讚"]')), "👍1", "未登入看得到讚數");
  assert.equal(await text(row(g, "沒人按過").locator('button[aria-label^="按讚"]')), "👍讚", "沒人按過寫「讚」");
  assert.equal(await g.locator("video").count(), 0, "列表沒有 <video>");
  await row(g, "有一個讚").locator('button[aria-label^="按讚"]').click();
  await g.waitForURL("**/login**");

  // 登入：列表按讚，不會開始播放
  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", "/new");
  await row(c, "有一個讚").waitFor();
  await row(c, "有一個讚").locator('button[aria-label^="按讚"]').click();
  await c.waitForTimeout(400);
  assert.equal(await c.locator('[aria-label="影片播放"]').count(), 0, "按讚不會打開播放");
  assert.equal(await c.locator("video").count(), 0, "按讚不會下載影片");
  assert.ok(mock.db.videoLikes.some((l) => l.video_id === v1.id && l.user_id === me), "讚存進資料庫");
  assert.equal(await text(row(c, "有一個讚").locator('button[aria-pressed="true"]')), "👍2", "按過變 2、變主色");

  // 全螢幕播放：名字那一行也有讚，按了收回；關掉後列表跟著變
  await row(c, "有一個讚").locator('button[aria-label^="播放"]').click();
  const viewer = c.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  const vl = viewer.locator('button[aria-pressed="true"][aria-label^="收回讚"]');
  assert.equal(await text(vl), "👍2", "播放時看得到自己按過的讚");
  await vl.click();
  await c.waitForTimeout(400);
  assert.equal(mock.db.videoLikes.filter((l) => l.user_id === me).length, 0, "播放時收回");
  await viewer.locator('button[aria-label="關閉"]').click();
  assert.equal(await text(row(c, "有一個讚").locator('button[aria-label^="按讚"]')), "👍1", "列表也收回");

  // 送不出去：改回來、跳提示
  mock.state.videoLikeFail = true;
  await row(c, "沒人按過").locator('button[aria-label^="按讚"]').click();
  await c.waitForTimeout(600);
  assert.equal(await row(c, "沒人按過").locator('button[aria-pressed="true"]').count(), 0, "送不出去改回沒按過");
  assert.equal(await text(row(c, "沒人按過").locator('button[aria-label^="按讚"]')), "👍讚");
  mock.state.videoLikeFail = false;
  assert.deepEqual([...G.errors, ...C.errors], []);
});

test("路線卡片「影片」分頁按讚；New~ 打開卡片（Spray Wall）按的讚，關掉後列表也更新", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 4, "藍");
  const v = mock.addVideo(other, r, { caption: "卡片裡按讚", created_at: ago(within(1)) });
  // Spray Wall 上岩友出的路線：New~ 點「看這條路線」照舊在 New~ 打開卡片（牆上的路線改成跳到區域頁）
  const sw = mock.db.zones.find((z) => z.gym_id === "mingde" && z.kind === "spray");
  const sr = Object.assign(mock.addRoute(sw, 3, "白"), { kind: "community", name: "阿明的路線", created_by: other, holds: [{ x: 20, y: 80, t: "s" }, { x: 60, y: 20, t: "t" }] });
  const sv = mock.addVideo(other, sr, { caption: "Spray 卡片", created_at: ago(within(2)) });

  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(500);
  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  const dialog = c.locator("[role=dialog]");
  await dialog.locator('[role=tab]:has-text("影片")').click();
  const card = dialog.locator("li", { hasText: "卡片裡按讚" });
  await card.locator('button[aria-label^="按讚"]').click();
  await c.waitForTimeout(400);
  assert.equal(await dialog.locator('[aria-label="影片播放"]').count(), 0, "按讚不會播放");
  assert.ok(mock.db.videoLikes.some((l) => l.video_id === v.id && l.user_id === me), "卡片裡按讚有存");
  assert.equal(await text(card.locator('button[aria-pressed="true"]')), "👍1");
  await c.keyboard.press("Escape");

  // New~：牆上那條在卡片裡按的讚，列表也是按過的
  await c.goto(`${BASE}/new`, { waitUntil: "networkidle" });
  await c.locator("[role=tabpanel]:not([hidden]) li", { hasText: "卡片裡按讚" }).locator('button[aria-pressed="true"]').waitFor();
  // Spray Wall 那條：從播放「看這條路線」在 New~ 打開卡片（停在影片分頁）按讚；關掉後 New~ 列表也是按過的
  const row = c.locator("[role=tabpanel]:not([hidden]) li", { hasText: "Spray 卡片" });
  await row.locator('button[aria-label^="播放"]').click();
  await c.locator('[aria-label="影片播放"] button:has-text("看這條路線")').click();
  const sheet = c.locator("[role=dialog]").filter({ has: c.locator('[role=tab]:has-text("影片")') });
  await sheet.locator("li", { hasText: "Spray 卡片" }).locator('button[aria-label^="按讚"]').click();
  await c.waitForTimeout(400);
  assert.ok(mock.db.videoLikes.some((l) => l.video_id === sv.id && l.user_id === me), "卡片裡按讚有存");
  await c.keyboard.press("Escape");
  await c.waitForTimeout(600);
  assert.ok(c.url().endsWith("/new"), "Spray Wall 的路線還在 New~");
  assert.equal(await row.locator('button[aria-pressed="true"]').count(), 1, "關掉後列表也更新");

  assert.deepEqual(errors, []);
});

test("還沒套用 step42：影片照常顯示，沒有讚的按鈕，不出錯", async () => {
  const mock = createMock();
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 4, "藍");
  mock.addVideo(other, r, { caption: "舊資料庫", created_at: ago(within(1)) });
  mock.state.noVideoLikes = true;

  const { page: g, errors } = await phone(browser, mock);
  await g.goto(`${BASE}/new`, { waitUntil: "networkidle" });
  const row = g.locator("[role=tabpanel]:not([hidden]) li", { hasText: "舊資料庫" });
  await row.waitFor();
  assert.equal(await row.locator('button[aria-label*="讚"]').count(), 0, "列表沒有讚");
  await row.locator('button[aria-label^="播放"]').click();
  const viewer = g.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  assert.equal(await viewer.locator('button[aria-label*="讚"]').count(), 0, "播放時沒有讚");
  await viewer.locator('button[aria-label="關閉"]').click();

  await g.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await g.locator("main ul li button", { hasText: "A1-01" }).click();
  const dialog = g.locator("[role=dialog]");
  await dialog.locator('[role=tab]:has-text("影片")').click();
  await dialog.locator("li", { hasText: "舊資料庫" }).waitFor();
  assert.equal(await dialog.locator('li button[aria-label*="讚"]').count(), 0, "卡片裡沒有讚");
  assert.ok(mock.state.likeFallbacks >= 1, "有先試著讀讚");
  assert.deepEqual(errors, []);
});
