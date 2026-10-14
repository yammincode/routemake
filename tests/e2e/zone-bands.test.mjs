// 區域頁版型（版型固定，見 CLAUDE.md）：標題 → 上一區／下一區方框 →（登入時）夥伴的泡泡 → 照片 → 難度色帶卡 → 難度四格 → 說明 → 顏色、風格篩選 → 路線依入門／進階／挑戰分段；
// 選一段只列那段、照片上其他難度變淡；這區沒有的段點不了；四格跟館首頁同一個選擇（記在手機），這區沒有那段就先顯示全部
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, WALL, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const COLORS = ["藍", "紅", "黃", "綠", "黑", "粉", "白", "紫", "橘", "灰"];
const zoneOf = (mock, code) => mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === code);
function seed(mock) {
  const grades = { A1: [0, 1], A2: [-1, 0, 1, 2, 3, 3, 4, 5, 6, 7], A3: [3, 5] };
  // A2 的 V3 黑色有風格標籤（風格篩選才會出來）
  for (const [code, gs] of Object.entries(grades)) gs.forEach((g, i) => mock.addRoute(zoneOf(mock, code), g, COLORS[i % COLORS.length], code === "A2" && i === 4 ? ["指力"] : []));
  const a2 = zoneOf(mock, "A2");
  Object.assign(a2, { photo_path: "mingde/zones/A2-1.jpg", photo_width: 800, photo_height: 600 });
  mock.db.files[a2.photo_path] = fs.readFileSync(WALL);
}
const flat = (s) => s.replace(/\s+/g, "");
const open = async (page, mock, code) => {
  await page.goto(`${BASE}/zone?id=${zoneOf(mock, code).id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
};
const box = (page, range) => page.locator(`main button[aria-pressed]:has-text("${range}")`);
const pressedBox = async (page) => {
  for (const r of ["VB–V10", "VB–V2", "V3–V5", "V6+"]) if ((await box(page, r).getAttribute("aria-pressed")) === "true") return r;
  return null;
};
const headings = async (page) => (await page.locator("main section h2").allTextContents()).map(flat);

test("區域頁版型：方框上一區／下一區、照片、難度色帶卡、四格、說明、篩選、路線分段；選一段只列那段、照片其他變淡；沒有的段點不了", async () => {
  const mock = createMock();
  seed(mock);
  const { page, errors } = await phone(browser, mock, { viewport: { width: 360, height: 780 } });
  await open(page, mock, "A2");

  // 由上而下的順序（版型固定）
  const text = flat(await page.innerText("main"));
  const steps = [
    "明德館",
    "A2區",
    "10條路線",
    "上一區",
    "下一區",
    "A2區難度",
    "共10條",
    "全部VB–V10",
    "入門VB–V2",
    "進階V3–V5",
    "挑戰V6+",
    "色帶是牆上的膠帶顏色",
    "顏色和分數怎麼看",
    "所有顏色",
    "所有風格",
    "入門VB–V24條",
    "進階V3–V54條",
    "挑戰V6+2條",
  ];
  let at = -1;
  for (const s of steps) {
    const i = text.indexOf(s, at + 1);
    assert.ok(i > at, `「${s}」在「${steps[steps.indexOf(s) - 1] ?? "開頭"}」後面（${text.slice(0, 400)}）`);
    at = i;
  }
  const photo = await page.locator('main img[alt="A2 區照片"]').boundingBox();
  const nav = await page.locator('nav[aria-label="切換區域"]').boundingBox();
  const card = await page.locator("main b", { hasText: "A2 區難度" }).boundingBox();
  assert.ok(nav.y < photo.y && photo.y < card.y, "上一區／下一區在照片上面，難度色帶卡在照片下面");

  // 上一區／下一區是方框：上面小字、下面區名，左右各一半
  const navBtns = page.locator('nav[aria-label="切換區域"] button');
  assert.deepEqual((await navBtns.allTextContents()).map(flat), ["‹上一區A1區", "下一區›A3區"]);
  const [l, r] = await Promise.all([navBtns.nth(0).boundingBox(), navBtns.nth(1).boundingBox()]);
  assert.ok(Math.abs(l.width - r.width) < 2 && l.height >= 44, `兩個方框一樣寬、夠高（${l.width}／${r.width}×${l.height}）`);
  assert.ok(flat(await page.locator("main div.rounded-card", { hasText: "A2 區難度" }).textContent()).endsWith("VB–V7"), "色帶卡寫難度範圍");

  // 分段：每段一個列表、順序由易到難
  assert.deepEqual(await headings(page), ["入門VB–V24條", "進階V3–V54條", "挑戰V6+2條"]);
  assert.equal(await page.locator("main section").nth(0).locator("ul li").count(), 4);
  assert.equal(await page.locator("main ul li").count(), 10);
  assert.equal(await pressedBox(page), "VB–V10");

  // 選進階：只列進階、色帶卡寫條數、照片上其他難度變淡
  await box(page, "V3–V5").click();
  await page.waitForTimeout(200);
  assert.equal(await pressedBox(page), "V3–V5");
  assert.deepEqual(await headings(page), ["進階V3–V54條"], "只列進階那段");
  assert.equal(await page.locator("main ul li").count(), 4);
  assert.ok(flat(await page.innerText("main")).includes("V3–V5有4條"), "色帶卡寫篩選結果");
  assert.ok(flat(await page.innerText("main")).includes("只列V3–V5，照片上其他難度的路線變淡。"));
  assert.match(await page.locator('main button[aria-label^="V0"]').getAttribute("class"), /opacity-\[0\.16\]/, "V0 的標記變淡");
  assert.doesNotMatch(await page.locator('main button[aria-label^="V4"]').getAttribute("class"), /opacity-\[0\.16\]/, "V4 的標記不變淡");
  // 色帶：進階的色段保持粗，其他縮成細線
  const segs = page.locator("main div.rounded-card", { hasText: "A2 區難度" }).locator("span[aria-hidden] > span");
  const heights = await segs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  assert.ok(heights[0] < heights[4] / 2, `VB 那段縮成細線、V3 保持粗（${heights.join("、")}）`);
  // 再加顏色篩選：分段的條數跟著變
  await page.click('main button[aria-pressed]:text-is("黑")');
  await page.waitForTimeout(200);
  assert.deepEqual(await headings(page), ["進階V3–V51條"], "進階裡只有 1 條黑色");
  assert.equal(await page.locator("main ul li").count(), 1);
  await page.click('main button[aria-pressed]:text-is("綠")');
  await page.waitForTimeout(200);
  assert.deepEqual(await headings(page), [], "進階裡沒有綠色");
  assert.ok((await page.innerText("main")).includes("沒有符合的路線"));
  await page.click('main button[aria-pressed]:text-is("所有顏色")');
  await page.waitForTimeout(200);

  // A3（只有 V3、V5）：入門、挑戰點不了
  await page.click('nav[aria-label="切換區域"] button[aria-label^="下一區"]');
  await page.waitForTimeout(800);
  assert.equal((await page.textContent("main h1")).trim(), "A3 區");
  assert.equal(await box(page, "VB–V2").isDisabled(), true, "沒有入門：點不了");
  assert.equal(await box(page, "V6+").isDisabled(), true, "沒有挑戰：點不了");
  assert.equal(await box(page, "V3–V5").isDisabled(), false);
  assert.equal(await pressedBox(page), "V3–V5", "進階照樣篩");
  assert.ok(flat(await page.locator("main div.rounded-card", { hasText: "A3 區難度" }).textContent()).includes("V3–V5有2條"));

  // 360 寬不撐破畫面
  assert.ok((await page.evaluate(() => document.scrollingElement.scrollWidth)) <= 360);
  assert.deepEqual(errors, []);
});

test("區域名字很長（20 字）：色帶卡只截名字，「難度」留著；360 寬不撐破畫面", async () => {
  const mock = createMock();
  seed(mock);
  zoneOf(mock, "A2").name = "非常非常長的區域名字一二三四五六七八九十";
  const { page, errors } = await phone(browser, mock, { viewport: { width: 360, height: 780 } });
  await open(page, mock, "A2");
  const title = page.locator("main div.rounded-card b", { hasText: "難度" });
  const [name, suffix] = await title.locator("span").evaluateAll((els) => els.map((el) => ({ text: el.textContent, cut: el.scrollWidth > el.clientWidth, w: el.getBoundingClientRect().width })));
  assert.ok(name.cut, "名字截短");
  assert.equal(suffix.text, "難度");
  assert.ok(suffix.w > 20, "「難度」整個看得到");
  assert.ok((await page.evaluate(() => document.scrollingElement.scrollWidth)) <= 360);
  assert.deepEqual(errors, []);
});

test("難度四格跟館首頁同一個選擇：首頁選的帶進區域頁、區域頁改的回首頁也變；這區沒有那段就先顯示全部", async () => {
  const mock = createMock();
  seed(mock);
  const { page, errors } = await phone(browser, mock);
  await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await box(page, "V6+").click();
  await page.waitForTimeout(200);

  // 首頁選挑戰 → 點 A2 → 區域頁也是挑戰
  await page.locator("main button.rounded-card", { hasText: "A2 區" }).click();
  await page.waitForURL(`**/zone?id=${zoneOf(mock, "A2").id}`);
  await page.waitForTimeout(800);
  assert.equal(await pressedBox(page), "V6+", "帶進區域頁");
  assert.deepEqual(await headings(page), ["挑戰V6+2條"]);

  // 區域頁改成入門 → 回首頁也是入門
  await box(page, "VB–V2").click();
  await page.waitForTimeout(200);
  await page.click('main button:has-text("明德館")');
  await page.waitForURL("**/gym/mingde");
  await page.waitForTimeout(800);
  assert.equal(await pressedBox(page), "VB–V2", "回首頁也變成入門");

  // A3 沒有入門：先顯示全部、說明為什麼；記著的不變（回首頁還是入門）
  await open(page, mock, "A3");
  assert.equal(await pressedBox(page), "VB–V10");
  assert.ok(flat(await page.innerText("main")).includes("這區沒有VB–V2的路線，先顯示全部。"));
  assert.equal(await page.locator("main ul li").count(), 2);
  await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.equal(await pressedBox(page), "VB–V2", "記著的沒有被清掉");
  assert.deepEqual(errors, []);
});

test("區域頁版型（登入）：上一區／下一區方框 → 夥伴的泡泡 → 照片 → 難度色帶卡", async () => {
  const mock = createMock();
  seed(mock);
  mock.addUser("climbera", "password1", { nickname: "小岩" });
  const { page, errors } = await phone(browser, mock, { viewport: { width: 360, height: 780 } });
  await login(page, "climbera", "password1", `/zone?id=${zoneOf(mock, "A2").id}`);
  const bubble = page.locator('[data-testid="mascot-bubble"]');
  await bubble.waitFor();
  const nav = await page.locator('nav[aria-label="切換區域"]').boundingBox();
  const bb = await bubble.boundingBox();
  const photo = await page.locator('main img[alt="A2 區照片"]').boundingBox();
  const card = await page.locator("main b", { hasText: "A2 區難度" }).boundingBox();
  assert.ok(nav.y < bb.y && bb.y < photo.y && photo.y < card.y, "方框 → 夥伴的泡泡 → 照片 → 色帶卡");
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 360, "360 寬不撐破畫面");
  assert.deepEqual(errors, []);
});
