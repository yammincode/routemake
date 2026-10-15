// 原岩夥伴：選夥伴、換色、存起來；留言、影片旁的頭像；別人的人物卡；夥伴說話（每頁上面、右下角、做了事情）；閉嘴；幹話模式；還沒套用 step41 照常
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

// 幹話：直接讀 lib/mascots.ts 的 TROLL_LINES（老闆加句子不用改測試）
const TROLL = [...fs.readFileSync(new URL("../../lib/mascots.ts", import.meta.url), "utf8").match(/TROLL_LINES = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
// 每天一句要固定挑哪一句：Math.random 固定成 v（0.3：不講夥伴自己的話、挑第一句紀錄）
const fixRandom = (ctx, v) => ctx.addInitScript((x) => (Math.random = () => x), v);

test("原岩夥伴：選夥伴、換色、太空小熊即將登場；留言和影片旁的頭像、別人的人物卡跟著換", async () => {
  const mock = createMock();
  const b = mock.addUser("climberb", "password1", { nickname: "小安" });
  mock.addUser("viewer01", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 5, "藍", ["指力"]);
  mock.db.comments.push({ id: crypto.randomUUID(), route_id: r.id, user_id: b, body: "第三手好遠", created_at: new Date().toISOString(), edited_at: null, deleted_at: null });
  mock.addVideo(b, r, { caption: "第三手" });

  const B = await phone(browser, mock);
  await login(B.page, "climberb", "password1", "/card");
  const p = B.page;
  await p.waitForSelector('main [data-mascot="mingde"]');
  assert.ok((await p.textContent("main")).includes("夥伴：高山猛牛（耐力）"), "還沒選：預設高山猛牛，有夥伴簡介");

  await p.click('main button:text-is("編輯人物卡")');
  const bear = p.locator("main button", { hasText: "太空小熊" });
  assert.ok(await bear.isDisabled(), "太空小熊點不了");
  assert.ok((await bear.textContent()).includes("即將登場"));
  await p.locator("main button", { hasText: "星際猿猿" }).click();
  await p.click('main button[aria-label="身體 #d7263d"]');
  await p.click('main button[aria-label="卡片背景 #006382"]');
  // 預覽馬上換
  assert.equal(await p.locator('main [data-mascot="wanhua"]').count() >= 1, true, "上面的角色卡換成星際猿猿");
  assert.ok((await p.textContent("main")).includes("夥伴：星際猿猿（動態）"));
  await p.click('main button:text-is("儲存人物卡")');
  await p.waitForTimeout(600);
  assert.deepEqual(mock.db.profiles.find((x) => x.id === b).mascot, { id: "wanhua", colors: ["#d7263d", null, null], bg: "#006382" }, "存進資料庫");
  assert.deepEqual(B.errors, []);

  // 別人看：留言旁的頭像、影片旁的頭像、人物卡（沒公開也看得到夥伴）
  const V = await phone(browser, mock);
  await login(V.page, "viewer01");
  const v = V.page;
  await v.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await v.locator("main ul li button", { hasText: "A1-01" }).click();
  await v.waitForTimeout(600);
  await v.click('[role=dialog] [role=tab]:has-text("留言")');
  await v.waitForSelector('[role=dialog] [data-mascot="wanhua"]');
  await v.click('[role=dialog] [role=tab]:has-text("影片")');
  await v.waitForTimeout(400);
  assert.ok((await v.locator('[role=dialog] [role=tabpanel]:not([hidden]) [data-mascot="wanhua"]').count()) >= 1, "影片列也有頭像");
  await v.click('[role=dialog] [role=tab]:has-text("留言")');
  await v.click('[role=dialog] button:text-is("小安")');
  await v.waitForTimeout(600);
  const card = v.locator("[role=dialog]").last();
  assert.ok((await card.textContent()).includes("還沒有公開人物卡"));
  assert.ok((await card.textContent()).includes("星際猿猿"), "沒公開也看得到夥伴");
  assert.deepEqual(V.errors, []);
  await B.ctx.close();
  await V.ctx.close();
});

test("原岩夥伴：館首頁每次打開說一句（看紀錄）、✕ 關掉後這次打開 App 不再出現；幹話模式加刀疤棒棒糖、只講幹話（關掉沒有幹話）", async () => {
  const mock = createMock();
  const a = mock.addUser("climbera", "password1", { nickname: "小岩" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 5, "藍", ["指力"]);
  mock.addAscent(a, r, "project", new Date().toISOString().slice(0, 10));

  const A = await phone(browser, mock);
  await fixRandom(A.ctx, 0.3);
  await login(A.page, "climbera", "password1", "/gym/mingde");
  const p = A.page;
  const bubble = p.locator('[data-testid="mascot-bubble"]');
  await bubble.waitFor();
  const text = await bubble.textContent();
  assert.ok(text.includes("高山猛牛"), "預設高山猛牛");
  assert.ok(text.includes("上次 A1-01（V5 藍）還在嘗試中"), `講嘗試中的路線：${text}`);
  // 在標題下面、平面圖上面
  const title = await p.locator("h1", { hasText: "今天爬哪一區" }).boundingBox();
  const bb = await bubble.boundingBox();
  assert.ok(bb.y > title.y, "在標題下面");
  // 每次打開都說：換到別頁再回來還在
  await p.goto(`${BASE}/new`, { waitUntil: "networkidle" });
  await p.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await bubble.waitFor();
  // ✕ 關掉：這次打開 App 回到館首頁不再出現
  await bubble.locator('button[aria-label="關掉，今天不再出現"]').click();
  assert.equal(await bubble.count(), 0, "關掉了");
  await p.goto(`${BASE}/new`, { waitUntil: "networkidle" });
  await p.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  assert.equal(await bubble.count(), 0, "這次打開 App 不再出現");

  // 幹話模式：人物卡打開開關 → 夥伴加刀疤和棒棒糖；重新打開 App 館首頁講老闆給的幹話（Math.random 0.3）
  await p.goto(`${BASE}/card`, { waitUntil: "networkidle" });
  await p.waitForSelector('main [data-mascot="mingde"]');
  assert.equal(await p.locator("main [data-troll]").count(), 0);
  await p.click('main button[role=switch][aria-label="幹話模式"]');
  assert.ok((await p.locator("main [data-troll]").count()) >= 1, "加上刀疤和棒棒糖");
  const reopen = () => p.evaluate(() => sessionStorage.clear()); // 當作重新打開 App
  await reopen();
  await p.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await bubble.waitFor();
  const troll = TROLL;
  const said = await bubble.textContent();
  assert.ok(troll.some((t) => said.includes(t)), `講幹話：${said}`);
  assert.equal(await bubble.locator("[data-troll]").count(), 1, "泡泡旁的夥伴也有刀疤");
  // 幹話模式只講幹話（跟平常的話分開）：Math.random 0.7（以前會講紀錄）也照樣講幹話
  await fixRandom(A.ctx, 0.7);
  await reopen();
  await p.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await bubble.waitFor();
  const again = await bubble.textContent();
  assert.ok(troll.some((t) => again.includes(t)) && !again.includes("新路線"), `幹話模式只講幹話：${again}`);
  // 右下角小夥伴點牠也只講幹話
  await p.goto(`${BASE}/card`, { waitUntil: "networkidle" });
  const buddy = p.locator('[data-testid="mascot-buddy"] [role=status]');
  await buddy.waitFor();
  const bt = await buddy.textContent();
  assert.ok(troll.some((t) => bt.includes(t)), `小夥伴只講幹話：${bt}`);
  // 關掉幹話模式：沒有幹話
  await p.click('main button[role=switch][aria-label="幹話模式"]');
  await reopen();
  await p.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await bubble.waitFor();
  const normal = await bubble.textContent();
  assert.ok(normal.includes("明德館這週有 1 條新路線") && !troll.some((t) => normal.includes(t)), `關掉幹話模式講平常的話：${normal}`);
  assert.equal(await bubble.locator("[data-troll]").count(), 0, "關掉後沒有刀疤");
  assert.deepEqual(A.errors, []);
  await A.ctx.close();
});

test("夥伴說話：區域頁講這一區、記錄 Flash 破紀錄撒彩帶、完攀、第一則留言、我的紀錄、右下角小夥伴、🤫 閉嘴、人物卡關掉說話", async () => {
  const mock = createMock();
  const a = mock.addUser("climbera", "password1", { nickname: "小岩" });
  const zone = mock.db.zones[0];
  const easy = mock.addRoute(zone, 2, "藍", ["技巧"]);
  mock.addRoute(zone, 3, "紅", ["指力"]);
  mock.addAscent(a, easy, "project", taipeiDay(-3));

  const A = await phone(browser, mock);
  await fixRandom(A.ctx, 0.3);
  await login(A.page, "climbera", "password1", `/zone?id=${zone.id}`);
  const p = A.page;
  const bubble = p.locator('[data-testid="mascot-bubble"]');
  await bubble.waitFor();
  assert.ok((await bubble.textContent()).includes("A1 區只剩 2 條沒完攀"), `區域頁講這一區：${await bubble.textContent()}`);
  // 位置：上一區／下一區方框下面、照片上面
  const nav = await p.locator("main button", { hasText: "下一區" }).first().boundingBox();
  const bb = await bubble.boundingBox();
  const howto = await p.locator("main", { hasText: "顏色和分數怎麼看" }).locator("text=顏色和分數怎麼看").first().boundingBox();
  assert.ok(nav && bb.y > nav.y, "在方框下面");
  assert.ok(howto && bb.y < howto.y, "在照片和路線上面");

  // 記錄 Flash：第一次完攀 V3 → 破紀錄、撒彩帶
  const toast = p.locator('[data-testid="mascot-toast"]');
  await p.locator("main ul li button", { hasText: "A1-02" }).click();
  await p.waitForTimeout(500);
  await p.click('[role=dialog] button:has-text("Flash")');
  await toast.waitFor();
  assert.ok((await toast.textContent()).includes("新紀錄！你第一次完攀 V3"), `破紀錄：${await toast.textContent()}`);
  assert.equal(await p.locator("[data-party]").count(), 1, "撒彩帶");
  // 第一則留言
  await p.click('[role=dialog] [role=tab]:has-text("留言")');
  await p.fill('[role=dialog] textarea[placeholder^="公開留言"]', "起步右手很遠");
  await p.click('[role=dialog] button:text-is("送出")');
  await p.waitForFunction(() => document.querySelector('[data-testid="mascot-toast"]')?.textContent?.includes("謝謝分享 beta"));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(3200);
  assert.equal(await toast.count(), 0, "3 秒後收起來");
  // 嘗試中改完攀：不是破紀錄（V2 比 V3 低）、今天已經爬過別條 → 一般的完攀
  await p.locator("main ul li button", { hasText: "A1-01" }).click();
  await p.waitForTimeout(500);
  await p.click('[role=dialog] button:has-text("完攀")');
  await toast.waitFor();
  assert.ok((await toast.textContent()).includes("完攀！手感不錯喔！"), `完攀：${await toast.textContent()}`);
  assert.equal(await p.locator("[data-party]").count(), 0, "完攀不撒彩帶");
  await p.keyboard.press("Escape");

  // 我的紀錄：講這個月
  await p.goto(`${BASE}/me`, { waitUntil: "networkidle" });
  await bubble.waitFor();
  assert.ok((await bubble.textContent()).includes("這個月"), `我的紀錄講這個月：${await bubble.textContent()}`);

  // 右下角小夥伴：New~ 打開時說一句；點牠換一句；🤫 閉嘴 → 今天都不說、小夥伴也不見
  const buddy = p.locator('[data-testid="mascot-buddy"]');
  await p.goto(`${BASE}/new`, { waitUntil: "networkidle" });
  await buddy.locator("[role=status]").waitFor();
  assert.ok((await buddy.textContent()).includes("喝水了沒？"), `小夥伴說話：${await buddy.textContent()}`);
  const tab = await p.locator("nav").last().boundingBox();
  const bb2 = await buddy.boundingBox();
  assert.ok(bb2.y + bb2.height <= tab.y + 1, "在底部分頁上面");
  await buddy.locator('button:has-text("閉嘴")').click();
  assert.equal(await buddy.count(), 0, "閉嘴後小夥伴不見");
  await p.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  assert.equal(await bubble.count(), 0, "閉嘴：館首頁也不說");
  // 人物卡：今天閉嘴中 → 讓夥伴現在說話；關掉「夥伴說話」就一直不說
  await p.goto(`${BASE}/card`, { waitUntil: "networkidle" });
  assert.ok((await p.textContent("main")).includes("今天按了「閉嘴」"));
  await p.click('main button:text-is("讓夥伴現在說話")');
  await buddy.locator("[role=status]").waitFor();
  await p.click('main button[role=switch][aria-label="夥伴說話"]');
  assert.equal(await buddy.count(), 0, "關掉說話：小夥伴不見");
  assert.deepEqual(A.errors, []);
  await A.ctx.close();
});

test("原岩夥伴：資料庫還沒套用 step41 照常（大家都是猛牛、不能選夥伴）", async () => {
  const mock = createMock();
  mock.state.noMascot = true;
  const b = mock.addUser("climberb", "password1", { nickname: "小安" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 5, "藍", ["指力"]);
  mock.db.comments.push({ id: crypto.randomUUID(), route_id: r.id, user_id: b, body: "好難", created_at: new Date().toISOString(), edited_at: null, deleted_at: null });
  const B = await phone(browser, mock);
  await login(B.page, "climberb", "password1", "/card");
  const p = B.page;
  await p.waitForSelector('main [data-mascot="mingde"]');
  await p.click('main button:text-is("編輯人物卡")');
  await p.waitForTimeout(300);
  assert.ok((await p.textContent("main")).includes("暫時不能選夥伴"), "說明資料庫還沒更新");
  await p.fill("#cbio", "喜歡長路線");
  await p.click('main button:text-is("儲存人物卡")');
  await p.waitForTimeout(500);
  assert.equal(mock.db.profiles.find((x) => x.id === b).bio, "喜歡長路線", "人物卡照樣存");
  await p.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await p.locator("main ul li button", { hasText: "A1-01" }).click();
  await p.waitForTimeout(600);
  await p.click('[role=dialog] [role=tab]:has-text("留言")');
  await p.waitForSelector('[role=dialog] [data-mascot="mingde"]');
  assert.deepEqual(B.errors.filter((e) => !/400|42703/.test(e)), []);
  await B.ctx.close();
});
