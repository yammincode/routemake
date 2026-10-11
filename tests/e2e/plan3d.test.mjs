// 立體（2.5D）平面圖：預設立體、可以切回平面（記在這支手機，館首頁和管理後台一起換）；點方塊或區名都能進那一區；
// 方塊越高路線越多；字的大小固定；管理後台選中的區域浮起來、區名變深色膠囊
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const zone = (mock, gym, code) => mock.db.zones.find((z) => z.gym_id === gym && z.code === code);

test("立體平面圖：預設立體；點方塊、點區名都能進那一區；方塊越高路線越多；切回平面會記住，後台也一樣", async () => {
  const mock = createMock();
  for (let i = 0; i < 12; i++) mock.addRoute(zone(mock, "mingde", "A4"), i % 6, "藍");
  mock.addRoute(zone(mock, "mingde", "A3"), 2, "紅");
  const boss = mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  void boss;
  const { page, errors } = await phone(browser, mock);
  await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const plan = page.locator('main svg[role=img][aria-label="明德館平面圖"]');
  assert.equal(await plan.getAttribute("data-plan"), "3d", "預設立體");
  assert.equal(await page.getAttribute('main [aria-label="平面圖畫法"] button:text-is("立體")', "aria-pressed"), "true");
  assert.ok((await page.textContent("main")).includes("方塊越高，路線越多"));

  // 方塊越高路線越多：A4（12 條）比 A3（1 條）高
  const height = (code) =>
    page.evaluate((c) => {
      const g = [...document.querySelectorAll('main svg[data-plan="3d"] g[role=button]')].find((x) => x.getAttribute("aria-label").startsWith(c));
      const faces = [...g.querySelectorAll("g > polygon")];
      const ys = faces.flatMap((p) => [...p.points].map((pt) => pt.y));
      return Math.max(...ys) - Math.min(...ys);
    }, code);
  assert.ok((await height("A4 區")) > (await height("A3 區")), "路線多的方塊比較高");

  // 字的大小固定（13.5px 上下）：360、430 寬都一樣
  for (const w of [360, 430]) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.waitForTimeout(500);
    const px = await page.evaluate(() => {
      const t = document.querySelector('main svg[data-plan="3d"] [data-zone] text');
      return +t.getAttribute("font-size") * t.ownerSVGElement.getScreenCTM().a;
    });
    assert.ok(Math.abs(px - 13.5) < 0.6, `${w} 寬：區名字 ${px.toFixed(1)}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // 點方塊進那一區
  await page.locator('main svg[data-plan="3d"] g[role=button][aria-label^="A4 區"]').dispatchEvent("click");
  await page.waitForURL(/\/zone\?id=/);
  assert.ok((await page.textContent("main h1")).includes("A4 區"));
  // 點區名也能進
  await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator(`main svg[data-plan="3d"] [data-zone="${zone(mock, "mingde", "A3").code}"]`).dispatchEvent("click");
  await page.waitForURL(/\/zone\?id=/);
  assert.ok((await page.textContent("main h1")).includes("A3 區"));

  // 切回平面：重新整理還是平面；後台也是平面
  await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.click('main [aria-label="平面圖畫法"] button:text-is("平面")');
  await page.waitForTimeout(300);
  assert.equal(await plan.getAttribute("data-plan"), null, "換成平面");
  assert.equal(await page.locator("main svg g[role=button] text").count() > 0, true, "平面圖的字在區域裡");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.equal(await plan.getAttribute("data-plan"), null, "重新整理後還是平面");
  await login(page, "boss", "password1", "/admin");
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('main svg[data-plan="3d"]').count(), 0, "後台也是平面");
  await page.click('main [aria-label="平面圖畫法"] button:text-is("立體")');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('main svg[data-plan="3d"]').count(), 1, "後台切回立體");
  assert.deepEqual(errors, []);
});

test("立體平面圖：後台點方塊切換區域，選中的浮起來、區名變深色膠囊；改過的長名字截短；南港 1F、2F 都是立體", async () => {
  const mock = createMock();
  zone(mock, "mingde", "C1").name = "攀岩洞穴入口";
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const { page, errors } = await phone(browser, mock);
  await login(page, "boss", "password1", "/admin");
  await page.waitForTimeout(1200);
  const b1 = 'main svg[data-plan="3d"] g[role=button][aria-label^="B1 區"]';
  await page.locator(b1).dispatchEvent("click");
  await page.waitForTimeout(500);
  assert.equal(await page.getAttribute(b1, "aria-pressed"), "true", "選中 B1");
  assert.equal(await page.inputValue("#zname"), "B1 區");
  assert.equal(await page.locator(`main svg[data-plan="3d"] [data-zone="B1"] rect`).count(), 1, "區名變膠囊");
  assert.equal(await page.locator(`main svg[data-plan="3d"] [data-zone="A1"] rect`).count(), 0);
  assert.equal(await page.textContent(`main svg[data-plan="3d"] [data-zone="C1"] text`), "攀岩洞穴…", "改過的長名字截短");
  assert.equal(await page.textContent(`main svg[data-plan="3d"] [data-zone="A1"] text`), "A1", "沒改名的寫簡稱");

  await page.goto(`${BASE}/gym/g4`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.deepEqual(
    await page.locator('main svg[data-plan="3d"]').evaluateAll((s) => s.map((x) => x.getAttribute("aria-label"))),
    ["南港館 1F 平面圖", "南港館 2F 平面圖"],
    "南港兩層都是立體"
  );
  await page.locator('main svg[data-plan="3d"] g[role=button][aria-label^="D2 區"]').dispatchEvent("click");
  await page.waitForURL(/\/zone\?id=/);
  assert.ok((await page.textContent("main h1")).includes("D2 區"));
  assert.deepEqual(errors, []);
});
