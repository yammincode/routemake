// 立體（2.5D）平面圖：預設立體、可以切回平面（記在這支手機，館首頁和管理後台一起換）；點方塊或區名都能進那一區；
// 方塊越高路線越多；字的大小固定；管理後台選中的區域浮起來、區名變深色膠囊；
// 真的點下去：每區方塊看得到、點得到自己（不被前面的高方塊擋掉、不被半透明的牆和櫃台擋住），區名點得到自己
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const zone = (mock, gym, code) => mock.db.zones.find((z) => z.gym_id === gym && z.code === code);
// 這一館每區放幾條路線（沒寫的用 def）
const fill = (mock, gym, counts, def = 0) => {
  for (const z of mock.db.zones.filter((x) => x.gym_id === gym))
    for (let i = 0; i < (counts[z.code] ?? def); i++) mock.addRoute(z, i % 6, "藍");
};
// 畫面上實際取樣（elementFromPoint）：
// tap：每區方塊（頂面＋側面）有幾成點下去會進這一區（點到方塊或自己的區名都算）
// top：頂面（顏色、虛線框畫在這裡）有幾成看得到（先不管區名，只看有沒有被別的方塊擋住）
// onOther：區名的框有幾成蓋在別區的方塊上；label：區名中間點下去是不是自己
const hits = (page) =>
  page.evaluate(async () => {
    const out = {};
    const zoneAt = (x, y) => {
      const at = document.elementFromPoint(x, y);
      const b = at?.closest("[data-block]");
      return b ? b.getAttribute("data-block") : (at?.closest("[data-zone]")?.getAttribute("data-zone") ?? null);
    };
    const style = document.createElement("style");
    for (const svg of document.querySelectorAll('main svg[data-plan="3d"]')) {
      svg.scrollIntoView({ block: "center" });
      await new Promise((r) => requestAnimationFrame(r));
      const inv = svg.getScreenCTM().inverse();
      const inside = (els, x, y) => els.some((p) => p.isPointInFill(new DOMPoint(x, y).matrixTransform(inv)));
      for (const g of svg.querySelectorAll("g[data-block]")) {
        const code = g.getAttribute("data-block");
        const polys = [...g.querySelectorAll("polygon")];
        const tops = [...g.querySelectorAll("polygon[data-top]")];
        const label = svg.querySelector(`[data-zone="${code}"]`);
        const r = g.getBoundingClientRect();
        const t = label.querySelector("text").getBoundingClientRect();
        const lb = label.querySelector("rect").getBoundingClientRect();
        const o = { tap: 0, px: 0, top: 0, onOther: 0, label: null };
        // 有區名時：點下去會進哪一區
        let all = 0;
        for (let x = r.left + 0.5; x < r.right; x += 1)
          for (let y = r.top + 0.5; y < r.bottom; y += 1) {
            if (!inside(polys, x, y)) continue;
            all++;
            if (zoneAt(x, y) === code) o.px++;
          }
        o.tap = all ? o.px / all : 0;
        o.label = zoneAt(t.left + t.width / 2, t.top + t.height / 2);
        // 先讓區名不接點擊，只看方塊
        style.textContent = "main svg [data-zone] { pointer-events: none }";
        document.head.append(style);
        let topAll = 0;
        let topOwn = 0;
        for (let x = r.left + 0.5; x < r.right; x += 1)
          for (let y = r.top + 0.5; y < r.bottom; y += 1) {
            if (!inside(tops, x, y)) continue;
            topAll++;
            if (zoneAt(x, y) === code) topOwn++;
          }
        o.top = topAll ? topOwn / topAll : 0;
        let n = 0;
        for (let i = 0; i < 6; i++)
          for (let j = 0; j < 4; j++) {
            const z = zoneAt(lb.left + ((i + 0.5) / 6) * lb.width, lb.top + ((j + 0.5) / 4) * lb.height);
            if (z && z !== code) n++;
          }
        o.onOther = n / 24;
        style.remove();
        out[code] = o;
      }
    }
    return out;
  });
// 方塊上一個點下去是自己的位置（畫面座標）
const spot = (page, code) =>
  page.evaluate((c) => {
    const g = document.querySelector(`main svg[data-plan="3d"] g[data-block="${c}"]`);
    g.scrollIntoView({ block: "center" });
    const r = g.getBoundingClientRect();
    for (let y = r.top + 1; y < r.bottom; y += 1)
      for (let x = r.left + 1; x < r.right; x += 1) if (document.elementFromPoint(x, y)?.closest("[data-block]") === g) return { x, y };
    return null;
  }, code);

test("立體平面圖：預設立體；點方塊、點區名都能進那一區；方塊越高路線越多；切回平面會記住，後台也一樣", async () => {
  const mock = createMock();
  fill(mock, "mingde", { A4: 12, A3: 1 });
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
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
      const ys = [...document.querySelectorAll(`main svg[data-plan="3d"] g[data-block="${c}"] polygon`)].flatMap((p) => [...p.points].map((pt) => pt.y));
      return Math.max(...ys) - Math.min(...ys);
    }, code);
  assert.ok((await height("A4")) > (await height("A3")), "路線多的方塊比較高");

  // 鍵盤、報讀的順序跟區域順序一樣（不是畫的前後順序）
  assert.deepEqual(
    await page.locator('main svg[data-plan="3d"] [role=button]').evaluateAll((gs) => gs.map((g) => g.getAttribute("data-zone"))),
    ["A1", "A2", "A3", "A4", "W1", "W2", "W3", "W4", "B1", "B2", "B3", "C1", "C2", "C3", "D1", "D2"],
    "按鈕照區域順序"
  );

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
  await page.waitForTimeout(300);

  // 真的點方塊（不是點字）進那一區
  const p = await spot(page, "A4");
  assert.ok(p, "A4 方塊上有點得到的地方");
  await page.mouse.click(p.x, p.y);
  await page.waitForURL(/\/zone\?id=/);
  assert.ok((await page.textContent("main h1")).includes("A4 區"));
  // 點區名也能進
  await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator('main svg[data-plan="3d"] [data-zone="A3"] text').first().click();
  await page.waitForURL(/\/zone\?id=/);
  assert.ok((await page.textContent("main h1")).includes("A3 區"));
  // 鍵盤：移到區名按 Enter 也能進
  await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.focus('main svg[data-plan="3d"] [data-zone="W2"]');
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/zone\?id=/);
  assert.ok((await page.textContent("main h1")).includes("比賽牆 2"));

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

test("立體平面圖：手機不讓存設定（私密瀏覽）也能切換", async () => {
  const mock = createMock();
  const { page, ctx, errors } = await phone(browser, mock);
  await ctx.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
  });
  await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.equal(await page.locator('main svg[data-plan="3d"]').count(), 1, "預設立體");
  await page.click('main [aria-label="平面圖畫法"] button:text-is("平面")');
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('main [aria-label="平面圖畫法"] button:text-is("平面")', "aria-pressed"), "true", "按了平面");
  assert.equal(await page.locator('main svg[data-plan="3d"]').count(), 0, "換成平面");
  assert.equal(await page.locator('main svg[role=img][aria-label="明德館平面圖"]').count(), 1);
  assert.deepEqual(errors, []);
});

test("立體平面圖：前面的方塊再高，後面的區也看得到、點得到；半透明的牆和櫃台不擋點擊；每個區名都點得到自己", async () => {
  // 最難的情況：明德的小區正後面那區剛換線（0 條）、前面那區 20 條；中和速度牆只有 1 條、前面有內牆；
  // 新店 A1 很多條、A2 的區名原本在 A1 正後面的地上（A1 浮起來會蓋到）
  const cases = [
    ["mingde", { C1: 20, C2: 0, A2: 20, A3: 0, D1: 20, D2: 0, B2: 20, B1: 0 }, 8],
    ["g3", { SP: 1 }, 10],
    ["g2", {}, 10],
    ["g4", { B3: 18 }, 6],
    ["g5", { A1: 20, A2: 5 }, 8],
  ];
  for (const width of [360, 390]) {
    const mock = createMock();
    for (const [gym, counts, def] of cases) fill(mock, gym, counts, def);
    const { page, ctx, errors } = await phone(browser, mock, { viewport: { width, height: 844 } });
    for (const [gym] of cases) {
      await page.goto(`${BASE}/gym/${gym}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const h = await hits(page);
      const codes = Object.keys(h);
      assert.ok(codes.length >= 2, `${gym} 有畫方塊`);
      for (const c of codes) {
        const at = `${width} 寬 ${gym} ${c}`;
        assert.equal(h[c].label, c, `${at}：區名中間點下去是自己（${h[c].label}）`);
        assert.ok(h[c].tap >= 0.4 && h[c].px >= 80, `${at}：方塊上點下去會進這一區的地方 ${(h[c].tap * 100).toFixed(0)}%（${h[c].px}px）`);
        assert.ok(h[c].top >= 0.5, `${at}：頂面看得到 ${(h[c].top * 100).toFixed(0)}%（沒被前面的方塊擋掉）`);
        assert.ok(h[c].onOther <= 0.5, `${at}：區名蓋在別區方塊上 ${(h[c].onOther * 100).toFixed(0)}%`);
      }
    }
    // 真的點：中和速度牆的方塊（前面有內牆）
    await page.goto(`${BASE}/gym/g3`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const p = await spot(page, "SP");
    await page.mouse.click(p.x, p.y);
    await page.waitForURL(/\/zone\?id=/);
    assert.equal(await page.textContent("main h1"), "速度牆");
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("立體平面圖：後台點方塊切換區域，選中的浮起來、區名變深色膠囊（不移動、不被切掉）；改過的長名字截短；南港 1F、2F 都是立體", async () => {
  const mock = createMock();
  zone(mock, "mingde", "C1").name = "攀岩洞穴入口";
  zone(mock, "mingde", "C2").name = "五個字的牆";
  fill(mock, "mingde", {}, 10);
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const { page, errors } = await phone(browser, mock, { viewport: { width: 360, height: 844 } });
  await login(page, "boss", "password1", "/admin");
  await page.waitForTimeout(1200);
  const b1 = 'main svg[data-plan="3d"] g[role=button][aria-label^="B1 區"]';
  const p = await spot(page, "B1");
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(500);
  assert.equal(await page.getAttribute(b1, "aria-pressed"), "true", "選中 B1");
  assert.equal(await page.inputValue("#zname"), "B1 區");
  assert.equal(await page.locator('main svg[data-plan="3d"] [data-zone="B1"] rect[fill="var(--ink)"]').count(), 1, "區名變膠囊");
  assert.equal(await page.locator('main svg[data-plan="3d"] [data-zone="A1"] rect[fill="var(--ink)"]').count(), 0);
  assert.equal(await page.textContent('main svg[data-plan="3d"] [data-zone="C1"] text'), "攀岩洞穴…", "改過的長名字截短");
  assert.equal(await page.textContent('main svg[data-plan="3d"] [data-zone="C2"] text'), "五個字的牆", "剛好 5 個字不截短");
  assert.equal(await page.textContent('main svg[data-plan="3d"] [data-zone="A1"] text'), "A1", "沒改名的寫簡稱");

  // 最上面的 A4 選中：膠囊整個在圖裡，也不會疊到旁邊的區名
  await page.locator('main svg[data-plan="3d"] [data-zone="A4"] text').first().click();
  await page.waitForTimeout(500);
  assert.equal(await page.inputValue("#zname"), "A4 區");
  const box = await page.evaluate(() => {
    const svg = document.querySelector('main svg[data-plan="3d"]').getBoundingClientRect();
    const a4 = document.querySelector('main svg[data-plan="3d"] [data-zone="A4"] rect[fill="var(--ink)"]').getBoundingClientRect();
    // 別的區名的框：鍵盤框（比區名的框大 1.2 個單位，約 1.2px）往內縮回來
    const hit = [...document.querySelectorAll('main svg[data-plan="3d"] [data-zone]:not([data-zone="A4"]) rect[pointer-events="none"]')]
      .map((t) => ({ c: t.parentElement.getAttribute("data-zone"), r: t.getBoundingClientRect() }))
      .filter((x) => x.r.left + 1.3 < a4.right && a4.left < x.r.right - 1.3 && x.r.top + 1.3 < a4.bottom && a4.top < x.r.bottom - 1.3)
      .map((x) => x.c);
    return { inside: a4.top >= svg.top - 0.5 && a4.left >= svg.left - 0.5 && a4.right <= svg.right + 0.5, hit };
  });
  assert.ok(box.inside, "A4 膠囊沒被切掉");
  assert.deepEqual(box.hit, [], "A4 膠囊沒疊到別的區名");

  await page.goto(`${BASE}/gym/g4`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.deepEqual(
    await page.locator('main svg[data-plan="3d"]').evaluateAll((s) => s.map((x) => x.getAttribute("aria-label"))),
    ["南港館 1F 平面圖", "南港館 2F 平面圖"],
    "南港兩層都是立體"
  );
  await page.locator('main svg[data-plan="3d"] g[role=button][aria-label^="D2 區"] text').first().click();
  await page.waitForURL(/\/zone\?id=/);
  assert.ok((await page.textContent("main h1")).includes("D2 區"));
  assert.deepEqual(errors, []);
});

test("設計規範頁：平面圖示範畫得出立體的方塊和區名", async () => {
  const { page, errors } = await phone(browser, createMock());
  await page.goto(`${BASE}/design`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const n = await page.locator('svg[data-plan="3d"]').evaluateAll((s) => s.map((x) => [x.querySelectorAll("[data-block]").length, x.querySelectorAll("[data-zone]").length]));
  assert.equal(n.length, 3, "三張示範");
  for (const [blocks, labels] of n) assert.ok(blocks === 16 && labels === 16, `每張 16 區（${blocks} 方塊、${labels} 區名）`);
  assert.deepEqual(errors, []);
});
