// 原岩夥伴：選夥伴、換色、存起來；留言、影片旁的頭像；別人的人物卡；館首頁每天一句；幹話模式；還沒套用 step41 照常
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

// 每天一句要固定挑哪一句：Math.random 固定成 v（0.3：不講夥伴自己的話、挑第一句紀錄）
const fixRandom = (ctx, v) => ctx.addInitScript((x) => (Math.random = () => x), v);

test("原岩夥伴：選夥伴、換色、中壢熊即將登場；留言和影片旁的頭像、別人的人物卡跟著換", async () => {
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
  assert.ok((await p.textContent("main")).includes("夥伴：明德氂牛（耐力）"), "還沒選：預設明德氂牛，有夥伴簡介");

  await p.click('main button:text-is("編輯人物卡")');
  const bear = p.locator("main button", { hasText: "中壢熊" });
  assert.ok(await bear.isDisabled(), "中壢熊點不了");
  assert.ok((await bear.textContent()).includes("即將登場"));
  await p.locator("main button", { hasText: "太空猩猩" }).click();
  await p.click('main button[aria-label="身體 #d7263d"]');
  await p.click('main button[aria-label="卡片背景 #006382"]');
  // 預覽馬上換
  assert.equal(await p.locator('main [data-mascot="wanhua"]').count() >= 1, true, "上面的角色卡換成太空猩猩");
  assert.ok((await p.textContent("main")).includes("夥伴：太空猩猩（動態）"));
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
  assert.ok((await card.textContent()).includes("太空猩猩"), "沒公開也看得到夥伴");
  assert.deepEqual(V.errors, []);
  await B.ctx.close();
  await V.ctx.close();
});

test("原岩夥伴：館首頁每天第一次說一句（看紀錄）、關掉後今天不再出現；幹話模式加刀疤棒棒糖、講幹話", async () => {
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
  assert.ok(text.includes("明德氂牛"), "預設明德氂牛");
  assert.ok(text.includes("上次 A1-01（V5 藍）還在嘗試中"), `講嘗試中的路線：${text}`);
  // 在標題下面、平面圖上面
  const title = await p.locator("h1", { hasText: "今天爬哪一區" }).boundingBox();
  const bb = await bubble.boundingBox();
  assert.ok(bb.y > title.y, "在標題下面");
  await bubble.locator('button[aria-label="關掉，今天不再出現"]').click();
  assert.equal(await bubble.count(), 0, "關掉了");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  assert.equal(await bubble.count(), 0, "同一天再打開不再出現");

  // 幹話模式：人物卡打開開關 → 夥伴加刀疤和棒棒糖；隔天館首頁講老闆給的幹話
  await p.goto(`${BASE}/card`, { waitUntil: "networkidle" });
  await p.waitForSelector('main [data-mascot="mingde"]');
  assert.equal(await p.locator("main [data-troll]").count(), 0);
  await p.click('main button[role=switch][aria-label="幹話模式"]');
  assert.ok((await p.locator("main [data-troll]").count()) >= 1, "加上刀疤和棒棒糖");
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("routemake:cheer:")) localStorage.removeItem(k); // 當作隔天
  });
  await p.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await bubble.waitFor();
  const troll = ["站起來就好，完攀很近", "閃電：我阿罵都可以，你也可以", "加油，點很大", "黑：有時間看我講幹話，怎麼不去爬", "啊～你怎麼掉下來了", "用力就抓住了", "不要坐墊子", "宋拔：（眼神凝視）", "攀岩治百病，爬爆", "抓不住就用力"];
  const said = await bubble.textContent();
  assert.ok(troll.some((t) => said.includes(t)), `講幹話：${said}`);
  assert.equal(await bubble.locator("[data-troll]").count(), 1, "泡泡旁的夥伴也有刀疤");
  assert.deepEqual(A.errors, []);
  await A.ctx.close();
});

test("原岩夥伴：資料庫還沒套用 step41 照常（大家都是氂牛、不能選夥伴）", async () => {
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
