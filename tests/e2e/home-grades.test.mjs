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

test("上攀為主的館不顯示難度分布和篩選，區域卡片寫 YDS 難度範圍", async () => {
  const mock = createMock();
  const zone = (code) => mock.db.zones.find((z) => z.gym_id === "g3" && z.code === code);
  [104, 108].forEach((g) => mock.addRoute(zone("A"), g, "藍"));
  mock.addRoute(zone("BO"), 3, "紅");
  const { page, errors } = await phone(browser, mock);
  await page.goto(BASE + "/gym/g3", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.ok(!(await page.textContent("main")).includes("全館難度分布"));
  assert.equal(await page.locator('main button[aria-pressed]:has-text("VB–V10")').count(), 0);
  assert.ok((await page.locator("main button.rounded-card", { hasText: "A 區" }).textContent()).includes("5.10a–5.11a"));
  assert.deepEqual(errors, []);
});
