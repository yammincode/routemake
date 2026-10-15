// 館首頁：全館難度分布、難度篩選（變淡、記住選擇）、區域難度色帶、NEW、快換線提醒、沒登入的寫法
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

test("館首頁難度色帶：沒登入只寫條數；登入後有完成數、篩選變淡且記住、快換線提醒、NEW", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = (code) => mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === code);
  const [A1, A2, B1, C1] = [zone("A1"), zone("A2"), zone("B1"), zone("C1")];
  const old = daysAgo(10);
  const a1 = [0, 1, 3, 4].map((g) => mock.addRoute(A1, g, "藍", [], 30, 40, old));
  const a2 = [6, 7].map((g) => mock.addRoute(A2, g, "紅", [], 30, 40, old));
  [-1, 2].forEach((g) => mock.addRoute(B1, g, "黃")); // 今天剛設定 → NEW
  mock.addRoute(C1, 8, "黑", [], 30, 40, daysAgo(5)); // 5 天前設定 → 不算 NEW（3 天內才算）
  A2.next_reset_on = taipeiDay(2);
  A1.next_reset_on = taipeiDay(20);
  mock.addAscent(me, a1[0], "send", taipeiDay(-3));
  mock.addAscent(me, a2[0], "flash", taipeiDay(-3));

  // ---- 沒登入 ----
  const G = await phone(browser, mock);
  const g = G.page;
  await g.goto(BASE + "/gym/mingde", { waitUntil: "networkidle" });
  await g.waitForTimeout(800);
  const plan = g.locator("svg[role=img]");
  assert.match(await plan.locator('g[aria-label^="A1 區"]').getAttribute("aria-label"), /牆上 4 條/, "平面圖寫路線數");
  assert.ok(!(await plan.textContent()).includes("天後換線"), "平面圖不寫換線小字（會壓到旁邊的區名）");
  assert.ok((await g.textContent("main")).includes("點區域看路線"));
  const goalG = g.locator("main button", { hasText: "快換線" });
  assert.match((await goalG.textContent()).replace(/\s+/g, ""), /A2區2天後換線，共2條路線/, "沒登入的快換線提醒");
  assert.ok(!(await g.textContent("main")).includes("沒完攀"), "沒登入不出現「沒完攀」");
  assert.ok(!(await g.textContent("main")).includes("即將換線"), "即將換線整段拿掉（換線寫在區域卡片上）");
  const cardG = g.locator("main button.rounded-card", { hasText: "A1 區" });
  assert.ok((await cardG.textContent()).includes("4 條"));
  assert.ok(!(await cardG.textContent()).includes("/"), "沒登入不顯示完成數");
  assert.ok((await cardG.textContent()).includes("20 天後換線"), "卡片寫換線日（沒有公告時用員工設的下次換線日）");

  // ---- 登入 ----
  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", "/gym/mingde");
  await c.waitForTimeout(800);
  const main = async () => (await c.textContent("main")).replace(/\s+/g, "");
  assert.ok((await main()).includes("全館難度分布共9條"), "全館難度分布");
  // 「所有區域」由上而下（版型固定，見 CLAUDE.md）：全館難度分布 → 四格 → 說明一行 → 區域卡片
  {
    const text = await main();
    const steps = ["所有區域", "全館難度分布", "全部VB–V10", "入門VB–V2", "進階V3–V5", "挑戰V6+", "色帶是牆上的膠帶顏色", "A1區1/4"];
    let at = -1;
    for (const [k, step] of steps.entries()) {
      const i = text.indexOf(step, at + 1);
      assert.ok(i > at, `「${step}」在「${steps[k - 1] ?? "開頭"}」後面`);
      at = i;
    }
  }
  const card = (name) => c.locator("main button.rounded-card", { hasText: name });
  assert.ok((await card("A1 區").textContent()).includes("1 / 4"), "完成數");
  assert.ok((await card("A1 區").textContent()).includes("V0–V4"), "難度範圍");
  assert.ok((await card("B1 區").textContent()).includes("NEW"), "3 天內有新路線標 NEW");
  assert.ok(!(await card("A1 區").textContent()).includes("NEW"));
  assert.ok(!(await card("C1 區").textContent()).includes("NEW"), "5 天前的不算 NEW");

  const goal = c.locator("main button", { hasText: "下一個目標" });
  assert.match((await goal.textContent()).replace(/\s+/g, ""), /A2區2天後換線，還有1條沒完攀/, "快換線提醒");

  // 難度篩選：進階 V3–V5
  const mid = c.locator('main button[aria-pressed]:has-text("V3–V5")');
  await mid.click();
  await c.waitForTimeout(200);
  assert.equal(await mid.getAttribute("aria-pressed"), "true");
  assert.ok((await card("A1 區").textContent()).includes("V3–V5 有 2 條"), "有這個難度的區寫條數");
  assert.ok((await card("A2 區").textContent()).includes("沒有 V3–V5"), "沒有的區寫「沒有」");
  assert.ok(await card("A2 區").locator("img.grayscale").count(), "沒有的區照片變淡");
  assert.ok((await main()).includes("有1個區域有V3–V5的路線"), "說明幾個區域有");
  assert.ok((await main()).includes("V3–V5共2條／9"), "全館難度分布跟著篩選");

  // 重新整理後記得上次選的難度
  await c.reload({ waitUntil: "networkidle" });
  await c.waitForTimeout(800);
  assert.equal(await mid.getAttribute("aria-pressed"), "true", "記住選的難度");
  await c.locator('main button[aria-pressed]:has-text("VB–V10")').click();
  await c.waitForTimeout(200);
  assert.ok((await main()).includes("色帶是牆上的膠帶顏色"), "回到全部");
  assert.ok(!(await card("A2 區").textContent()).includes("沒有"));

  await goal.click();
  await c.waitForURL(`**/zone?id=${A2.id}`);

  // 舊版存在手機裡的資料沒有難度（r）：離線時卡片照樣寫條數，不會變成「還沒有路線」
  await g.evaluate(() => {
    const k = "routemake-cache:home:mingde:guest";
    const d = JSON.parse(localStorage.getItem(k));
    delete d.r;
    localStorage.setItem(k, JSON.stringify(d));
  });
  mock.state.offline = true;
  await g.reload({ waitUntil: "domcontentloaded" });
  await g.waitForTimeout(1500);
  const oldCard = await cardG.textContent();
  assert.ok(oldCard.includes("4 條") && !oldCard.includes("還沒有路線"), `舊資料離線時卡片照樣寫條數（實際：${oldCard}）`);
  mock.state.offline = false;
  assert.deepEqual([...G.errors, ...C.errors], []);
});

test("上攀為主的館：沒有抱石分布和四格，只有上攀難度分布（全館難度分布（上攀））；區域卡片寫 YDS 難度範圍；上攀四格篩選", async () => {
  const mock = createMock();
  const zone = (code) => mock.db.zones.find((z) => z.gym_id === "g3" && z.code === code);
  [104, 108].forEach((g) => mock.addRoute(zone("A"), g, "藍"));
  [100, 103].forEach((g) => mock.addRoute(zone("AB1"), g, "藍"));
  mock.addRoute(zone("BO"), 3, "紅");
  const { page, errors } = await phone(browser, mock);
  await page.goto(BASE + "/gym/g3", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const main = async () => (await page.textContent("main")).replace(/\s+/g, "");
  assert.ok(!(await main()).includes("全館難度分布共"), "沒有抱石的全館難度分布");
  assert.equal(await page.locator('main button[aria-pressed]:has-text("VB–V10")').count(), 0, "沒有抱石四格");
  assert.ok((await main()).includes("全館難度分布（上攀）共4條"), "只有上攀那張，標題寫（上攀）");
  assert.ok((await page.locator("main button.rounded-card", { hasText: "A 區" }).textContent()).includes("5.10a–5.11a"));
  // 上攀四格：選「進階 5.10」→ 有 5.10 的區寫條數，沒有的變淡
  await page.locator('main button[aria-pressed]:has-text("5.10")').filter({ hasText: "進階" }).click();
  await page.waitForTimeout(200);
  assert.match(await page.locator("main button.rounded-card", { hasText: "A 區" }).getAttribute("aria-label"), /5\.10 有 1 條/);
  assert.match(await page.locator("main button.rounded-card", { hasText: "Auto-Belay 1" }).getAttribute("aria-label"), /沒有 5\.10/);
  assert.ok((await main()).includes("有1個區域有5.10的路線"));
  assert.deepEqual(errors, []);
});

test("抱石＋上攀的館：抱石分布下面多一張上攀難度分布（長耐力也算）；上攀三段篩選區域卡片，跟抱石同時只篩一種；※檢查由上而下的順序", async () => {
  const mock = createMock();
  const zone = (code) => mock.db.zones.find((z) => z.gym_id === "g5" && z.code === code);
  [0, 2, 3, 5, 6].forEach((g) => mock.addRoute(zone("A1"), g, "藍"));
  [1, 4].forEach((g) => mock.addRoute(zone("B1"), g, "紅"));
  [101, 103, 105, 110, 117].forEach((g) => mock.addRoute(zone("E"), g, "黃")); // 上攀 E 區：5.7、5.9、5.10b、5.11c、5.13b
  // 長耐力的區（照順序的點）也是 5.x：算進上攀
  const d = zone("D");
  d.grade_system = "endurance";
  const en = mock.addRoute(d, 108, "白");
  en.holds = Array.from({ length: 6 }, (_, i) => ({ x: 10 + i * 12, y: 50, t: i ? (i === 5 ? "t" : "h") : "s" }));
  const { page, errors } = await phone(browser, mock);
  await page.goto(BASE + "/gym/g5", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const main = async () => (await page.textContent("main")).replace(/\s+/g, "");
  {
    const text = await main();
    const steps = ["所有區域", "全館難度分布共7條", "全部VB–V10", "色帶是牆上的膠帶顏色", "上攀難度分布共6條", "全部5.6–5.13", "入門5.9以下", "進階5.10", "挑戰5.11+", "上攀沒有膠帶顏色", "抱石A1區"];
    let at = -1;
    for (const [k, step] of steps.entries()) {
      const i = text.indexOf(step, at + 1);
      assert.ok(i > at, `「${step}」在「${steps[k - 1] ?? "開頭"}」後面`);
      at = i;
    }
  }
  // 上攀長條：5.7、5.9 各 1；5.10、5.11（含長耐力 5.11a）、5.13 合成一根
  const bars = await page.locator("main .grid-cols-8 > div").evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, "")));
  assert.deepEqual(bars, ["5.6", "15.7", "5.8", "15.9", "15.10", "25.11", "5.12", "15.13"], bars.join("｜"));

  // 先選抱石「進階」，再選上攀「挑戰 5.11+」：抱石回到全部，區域卡片照上攀變淡
  await page.locator('main button[aria-pressed]:has-text("V3–V5")').click();
  await page.waitForTimeout(150);
  await page.locator('main button[aria-pressed]:has-text("5.11+")').click();
  await page.waitForTimeout(200);
  assert.equal(await page.getAttribute('main button[aria-pressed]:has-text("VB–V10")', "aria-pressed"), "true", "抱石四格回到全部");
  assert.match(await page.locator("main button.rounded-card", { hasText: "上攀 E 區" }).getAttribute("aria-label"), /5\.11\+ 有 2 條/);
  assert.match(await page.locator("main button.rounded-card", { hasText: "D 區" }).getAttribute("aria-label"), /5\.11\+ 有 1 條/, "長耐力也算");
  assert.match(await page.locator("main button.rounded-card", { hasText: "抱石 A1 區" }).getAttribute("aria-label"), /沒有 5\.11\+/);
  assert.ok((await main()).includes("有2個區域有5.11+的路線"));
  assert.equal(await page.evaluate(() => localStorage.getItem("routemake:home-band")), null, "選上攀時抱石的記憶清掉");
  // 點上攀圖下面的「入門」等於按四格；再按抱石「挑戰」：上攀回到全部
  await page.locator('main button[aria-label="上攀入門 5.9 以下"]').click();
  await page.waitForTimeout(150);
  assert.match(await page.locator("main button.rounded-card", { hasText: "上攀 E 區" }).getAttribute("aria-label"), /5\.9 以下 有 2 條/);
  await page.locator('main button[aria-pressed]:has-text("V6+")').click();
  await page.waitForTimeout(150);
  assert.equal(await page.getAttribute('main button[aria-pressed]:has-text("5.6–5.13")', "aria-pressed"), "true", "上攀四格回到全部");
  assert.match(await page.locator("main button.rounded-card", { hasText: "抱石 A1 區" }).getAttribute("aria-label"), /V6\+ 有 1 條/);
  assert.deepEqual(errors, []);
});

test("館首頁：這週新路線很多（170 條）時，自己的紀錄分批查（每次最多 80 條、全部查到，網址不會太長被拒絕）", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "A1");
  const rs = Array.from({ length: 170 }, (_, i) => mock.addRoute(zA, 3, "藍", [], 10 + (i % 80), 20, daysAgo(2)));
  mock.addAscent(me, rs[4], "send", taipeiDay(-1));
  mock.addAscent(me, rs[149], "flash", taipeiDay(0));
  const { page, errors } = await phone(browser, mock);
  const sizes = [];
  const ids = new Set();
  page.on("request", (req) => {
    const u = new URL(req.url());
    const list = u.searchParams.get("route_id");
    if (u.pathname === "/rest/v1/ascents" && list?.startsWith("in.")) {
      const part = list.slice(4, -1).split(",");
      sizes.push(part.length);
      part.forEach((id) => ids.add(id.replace(/"/g, "")));
    }
  });
  await login(page, "climber88", "password1", "/gym/mingde");
  await page.waitForTimeout(1500);
  assert.ok(sizes.length >= 3 && Math.max(...sizes) <= 80, `每次最多查 80 條（實際：${sizes.join("、")}）`);
  assert.ok(rs.every((r) => ids.has(r.id)), `170 條都查到（${ids.size}）`);
  assert.deepEqual(errors, []);
});
