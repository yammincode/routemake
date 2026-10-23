// 訓練日誌（step51）：我的紀錄四個分頁（這週｜日誌｜這個月｜全部）、主頁自己選（記在帳號）、
// 這週（目標圈、連續週數、我的專案、換線前 3 天提醒）、路線卡片試了幾次、日誌時間軸（路線自動帶入、試了幾天、里程碑、寫日誌、公開到人物卡）、
// 別人看公開的日誌、店長隱藏、攀爬日寫日誌、全部（難度金字塔、路線進度只列有完成的）、帳號收成一行；還沒套用 step51 照舊
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";
import { taipeiDay } from "./mock-supabase.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const flat = (t) => (t ?? "").replace(/\s+/g, "");
const tab = (page, name) => page.locator(`main [role=tablist][aria-label="我的紀錄"] [role=tab]:text-is("${name}")`);
const selected = async (page) => (await page.locator('main [role=tablist][aria-label="我的紀錄"] [role=tab][aria-selected=true]').textContent()).replace("★", "").trim();
const md = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;

function setup() {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安", card_public: true });
  const zone = (gym, code) => mock.db.zones.find((z) => z.gym_id === gym && z.code === code);
  const created = new Date(Date.now() - 60 * 86400000).toISOString();
  const route = (z, grade, color) => mock.addRoute(z, grade, color, [], 30, 40, created);
  // 專案一：明德 A1 黃色 V5，2 天後換線（橘色提醒）；之前試了兩天（5 天前 6 次、2 天前 4 次）
  const za = zone("mingde", "A1");
  za.next_reset_on = taipeiDay(2);
  const p1 = route(za, 5, "黃");
  mock.addAscent(me, p1, "project", taipeiDay(-2), { tries: 4 });
  mock.db.climbDays.push({ user_id: me, route_id: p1.id, day: taipeiDay(-5), status: "project", tries: 6, highpoint: null, updated_at: new Date().toISOString() });
  // 專案二：萬華 V6，換線還很久
  const zb = mock.db.zones.find((z) => z.gym_id === "g2" && z.code === "A");
  zb.next_reset_on = taipeiDay(20);
  const p2 = route(zb, 6, "紫");
  mock.addAscent(me, p2, "project", taipeiDay(-1));
  // 今天：明德 V3 藍 Flash、V2 綠完攀（第一次完攀 → 里程碑）；試了 3 天的 V4 紅今天完攀（7 天前 5 次、3 天前 3 次、今天 2 次）
  const v3 = route(zone("mingde", "A2"), 3, "藍");
  const v2 = route(zone("mingde", "A2"), 2, "綠");
  const v4 = route(zone("mingde", "B1"), 4, "紅");
  mock.addAscent(me, v3, "flash", taipeiDay(0));
  mock.addAscent(me, v2, "send", taipeiDay(0));
  mock.addAscent(me, v4, "send", taipeiDay(0), { tries: 2 });
  for (const [d, n] of [[-7, 5], [-3, 3]]) mock.db.climbDays.push({ user_id: me, route_id: v4.id, day: taipeiDay(d), status: "project", tries: n, highpoint: null, updated_at: new Date().toISOString() });
  return { mock, me, p1, p2, v3, v2, v4, za };
}

test("訓練日誌：四個分頁、預設主頁是這週、設成主頁記在帳號（換手機也一樣）、網址 ?tab= 直接打開", async () => {
  const { mock, me } = setup();
  const A = await phone(browser, mock);
  await login(A.page, "climber88", "password1", "/me");
  await A.page.waitForTimeout(1200);
  assert.deepEqual(
    (await A.page.locator('main [role=tablist][aria-label="我的紀錄"] [role=tab]').allTextContents()).map((t) => t.replace("★", "")),
    ["這週", "日誌", "這個月", "全部"],
    "四個分頁"
  );
  assert.equal(await selected(A.page), "這週", "沒選過主頁：先看這週");
  assert.ok((await tab(A.page, "這週").textContent()).includes("★"), "主頁有小 ★");
  assert.equal(await A.page.locator('main button[aria-pressed=true]:text-is("★ 主頁")').count(), 1, "這週是主頁");
  // 換到日誌，設成主頁
  await tab(A.page, "日誌").click();
  await A.page.waitForTimeout(500);
  await A.page.getByRole("button", { name: "☆ 設成主頁" }).click();
  await A.page.waitForTimeout(500);
  assert.equal(mock.db.trainingSettings.find((s) => s.user_id === me)?.home_tab, "log", "記在帳號");
  assert.ok((await tab(A.page, "日誌").textContent()).includes("★"), "★ 移到日誌");
  // 換一支手機登入：直接停在日誌
  const B = await phone(browser, mock);
  await login(B.page, "climber88", "password1", "/me");
  await B.page.waitForTimeout(1200);
  assert.equal(await selected(B.page), "日誌", "換手機也一樣");
  // 網址指定分頁優先
  await B.page.goto(`${BASE}/me?tab=all`, { waitUntil: "networkidle" });
  await B.page.waitForTimeout(800);
  assert.equal(await selected(B.page), "全部", "?tab=all 打開全部");
  assert.deepEqual([...A.errors, ...B.errors], []);
});

test("訓練日誌：這週目標圈（預設 2 天、改成 3 天）、連續週數、我的專案（來了幾天、試了幾次、換線前 3 天變橘色），點專案打開卡片記試了幾次", async () => {
  const { mock, me, p1 } = setup();
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me");
  await page.waitForTimeout(1500);
  const week = page.locator('main section[aria-label="這週目標"]');
  const w = flat(await week.textContent());
  assert.ok(w.includes("這週目標：爬2天"), `預設 2 天（${w}）`);
  assert.ok(w.includes("這週完攀3條"), `這週完攀（${w}）`);
  assert.match(w, /連續\d+週/, "連續週數");
  assert.equal(await week.locator('[aria-label="週' + "一二三四五六日"[((new Date(`${taipeiDay(0)}T00:00:00Z`).getUTCDay() + 6) % 7)] + '有爬"]').count(), 1, "今天有爬");
  // 改目標：3 天
  await week.getByRole("button", { name: "改" }).click();
  await week.getByRole("radio", { name: "每週 3 天" }).click();
  await page.waitForTimeout(500);
  assert.equal(mock.db.trainingSettings.find((s) => s.user_id === me)?.week_goal, 3, "存進帳號");
  assert.ok(flat(await week.textContent()).includes("這週目標：爬3天"));

  // 我的專案：快換線的排前面、變橘色；來了幾天、試了幾次
  const cards = await page.locator("main li button", { hasText: "換線" }).allTextContents();
  assert.equal(cards.length, 2, "兩條專案");
  assert.ok(flat(cards[0]).includes("明德") && flat(cards[0]).includes("2天後換線") && flat(cards[0]).includes("來了2天・試了10次"), `專案一（${flat(cards[0])}）`);
  assert.ok(flat(cards[1]).includes("萬華") && flat(cards[1]).includes("20天後換線"), `專案二（${flat(cards[1])}）`);
  assert.equal(await page.locator("main li button", { hasText: "2 天後換線" }).locator(".text-warn").count(), 1, "快換線的變橘色");
  assert.equal(await page.locator("main li button", { hasText: "20 天後換線" }).locator(".text-warn").count(), 0);

  // 點專案：打開路線卡片，記試了幾次（是攀爬日那天的）
  await page.locator("main li button", { hasText: "2 天後換線" }).click();
  await page.waitForTimeout(800);
  const dlg = page.getByRole("dialog");
  const stepper = dlg.getByRole("group", { name: `${md(taipeiDay(-2))} 試了幾次` });
  assert.equal(flat(await stepper.textContent()).replace(/[－＋]/g, ""), `${md(taipeiDay(-2))}試了幾次4`, "帶著那天的次數");
  await stepper.getByRole("button", { name: "多一次" }).click();
  await page.waitForTimeout(600);
  assert.equal(mock.db.ascents.find((a) => a.route_id === p1.id).tries, 5, "存進紀錄");
  assert.equal(mock.db.climbDays.find((c) => c.route_id === p1.id && c.day === taipeiDay(-2)).tries, 5, "那天的紀錄跟著改");
  assert.deepEqual(errors, []);
});

test("訓練日誌：日誌時間軸（路線自動帶入、試了幾天的過程、里程碑）、寫日誌、公開到人物卡、別人看得到、店長隱藏", async () => {
  const { mock, me, v4 } = setup();
  const viewer = mock.addUser("viewer01", "password1", { nickname: "阿明" });
  const mgr = mock.addUser("manager1", "password1", { nickname: "店長" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "mingde", role: "manager" });
  mock.addComment(me, v4, "紅色那條終於過了");
  void viewer;
  // 別人公開到人物卡的同一天日誌和路線：不能混進我的日誌（資料庫讓大家讀得到公開的，畫面要只讀自己的）
  const other = mock.addUser("other22", "password1", { nickname: "阿華", card_public: true });
  mock.addAscent(other, v4, "flash", taipeiDay(0));
  mock.db.trainingDays.push({ user_id: other, day: taipeiDay(0), feel: 5, hours: 3, kinds: ["play"], note: "別人的日誌", is_public: true, updated_at: new Date().toISOString() });
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me?tab=log");
  await page.waitForTimeout(1500);
  assert.equal(await selected(page), "日誌");
  const today = page.locator(`main section[aria-label^="今天"]`);
  const t = flat(await today.textContent());
  assert.ok(t.includes("明德"), `去了哪館（${t}）`);
  assert.ok(t.includes(`第3天・${md(taipeiDay(-7))}5次→${md(taipeiDay(-3))}3次→今天2次`), `試了幾天的過程（${t}）`);
  assert.ok(t.includes("第一次就上"), "Flash 寫第一次就上");
  assert.ok(t.includes("完攀3・Flash1"), `完攀數（${t}）`);
  assert.ok((await page.textContent("main")).includes("第一次完攀！"), "里程碑");
  assert.ok(!(await page.textContent("main")).includes("別人的日誌"), "別人公開的日誌不會混進來");
  assert.ok(!t.includes("只是來玩"), "別人的日誌內容不會出現在我的今天");
  // 之前試的那幾天也有自己一張卡
  assert.equal(await page.locator(`main section[aria-label^="${+taipeiDay(-3).slice(5, 7)}/${+taipeiDay(-3).slice(8, 10)}（"]`).count(), 1, "3 天前那天");

  // 寫今天的日誌：感覺 4、2 小時、抱石＋指力板、一句話、公開到人物卡
  await today.getByRole("button", { name: "＋ 寫日誌" }).click();
  await today.getByRole("radio", { name: "感覺 4 分" }).click();
  await today.getByRole("button", { name: "2 小時" }).click();
  await today.getByRole("button", { name: "抱石" }).click();
  await today.getByRole("button", { name: "指力板" }).click();
  await today.locator("textarea").fill("紅色那條第三手終於抓住");
  await today.getByRole("switch", { name: "公開到人物卡" }).click();
  await today.getByRole("button", { name: "儲存日誌" }).click();
  await page.waitForTimeout(600);
  const saved = mock.db.trainingDays.find((x) => x.user_id === me && x.day === taipeiDay(0));
  assert.deepEqual([saved.feel, saved.hours, saved.kinds, saved.note, saved.is_public], [4, 2, ["boulder", "board"], "紅色那條第三手終於抓住", true]);
  const t2 = flat(await today.textContent());
  assert.ok(t2.includes("2小時・抱石・指力板") && t2.includes("紅色那條第三手終於抓住") && t2.includes("公開到人物卡"), `存好顯示（${t2}）`);
  // 不能放網址
  await today.getByRole("button", { name: "編輯日誌" }).click();
  await today.locator("textarea").fill("看 evil.com");
  await today.getByRole("button", { name: "儲存日誌" }).click();
  await page.waitForTimeout(500);
  assert.ok((await page.textContent("body")).includes("日誌不能放網址"));
  assert.equal(mock.db.trainingDays.find((x) => x.user_id === me).note, "紅色那條第三手終於抓住", "沒存進去");

  // 別人從留言點名字看人物卡：看得到公開的日誌（那天的路線、一句話），私人心得不會出現
  const openCard = async (p) => {
    await p.goto(`${BASE}/zone?id=${v4.zone_id}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(500);
    await p.locator("main ul li button", { hasText: v4.code }).click();
    await p.waitForTimeout(700);
    await p.click('[role=dialog] [role=tab]:has-text("留言")');
    await p.click('[role=dialog] button:text-is("小安")');
    await p.waitForTimeout(800);
    return p.locator("[role=dialog]").last();
  };
  const V = await phone(browser, mock);
  await login(V.page, "viewer01");
  const card = await openCard(V.page);
  const c = flat(await card.textContent());
  assert.ok(c.includes("公開的日誌") && c.includes("紅色那條第三手終於抓住"), `公開的日誌（${c}）`);
  assert.ok(!c.includes("隱藏不當的日誌"), "顧客沒有隱藏");
  // 店長隱藏（按兩次）
  const M = await phone(browser, mock);
  await login(M.page, "manager1");
  const mc = await openCard(M.page);
  await mc.getByRole("button", { name: "隱藏不當的日誌（店長）" }).click();
  await mc.getByRole("button", { name: "確定改成不公開？再按一次" }).click();
  await M.page.waitForTimeout(500);
  assert.equal(mock.db.trainingDays.find((x) => x.user_id === me).is_public, false, "改成不公開");
  assert.ok(mock.db.audit.some((a) => a.action === "diary.hide"), "操作紀錄");
  assert.deepEqual([...errors, ...V.errors, ...M.errors], []);
});

test("訓練日誌：攀爬日點一天寫日誌（月曆黃點）、積分改成這週和連續週數、全部（難度金字塔、路線進度只列有完成的）、帳號收成一行", async () => {
  const { mock, me } = setup();
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me?tab=month");
  await page.waitForTimeout(1500);
  const main = flat(await page.textContent("main"));
  assert.ok(main.includes("這週") && main.includes("連續週數") && !main.includes("連續天數"), "積分：這週、連續週數");
  const d = +taipeiDay(0).slice(8, 10);
  const m = +taipeiDay(0).slice(5, 7);
  const day = page.locator(`main button[aria-label^="${m}/${d} 完攀"]`);
  await day.click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "＋ 寫這天的日誌" }).click();
  await page.locator("main textarea").fill("今天手感很好");
  await page.getByRole("button", { name: "儲存日誌" }).click();
  await page.waitForTimeout(700);
  assert.equal(mock.db.trainingDays.find((x) => x.user_id === me)?.note, "今天手感很好");
  assert.ok((await page.locator("main section[aria-label$='攀爬紀錄']").textContent()).includes("今天手感很好"), "那天顯示日誌");
  assert.equal(await day.locator("[data-diary]").count(), 1, "月曆黃點");

  // 全部：累計完攀 → 難度金字塔 → 路線進度（只列有完成的難度）
  await tab(page, "全部").click();
  await page.waitForTimeout(800);
  const all = await page.textContent("main");
  const at = (w) => all.indexOf(w);
  assert.ok(at("累計完攀") < at("難度金字塔") && at("難度金字塔") < at("路線進度"), "由上而下");
  const pyr = page.locator('main section[aria-label="難度金字塔"]');
  assert.deepEqual(await pyr.locator("[data-grade]").evaluateAll((els) => els.map((e) => +e.dataset.grade)), [4, 3, 2], "最難的完攀在最上面");
  const bo = page.locator('main section[aria-label="抱石"]');
  assert.equal(await bo.locator('button[aria-expanded]:has(span:text-is("V5"))').count(), 0, "沒完成的難度先收起來");
  await bo.getByRole("button", { name: /個難度還沒完成/ }).click();
  assert.equal(await bo.locator('button[aria-expanded]:has(span:text-is("V5"))').count(), 1, "點了全部打開");

  // 帳號收成一行
  assert.equal(await page.getByRole("button", { name: "登出" }).count(), 0, "登出先收起來");
  await page.getByRole("button", { name: /帳號設定/ }).click();
  assert.equal(await page.getByRole("button", { name: "登出" }).count(), 1, "點了打開");
  assert.deepEqual(errors, []);
});

test("訓練日誌：還沒套用 step51 時停在這個月、這週和日誌寫還沒開放、積分照舊、路線卡片沒有試了幾次", async () => {
  const { mock, v3 } = setup();
  mock.state.noTraining = true;
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me");
  await page.waitForTimeout(1500);
  assert.equal(await selected(page), "這個月");
  const main = await page.textContent("main");
  assert.ok(main.includes("連續天數") && main.includes("今天"), "積分照舊");
  assert.equal(await page.getByRole("button", { name: "☆ 設成主頁" }).count(), 0, "不能設主頁");
  await tab(page, "這週").click();
  await page.waitForTimeout(300);
  assert.ok((await page.textContent("main")).includes("訓練日誌還沒開放"));
  // 路線卡片照常記錄，沒有試了幾次
  await page.goto(`${BASE}/zone?id=${v3.zone_id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.locator("main ul li button", { hasText: v3.code }).click();
  await page.waitForTimeout(700);
  assert.equal(await page.getByRole("dialog").getByRole("group", { name: /試了幾次/ }).count(), 0);
  await page.getByRole("dialog").getByRole("button", { name: "完攀" }).click();
  await page.waitForTimeout(500);
  assert.equal(mock.db.ascents.find((a) => a.route_id === v3.id).status, "send", "照常存");
  assert.deepEqual(errors, []);
});
