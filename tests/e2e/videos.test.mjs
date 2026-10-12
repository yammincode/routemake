// 顧客分享影片：上傳、刪除自己的、員工在後台刪除、下架路線時影片一起刪除；身高、動作標籤與篩選
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

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

  // 做一支 1080p、畫面很雜的真影片（約 3 秒）：小色塊很多，原檔一定比 720p 壓縮後大很多
  // （以前色塊少，原檔只有 250 KB 左右，跟壓縮後差不多大，電腦忙時就判定「壓了沒變小」）；錄出來還是太小就重錄（最多 3 次）
  // 電腦慢時畫不了幾格、檔案偏小：重錄時錄久一點（3 → 5 → 8 秒）
  const make = async (ms) => {
    const maker = await browser.newPage();
    const b64 = await maker.evaluate(async (ms) => {
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
          for (let i = 0; i < 2500; i++) {
            g.fillStyle = `hsl(${(i * 37 + t / 3) % 360},70%,${30 + ((i * 13) % 50)}%)`;
            g.fillRect((i * 97 + t) % 1920, (i * 53 + t / 2) % 1080, 24, 24);
          }
          if (t < ms) requestAnimationFrame(tick);
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
    }, ms);
    await maker.close();
    return Buffer.from(b64, "base64");
  };
  let original = await make(3000);
  for (const ms of [5000, 8000]) if (original.length < 1_500_000) original = await make(ms);
  assert.ok(original.length >= 1_500_000, `測試影片夠大（${original.length}）`);

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
  await c.waitForFunction(() => document.body.textContent.includes("已分享影片"), null, { timeout: 20000 });
  assert.equal(mock.db.videos.length, 1, "上傳完成");
  const v = mock.db.videos[0];
  const sent = mock.db.vfiles[v.path].buf;
  assert.ok(sent.length < original.length * 0.85, `壓縮後變小（${original.length} → ${sent.length}）`);
  assert.ok(v.path.endsWith(".webm") && v.path.startsWith(`mingde/${r1.id}/${me}/`));
  assert.ok(v.size_bytes < original.length * 0.85, "記錄的是壓縮後的大小");
  // 壓縮時順便擷取縮圖：跟影片同名、WebP、快取跟影片一樣 1 小時
  const t = mock.db.tfiles[v.thumb_path ?? ""];
  assert.ok(t && v.thumb_path === v.path.replace(/\.webm$/, ".webp"), `壓縮時順便做縮圖（${v.thumb_path}）`);
  assert.equal(t.type, "image/webp");
  assert.equal(t.cache, "3600", "縮圖快取 1 小時（跟影片一樣，刪掉後不留太久）");
  assert.ok(t.buf.length > 500 && t.buf.length < 1048576, `縮圖大小合理（${t.buf.length}）`);
  assert.deepEqual(C.errors, []);
  await C.ctx.close();
});

test("影片標籤：一支一列、用身高、動作或型態篩選；分享時選型態（最多 2 個）、身高、動作，下次自動帶入身高；資料庫還沒更新時照樣分享", async () => {
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

  // 分享：選型態、身高、動作，不寫心得、還沒記錄這條；篩選停在別的身高時，分享完回到全部（剛分享的才看得到）
  await chip("170–179cm").click();
  await c.waitForTimeout(200);
  await dialog.locator("input[type=file]").setInputFiles(clip());
  await c.waitForTimeout(600);
  const form = await dialog.textContent();
  assert.ok(form.includes("沒寫的話，標題會顯示「小安的攀爬」"));
  assert.ok(form.includes("你還沒記錄這條，影片上不會顯示紀錄"));
  assert.ok(form.includes("你爬起來覺得？（選填，最多 2 個）") && form.includes("心得（選填）"));
  assert.ok(form.indexOf("你爬起來覺得？") < form.indexOf("心得（選填）"), "型態在心得上面");
  const opt = (t) => dialog.locator(`button[aria-pressed].rounded-field:has-text("${t}")`);
  // 型態：最多 2 個，選滿後其他的按不了；取消一個又可以選
  await opt("🤏 手指超痛").click();
  await opt("🧘 risky").click();
  assert.ok(await opt("💪 力量感").isDisabled(), "選滿 2 個，其他的按不了");
  await opt("🧘 risky").click();
  assert.ok(!(await opt("💪 力量感").isDisabled()), "取消一個又可以選");
  await opt("🧘 risky").click();
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
  assert.deepEqual(mine.feel_tags, ["fingers", "risky"]);
  assert.equal(mine.caption, null);
  const pressed = await dialog.locator('button[aria-pressed="true"].rounded-full').allTextContents();
  assert.deepEqual(pressed.map((t) => t.replace(/\s+/g, "")), ["全部4"], "分享完篩選回到全部");
  assert.equal(await rows.count(), 4);
  assert.ok((await rows.first().textContent()).includes("小安的攀爬"), "新的在最上面");
  assert.equal(mine.climbed_on ?? null, null, "沒有紀錄不記攀爬日");
  assert.ok((await rows.first().textContent()).includes("今天分享"), "沒有紀錄的寫分享時間");
  const lines = await rows.first().locator("span.block").allTextContents();
  assert.ok(lines.includes("🤏 手指超痛・🧘 risky") && lines.includes("身高 160–169cm・動態"), "型態自己一行、身高・動作一行：" + lines.join("｜"));
  const feelLine = rows.first().locator("span.block", { hasText: "🤏 手指超痛" });
  assert.ok(await feelLine.evaluate((el) => el.scrollWidth <= el.clientWidth), "型態那一行沒有被切掉");
  // 用型態篩選
  await chip("🤏 手指超痛").click();
  await c.waitForTimeout(200);
  assert.equal(await rows.count(), 1, "按型態篩選只剩這支");
  await chip("🤏 手指超痛").click();
  await c.waitForTimeout(200);
  assert.equal(await rows.count(), 4);

  // 下次分享：身高自動帶入，動作、型態不帶
  await dialog.locator("input[type=file]").setInputFiles(clip("b.mp4"));
  await c.waitForTimeout(600);
  assert.equal(await opt("160–169").getAttribute("aria-pressed"), "true", "身高記在這支手機");
  assert.equal(await opt("有跳、甩的動作").getAttribute("aria-pressed"), "false");
  assert.equal(await opt("🤏 手指超痛").getAttribute("aria-pressed"), "false", "型態每支重新選");
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

  // 資料庫還沒套用 step35（沒有型態，身高、動作還在）：選了型態照樣分享，身高、動作照存
  mock.state.noVideoFeel = true;
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  await open();
  assert.equal(await rows.count(), 5);
  assert.equal(await chip("🤏 手指超痛").count(), 0, "讀不到型態就沒有型態篩選");
  assert.equal(await chip("160–169cm").count(), 1, "身高篩選照樣有");
  await dialog.locator("input[type=file]").setInputFiles(clip("e.mp4"));
  await c.waitForTimeout(600);
  await opt("💪 力量感").click();
  await opt("有跳、甩的動作").click();
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("分享影片")').click();
  await c.waitForTimeout(1000);
  assert.equal(mock.db.videos.length, 6, "去掉型態照樣分享");
  assert.equal(mock.db.videos.at(-1).height_band, "160s", "身高照存");
  assert.equal(mock.db.videos.at(-1).move, "dynamic", "動作照存");
  assert.deepEqual(mock.db.videos.at(-1).feel_tags, []);
  mock.state.noVideoFeel = false;
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

test("影片時間：有紀錄顯示攀爬日（不是上傳日）、沒有紀錄寫幾天前分享；資料庫還沒套用 step34 時標籤照樣顯示；24 小時最多 15 支", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  const md = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
  const t = (min) => new Date(Date.now() - min * 60000).toISOString();
  mock.addVideo(other, r1, { caption: "以前分享的", created_at: t(3 * 1440) }); // 沒有攀爬日（沒有紀錄或功能上線前分享的）
  mock.addVideo(other, r1, { caption: "五天前爬的", status: "send", climbed_on: taipeiDay(-5), height_band: "170s", created_at: t(0) }); // 今天才上傳
  mock.addAscent(me, r1, "flash", taipeiDay(-2));

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
  const row = async (i) => (await rows.nth(i).textContent()).replace(/\s+/g, "");
  assert.equal(await rows.count(), 2);
  assert.ok((await row(0)).includes(`阿明・${md(taipeiDay(-5))}完攀`), "今天上傳、5 天前爬的顯示攀爬日：" + (await row(0)));
  assert.ok(!(await row(0)).includes("今天"), "不會寫成今天");
  assert.ok((await row(1)).includes("阿明・3天前分享"), "沒有攀爬日的寫明是分享時間：" + (await row(1)));

  // 分享：表單先說會一起顯示攀爬日和紀錄；日期、紀錄由資料庫從本人紀錄帶入
  await dialog.locator("input[type=file]").setInputFiles(clip());
  await c.waitForTimeout(600);
  assert.ok((await dialog.textContent()).replace(/\s+/g, "").includes(`你在這條的紀錄會一起顯示：${md(taipeiDay(-2))}Flash`), "表單顯示會一起顯示的攀爬日和紀錄");
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("分享影片")').click();
  await c.waitForTimeout(1000);
  const mine = mock.db.videos.find((v) => v.user_id === me);
  assert.equal(mine.climbed_on, taipeiDay(-2), "攀爬日是紀錄上的日期");
  assert.equal(mine.status, "flash");
  assert.equal(await rows.count(), 3);
  assert.ok((await row(0)).includes(`小安的攀爬${md(taipeiDay(-2))}Flash`), "自己的影片顯示攀爬日：" + (await row(0)));
  await rows.first().click();
  const viewer = c.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  assert.ok((await viewer.textContent()).includes(md(taipeiDay(-2))), "全螢幕播放也顯示攀爬日");
  await c.keyboard.press("Escape");
  await c.waitForTimeout(200);
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);

  // 資料庫還沒套用 step34（沒有攀爬日欄位）：照樣讀得到影片，身高標籤和篩選不會不見，時間改寫分享時間
  mock.state.noVideoClimb = true;
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  await open();
  assert.equal(await rows.count(), 3, "還沒套用 step34 也看得到影片");
  assert.ok((await row(1)).includes("今天分享") && (await row(1)).includes("身高170–179cm"), "身高標籤照樣顯示：" + (await row(1)));
  assert.ok((await dialog.locator('button[aria-pressed].rounded-full:text-is("170–179cm")').count()) === 1, "身高篩選照樣出現");
  await dialog.locator("input[type=file]").setInputFiles(clip("c.mp4"));
  await c.waitForTimeout(600);
  const form = (await dialog.textContent()).replace(/\s+/g, "");
  assert.ok(form.includes("你在這條的紀錄會一起顯示：Flash"), "資料庫還不能記日期時，表單不說會顯示日期：" + form.slice(form.indexOf("你在這條"), form.indexOf("你在這條") + 30));
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("分享影片")').click();
  await c.waitForTimeout(1000);
  assert.equal(mock.db.videos.filter((v) => v.user_id === me).length, 2, "照樣分享");
  assert.equal(mock.db.videos.at(-1).climbed_on, null);
  assert.equal(mock.db.videos.at(-1).status, "flash");
  mock.state.noVideoClimb = false;
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);

  // 24 小時最多 15 支：已經分享 15 支時，分享前就擋下
  for (let i = 0; i < 13; i++) mock.addVideo(me, r1, { created_at: t(60 + i) });
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  await open();
  await dialog.locator("input[type=file]").setInputFiles(clip("d.mp4"));
  await c.waitForTimeout(600);
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("分享影片")').click();
  await c.waitForTimeout(800);
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("每人 24 小時內最多分享 15 支影片"), "第 16 支被擋");
  assert.equal(mock.db.videos.filter((v) => v.user_id === me).length, 15);
  assert.deepEqual(errors, []);
  await c.context().close();
});

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
    // 處理中：靜音、剪輯都不能再改（改了也不會用到）
    assert.ok(await dialog.locator('button[role=switch][aria-label="靜音"]').isDisabled(), "處理中不能切靜音");
    assert.ok(await dialog.locator('button[aria-label="開始往後 0.5 秒"]').isDisabled(), "處理中不能改剪輯");
    await page.waitForFunction(() => !document.body.textContent.includes("剪輯中"), null, { timeout: 20000 });
    await page.waitForFunction(() => document.body.textContent.includes("已分享影片"), null, { timeout: 20000 });
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

  // 4. 上攀路線：上限放寬 3 倍（正式是 3 分鐘、100 MB）；同樣 5 秒的影片，抱石上限 2 秒要剪，上攀 6 秒不用剪
  const zR = mock.db.zones.find((z) => z.gym_id === "g3" && z.grade_system === "yds");
  const rope = mock.addRoute(zR, 108, "紅");
  const D = await phone(browser, mock);
  await D.ctx.addInitScript(() => {
    window.__RM_VIDEO_MAX = 2;
    window.__RM_VIDEO_TYPES = ["video/webm;codecs=vp8,opus"];
  });
  await login(D.page, "climber88", "password1", `/zone?id=${zR.id}`);
  await D.page.waitForTimeout(600);
  await D.page.locator("main ul li button", { hasText: rope.code }).click();
  await D.page.waitForTimeout(500);
  const dd = D.page.locator("[role=dialog]");
  await dd.locator('[role=tab]:has-text("影片")').click().catch(() => {});
  t = await dd.textContent();
  assert.ok(t.includes("最長 6 秒") && t.includes("影片越長等越久"), "上攀上限放寬、提醒影片越長等越久：" + t.slice(t.indexOf("最長"), t.indexOf("最長") + 40));
  await dd.locator("input[type=file]").setInputFiles({ name: "climb.webm", mimeType: "video/webm", buffer: original });
  await D.page.waitForTimeout(800);
  t = await dd.textContent();
  assert.ok(!t.includes("已選") && t.includes("✂ 剪輯長度"), "5 秒的影片在上攀不用剪");
  // Supabase 的上傳上限還沒改成 100 MB（這裡用很小的上限模擬）：檔案沒超過 App 的上限，提示寫真正的上限，不會說「超過 100 MB」
  mock.state.uploadMax = 100;
  await dd.locator("input[type=checkbox]").check();
  await dd.locator('button:text-is("分享影片")').click();
  await D.page.waitForFunction(() => document.body.textContent.includes("目前每支最多 50 MB"), null, { timeout: 20000 });
  assert.ok(!(await D.page.locator("[role=status]").last().textContent()).includes("超過 100 MB"), "不會說超過 100 MB");
  assert.equal(mock.db.videos.length, 2);
  mock.state.uploadMax = Infinity;
  // 資料庫還沒套用 step36（舊的 60 秒上限，這裡用 2 秒模擬）：分享後說清楚原因，檔案刪掉
  mock.state.noRopeVideo = true;
  mock.state.oldVideoMax = 2;
  const files0 = Object.keys(mock.db.vfiles).length;
  await dd.locator('button:text-is("分享影片")').click();
  await D.page.waitForFunction(() => document.body.textContent.includes("這支影片太長"), null, { timeout: 20000 });
  assert.ok((await D.page.locator("[role=status]").last().textContent()).includes("目前每支最長 60 秒（上攀 3 分鐘還沒開放）"), "說清楚原因");
  assert.equal(mock.db.videos.length, 2, "沒有存進去");
  assert.equal(Object.keys(mock.db.vfiles).length, files0, "上傳的檔案刪掉");
  // 資料庫更新後：同一支照樣分享
  mock.state.noRopeVideo = false;
  mock.state.oldVideoMax = 60;
  await dd.locator('button:text-is("分享影片")').click();
  await D.page.waitForFunction(() => document.body.textContent.includes("已分享影片"), null, { timeout: 20000 });
  assert.equal(mock.db.videos.length, 3);
  assert.ok(mock.db.videos.at(-1).duration_s > 4.5, "記錄原本的長度（上攀不用剪）");
  assert.deepEqual(D.errors, []);
  await D.ctx.close();
  void me;
  void r1;
});

// 做一支小的真影片（約 1.5 秒、320×240，不用壓縮）：分享時從原檔擷取縮圖
async function smallClip() {
  const maker = await browser.newPage();
  const b64 = await maker.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
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
        g.fillStyle = `hsl(${(t / 5) % 360},70%,50%)`;
        g.fillRect(0, 0, 320, 240);
        if (t < 1500) requestAnimationFrame(tick);
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

test("省流量：影片列表只放縮圖（沒有縮圖是灰色方塊）、按了才載入影片；滑到別支要再按 ▶；後台、New~ 也一樣", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const setter = mock.addUser("setterx", "password1", { nickname: "阿定" });
  mock.db.staff_roles.push({ user_id: setter, gym_id: "mingde", role: "setter" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const real = await smallClip(); // 真的影片：播放器才不會因為讀不了而改顯示錯誤訊息
  for (const v of [mock.addVideo(other, r1, { caption: "有縮圖的", thumb: true, created_at: ago(1) }), mock.addVideo(other, r1, { caption: "舊影片沒縮圖", created_at: ago(2) })])
    mock.db.vfiles[v.path].buf = real;

  const C = await phone(browser, mock);
  const c = C.page;
  const videoReqs = [];
  c.on("request", (q) => q.url().includes("/route-videos/") && videoReqs.push(q.url()));
  await login(c, "climber88", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(600);
  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  await c.waitForTimeout(500);
  const dialog = c.locator("[role=dialog]");
  await dialog.locator('[role=tab]:has-text("影片")').click();
  await c.waitForTimeout(600);
  assert.equal(await dialog.locator("video").count(), 0, "影片分頁的列表沒有 <video>");
  const withThumb = dialog.locator("li", { hasText: "有縮圖的" });
  const img = withThumb.locator("img");
  assert.equal(await img.count(), 1, "有縮圖的顯示縮圖");
  assert.match(await img.getAttribute("src"), /\/storage\/v1\/object\/public\/video-thumbs\//);
  assert.equal(await img.getAttribute("loading"), "lazy");
  assert.ok(await img.evaluate((el) => el.complete && el.naturalWidth > 0), "縮圖畫得出來");
  const old = dialog.locator("li", { hasText: "舊影片沒縮圖" });
  assert.equal(await old.locator("img").count(), 0, "舊影片沒有縮圖");
  assert.equal(await old.locator("span.bg-line").count(), 1, "舊影片是灰色方塊");
  assert.deepEqual(videoReqs, [], "還沒按播放，一支影片都沒下載");

  // 按了才建立 <video>、下載影片；縮圖當作封面
  await withThumb.locator("button").click();
  const viewer = c.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  const vid = viewer.locator("video");
  assert.equal(await vid.count(), 1, "點開的那支直接播");
  assert.match(await vid.getAttribute("poster"), /video-thumbs/, "縮圖當封面");
  assert.equal(await vid.getAttribute("preload"), "none");
  await c.waitForTimeout(400);
  assert.ok(videoReqs.length >= 1, "按了才下載影片");
  // 滑到下一支：先顯示縮圖和 ▶，按了才載入
  await viewer.locator('button[aria-label="下一支"]').click();
  await c.waitForTimeout(200);
  assert.ok((await viewer.textContent()).includes("2 / 2"));
  assert.equal(await viewer.locator("video").count(), 0, "滑到別支不會自動下載");
  const n = videoReqs.length;
  await viewer.locator('button[aria-label="播放這支影片"]').click();
  assert.equal(await viewer.locator("video").count(), 1, "按 ▶ 才播放");
  await c.waitForTimeout(400);
  assert.ok(videoReqs.length > n, "按了才下載這支");
  await c.keyboard.press("Escape");
  await c.waitForTimeout(200);

  // New~：影片、留言分頁都沒有 <video>
  const before = videoReqs.length;
  await c.goto(BASE + "/new", { waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  assert.equal(await c.locator('main [role=tabpanel] li button[aria-label^="播放"]').count(), 2);
  assert.equal(await c.locator("main video").count(), 0, "New~ 的影片列表沒有 <video>");
  await c.click('[role=tab]:has-text("留言")');
  await c.waitForTimeout(300);
  assert.equal(await c.locator("video").count(), 0);
  assert.equal(videoReqs.length, before, "New~ 沒有下載影片");

  // 後台的影片區也一樣
  const S = await phone(browser, mock);
  const sReqs = [];
  S.page.on("request", (q) => q.url().includes("/route-videos/") && sReqs.push(q.url()));
  await login(S.page, "setterx", "password1", "/admin");
  await S.page.waitForTimeout(1200);
  assert.equal(await S.page.locator('main button[aria-label^="播放"]').count(), 2, "後台看得到 2 支");
  assert.equal(await S.page.locator("main video").count(), 0, "後台影片區沒有 <video>");
  assert.equal(await S.page.locator('main button[aria-label^="播放"] img').count(), 1, "後台有縮圖的顯示縮圖");
  assert.deepEqual(sReqs, [], "後台沒有下載影片");
  assert.deepEqual([...C.errors, ...S.errors], []);
});

test("分享影片時從原檔做縮圖（不用壓縮的小影片）；刪影片時縮圖一起刪；資料庫還沒套用 step38 照樣分享（灰色方塊）", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = mock.db.zones[0];
  mock.addRoute(zone, 4, "藍");
  const original = await smallClip();

  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(600);
  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  await c.waitForTimeout(500);
  const dialog = c.locator("[role=dialog]");
  await dialog.locator('[role=tab]:has-text("影片")').click().catch(() => {});
  const share = async (caption) => {
    await dialog.locator("input[type=file]").setInputFiles({ name: "short.webm", mimeType: "video/webm", buffer: original });
    await c.waitForTimeout(600);
    await c.fill("#vcap", caption);
    await dialog.locator("input[type=checkbox]").check();
    await dialog.locator('button:text-is("分享影片")').click();
    await c.waitForFunction(() => document.body.textContent.includes("已分享影片"), null, { timeout: 20000 });
    await c.waitForTimeout(400);
  };

  // 資料庫還沒套用 step38：照樣分享、沒有縮圖、列表是灰色方塊
  mock.state.noVideoThumb = true;
  await share("舊資料庫");
  const v1 = mock.db.videos.find((v) => v.caption === "舊資料庫");
  assert.ok(v1 && !v1.thumb_path, "照樣分享、沒有縮圖");
  assert.equal(Object.keys(mock.db.tfiles).length, 0);
  assert.equal(await dialog.locator("li", { hasText: "舊資料庫" }).locator("span.bg-line").count(), 1, "灰色方塊");

  // 套用後（App 重新打開才會再試縮圖）：從原檔擷取縮圖
  mock.state.noVideoThumb = false;
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  await c.locator("main ul li button", { hasText: "A1-01" }).click();
  await c.waitForTimeout(500);
  await dialog.locator('[role=tab]:has-text("影片")').click().catch(() => {});
  await share("新資料庫");
  const v2 = mock.db.videos.find((v) => v.caption === "新資料庫");
  const t = mock.db.tfiles[v2.thumb_path ?? ""];
  assert.ok(t && v2.thumb_path === v2.path.replace(/\.webm$/, ".webp"), `從原檔做縮圖（${v2.thumb_path}）`);
  assert.equal(t.type, "image/webp");
  assert.equal(t.cache, "3600");
  assert.equal(await dialog.locator("li", { hasText: "新資料庫" }).locator("img").count(), 1, "列表顯示縮圖");

  // 刪掉自己的影片：縮圖一起刪
  await dialog.locator('button[aria-label^="播放"]', { hasText: "新資料庫" }).click();
  const viewer = c.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  await viewer.locator('button:text-is("刪除這支影片")').click();
  await viewer.locator('button:text-is("確定刪除？再按一次")').click();
  await c.waitForTimeout(800);
  assert.ok(!mock.db.videos.some((v) => v.caption === "新資料庫"), "影片刪掉");
  assert.ok(!mock.db.vfiles[v2.path] && !mock.db.tfiles[v2.thumb_path], "影片檔和縮圖都刪掉");
  assert.deepEqual(C.errors, []);
  await C.ctx.close();
});

test("路線列：有影片、留言時在「幾天前」後面顯示影片數、留言數（沒有就不顯示）；資料庫還沒套用 step38 時只顯示留言數", async () => {
  const mock = createMock();
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  const r2 = mock.addRoute(zone, 3, "紅");
  mock.addVideo(other, r1);
  mock.addVideo(other, r1);
  mock.addComment(other, r1, "第三手好遠");

  const { page: c, errors } = await phone(browser, mock);
  await c.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  const row = (code) => c.locator("main ul li button", { hasText: code });
  assert.equal(await row(r1.code).locator('[aria-label="2 支影片"]').count(), 1, "有影片：顯示影片數");
  assert.match((await row(r1.code).textContent()).trim(), /今天\s*2\s*1$/, "影片數在前、留言數在後，跟在幾天前（今天）後面");
  assert.equal(await row(r2.code).locator('[aria-label$="支影片"]').count(), 0, "沒有影片不顯示");
  assert.match((await row(r2.code).textContent()).trim(), /今天$/, "沒有影片、留言就跟原本一樣");

  // 資料庫還沒套用 step38：只有留言數
  mock.state.noVideoThumb = true;
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  assert.equal(await row(r1.code).locator('[aria-label$="支影片"]').count(), 0, "還沒套用時不顯示影片數");
  assert.match((await row(r1.code).textContent()).trim(), /今天\s*1$/, "留言數照常顯示");
  assert.deepEqual(errors, []);
});
