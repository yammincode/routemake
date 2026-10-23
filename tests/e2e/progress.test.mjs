// 我的紀錄「路線進度」：牆上進度（開放的館一起算、Spray Wall 不算、抱石／上攀分開、各店標準色、★ 大滿貫、點一行看各館）
// 我的進度（累積完攀，跟累計完攀一樣：換線拆掉的、Spray Wall 上員工出的也算，岩友路線不算）；選哪個分頁記在手機
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";
import { taipeiDay } from "./mock-supabase.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

// 各店標準色（lib/gyms.ts 的 GYM_COLORS）換成瀏覽器算出來的 rgb
const RGB = { mingde: "rgb(109, 53, 64)", g2: "rgb(105, 89, 178)", g3: "rgb(1, 188, 181)", g4: "rgb(6, 109, 106)", g5: "rgb(0, 99, 130)" };

function setup() {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = (gym, code) => mock.db.zones.find((z) => z.gym_id === gym && z.code === code);
  // 中壢館還沒開放：放一區、一條 VB（不能算進牆上進度）
  const zl = { id: crypto.randomUUID(), gym_id: "g6", code: "A", name: "A 區", sort: 1, photo_path: null, photo_width: null, photo_height: null, next_reset_on: null, route_seq: 0, grade_system: "v" };
  mock.db.zones.push(zl);
  const created = new Date(Date.now() - 30 * 86400000).toISOString();
  const route = (z, grade, color = "藍") => mock.addRoute(z, grade, color, [], 30, 40, created);
  const day = taipeiDay(-2);
  const r = {
    // VB：明德 2、萬華 1、南港 1，全部完成 → 抱石 VB 大滿貫
    vb: [route(zone("mingde", "A1"), -1), route(zone("mingde", "A2"), -1), route(zone("g2", "A"), -1), route(zone("g4", "A1"), -1)],
    // V3：明德 1（完成）、萬華 1、新店 2 → 1/4，明德那館全部完成
    v3: [route(zone("mingde", "B1"), 3), route(zone("g2", "B1"), 3), route(zone("g5", "A1"), 3), route(zone("g5", "B1"), 3)],
    // 上攀（中和）：5.8 兩條都完成 → 大滿貫；5.10a 一條沒爬
    y58: [route(zone("g3", "A"), 102), route(zone("g3", "B"), 102)],
    y510: route(zone("g3", "C"), 104),
    // 不算進牆上進度：Spray Wall（員工出的 VB，完成；岩友出的 V2，完成）、中壢（沒開放）、已經下架的 VB（沒爬）
    sprayGym: route(zone("mingde", "S"), -1, "白"),
    sprayCommunity: Object.assign(route(zone("mingde", "S"), 2, "白"), { kind: "community", name: "小安的路線", created_by: me }),
    closed: route(zl, -1),
    archived: Object.assign(route(zone("mingde", "C1"), -1), { archived_at: new Date(Date.now() - 5 * 86400000).toISOString() }),
    // 我的進度：下架的 V5 也算（完攀過）
    archivedSent: Object.assign(route(zone("mingde", "C2"), 5), { archived_at: new Date(Date.now() - 3 * 86400000).toISOString() }),
  };
  for (const x of r.vb) mock.addAscent(me, x, "send", day);
  mock.addAscent(me, r.v3[0], "flash", day);
  for (const x of r.y58) mock.addAscent(me, x, "send", day);
  mock.addAscent(me, r.sprayGym, "send", day);
  mock.addAscent(me, r.sprayCommunity, "flash", day);
  mock.addAscent(me, r.archivedSent, "send", taipeiDay(-10));
  mock.addAscent(me, r.v3[1], "project", day); // 嘗試中不算完成
  return { mock, me, r };
}

const card = (page, title) => page.locator(`main section[aria-label="${title}"]`);
// 卡片裡的一行：用左邊的難度（剛好那幾個字）找
const row = (page, title, grade) => card(page, title).locator("button[aria-expanded]").filter({ has: page.locator(`span:text-is("${grade}")`) });
const flat = (t) => (t ?? "").replace(/\s+/g, "");
// 由上而下的順序（版型固定）：一個接一個往後找（上面本月完攀的直條圖也有「抱石」）
function assertOrder(text, words) {
  let at = 0;
  for (const t of words) {
    const i = text.indexOf(t, at);
    assert.ok(i >= at, `「${t}」要在前一個後面（${words.join(" → ")}）`);
    at = i + t.length;
  }
}

test("路線進度：牆上進度開放的館一起算（Spray Wall、沒開放的館、下架的不算），抱石／上攀分開、依館上色，全部完成是 ★ 大滿貫，點一行看各館", async () => {
  const { mock } = setup();
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me?tab=all");
  await page.waitForTimeout(1500);
  const main = await page.textContent("main");
  assert.ok(!main.includes("目前牆上進度"), "舊的「目前牆上進度」換成「路線進度」");
  // 由上而下：累計完攀 → 路線進度 → 牆上進度｜我的進度（預設牆上進度）→ 各館圖例 → 說明 → 抱石 → 上攀
  assertOrder(main, ["累計完攀", "路線進度", "牆上進度", "我的進度", "明德", "新店", "開放的館全部一起算", "抱石", "上攀"]);
  assert.equal(await page.getAttribute('main [role=tab]:has-text("牆上進度")', "aria-selected"), "true", "預設停在牆上進度");
  // 路線進度的圖例（上面攀爬日月曆也有自己的館圖例，所以取最後一個）
  assert.equal(flat(await page.locator("main div.flex-wrap", { hasText: "明德" }).last().textContent()), "明德萬華中和南港新店", "圖例：有路線的館，照館的順序（中壢沒開放不列）");

  // 抱石：VB 4/4 大滿貫（Spray Wall、中壢、下架的 VB 都不算），V3 1/4（嘗試中不算）
  const b = flat(await card(page, "抱石").textContent());
  assert.ok(b.includes("你完成5/8條"), `抱石 5/8（${b}）`);
  assert.ok(b.includes("★大滿貫1個難度"), "抱石大滿貫 1 個難度");
  assert.equal(flat(await row(page, "抱石", "VB").textContent()), "VB★大滿貫", "VB 全部完成寫 ★ 大滿貫");
  assert.equal(flat(await row(page, "抱石", "V3").textContent()), "V31/4");
  assert.equal(await row(page, "抱石", "V2").count(), 0, "岩友路線（Spray Wall）的 V2 不出現");
  // 上攀分開：5.8 兩條都完成 → 大滿貫；5.10a 0/1（沒完成的難度先收起來，點「還有 1 個難度還沒完成」打開）
  assert.equal(await row(page, "上攀", "5.10a").count(), 0, "沒完成的難度先收起來");
  await card(page, "上攀").getByRole("button", { name: "還有 1 個難度還沒完成 ⌄" }).click();
  const y = flat(await card(page, "上攀").textContent());
  assert.ok(y.includes("你完成2/3條") && y.includes("★大滿貫1個難度"), `上攀（${y}）`);
  assert.equal(flat(await row(page, "上攀", "5.8").textContent()), "5.8★大滿貫");
  assert.equal(flat(await row(page, "上攀", "5.10a").textContent()), "5.10a0/1");

  // 色條依館分段、用各店標準色：VB 有明德、萬華、南港三段
  const segs = await row(page, "抱石", "VB").locator("i[data-gym]").evaluateAll((els) => els.map((e) => [e.dataset.gym, getComputedStyle(e).backgroundColor]));
  assert.deepEqual(segs, [["mingde", RGB.mingde], ["g2", RGB.g2], ["g4", RGB.g4]], "VB 三段：明德、萬華、南港（標準色）");
  assert.equal(await row(page, "抱石", "V3").locator("i[data-gym]").count(), 1, "V3 只完成明德一段");

  // 點 V3：展開各館（明德 1/1 ★、萬華 0/1、新店 0/2）；再點一次收起來
  await row(page, "抱石", "V3").click();
  assert.equal(await row(page, "抱石", "V3").getAttribute("aria-expanded"), "true");
  const detail = flat(await card(page, "抱石").locator("div.rounded-tile").textContent());
  assert.equal(detail, "明德1/1★萬華0/1新店0/2", `各館數字，明德那館全部完成有 ★（${detail}）`);
  await row(page, "抱石", "V3").click();
  assert.equal(await card(page, "抱石").locator("div.rounded-tile").count(), 0, "再點一次收起來");
  assert.deepEqual(errors, []);
});

test("路線進度：我的進度是累積完攀（下架的、Spray Wall 員工出的也算，岩友路線不算），加起來等於累計完攀；選的分頁記在手機", async () => {
  const { mock } = setup();
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me?tab=all");
  await page.waitForTimeout(1500);
  await page.click('main [role=tab]:has-text("我的進度")');
  await page.waitForTimeout(300);
  const main = await page.textContent("main");
  assert.ok(!main.includes("大滿貫"), "我的進度沒有大滿貫");
  // 圖例只列爬過的館（這個人沒爬過新店）
  assertOrder(main, ["路線進度", "牆上進度", "我的進度", "明德", "南港", "換線拆掉的也算", "抱石", "上攀"]);
  assert.ok(!flat(await page.locator("main div.flex-wrap", { hasText: "明德" }).first().textContent()).includes("新店"), "沒爬過的館不列在圖例");
  // 抱石：VB 5（牆上 4＋Spray Wall 員工出的 1）、V3 1、V5 1（已下架）；岩友路線 V2 不算
  const b = flat(await card(page, "抱石").textContent());
  assert.ok(b.includes("累計完攀7條"), `抱石累計 7 條（${b}）`);
  assert.equal(flat(await row(page, "抱石", "VB").textContent()), "VB5條");
  assert.equal(flat(await row(page, "抱石", "V5").textContent()), "V51條", "換線拆掉的也算");
  assert.equal(await row(page, "抱石", "V2").count(), 0, "岩友路線不算");
  assert.equal(await row(page, "抱石", "V0").count(), 0, "沒爬過的難度不列");
  const y = flat(await card(page, "上攀").textContent());
  assert.ok(y.includes("累計完攀2條"), `上攀累計 2 條（${y}）`);
  // 加起來等於上面的累計完攀
  const total = Number(flat(await page.locator("main div", { hasText: /^累計完攀/ }).locator("strong").first().textContent()));
  assert.equal(total, 9, "累計完攀 9 條");
  assert.equal(7 + 2, total, "抱石＋上攀＝累計完攀");
  // 沒有灰底（不是完成度），最多的那個難度畫滿
  assert.ok(!(await row(page, "抱石", "VB").locator("span.bg-line").count()), "我的進度不畫灰底");
  // 點 VB：明德 3（含 Spray Wall）、萬華 1、南港 1
  await row(page, "抱石", "VB").click();
  assert.equal(flat(await card(page, "抱石").locator("div.rounded-tile").textContent()), "明德3條萬華1條南港1條");

  // 重新打開：還是停在我的進度
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  assert.equal(await page.getAttribute('main [role=tab]:has-text("我的進度")', "aria-selected"), "true", "記住選的分頁");
  assert.ok(flat(await card(page, "抱石").textContent()).includes("累計完攀7條"));
  assert.deepEqual(errors, []);
});

test("路線進度：手機裡還沒送出的紀錄，牆上進度先算進去；我的進度跟累計完攀一樣等送出才算", async () => {
  const { mock, me, r } = setup();
  // 送不出去（伺服器暫時出錯）：紀錄留在手機排隊
  mock.state.ascentsFail = { status: 503, type: "text/html", body: "<html>503</html>" };
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me?tab=all");
  await page.evaluate(
    ([uid, routeId, day]) => localStorage.setItem("routemake-pending", JSON.stringify([{ userId: uid, routeId, at: 1, ascent: { status: "send", climbed_on: day, feel: null, grade_feel: null, private_note: null } }])),
    [me, r.v3[2].id, taipeiDay(0)]
  );
  await page.goto(`${BASE}/me?tab=all`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  assert.equal(flat(await row(page, "抱石", "V3").textContent()), "V32/4", "排隊中的新店 V3 先算完成");
  await page.click('main [role=tab]:has-text("我的進度")');
  assert.equal(flat(await row(page, "抱石", "V3").textContent()), "V31條", "我的進度等送出才算");
  // 不算岩友路線之類的錯：只會有送不出去的 503
  assert.deepEqual(errors.filter((e) => !/503/.test(e)), []);
});

test("路線進度：牆上路線超過 1000 條時一頁一頁讀完，不會少算；紀錄不用把路線 id 放進網址", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones[0];
  const created = new Date(Date.now() - 10 * 86400000).toISOString();
  const rs = Array.from({ length: 1005 }, (_, i) => mock.addRoute(zA, 3, "藍", [], 10 + (i % 80), 20, created));
  mock.addAscent(me, rs[4], "send", taipeiDay(-1));
  mock.addAscent(me, rs[1003], "flash", taipeiDay(0));
  const { page, errors } = await phone(browser, mock);
  const pages = [];
  const idUrls = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.pathname === "/rest/v1/routes" && (u.searchParams.get("select") ?? "").includes("gyms!inner(is_live)")) pages.push(u.searchParams.get("offset"));
    if (u.pathname === "/rest/v1/ascents" && u.searchParams.get("route_id")?.startsWith("in.")) idUrls.push(u.href.length);
  });
  await login(page, "climber88", "password1", "/me?tab=all");
  await page.waitForTimeout(1500);
  assert.deepEqual(pages, ["0", "1000"], `分兩頁讀（${pages.join("、")}）`);
  assert.equal(flat(await row(page, "抱石", "V3").textContent()), "V32/1005", "第 5 條和第 1004 條的紀錄都算到");
  assert.deepEqual(idUrls, [], "不用把路線 id 放進網址");
  assert.deepEqual(errors, []);
});

test("路線進度：讀不到時這一段顯示錯誤和「重新整理」（上面的月統計照常），按了就讀得出來", async () => {
  const { mock } = setup();
  const { ctx, page, errors } = await phone(browser, mock);
  // 讀牆上路線時斷線（手機裡也還沒有這份資料）；要攔在瀏覽器這一層（請求會經過 Service Worker），後加的先處理
  let fail = true;
  await ctx.route("**/rest/v1/routes?*", (route) => {
    if (fail && route.request().url().includes("is_live")) return route.abort("internetdisconnected");
    return route.fallback();
  });
  await login(page, "climber88", "password1", "/me?tab=all");
  // 連線套件斷線時會自己重試幾秒，放棄後才顯示錯誤
  const retry = page.locator('main button:has-text("重新整理")');
  await retry.waitFor({ timeout: 20000 });
  const main = await page.textContent("main");
  assert.ok(main.includes("累計完攀") && !main.includes("讀取中…"), "月統計照常、路線進度不會一直寫讀取中");
  assert.equal(await retry.count(), 1, "路線進度這一段有「重新整理」");
  assert.equal(await card(page, "抱石").count(), 0);
  fail = false;
  await retry.click();
  await page.waitForTimeout(1000);
  assert.ok(flat(await card(page, "抱石").textContent()).includes("你完成5/8條"), "按了就讀得出來");
  assert.equal(await retry.count(), 0, "讀到後錯誤和按鈕收起來");
  assert.deepEqual(errors, []);
});
