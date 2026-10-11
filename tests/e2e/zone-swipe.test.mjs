// 區域頁左右滑動換區：往左滑下一區、往右滑上一區（順序跟館首頁區域卡片一樣，不含 Spray Wall）；標題下面「‹ 上一區　下一區 ›」；
// 換區不多一層上一頁、返回回館首頁；難度篩選換區時保留；捲動、篩選列、放大的照片、兩指、長按、路線卡片、系統手勢都不會換區；
// 沒網路只能換到存過的區；從連結直接打開也有；減少動態效果不跟著手指動；360 寬長名字不撐破畫面
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, WALL, createMock, finger, launch, phone, swipe } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const COLORS = ["藍", "紅", "黃", "綠", "黑", "粉", "白", "紫", "橘", "灰"];
const zoneOf = (mock, code) => mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === code);
// 明德 A1–A4、D1、D2 放路線；grades：每區有哪些難度
function seed(mock, grades = { A1: [0, 1], A2: [0, 1, 2, 3, 4, 5, 6, 7], A3: [3, 5], A4: [1, 2], D1: [2], D2: [4] }) {
  for (const [code, gs] of Object.entries(grades)) gs.forEach((g, i) => mock.addRoute(zoneOf(mock, code), g, COLORS[i % COLORS.length]));
}
const LEFT = [[320, 560], [80, 565]]; // 往左滑（下一區）
const RIGHT = [[80, 560], [320, 555]]; // 往右滑（上一區）
const here = async (page) => (await page.textContent("main h1")).trim();
const navLabels = (page) => page.locator('nav[aria-label="切換區域"] button').evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
const settle = (page) => page.waitForTimeout(700);
const open = async (page, mock, code) => {
  await page.goto(`${BASE}/zone?id=${zoneOf(mock, code).id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
};

test("左右滑換區、按鈕換區：順序跟館首頁一樣；不多一層上一頁、返回回館首頁；報讀新區、按鈕換區焦點留在按鈕上", async () => {
  const mock = createMock();
  seed(mock);
  const { page, errors } = await phone(browser, mock, { hasTouch: true });
  await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  // 館首頁區域卡片的順序（每張卡片寫的是哪一區）
  const names = mock.db.zones.filter((z) => z.gym_id === "mingde" && z.kind !== "spray").map((z) => z.name);
  const cards = (await page.locator("main button.rounded-card").allTextContents()).map((t) => names.find((n) => t.includes(n))).filter(Boolean);
  await open(page, mock, "A1");
  const hist = await page.evaluate(() => history.length);
  assert.deepEqual(await navLabels(page), ["下一區：A2 區"], "第一區沒有上一區");
  await swipe(page, ...RIGHT);
  await settle(page);
  assert.equal(await here(page), "A1 區", "第一區往右滑不會換");
  assert.equal(await page.evaluate(() => document.querySelector("main [data-swipe] > div")?.style.transform ?? ""), "", "彈回原位");

  // 往左滑三次：A2 → A3 → A4，順序跟館首頁區域卡片一樣
  const seen = [await here(page)];
  for (let i = 0; i < 3; i++) {
    await swipe(page, ...LEFT);
    await settle(page);
    seen.push(await here(page));
  }
  assert.deepEqual(seen, ["A1 區", "A2 區", "A3 區", "A4 區"]);
  assert.deepEqual(seen, cards.slice(0, 4), `跟館首頁卡片順序一樣（${cards.join("、")}）`);
  assert.deepEqual(await navLabels(page), ["上一區：A3 區", "下一區：比賽牆 1"]);
  assert.match(await page.textContent("main [aria-live=polite]"), /A4 區，2 條路線/, "報讀新區");
  // 往右滑回 A3
  await swipe(page, ...RIGHT);
  await settle(page);
  assert.equal(await here(page), "A3 區");
  assert.equal(new URL(page.url()).searchParams.get("id"), zoneOf(mock, "A3").id, "網址換成 A3");

  // 鍵盤：下一區按鈕按 Enter，換過去後焦點還在下一區按鈕
  await page.focus('nav[aria-label="切換區域"] button[aria-label^="下一區"]');
  await page.keyboard.press("Enter");
  await settle(page);
  assert.equal(await here(page), "A4 區");
  assert.match(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? ""), /^下一區：/, "焦點留在下一區按鈕");
  // 點按鈕回上一區
  await page.click('nav[aria-label="切換區域"] button[aria-label^="上一區"]');
  await settle(page);
  assert.equal(await here(page), "A3 區");

  assert.equal(await page.evaluate(() => history.length), hist, "換區不多一層上一頁");
  await page.click("main >> text=明德館");
  await page.waitForURL("**/gym/mingde");
  assert.equal(await page.evaluate(() => history.length), hist, "返回不會越疊越多");

  // 最後一區（D2）：沒有下一區，往左滑不會換；Spray Wall 不在順序裡；從 D1 按下一區到 D2，焦點停在上一區按鈕
  await open(page, mock, "D1");
  await page.focus('nav[aria-label="切換區域"] button[aria-label^="下一區"]');
  await page.keyboard.press("Enter");
  await settle(page);
  assert.equal(await here(page), "D2 區");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "上一區：D1 區", "最後一區沒有下一區：焦點停在上一區按鈕");
  assert.deepEqual(await navLabels(page), ["上一區：D1 區"]);
  await swipe(page, ...LEFT);
  await settle(page);
  assert.equal(await here(page), "D2 區");
  assert.deepEqual(errors, []);
});

test("這些不會換區：太短、慢慢滑一點點、上下捲、斜斜捲、螢幕邊緣、篩選列、長按、兩指、系統手勢打斷、路線卡片開著、放大的照片；很快的撥動會換", async () => {
  const mock = createMock();
  seed(mock);
  const a2 = zoneOf(mock, "A2");
  mock.db.files["mingde/zones/A2.jpg"] = fs.readFileSync(WALL);
  a2.photo_path = "mingde/zones/A2.jpg";
  const { page, errors } = await phone(browser, mock, { hasTouch: true });
  await open(page, mock, "A2");
  const stays = async (why) => {
    await settle(page);
    assert.equal(await here(page), "A2 區", why);
    assert.equal(await page.evaluate(() => document.querySelector("main [data-swipe] > div")?.style.transform ?? ""), "", `${why}：畫面回到原位`);
  };
  await swipe(page, [200, 600], [176, 600], { steps: 2, ms: 8 });
  await stays("太短的快速撥動");
  await swipe(page, [220, 600], [175, 600], { steps: 9, ms: 70 });
  await stays("慢慢滑 45px");
  // 很快滑 45px 後停住（看提示）再放開：不算撥動
  let f = await finger(page, { step: 8 });
  await f.down(260, 600);
  for (const x of [245, 230, 215]) await f.move(x, 600);
  await f.wait(300);
  await f.up();
  await f.done();
  await stays("快速滑一點點後停住再放開");
  // 往左滑過頭，又很快往回拉一些才放開：不換
  f = await finger(page, { step: 16 });
  await f.down(320, 600);
  for (const x of [290, 250, 210, 170, 150, 175, 200, 225]) await f.move(x, 600);
  await f.up();
  await f.done();
  await stays("往回拉才放開");
  await swipe(page, [200, 640], [230, 400]);
  await stays("上下捲（帶一點左右）");
  await swipe(page, [300, 640], [200, 560]);
  await stays("斜斜地捲");
  await swipe(page, [380, 600], [120, 600]);
  await stays("從螢幕右邊緣滑（系統手勢）");
  await page.evaluate(() => window.scrollTo(0, 0));
  await swipe(page, [300, 560], [80, 560], { hold: 650 });
  await stays("長按後再滑（在選字）");

  // 兩指：先一指滑一段，再放第二指
  f = await finger(page);
  await f.down(320, 560);
  for (let x = 300; x >= 220; x -= 20) await f.move(x, 560);
  await f.two(100, 600);
  await f.move(140, 560, [[60, 600]]);
  await f.up();
  await f.done();
  await stays("兩指（縮放）");
  // 系統手勢打斷（touchcancel）
  f = await finger(page);
  await f.down(320, 560);
  for (let x = 300; x >= 100; x -= 25) await f.move(x, 560);
  await f.cancel();
  await f.done();
  await stays("系統手勢打斷");

  // 篩選列：可以左右捲的那排上滑，是在捲篩選列
  const row = page.locator("main button[aria-pressed]", { hasText: "全部" }).first().locator("xpath=..");
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
  assert.ok(await row.evaluate((el) => el.scrollWidth > el.clientWidth + 1), "難度篩選列真的可以左右捲（測試資料夠多）");
  const rb = await row.boundingBox();
  await swipe(page, [rb.x + 300, rb.y + rb.height / 2], [rb.x + 80, rb.y + rb.height / 2]);
  await stays("在篩選列上滑");
  await page.evaluate(() => window.scrollTo(0, 0));

  // 路線卡片開著：在卡片上滑不換區
  await page.locator("main ul li button").first().click();
  await page.waitForTimeout(500);
  await swipe(page, [320, 600], [80, 600]);
  await settle(page);
  assert.equal(await page.locator("[role=dialog]").count(), 1, "卡片還開著");
  assert.equal(new URL(page.url()).searchParams.get("id"), a2.id, "沒有換區");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  if (await page.locator("[role=dialog]").count()) await page.locator('[role=dialog] button[aria-label="關閉"]').click();
  await page.waitForTimeout(400);

  // 照片放大後：在照片上滑是在拖照片；在照片外面滑照樣換區
  const wall = page.locator("main [data-swipe] img").first().locator("xpath=../..");
  await wall.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bb = await wall.boundingBox();
  await wall.evaluate((el, { cx, cy }) => {
    const ev = (type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
    ev("pointerdown", 1, cx - 40, cy);
    ev("pointerdown", 2, cx + 40, cy);
    for (let i = 1; i <= 10; i++) {
      ev("pointermove", 1, cx - 40 - i * 8, cy);
      ev("pointermove", 2, cx + 40 + i * 8, cy);
    }
    ev("pointerup", 1, cx - 120, cy);
    ev("pointerup", 2, cx + 120, cy);
  }, { cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2 });
  await page.waitForTimeout(300);
  assert.equal(await wall.getAttribute("data-noswipe"), "true", "照片放大了");
  await swipe(page, [bb.x + bb.width - 40, bb.y + bb.height / 2], [bb.x + 60, bb.y + bb.height / 2]);
  await stays("在放大的照片上滑");

  // 很快的撥動（45px，不到 1/6 螢幕）會換
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  await swipe(page, [245, 600], [200, 600], { steps: 3, ms: 8 });
  await settle(page);
  assert.equal(await here(page), "A3 區", "很快的撥動會換區");
  assert.equal(await page.evaluate(() => window.scrollY), 0, "換區後回到最上面");
  assert.deepEqual(errors, []);
});

test("難度篩選換區時保留：新的區有這個難度照樣篩，沒有就顯示全部，再換到有的區又會篩", async () => {
  const mock = createMock();
  seed(mock);
  const { page, errors } = await phone(browser, mock, { hasTouch: true });
  await open(page, mock, "A2");
  await page.click('main button[aria-pressed][aria-label^="V3"], main button[aria-pressed]:text-is("V3")');
  await page.waitForTimeout(300);
  const pressed = () => page.locator("main button[aria-pressed=true]").first().textContent();
  assert.equal((await pressed()).trim(), "V3");
  await swipe(page, ...LEFT);
  await settle(page);
  assert.equal(await here(page), "A3 區");
  assert.equal((await pressed()).trim(), "V3", "A3 有 V3：照樣篩");
  assert.equal(await page.locator("main ul li").count(), 1, "只列 V3");
  await swipe(page, ...LEFT);
  await settle(page);
  assert.equal(await here(page), "A4 區");
  assert.equal((await pressed()).trim(), "全部", "A4 沒有 V3：顯示全部");
  assert.equal(await page.locator("main ul li").count(), 2);
  await swipe(page, ...RIGHT);
  await settle(page);
  assert.equal((await pressed()).trim(), "V3", "回到 A3 又篩 V3");
  assert.deepEqual(errors, []);
});

test("從連結直接打開（手機裡沒有館首頁的資料）也有上一區／下一區；沒網路時只能換到手機裡存過的區", async () => {
  const mock = createMock();
  seed(mock);
  const { page, ctx, errors } = await phone(browser, mock, { hasTouch: true });
  const asked = [];
  page.on("request", (r) => r.url().includes("/rest/v1/") && asked.push(new URL(r.url()).pathname.replace("/rest/v1/", "")));
  await open(page, mock, "A2");
  assert.deepEqual(await navLabels(page), ["上一區：A1 區", "下一區：A3 區"], "沒有館首頁的資料也有");
  assert.equal(asked.filter((p) => p === "zones").length, 1, "區域順序只問一次");
  // 去過 A3（存進手機），回 A2
  await page.click('nav[aria-label="切換區域"] button[aria-label^="下一區"]');
  await settle(page);
  await page.click('nav[aria-label="切換區域"] button[aria-label^="上一區"]');
  await settle(page);
  assert.equal(await here(page), "A2 區");
  assert.equal(asked.filter((p) => p === "zones").length, 1, "換區不再問區域順序");

  mock.state.offline = true;
  await ctx.setOffline(true);
  await page.waitForTimeout(300);
  assert.deepEqual(await navLabels(page), ["下一區：A3 區"], "沒網路：沒去過的 A1 不能去，去過的 A3 可以");
  await swipe(page, ...RIGHT);
  await settle(page);
  assert.equal(await here(page), "A2 區", "往右滑（A1 沒存過）不會換");
  await swipe(page, ...LEFT);
  await settle(page);
  assert.equal(await here(page), "A3 區", "往左滑到存過的 A3");
  assert.ok((await page.locator("main ul li").count()) > 0, "A3 的路線照樣顯示");
  mock.state.offline = false;
  await ctx.setOffline(false);
  assert.deepEqual(errors, []);
});

test("減少動態效果：滑的時候畫面不跟著手指動，放開直接換；360 寬：長名字截短不撐破畫面", async () => {
  const mock = createMock();
  seed(mock);
  zoneOf(mock, "A1").name = "非常非常長的區域名字一二三四五六七八";
  zoneOf(mock, "A3").name = "另一個非常非常長的區域名字一二三四五";
  const { page, errors } = await phone(browser, mock, { hasTouch: true, reducedMotion: "reduce", viewport: { width: 360, height: 780 } });
  await open(page, mock, "A2");
  const f = await finger(page);
  await f.down(300, 520);
  for (let x = 280; x >= 120; x -= 20) await f.move(x, 522);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.querySelector("main [data-swipe] > div")?.style.transform ?? ""), "", "不跟著手指動");
  await f.up();
  await f.done();
  await settle(page);
  assert.equal(await here(page), "另一個非常非常長的區域名字一二三四五", "放開直接換");
  await page.click('nav[aria-label="切換區域"] button[aria-label^="上一區"]');
  await settle(page);
  const fit = await page.evaluate(() => ({
    page: document.scrollingElement.scrollWidth,
    btns: [...document.querySelectorAll('nav[aria-label="切換區域"] button')].map((b) => b.getBoundingClientRect()).map((r) => [Math.round(r.left), Math.round(r.right)]),
  }));
  assert.ok(fit.page <= 360, `畫面沒有被撐寬（${fit.page}）`);
  for (const [l, r] of fit.btns) assert.ok(l >= 0 && r <= 360, `按鈕在畫面裡（${l}–${r}）`);
  assert.deepEqual(await navLabels(page), ["上一區：非常非常長的區域名字一二三四五六七八", "下一區：另一個非常非常長的區域名字一二三四五"], "報讀唸完整名字");
  assert.deepEqual(errors, []);
});
