// 分享到 IG（10/16 使用者選 A3、B2、C1；先只給老闆試）：
// A3 路線卡片記錄 Flash／完攀後「分享到 IG」→ 岩牆照片完攀圖；C1 我的紀錄「分享 ○ 月成績到 IG」→ 本月完攀圖；
// B2 分享影片後「也分享到 IG（加上原岩標記）」→ 重錄一次、左下角加小貼紙；
// 交給手機的分享選單（navigator.share），叫不出選單就存到手機；顧客（不是老闆）看不到
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { WALL, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

// 假的分享選單：記下交出去的檔案
const fakeShare = (ctx) =>
  ctx.addInitScript(() => {
    window.__shared = [];
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (d) => !!d?.files?.length });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d) => {
        window.__shared.push(...d.files.map((f) => ({ name: f.name, type: f.type, size: f.size })), ...(d.text || d.url ? ["多帶了文字"] : []));
      },
    });
  });
// 沒有分享選單（電腦、IG 內建瀏覽器）
const noShare = (ctx) =>
  ctx.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  });

// 預覽圖做好（img 載入完成）後回傳大小
async function previewSize(page) {
  const img = page.locator('[data-testid="share-preview"] img');
  await img.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="share-preview"] img')?.naturalWidth > 0);
  return img.evaluate((i) => [i.naturalWidth, i.naturalHeight]);
}

test("完攀圖（A3）：老闆記 Flash 後分享到 IG，1080×1920、用區域照片、只交出圖片；嘗試中沒有；顧客看不到；沒有分享選單改存到手機", async () => {
  const mock = createMock();
  mock.addUser("bossman", "password1", { nickname: "老闆", is_owner: true });
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones[0];
  mock.db.files["mingde/zones/A-1.jpg"] = fs.readFileSync(WALL);
  zA.photo_path = "mingde/zones/A-1.jpg";
  const r1 = mock.addRoute(zA, 5, "紅", [], 40, 60);
  mock.addRoute(zA, 3, "藍", [], 60, 40);
  mock.addAscent(me, r1, "send", taipeiDay(0));

  // ---- 老闆 ----
  const B = await phone(browser, mock);
  await fakeShare(B.ctx);
  const page = B.page;
  await login(page, "bossman", "password1", `/zone?id=${zA.id}`);
  const dlg = page.locator("[role=dialog]").first();
  await page.locator("main ul li button", { hasText: "紅色" }).click();
  await page.waitForTimeout(500);
  const shareBtn = dlg.locator('button:has-text("分享到 IG")');
  assert.equal(await shareBtn.count(), 0, "還沒記錄：沒有分享");
  await dlg.locator('button:has-text("Flash")').first().click();
  await page.waitForTimeout(600);
  await shareBtn.click();
  const [w, h] = await previewSize(page);
  assert.deepEqual([w, h], [1080, 1920], "限時動態的大小");
  // 照片有畫上去：左上角附近不是膠帶色（V5 紅 #D9402F）的純色底
  const px = await page.locator('[data-testid="share-preview"] img').evaluate((i) => {
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1920;
    const g = c.getContext("2d");
    g.drawImage(i, 0, 0);
    return [...g.getImageData(540, 700, 1, 1).data.slice(0, 3)];
  });
  assert.notDeepEqual(px, [0xd9, 0x40, 0x2f], `用區域照片當底（${px}）`);
  const sheet = page.locator("[role=dialog]").last();
  assert.match(await sheet.textContent(), /不會有私人心得/);
  await sheet.locator('button:text-is("分享到 IG")').click();
  await page.waitForTimeout(400);
  const shared = await page.evaluate(() => window.__shared);
  assert.equal(shared.length, 1, `只交出一張圖、不帶文字（${JSON.stringify(shared)}）`);
  assert.equal(shared[0].type, "image/jpeg");
  assert.match(shared[0].name, /^routemake-.+\.jpg$/);
  await sheet.locator('button:text-is("關閉")').click();
  await page.waitForTimeout(300);
  // 改成嘗試中：沒有分享
  await dlg.locator('button:has-text("嘗試中")').first().click();
  await page.waitForTimeout(600);
  assert.equal(await shareBtn.count(), 0, "嘗試中不能分享");
  assert.deepEqual(B.errors, []);
  await B.ctx.close();

  // ---- 顧客：看不到 ----
  const C = await phone(browser, mock);
  await login(C.page, "climber88", "password1", `/zone?id=${zA.id}`);
  await C.page.locator("main ul li button", { hasText: "紅色" }).click();
  await C.page.waitForTimeout(600);
  assert.match(await C.page.locator("[role=dialog]").textContent(), /已記錄/);
  assert.equal(await C.page.locator('[role=dialog] button:has-text("分享到 IG")').count(), 0, "先只給老闆試");
  await C.ctx.close();

  // ---- 沒有分享選單：改存到手機；沒有照片的區域用膠帶色底 ----
  zA.photo_path = null;
  const N = await phone(browser, mock);
  await noShare(N.ctx);
  await login(N.page, "bossman", "password1", `/zone?id=${zA.id}`);
  await N.page.locator("main ul li button", { hasText: "藍色" }).click();
  await N.page.waitForTimeout(500);
  await N.page.locator('[role=dialog] button:has-text("完攀")').first().click();
  await N.page.waitForTimeout(600);
  await N.page.locator('[role=dialog] button:has-text("分享到 IG")').click();
  await previewSize(N.page);
  const ns = N.page.locator("[role=dialog]").last();
  assert.match(await ns.textContent(), /叫不出分享選單/);
  const [dl] = await Promise.all([N.page.waitForEvent("download"), ns.locator('button:text-is("存圖片到手機")').click()]);
  assert.match(dl.suggestedFilename(), /^routemake-.+\.jpg$/);
  assert.match(await N.page.locator("[role=status]").last().textContent(), /已存圖片/);
  assert.deepEqual(N.errors, []);
  await N.ctx.close();
});

test("本月完攀圖（C1）：老闆在我的紀錄分享這個月成績；沒有完攀的月份不能按；顧客看不到", async () => {
  const mock = createMock();
  const boss = mock.addUser("bossman", "password1", { nickname: "老闆", is_owner: true });
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones[0];
  for (const [g, c, s] of [[2, "紅", "send"], [3, "藍", "flash"], [5, "綠", "send"], [101, "黃", "send"]]) {
    const r = mock.addRoute(zA, g, c, [], 30, 40, new Date(Date.now() - 40 * 86400000).toISOString());
    mock.addAscent(boss, r, s, taipeiDay(0));
    mock.addAscent(me, r, s, taipeiDay(0));
  }
  const B = await phone(browser, mock);
  await fakeShare(B.ctx);
  const page = B.page;
  await login(page, "bossman", "password1", "/me");
  await page.waitForTimeout(800);
  const m = +taipeiDay(0).slice(5, 7);
  const btn = page.locator(`main button:has-text("分享 ${m} 月成績到 IG")`);
  await btn.click();
  assert.deepEqual(await previewSize(page), [1080, 1920]);
  const sheet = page.locator("[role=dialog]").last();
  await sheet.locator('button:text-is("分享到 IG")').click();
  await page.waitForTimeout(400);
  const shared = await page.evaluate(() => window.__shared);
  assert.equal(shared.length, 1);
  assert.match(shared[0].name, /^routemake-\d{4}-\d{2}\.jpg$/);
  await sheet.locator('button:text-is("關閉")').click();
  // 上個月沒有完攀：按鈕變淡
  await page.locator('main button[aria-label="上個月"]').click();
  await page.waitForTimeout(800);
  const off = page.locator('main button:has-text("還沒有完攀，不能分享")');
  assert.equal(await off.isDisabled(), true, "沒有完攀的月份不能分享");
  assert.deepEqual(B.errors, []);
  await B.ctx.close();

  const C = await phone(browser, mock);
  await login(C.page, "climber88", "password1", "/me");
  await C.page.waitForTimeout(800);
  assert.equal(await C.page.locator('main button:has-text("成績到 IG")').count(), 0, "顧客看不到");
  await C.ctx.close();
});

// 做一支真的小影片（WebM，約 2 秒）
async function makeClip() {
  const maker = await browser.newPage();
  const b64 = await maker.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 360;
    const g = c.getContext("2d");
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: "video/webm;codecs=vp8" });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stop = new Promise((r) => (rec.onstop = r));
    rec.start(200);
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = () => {
        const t = performance.now() - t0;
        g.fillStyle = `hsl(${(t / 5) % 360},60%,50%)`;
        g.fillRect(0, 0, 640, 360);
        if (t < 2000) requestAnimationFrame(tick);
        else done();
      };
      tick();
    });
    rec.stop();
    await stop;
    const buf = await new Blob(chunks).arrayBuffer();
    let s = "";
    new Uint8Array(buf).forEach((x) => (s += String.fromCharCode(x)));
    return btoa(s);
  });
  await maker.close();
  return Buffer.from(b64, "base64");
}

test("影片加小貼紙（B2）：老闆分享影片後「也分享到 IG」重錄一次加上原岩標記、交出影片；不能壓縮的手機分享原本那支；顧客看不到；列表沒有 <video>", async () => {
  const mock = createMock();
  mock.addUser("bossman", "password1", { nickname: "老闆", is_owner: true });
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = mock.db.zones[0];
  mock.addRoute(zone, 4, "藍");
  const clip = await makeClip();

  const upload = async (page) => {
    await page.locator("main ul li button", { hasText: "A1-01" }).click();
    await page.waitForTimeout(500);
    const dialog = page.locator("[role=dialog]").first();
    await dialog.locator('[role=tab]:has-text("影片")').click();
    await dialog.locator("input[type=file]").setInputFiles({ name: "climb.webm", mimeType: "video/webm", buffer: clip });
    await page.waitForTimeout(600);
    await dialog.locator("input[type=checkbox]").check();
    await dialog.locator('button:text-is("分享影片")').click();
    await page.waitForFunction(() => document.body.textContent.includes("已分享影片"), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    return dialog;
  };

  // ---- 老闆（能壓縮的手機）----
  const B = await phone(browser, mock);
  await fakeShare(B.ctx);
  await B.ctx.addInitScript(() => (window.__RM_VIDEO_TYPES = ["video/webm;codecs=vp8,opus"])); // 測試瀏覽器沒有 H.264
  const page = B.page;
  await login(page, "bossman", "password1", `/zone?id=${zone.id}`);
  const dialog = await upload(page);
  const offer = dialog.getByTestId("share-offer");
  assert.match(await offer.textContent(), /也分享到 IG（加上原岩標記）/);
  await offer.locator("button").click();
  await page.waitForFunction(() => /製作中 \d+%/.test(document.body.textContent), null, { timeout: 10000 });
  assert.deepEqual(await previewSize(page), [480, 270], "預覽是第 1 秒的畫面");
  const sheet = page.locator("[role=dialog]").last();
  assert.match(await sheet.textContent(), /左下角加上難度和館名/);
  // 小貼紙畫在左下角：預覽圖左下角跟右上角顏色不一樣（原本整個畫面同一個顏色）
  const [bl, tr] = await sheet.locator('[data-testid="share-preview"] img').evaluate((i) => {
    const c = document.createElement("canvas");
    c.width = i.naturalWidth;
    c.height = i.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(i, 0, 0);
    const at = (x, y) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
    return [at(30, c.height - 22), at(c.width - 10, 10)];
  });
  assert.ok(Math.abs(bl[0] - tr[0]) + Math.abs(bl[1] - tr[1]) + Math.abs(bl[2] - tr[2]) > 40, `左下角有貼紙（${bl} vs ${tr}）`);
  await sheet.locator('button:text-is("分享到 IG")').click();
  await page.waitForTimeout(400);
  const shared = await page.evaluate(() => window.__shared);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].name, "routemake-A1-01.webm");
  assert.ok(shared[0].size > 5000, `重錄的影片（${shared[0].size}）`);
  assert.equal(mock.db.videos.length, 1, "原岩 App 裡的影片不變（沒有多傳一支）");
  await sheet.locator('button:text-is("關閉")').click();
  assert.equal(await dialog.locator("video").count(), 0, "影片列表沒有 <video>");
  assert.deepEqual(B.errors, []);
  await B.ctx.close();

  // ---- 老闆（不能壓縮的手機）：分享原本那支 ----
  const P = await phone(browser, mock);
  await fakeShare(P.ctx);
  await P.ctx.addInitScript(() => (window.__RM_VIDEO_TYPES = ["video/none"]));
  await login(P.page, "bossman", "password1", `/zone?id=${zone.id}`);
  const d2 = await upload(P.page);
  const o2 = d2.getByTestId("share-offer");
  assert.match(await o2.textContent(), /加不了原岩標記/);
  await o2.locator("button").click();
  const s2 = P.page.locator("[role=dialog]").last();
  await s2.locator('button:text-is("分享到 IG"):not([disabled])').waitFor({ timeout: 15000 });
  await s2.locator('button:text-is("分享到 IG")').click();
  await P.page.waitForTimeout(400);
  const sh2 = await P.page.evaluate(() => window.__shared);
  assert.equal(sh2.length, 1);
  assert.equal(sh2[0].size, clip.length, "原本那支影片");
  await P.ctx.close();

  // ---- 顧客：沒有「也分享到 IG」----
  const C = await phone(browser, mock);
  await C.ctx.addInitScript(() => (window.__RM_VIDEO_TYPES = ["video/webm;codecs=vp8,opus"]));
  await login(C.page, "climber88", "password1", `/zone?id=${zone.id}`);
  const d3 = await upload(C.page);
  assert.equal(await d3.getByTestId("share-offer").count(), 0, "顧客看不到");
  await C.ctx.close();
});
