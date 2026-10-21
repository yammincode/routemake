// 官方 beta（step49）：定線員放示範影片（一條路線一支、換新的刪舊的要按兩次、留言關閉也能放）；
// 路線卡片評語下面「看官方 beta」（蓋住、點了才播）、影片分頁排最上面；New~ 不放；客人看不到開關；還沒套用 step49 照舊
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const clip = (name = "beta.mp4") => ({ name, mimeType: "video/mp4", buffer: Buffer.from("fake video bytes") });

async function openRoute(page, zone, code) {
  await page.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.locator("main ul li button", { hasText: code }).click();
  await page.waitForTimeout(600);
  return page.locator("[role=dialog]").first();
}
// 選影片、勾同意，按「分享影片」（換掉原本的要再按一次）
async function share(dialog, { beta = false, confirm = false } = {}) {
  await dialog.locator('[role=tab]:has-text("影片")').click();
  await dialog.locator("input[type=file]").setInputFiles(clip());
  await dialog.page().waitForTimeout(500);
  const toggle = dialog.locator('[role=switch][aria-label="這是官方 beta"]');
  if (beta && (await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("分享影片")').click();
  if (confirm) {
    await dialog.locator("button", { hasText: "確定換掉現在的官方 beta" }).click();
  }
  await dialog.page().waitForTimeout(1000);
}

test("官方 beta：定線員放、評語下面「看官方 beta」點了才播、影片分頁排最上面蓋住；換一支要按兩次、舊的檔案刪掉；New~ 不放", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const st = mock.addUser("setter1", "password1", { nickname: "阿凱" });
  const mg = mock.addUser("manager1", "password1", { nickname: "店長" });
  mock.db.staff_roles.push({ user_id: st, gym_id: "mingde", role: "setter" }, { user_id: mg, gym_id: "mingde", role: "manager" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 2, "綠");
  r.setter_note = "最後一手要果斷";
  mock.addVideo(other, r, { caption: "客人的影片", status: "send", created_at: new Date(Date.now() - 60000).toISOString() });

  // 客人：沒有官方 beta 時卡片照舊、分享表單沒有開關
  const C = await phone(browser, mock);
  await login(C.page, "climber88", "password1", `/zone?id=${zone.id}`);
  let d = await openRoute(C.page, zone, r.code);
  assert.equal(await d.locator("button", { hasText: "看官方 beta" }).count(), 0, "沒有官方 beta 就沒有那一條");
  await d.locator('[role=tab]:has-text("影片")').click();
  await d.locator("input[type=file]").setInputFiles(clip());
  await C.page.waitForTimeout(400);
  assert.equal(await d.locator('[role=switch][aria-label="這是官方 beta"]').count(), 0, "客人沒有官方 beta 開關");
  await C.ctx.close();

  // 定線員放官方 beta
  const S = await phone(browser, mock);
  await login(S.page, "setter1", "password1", `/zone?id=${zone.id}`);
  d = await openRoute(S.page, zone, r.code);
  await d.locator('[role=tab]:has-text("影片")').click();
  await d.locator("input[type=file]").setInputFiles(clip());
  await S.page.waitForTimeout(400);
  const toggle = d.locator('[role=switch][aria-label="這是官方 beta"]');
  assert.equal(await toggle.getAttribute("aria-checked"), "false", "預設不是官方 beta");
  await toggle.click();
  assert.ok((await d.textContent()).includes("官方 beta 不顯示你的 Flash／完攀和攀爬日"));
  await d.locator("input[type=checkbox]").check();
  await d.locator('button:text-is("分享影片")').click();
  await S.page.waitForTimeout(1000);
  const first = mock.db.videos.find((v) => v.is_beta);
  assert.ok(first && first.user_id === st && first.status == null, "存成官方 beta、不帶紀錄");
  assert.match(await S.page.textContent("[role=status]"), /已放上官方 beta/);
  await S.ctx.close();

  // 客人打開卡片：評語下面「看官方 beta」，寫誰示範、會暴雷；沒點前不下載縮圖和影片
  const P = await phone(browser, mock);
  const videoReqs = [];
  P.page.on("request", (q) => /route-videos|video-thumbs/.test(q.url()) && videoReqs.push(q.url()));
  await login(P.page, "climber88", "password1", `/zone?id=${zone.id}`);
  d = await openRoute(P.page, zone, r.code);
  const bar = d.locator("button", { hasText: "看官方 beta" });
  await bar.waitFor();
  assert.ok((await bar.textContent()).includes("定線員 阿凱") && (await bar.textContent()).includes("會暴雷"));
  const order = await d.evaluate((el) => {
    const t = el.innerText;
    return [t.indexOf("最後一手要果斷"), t.indexOf("看官方 beta"), t.indexOf("攀爬日")];
  });
  assert.ok(order[0] < order[1] && order[1] < order[2], "在評語下面、攀爬日上面");
  assert.deepEqual(videoReqs, [], "沒點前不下載");
  await bar.click();
  const viewer = P.page.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  const vt = await viewer.textContent();
  assert.ok(vt.includes("官方 beta") && vt.includes("阿凱") && vt.includes("1 / 2"), `點了全螢幕播放官方 beta（從它開始）：${vt.slice(0, 60)}`);
  await P.page.keyboard.press("Escape");
  await P.page.waitForTimeout(300);
  // 影片分頁：官方 beta 排最上面、酒紅框、縮圖蓋住寫會暴雷
  await d.locator('[role=tab]:has-text("影片")').click();
  const rows = d.locator('li button[aria-label^="播放"]');
  assert.match(await rows.first().textContent(), /官方 beta.*阿凱示範設計的爬法/);
  assert.ok((await rows.first().textContent()).includes("會暴雷"));
  assert.equal(await rows.first().locator("img").count(), 0, "縮圖蓋住（不下載）");
  assert.ok((await rows.nth(1).textContent()).includes("客人的影片"));
  // 可以按讚
  await d.locator("li", { hasText: "阿凱示範" }).locator('button[aria-label^="按讚"]').click();
  await P.page.waitForTimeout(400);
  assert.equal(mock.db.videoLikes.length, 1);
  // New~ 不放官方 beta
  await P.page.keyboard.press("Escape");
  await P.page.waitForTimeout(300);
  await P.page.goto(`${BASE}/new`, { waitUntil: "networkidle" });
  await P.page.waitForTimeout(600);
  const feed = await P.page.textContent("main");
  assert.ok(feed.includes("客人的影片") && !feed.includes("阿凱示範"), "New~ 不放官方 beta");
  await P.ctx.close();

  // 店長再放一支：要按兩次，舊的資料和檔案刪掉、寫操作紀錄
  const M = await phone(browser, mock);
  await login(M.page, "manager1", "password1", `/zone?id=${zone.id}`);
  d = await openRoute(M.page, zone, r.code);
  await d.locator('[role=tab]:has-text("影片")').click();
  await d.locator("input[type=file]").setInputFiles(clip());
  await M.page.waitForTimeout(400);
  await d.locator('[role=switch][aria-label="這是官方 beta"]').click();
  assert.ok((await d.textContent()).includes("會換掉現在的官方 beta（阿凱 放的），舊的那支會刪掉"));
  await d.locator("input[type=checkbox]").check();
  await d.locator('button:text-is("分享影片")').click();
  await M.page.waitForTimeout(300);
  assert.equal(mock.db.videos.filter((v) => v.is_beta).length, 1);
  assert.equal(mock.db.videos.find((v) => v.is_beta).user_id, st, "按一次還沒換");
  await d.locator("button", { hasText: "確定換掉現在的官方 beta？舊的會刪掉，再按一次" }).click();
  await M.page.waitForTimeout(1200);
  const betas = mock.db.videos.filter((v) => v.is_beta);
  assert.equal(betas.length, 1);
  assert.equal(betas[0].user_id, mg, "換成店長的");
  assert.ok(!mock.db.vfiles[first.path], "舊的影片檔刪掉");
  assert.equal(mock.db.audit.filter((a) => a.action === "video.beta").length, 2);
  assert.match(await M.page.textContent("[role=status]"), /已換成新的官方 beta/);
  assert.deepEqual([...C.errors, ...S.errors, ...P.errors, ...M.errors], []);
  await M.ctx.close();
});

test("官方 beta：留言關閉的路線客人不能分享，定線員照樣能放（開關固定打開）；別館定線員沒有開關；不算 24 小時 15 支", async () => {
  const mock = createMock();
  const st = mock.addUser("setter1", "password1", { nickname: "阿凱" });
  const st2 = mock.addUser("setter2", "password1", { nickname: "萬華定線" });
  mock.db.staff_roles.push({ user_id: st, gym_id: "mingde", role: "setter" }, { user_id: st2, gym_id: "g2", role: "setter" });
  const zone = mock.db.zones[0];
  const closed = mock.addRoute(zone, 3, "藍");
  closed.comments_enabled = false;
  const open = mock.addRoute(zone, 4, "紅");
  // 定線員今天已經分享 15 支一般影片
  for (let i = 0; i < 15; i++) mock.addVideo(st, open, { caption: `一般 ${i}` });

  const S = await phone(browser, mock);
  await login(S.page, "setter1", "password1", `/zone?id=${zone.id}`);
  let d = await openRoute(S.page, zone, closed.code);
  await d.locator('[role=tab]:has-text("影片")').click();
  await d.locator("input[type=file]").setInputFiles(clip());
  await S.page.waitForTimeout(400);
  const toggle = d.locator('[role=switch][aria-label="這是官方 beta"]');
  assert.equal(await toggle.getAttribute("aria-checked"), "true", "留言關閉時只能放官方 beta");
  assert.ok(await toggle.isDisabled());
  assert.ok((await d.textContent()).includes("這條路線留言關閉，客人不能分享影片，只能放官方 beta"));
  await d.locator("input[type=checkbox]").check();
  await d.locator('button:text-is("分享影片")').click();
  await S.page.waitForTimeout(1000);
  assert.ok(mock.db.videos.some((v) => v.route_id === closed.id && v.is_beta), "留言關閉照樣能放、滿 15 支也能放");
  // 一般影片滿 15 支照樣擋
  await S.page.keyboard.press("Escape");
  await S.page.waitForTimeout(300);
  d = await openRoute(S.page, zone, open.code);
  await share(d);
  assert.match(await S.page.locator("[role=status]").last().textContent(), /15 支/);
  await S.ctx.close();

  // 別館的定線員在明德沒有開關
  const O = await phone(browser, mock);
  await login(O.page, "setter2", "password1", `/zone?id=${zone.id}`);
  d = await openRoute(O.page, zone, open.code);
  await d.locator('[role=tab]:has-text("影片")').click();
  await d.locator("input[type=file]").setInputFiles(clip());
  await O.page.waitForTimeout(400);
  assert.equal(await d.locator('[role=switch][aria-label="這是官方 beta"]').count(), 0);
  assert.deepEqual([...S.errors, ...O.errors], []);
  await O.ctx.close();
});

test("還沒套用 step49：定線員沒有官方 beta 開關、卡片沒有「看官方 beta」，影片照常", async () => {
  const mock = createMock();
  const st = mock.addUser("setter1", "password1", { nickname: "阿凱" });
  mock.db.staff_roles.push({ user_id: st, gym_id: "mingde", role: "setter" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 2, "綠");
  mock.addVideo(st, r, { caption: "舊資料庫的影片" });
  mock.state.noBeta = true;
  const { page, errors } = await phone(browser, mock);
  await login(page, "setter1", "password1", `/zone?id=${zone.id}`);
  const d = await openRoute(page, zone, r.code);
  assert.equal(await d.locator("button", { hasText: "看官方 beta" }).count(), 0);
  await d.locator('[role=tab]:has-text("影片")').click();
  assert.ok((await d.textContent()).includes("舊資料庫的影片"), "影片照常");
  await d.locator("input[type=file]").setInputFiles(clip());
  await page.waitForTimeout(400);
  assert.equal(await d.locator('[role=switch][aria-label="這是官方 beta"]').count(), 0, "沒有開關");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.goto(`${BASE}/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  assert.ok((await page.textContent("main")).includes("舊資料庫的影片"), "New~ 照常");
  assert.deepEqual(errors, []);
});
