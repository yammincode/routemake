// 顧客分享影片：上傳、刪除自己的、員工在後台刪除、下架路線時影片一起刪除
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const clip = (name = "climb.mp4", mimeType = "video/mp4") => ({ name, mimeType, buffer: Buffer.from("fake video bytes") });

test("顧客分享影片、刪除自己的；員工刪影片並記錄；下架路線影片一起刪除", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const setter = mock.addUser("setterx", "password1", { nickname: "阿定" });
  mock.db.staff_roles.push({ user_id: setter, gym_id: "mingde", role: "setter" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  mock.addRoute(zone, 2, "紅");
  mock.addVideo(other, r1, { caption: "第三手用左腳勾", status: "flash" });

  // ---- 顧客 ----
  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(600);
  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  await c.waitForTimeout(600);
  const dialog = c.locator("[role=dialog]");
  const thumbs = dialog.locator('button[aria-label^="播放"]');
  assert.equal(await thumbs.count(), 1, "看得到別人分享的影片縮圖");
  await thumbs.first().click();
  const viewer = c.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  assert.ok((await viewer.textContent()).includes("第三手用左腳勾"), "全螢幕顯示說明");
  assert.equal(await viewer.locator('button:text-is("刪除這支影片")').count(), 0, "別人的影片沒有刪除鍵");
  await c.keyboard.press("Escape");
  await c.waitForTimeout(200);
  assert.equal(await viewer.count(), 0, "Esc 關閉播放");
  assert.equal(await dialog.count(), 1, "路線卡片還開著");

  await dialog.locator("input[type=file]").setInputFiles(clip("clip.avi", "video/x-msvideo"));
  await c.waitForTimeout(400);
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("只能分享 MP4"), "不支援的格式被擋");

  await dialog.locator("input[type=file]").setInputFiles(clip());
  await c.waitForTimeout(600);
  assert.ok(await dialog.locator('button:text-is("上傳影片")').isDisabled(), "沒勾同意不能上傳");
  await c.fill("#vcap", "我的 beta");
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("上傳影片")').click();
  await c.waitForTimeout(1000);
  assert.equal(mock.db.videos.length, 2);
  const mine = mock.db.videos.find((v) => v.user_id === me);
  assert.ok(mine.path.startsWith(`mingde/${r1.id}/${me}/`) && mine.path.endsWith(".mp4"), "路徑是 場館/路線/本人/檔名");
  assert.equal(mine.caption, "我的 beta");
  assert.ok(mock.db.vfiles[mine.path], "檔案已上傳");
  assert.equal(await thumbs.count(), 2);

  // 新的在前：第一支是自己的；滑到下一支是別人的
  await thumbs.first().click();
  await viewer.waitFor();
  assert.ok((await viewer.textContent()).includes("我的 beta"));
  assert.ok((await viewer.textContent()).includes("1 / 2"));
  const box = await viewer.boundingBox();
  await c.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.45);
  await c.mouse.down();
  await c.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.45, { steps: 5 });
  await c.mouse.up();
  await c.waitForTimeout(200);
  assert.ok((await viewer.textContent()).includes("2 / 2") && (await viewer.textContent()).includes("第三手用左腳勾"), "左滑換下一支");
  await viewer.locator('button[aria-label="上一支"]').click();
  assert.ok((await viewer.textContent()).includes("1 / 2"), "按 ‹ 回上一支");
  await viewer.locator('button:text-is("刪除這支影片")').click();
  await c.waitForTimeout(600);
  assert.equal(mock.db.videos.length, 1, "刪除自己的影片");
  assert.ok(!mock.db.vfiles[mine.path], "檔案也刪掉");

  await dialog.locator("input[type=file]").setInputFiles(clip("again.mov", "video/quicktime"));
  await c.waitForTimeout(600);
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("上傳影片")').click();
  await c.waitForTimeout(1000);
  assert.equal(mock.db.videos.length, 2);
  assert.ok(mock.db.videos.some((v) => v.user_id === me && v.path.endsWith(".mov")));

  // ---- 定線長 ----
  const S = await phone(browser, mock);
  const s = S.page;
  await login(s, "setterx", "password1", "/admin");
  await s.waitForTimeout(1200);
  const main = await s.textContent("main");
  assert.ok(main.includes("明德館顧客影片") && /目前\s*2\s*支/.test(main), "後台看得到影片數");
  await s.locator('main button[aria-label^="播放 阿明"]').click();
  const sv = s.locator('[aria-label="影片播放"]');
  await sv.waitFor();
  assert.ok((await sv.textContent()).includes("A1 區 A1-01"), "後台播放顯示區域與路線");
  await sv.locator('button:text-is("刪除這支影片")').click();
  await s.waitForTimeout(200);
  assert.ok((await sv.textContent()).includes("再按一次"), "刪除要按兩次");
  await sv.locator('button:text-is("確定刪除？再按一次")').click();
  await s.waitForTimeout(800);
  assert.equal(mock.db.videos.length, 1);
  assert.ok(mock.db.audit.some((a) => a.action === "video.delete" && a.detail.author_nickname === "阿明"), "員工刪影片寫操作紀錄");

  await s.locator("main ul li button", { hasText: "A1-01" }).click();
  await s.click("[role=dialog] >> text=下架這條路線");
  assert.match(await s.textContent("[role=dialog] button.text-warn"), /影片會一起刪除/);
  await s.click("[role=dialog] button.text-warn");
  await s.waitForTimeout(800);
  assert.equal(mock.db.videos.length, 0, "下架後影片資料刪除");
  assert.equal(Object.keys(mock.db.vfiles).length, 0, "下架後影片檔案刪除");
  assert.deepEqual([...C.errors, ...S.errors], []);
});

test("未登入看得到影片、要登入才能分享；留言關閉且沒有影片時不顯示影片區", async () => {
  const mock = createMock();
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  const r2 = mock.addRoute(zone, 2, "紅");
  r2.comments_enabled = false;
  mock.addVideo(other, r1, { caption: "看我的" });

  const G = await phone(browser, mock);
  const g = G.page;
  await g.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await g.waitForTimeout(600);
  await g.locator("main ul li button", { hasText: "A1-01" }).click();
  await g.waitForTimeout(600);
  const text = await g.textContent("[role=dialog]");
  assert.ok(text.includes("看我的") || (await g.locator('[role=dialog] button[aria-label*="看我的"]').count()) === 1);
  assert.ok(text.includes("登入後分享影片"));
  assert.equal(await g.locator("[role=dialog] input[type=file]").count(), 0);
  await g.keyboard.press("Escape");
  await g.waitForTimeout(400);
  await g.locator("main ul li button", { hasText: "A1-02" }).click();
  await g.waitForTimeout(600);
  await g.click('[role=dialog] [role=tab]:has-text("影片")');
  assert.ok((await g.textContent("[role=dialog]")).includes("這條路線目前不開放分享影片"), "留言關閉、沒有影片：不能分享");
  assert.equal(await g.locator("[role=dialog] input[type=file]").count(), 0);
  assert.deepEqual(G.errors, []);
});

test("影片上傳前先壓縮成 720p（顯示進度），檔案變小、記錄壓縮後的大小", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");

  // 做一支 1080p、高畫質的真影片（約 3 秒）
  const maker = await browser.newPage();
  const b64 = await maker.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1920;
    c.height = 1080;
    const g = c.getContext("2d");
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stop = new Promise((r) => (rec.onstop = r));
    rec.start(200);
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = () => {
        const t = performance.now() - t0;
        for (let i = 0; i < 400; i++) {
          g.fillStyle = `hsl(${(i * 37 + t / 3) % 360},70%,${30 + ((i * 13) % 50)}%)`;
          g.fillRect((i * 97 + t) % 1920, (i * 53 + t / 2) % 1080, 60, 60);
        }
        if (t < 3000) requestAnimationFrame(tick);
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
  const original = Buffer.from(b64, "base64");

  const C = await phone(browser, mock);
  const c = C.page;
  await C.ctx.addInitScript(() => {
    window.__RM_VIDEO_TYPES = ["video/webm;codecs=vp8,opus"]; // 測試瀏覽器沒有 H.264，改用 WebM 走一遍壓縮流程
    window.__RM_VIDEO_MIN = 100_000;
  });
  await login(c, "climber88", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(600);
  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  await c.waitForTimeout(500);
  const dialog = c.locator("[role=dialog]");
  await dialog.locator('[role=tab]:has-text("影片")').click().catch(() => {});
  await dialog.locator("input[type=file]").setInputFiles({ name: "climb.webm", mimeType: "video/webm", buffer: original });
  await c.waitForTimeout(600);
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("上傳影片")').click();
  await c.waitForFunction(() => /壓縮中 \d+%/.test(document.body.textContent), null, { timeout: 10000 });
  assert.match(await c.textContent("[role=dialog]"), /壓縮中 \d+%，請不要關閉畫面/, "顯示壓縮進度");
  await c.waitForFunction(() => !document.body.textContent.includes("壓縮中"), null, { timeout: 20000 });
  await c.waitForTimeout(1500);
  assert.equal(mock.db.videos.length, 1, "上傳完成");
  const v = mock.db.videos[0];
  const sent = mock.db.vfiles[v.path].buf;
  assert.ok(sent.length < original.length * 0.85, `壓縮後變小（${original.length} → ${sent.length}）`);
  assert.ok(v.path.endsWith(".webm") && v.path.startsWith(`mingde/${r1.id}/${me}/`));
  assert.ok(v.size_bytes < original.length * 0.85, "記錄的是壓縮後的大小");
  assert.deepEqual(C.errors, []);
  await C.ctx.close();
});
