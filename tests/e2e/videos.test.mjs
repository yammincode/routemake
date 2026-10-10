// 顧客分享影片：上傳、刪除自己的、員工在後台刪除、下架路線時影片一起刪除；身高、動作標籤與篩選
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
  // 沒點「影片」分頁前不放影片縮圖（不下載影片）
  assert.equal(await dialog.locator("video").count(), 0, "打開路線卡片時不下載影片");
  assert.match(await dialog.locator('[role=tab]:has-text("影片")').textContent(), /1/, "影片分頁顯示有 1 支");
  await dialog.locator('[role=tab]:has-text("影片")').click();
  await c.waitForTimeout(300);
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
  assert.ok(await dialog.locator('button:text-is("分享影片")').isDisabled(), "沒勾同意不能上傳");
  await c.fill("#vcap", "我的 beta");
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("分享影片")').click();
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
  await c.waitForTimeout(300);
  assert.equal(mock.db.videos.length, 2, "刪除要按兩次：按一次還在");
  await viewer.locator('button:text-is("確定刪除？再按一次")').click();
  await c.waitForTimeout(600);
  assert.equal(mock.db.videos.length, 1, "刪除自己的影片");
  assert.ok(!mock.db.vfiles[mine.path], "檔案也刪掉");

  await dialog.locator("input[type=file]").setInputFiles(clip("again.mov", "video/quicktime"));
  await c.waitForTimeout(600);
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("分享影片")').click();
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
  await g.click('[role=dialog] [role=tab]:has-text("影片")');
  await g.waitForTimeout(300);
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
  await dialog.locator('button:text-is("分享影片")').click();
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

test("影片標籤：一支一列、用身高或動作篩選；分享時選身高、動作，下次自動帶入身高；資料庫還沒更新時照樣分享", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  const t = (min) => new Date(Date.now() - min * 60000).toISOString();
  mock.addVideo(other, r1, { caption: "慢慢來", height_band: "lt160", move: "static", created_at: t(30) });
  mock.addVideo(other, r1, { created_at: t(20) }); // 功能上線前分享的：沒有說明、沒有標籤
  mock.addVideo(other, r1, { caption: "起步跳上去", height_band: "170s", move: "dynamic", status: "send", duration_s: 42, created_at: t(10) });

  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(600);
  const open = async () => {
    await c.locator("main ul li button", { hasText: "A1-01" }).click();
    await c.waitForTimeout(600);
    await c.click('[role=dialog] [role=tab]:has-text("影片")');
    await c.waitForTimeout(400);
  };
  await open();
  const dialog = c.locator("[role=dialog]");
  const rows = dialog.locator('li button[aria-label^="播放"]');
  assert.equal(await rows.count(), 3, "一支一列");
  assert.ok((await rows.nth(0).textContent()).includes("起步跳上去") && (await rows.nth(0).textContent()).includes("身高 170–179cm・動態"), "列上有說明和身高・動作");
  assert.ok((await rows.nth(0).textContent()).includes("0:42"), "片長");
  assert.ok((await rows.nth(1).textContent()).includes("阿明的攀爬"), "沒寫說明的標題是「某某的攀爬」");
  const chips = await dialog.locator("button[aria-pressed].rounded-full").allTextContents();
  assert.deepEqual(chips.map((t) => t.replace(/\s+/g, "")), ["全部3", "160cm以下", "170–179cm", "動態", "靜態"], "只出現影片裡有的標籤，身高在前");

  const chip = (t) => dialog.locator(`button[aria-pressed].rounded-full:text-is("${t}")`);
  await chip("170–179cm").click();
  await c.waitForTimeout(200);
  assert.equal(await rows.count(), 1, "篩選後只剩這個身高");
  assert.ok((await dialog.textContent()).replace(/\s+/g, "").includes("1/3支"));
  await rows.first().click();
  const viewer = c.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  assert.ok((await viewer.textContent()).includes("1 / 1") && (await viewer.textContent()).includes("身高 170–179cm・動態"), "播放時只在篩選結果裡切換，也顯示標籤");
  await c.keyboard.press("Escape");
  await c.waitForTimeout(200);
  await chip("170–179cm").click();
  await c.waitForTimeout(200);
  assert.equal(await rows.count(), 3, "再按一次回到全部");

  // 分享：選身高、動作，不寫說明、還沒記錄這條；篩選停在別的身高時，分享完回到全部（剛分享的才看得到）
  await chip("170–179cm").click();
  await c.waitForTimeout(200);
  await dialog.locator("input[type=file]").setInputFiles(clip());
  await c.waitForTimeout(600);
  const form = await dialog.textContent();
  assert.ok(form.includes("沒寫的話，標題會顯示「小安的攀爬」"));
  assert.ok(form.includes("你還沒記錄這條，影片上不會顯示紀錄"));
  const opt = (t) => dialog.locator(`button[aria-pressed].rounded-field:has-text("${t}")`);
  await opt("160–169").click();
  await opt("一手一手慢慢移動").click();
  await opt("一手一手慢慢移動").click(); // 再按一次取消
  assert.equal(await opt("一手一手慢慢移動").getAttribute("aria-pressed"), "false", "再按一次取消");
  await opt("有跳、甩的動作").click();
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("分享影片")').click();
  await c.waitForTimeout(1000);
  const mine = mock.db.videos.find((v) => v.user_id === me);
  assert.equal(mine.height_band, "160s");
  assert.equal(mine.move, "dynamic");
  assert.equal(mine.caption, null);
  const pressed = await dialog.locator('button[aria-pressed="true"].rounded-full').allTextContents();
  assert.deepEqual(pressed.map((t) => t.replace(/\s+/g, "")), ["全部4"], "分享完篩選回到全部");
  assert.equal(await rows.count(), 4);
  assert.ok((await rows.first().textContent()).includes("小安的攀爬"), "新的在最上面");

  // 下次分享：身高自動帶入，動作不帶
  await dialog.locator("input[type=file]").setInputFiles(clip("b.mp4"));
  await c.waitForTimeout(600);
  assert.equal(await opt("160–169").getAttribute("aria-pressed"), "true", "身高記在這支手機");
  assert.equal(await opt("有跳、甩的動作").getAttribute("aria-pressed"), "false");
  await dialog.locator('button:text-is("取消")').click();
  await c.keyboard.press("Escape");
  await c.waitForTimeout(400);

  // 資料庫還沒套用 step25：照樣看得到影片、照樣分享（不帶標籤）
  mock.state.noVideoTags = true;
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  await open();
  assert.equal(await rows.count(), 4, "還沒更新資料庫也看得到影片");
  assert.equal(await dialog.locator("button[aria-pressed].rounded-full").count(), 0, "沒有標籤就不出現篩選");
  await dialog.locator("input[type=file]").setInputFiles(clip("c.mp4"));
  await c.waitForTimeout(600);
  assert.equal(await opt("160–169").getAttribute("aria-pressed"), "true", "重新整理後身高還記得（存在手機）");
  await opt("有跳、甩的動作").click();
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("分享影片")').click();
  await c.waitForTimeout(1000);
  assert.equal(mock.db.videos.length, 5, "去掉標籤照樣分享");
  assert.equal(mock.db.videos.at(-1).height_band ?? null, null);
  assert.ok(mock.state.tagFallbacks >= 2, "讀和寫都走了舊資料庫的備用方式");
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("已分享影片"));
  mock.state.noVideoTags = false;
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);

  // 登出換別人登入：不會帶入上一個人的身高（身高分帳號記，登出時清掉）
  await c.goto(BASE + "/me", { waitUntil: "networkidle" });
  await c.waitForTimeout(500);
  await c.click("text=登出");
  await c.waitForTimeout(400);
  assert.ok(!(await c.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("routemake:video-height")))), "登出時清掉記住的身高");
  await login(c, "other22", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(600);
  await open();
  await dialog.locator("input[type=file]").setInputFiles(clip("d.mp4"));
  await c.waitForTimeout(600);
  assert.equal(await dialog.locator('button[aria-pressed="true"].rounded-field').count(), 0, "別人登入時沒有預先選好的身高");
  assert.deepEqual(errors, []);
});

// 做一支有聲音的真影片（約 sec 秒，畫面一直在變、聲音是一個音）
async function realClip(sec) {
  const maker = await browser.newPage();
  const b64 = await maker.evaluate(async (sec) => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 360;
    const g = c.getContext("2d");
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const dest = ac.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    const stream = c.captureStream(30);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stop = new Promise((r) => (rec.onstop = r));
    rec.start(200);
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = () => {
        const t = performance.now() - t0;
        g.fillStyle = `hsl(${(t / 10) % 360},70%,50%)`;
        g.fillRect(0, 0, 640, 360);
        g.fillStyle = "#fff";
        g.fillRect((t / 5) % 640, 150, 60, 60);
        if (t < sec * 1000) requestAnimationFrame(tick);
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
  }, sec);
  await maker.close();
  return Buffer.from(b64, "base64");
}
// 影片真正的長度（MediaRecorder 錄的 WebM 一開始讀不到長度：跳到最後再讀）
async function clipSeconds(buf) {
  const p = await browser.newPage();
  const d = await p.evaluate(async (b64) => {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const v = document.createElement("video");
    v.src = URL.createObjectURL(new Blob([u], { type: "video/webm" }));
    const wait = (ev) => new Promise((r, no) => ((v["on" + ev] = r), (v.onerror = () => no(new Error("讀不到影片"))), setTimeout(() => no(new Error(`等不到 ${ev}`)), 8000)));
    await wait("loadedmetadata");
    if (!Number.isFinite(v.duration)) {
      v.currentTime = 1e9;
      await wait("seeked");
    }
    return v.duration;
  }, buf.toString("base64"));
  await p.close();
  return d;
}
const hasAudio = (buf) => buf.includes(Buffer.from("A_OPUS"));
// 上傳是 multipart：取出裡面的影片檔（第一行是分隔線，檔案在最後一個分隔線前）
function uploaded(buf) {
  const sep = buf.subarray(0, buf.indexOf("\r\n"));
  if (!sep.toString().startsWith("--")) return buf;
  const start = buf.indexOf(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])); // WebM 開頭
  return buf.subarray(start, buf.lastIndexOf(Buffer.concat([Buffer.from("\r\n"), sep])));
}

test("影片剪輯：太長的自動打開剪輯、只上傳選的那段，可以靜音；不太長的可以自己剪；不能重錄的手機照舊請他先剪短", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  const original = await realClip(5);
  assert.ok(hasAudio(original), "原本的影片有聲音");
  const seconds = await clipSeconds(original);
  assert.ok(seconds > 4.5 && seconds < 6, `原本約 5 秒（${seconds}）`);

  // max：測試用的長度上限；types：手機能不能重新錄影（測試瀏覽器沒有 H.264，改用 WebM）
  const open = async (max, canEdit) => {
    const C = await phone(browser, mock);
    await C.ctx.addInitScript(([max, canEdit]) => {
      window.__RM_VIDEO_MAX = max;
      window.__RM_VIDEO_TYPES = canEdit ? ["video/webm;codecs=vp8,opus"] : ["video/none"];
    }, [max, canEdit]);
    await login(C.page, "climber88", "password1", `/zone?id=${zone.id}`);
    await C.page.waitForTimeout(600);
    await C.page.locator("main ul li button", { hasText: "A1-01" }).click();
    await C.page.waitForTimeout(500);
    const dialog = C.page.locator("[role=dialog]");
    await dialog.locator('[role=tab]:has-text("影片")').click().catch(() => {});
    await dialog.locator("input[type=file]").setInputFiles({ name: "climb.webm", mimeType: "video/webm", buffer: original });
    await C.page.waitForTimeout(800);
    return { ...C, dialog };
  };
  const share = async ({ page, dialog }) => {
    await dialog.locator("input[type=checkbox]").check();
    await dialog.locator('button:text-is("分享影片")').click();
    await page.waitForFunction(() => /剪輯中 \d+%/.test(document.body.textContent), null, { timeout: 10000 });
    await page.waitForFunction(() => !document.body.textContent.includes("剪輯中"), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
  };

  // 1. 上限 3 秒、影片 5 秒：自動打開剪輯，先選前 3 秒，不能「不剪」；開始往後 1 秒 → 1–3 秒；靜音
  const A = await open(3, true);
  let t = await A.dialog.textContent();
  assert.ok(t.includes("影片 5 秒，最長 3 秒") && t.includes("已選 0:00–0:03（3 秒）"), "太長：自動打開剪輯、先選前 3 秒");
  assert.equal(await A.dialog.locator("text=不剪了").count(), 0, "太長的一定要剪");
  await A.dialog.locator('button[aria-label="開始往後 0.5 秒"]').click();
  await A.dialog.locator('button[aria-label="開始往後 0.5 秒"]').click();
  assert.ok((await A.dialog.textContent()).includes("已選 0:01–0:03（2 秒）"), "拉開始，結束不動");
  await A.dialog.locator('button[role=switch][aria-label="靜音"]').click();
  await share(A);
  assert.equal(mock.db.videos.length, 1, "上傳完成");
  let v = mock.db.videos[0];
  let sent = uploaded(mock.db.vfiles[v.path].buf);
  assert.equal(v.duration_s, 2, "記錄剪下來的長度");
  const d1 = await clipSeconds(sent);
  assert.ok(d1 > 1.5 && d1 < 2.8, `只上傳選的那段（${d1} 秒）`);
  assert.ok(!hasAudio(sent), "靜音：沒有聲音");
  assert.deepEqual(A.errors, []);
  await A.ctx.close();

  // 2. 上限 10 秒、影片 5 秒：不用剪；按「剪輯長度」自己剪成 0–3 秒，不靜音 → 有聲音
  const B = await open(10, true);
  t = await B.dialog.textContent();
  assert.ok(!t.includes("已選") && t.includes("✂ 剪輯長度"), "不太長：剪輯收起來");
  await B.dialog.locator('button:has-text("剪輯長度")').click();
  assert.ok((await B.dialog.textContent()).includes("已選 0:00–0:05"), "打開剪輯是整支");
  for (let i = 0; i < 4; i++) await B.dialog.locator('button[aria-label="結束往前 0.5 秒"]').click();
  assert.ok((await B.dialog.textContent()).includes("（3 秒）"), "結束往前 2 秒");
  await share(B);
  assert.equal(mock.db.videos.length, 2);
  v = mock.db.videos[1];
  sent = uploaded(mock.db.vfiles[v.path].buf);
  assert.equal(v.duration_s, 3);
  const d2 = await clipSeconds(sent);
  assert.ok(d2 > 2.5 && d2 < 3.8, `只上傳選的那段（${d2} 秒）`);
  assert.ok(hasAudio(sent), "沒靜音：有聲音");
  assert.deepEqual(B.errors, []);
  await B.ctx.close();

  // 3. 不能重新錄影的手機：跟原本一樣，太長就請他先剪短，沒有剪輯、靜音
  const C = await open(3, false);
  assert.ok((await C.page.locator("[role=status]").last().textContent()).includes("影片 5 秒，最長 3 秒，請先剪短再分享"));
  assert.equal(await C.dialog.locator('button:has-text("剪輯長度")').count(), 0);
  assert.equal(mock.db.videos.length, 2);
  await C.ctx.close();
  void me;
  void r1;
});
