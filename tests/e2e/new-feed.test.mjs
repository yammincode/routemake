// New~：大家最新的影片、留言（所有開放的館）：今天的隨機排、不到 10 筆用之前的補滿、超過 10 筆可以換一批；點了在這頁打開路線卡片
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const DAY = 24 * 60;
// 今天（台北時間）已經過了幾分鐘：「今天」的資料放在這之內，才不會跨到昨天
const todayMin = () => {
  const t = new Date(Date.now() + 8 * 3600000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
};
const within = (i) => Math.min(i, Math.max(0, todayMin() - 1)); // 今天第 i 分鐘前（凌晨也還在今天）
// 沒開放的館（中壢）加一區一條路線
function closedGymRoute(mock) {
  const z = { ...mock.db.zones[0], id: "00000000-0000-4000-8000-00000000c601", gym_id: "g6", code: "A", name: "A 區", route_seq: 0 };
  mock.db.zones.push(z);
  return mock.addRoute(z, 3, "紅");
}

test("New~ 影片：今天的隨機排、不到 10 支用之前的補滿；寫店名・區域・路線；看這條路線打開卡片停在影片分頁；沒開放的館不出現；不用登入", async () => {
  const mock = createMock();
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const mingde = mock.db.zones[0];
  const r1 = mock.addRoute(mingde, 4, "藍");
  const zh = mock.db.zones.find((z) => z.gym_id === "g3" && z.code === "A");
  const r2 = mock.addRoute(zh, 108, "紅");
  const xd = mock.db.zones.find((z) => z.gym_id === "g5" && z.code === "A");
  const r3 = mock.addRoute(xd, 2, "黃");
  mock.addVideo(other, r1, { caption: "今天明德", created_at: ago(within(1)) });
  mock.addVideo(other, r2, { caption: "今天中和", created_at: ago(within(2)) });
  mock.addVideo(other, r3, { caption: "今天新店", created_at: ago(within(3)) });
  for (let i = 1; i <= 12; i++) mock.addVideo(other, r1, { caption: `之前 ${i}`, created_at: ago(DAY * 2 + i * 10) });
  mock.addVideo(other, closedGymRoute(mock), { caption: "沒開放的館", created_at: ago(within(1)) });

  const { page: c, errors } = await phone(browser, mock);
  await c.goto(BASE + "/new", { waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  assert.deepEqual(await c.locator("nav a").allTextContents(), ["館內路線", "New~", "人物卡", "我的紀錄"], "底部多一個 New~");
  assert.equal(await c.getAttribute('nav a:has-text("New~")', "aria-current"), "page");
  const rows = c.locator('[role=tabpanel]:not([hidden]) li button[aria-label^="播放"]');
  assert.equal(await rows.count(), 10, "最多 10 支");
  const texts = await rows.allTextContents();
  assert.deepEqual(texts.slice(0, 3).map((t) => t.match(/今天(明德|中和|新店)/)?.[0]).sort(), ["今天中和", "今天新店", "今天明德"], "今天的 3 支在前面");
  assert.deepEqual(texts.slice(3).map((t) => t.match(/之前 \d+/)?.[0]), ["之前 1", "之前 2", "之前 3", "之前 4", "之前 5", "之前 6", "之前 7"], "不到 10 支用之前最新的補滿");
  const page = await c.textContent("main");
  assert.ok(page.includes("今天新分享（3 支）") && page.includes("今天不到 10 支，補上最近的"), "分兩段");
  assert.ok(!page.includes("沒開放的館"), "沒開放的館不出現");
  assert.ok(!page.includes("換一批"), "今天不到 10 支沒有換一批");
  const zhRow = rows.filter({ hasText: "今天中和" });
  assert.ok((await zhRow.textContent()).includes(`中和館・A 區・${r2.code}`), "寫店名・區域・路線");

  // 點影片全螢幕播放 →「看這條路線 ›」在這頁打開路線卡片、停在影片分頁
  await zhRow.click();
  const viewer = c.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  assert.ok((await viewer.textContent()).includes(`中和館・A 區・${r2.code}`), "播放畫面也寫哪條路線");
  await viewer.locator('button:has-text("看這條路線")').click();
  await c.waitForTimeout(500);
  assert.equal(await viewer.count(), 0, "播放關掉");
  const dialog = c.locator("[role=dialog]");
  assert.ok((await dialog.textContent()).includes(`中和館 A 區 ${r2.code}`), "打開那條路線的卡片（寫館名，因為 New~ 有各館的路線）");
  assert.match(await dialog.locator('[role=tab][aria-selected="true"]').textContent(), /影片/, "停在影片分頁");
  assert.ok(c.url().endsWith("/new"), "還在 New~");
  assert.deepEqual(errors, []);
});

test("New~ 影片：今天超過 10 支時只放今天的、可以換一批（先換還沒看過的）", async () => {
  const mock = createMock();
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const r1 = mock.addRoute(mock.db.zones[0], 4, "藍");
  for (let i = 1; i <= 13; i++) mock.addVideo(other, r1, { caption: `今天第${i}支`, created_at: ago(within(i)) });
  mock.addVideo(other, r1, { caption: "之前的", created_at: ago(DAY * 3) });

  const { page: c, errors } = await phone(browser, mock);
  await c.goto(BASE + "/new", { waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  const rows = c.locator('[role=tabpanel]:not([hidden]) li button[aria-label^="播放"]');
  const shown = async () => (await rows.allTextContents()).map((t) => t.match(/今天第\d+支|之前的/)?.[0]);
  const a = await shown();
  assert.equal(a.length, 10);
  assert.ok(a.every((t) => t?.startsWith("今天")), "只放今天的");
  const main = await c.textContent("main");
  assert.ok(main.includes("今天新分享（13 支裡隨機 10 支）") && !main.includes("補上最近的"));
  await c.click('[role=tabpanel]:not([hidden]) button:has-text("換一批")');
  await c.waitForTimeout(300);
  const b = await shown();
  const unseen = Array.from({ length: 13 }, (_, i) => `今天第${i + 1}支`).filter((t) => !a.includes(t));
  assert.ok(unseen.every((t) => b.includes(t)), `換成還沒看過的 3 支：${unseen.join("、")}`);
  assert.ok(b.every((t) => t?.startsWith("今天")) && b.length === 10);
  assert.deepEqual(errors, []);
});

test("New~ 留言：今天的隨機排、不到 10 則用之前補滿；看路線打開卡片停在留言分頁；可以按讚；刪掉的、關留言的、下架的不出現", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  const closed = mock.addRoute(zone, 3, "紅");
  closed.comments_enabled = false;
  const gone = mock.addRoute(zone, 5, "黃");
  gone.archived_at = ago(10);
  const long = "第三手好遠，矮個子可以先踩右邊那顆小點再換手；".repeat(6);
  mock.addComment(other, r1, long, { created_at: ago(within(1)) });
  for (let i = 2; i <= 4; i++) mock.addComment(other, mock.addRoute(zone, 2, "綠"), `今天留言${i}`, { created_at: ago(within(i)) });
  mock.addComment(other, r1, "被刪掉的", { created_at: ago(within(5)), deleted_at: ago(1) });
  mock.addComment(other, closed, "關留言的", { created_at: ago(within(6)) });
  mock.addComment(other, gone, "下架的", { created_at: ago(within(7)) });
  for (let i = 1; i <= 8; i++) mock.addComment(other, mock.addRoute(zone, 1, "白"), `之前留言${i}`, { created_at: ago(DAY * 2 + i * 10) });

  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", "/new");
  await c.waitForTimeout(600);
  await c.click('[role=tab]:has-text("留言")');
  await c.waitForTimeout(200);
  const panel = c.locator("[role=tabpanel]:not([hidden])");
  assert.equal(await panel.locator('button:text-is("看路線 ›")').count(), 10, "10 則");
  const text = await panel.textContent();
  for (const t of ["被刪掉的", "關留言的", "下架的"]) assert.ok(!text.includes(t), `${t}不出現`);
  assert.ok(text.includes("今天新留言（4 則）") && text.includes("今天不到 10 則，補上最近的"));
  assert.ok(["之前留言1", "之前留言6"].every((t) => text.includes(t)) && !text.includes("之前留言7"), "用之前最新的補滿");
  assert.ok(text.includes(`明德館・${zone.name}・${r1.code}`), "寫店名・區域・路線");
  const longP = panel.locator("p", { hasText: "第三手好遠" });
  assert.match(await longP.getAttribute("class"), /line-clamp-3/, "長留言最多 3 行");

  // 按讚
  const card = panel.locator("div.bg-sunk", { hasText: "今天留言2" });
  await card.locator('button[aria-label^="按讚"]').click();
  await c.waitForTimeout(400);
  assert.equal(mock.db.likes.length, 1, "按讚存起來");

  // 看路線 → 卡片停在留言分頁，看得到同一則
  await panel.locator("div.bg-sunk", { hasText: "第三手好遠" }).locator('button:text-is("看路線 ›")').click();
  await c.waitForTimeout(600);
  const dialog = c.locator("[role=dialog]");
  assert.match(await dialog.locator('[role=tab][aria-selected="true"]').textContent(), /留言/, "停在留言分頁");
  assert.ok((await dialog.textContent()).includes(long), "卡片裡是完整的留言");
  assert.deepEqual(errors, []);
});

test("New~ 打開自己記錄過的路線：卡片帶著原本的紀錄，再點狀態不會蓋掉心得；卡片裡按讚，關掉後列表也更新", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const r = mock.addRoute(mock.db.zones[0], 4, "藍");
  mock.addAscent(me, r, "project", taipeiDay(-6), { private_note: "卡在最後一手" });
  mock.addVideo(other, r, { caption: "今天的", created_at: ago(within(1)) });
  mock.addComment(other, r, "先踩右邊那顆", { created_at: ago(within(2)) });
  mock.addComment(me, mock.addRoute(mock.db.zones[0], 2, "綠"), "我自己的留言", { created_at: ago(within(3)) });
  const asc = () => mock.db.ascents.find((a) => a.route_id === r.id);

  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", "/new");
  await c.waitForTimeout(600);
  await c.locator('[role=tabpanel]:not([hidden]) li button[aria-label^="播放"]').first().click();
  const viewer = c.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  await viewer.locator('button:has-text("看這條路線")').click();
  const dialog = c.locator("[role=dialog]");
  await dialog.waitFor();
  const pressed = (label) => dialog.locator('button[aria-pressed="true"]', { hasText: label });
  await pressed("嘗試中").waitFor({ timeout: 5000 }); // 讀到自己的紀錄才顯示記錄按鈕
  assert.equal(await dialog.locator('button:text-is("完攀")').count(), 1, "只有一組狀態按鈕");
  await dialog.locator('[role=tab]:has-text("紀錄")').click();
  assert.equal(await dialog.locator("#lnote").inputValue(), "卡在最後一手", "心得在");

  // 改成完攀：心得保留、日期改今天
  await dialog.locator('button:has-text("完攀")').first().click();
  await c.waitForTimeout(500);
  assert.equal(asc().status, "send");
  assert.equal(asc().private_note, "卡在最後一手", "心得沒被蓋掉");
  assert.equal(asc().climbed_on, taipeiDay(0));
  await c.keyboard.press("Escape");
  await c.waitForTimeout(400);

  // 從留言再打開同一條：是剛剛存的「完攀」；在卡片裡按讚，關掉後 New~ 的列表也是按過的
  await c.click('[role=tab]:has-text("留言")');
  const panel = c.locator("[role=tabpanel]:not([hidden])");
  await panel.locator("div.bg-sunk", { hasText: "先踩右邊那顆" }).locator('button:text-is("看路線 ›")').click();
  await dialog.waitFor();
  await c.waitForTimeout(400);
  assert.equal(await pressed("完攀").count(), 1, "記住剛剛存的");
  await dialog.locator('button[aria-label^="按讚"]').click();
  await c.waitForTimeout(400);
  assert.equal(mock.db.likes.length, 1);
  await c.keyboard.press("Escape");
  await c.waitForTimeout(600);
  assert.equal(await panel.locator('button[aria-label="收回讚，目前 1 個讚"]').count(), 1, "列表也更新");

  // 在卡片裡刪掉自己的留言，關掉後列表也拿掉
  await panel.locator("div.bg-sunk", { hasText: "我自己的留言" }).locator('button:text-is("看路線 ›")').click();
  await dialog.locator('button:text-is("刪除")').click();
  await dialog.locator('button:text-is("確定刪除？再按一次")').click();
  await c.waitForTimeout(400);
  await c.keyboard.press("Escape");
  await c.waitForTimeout(600);
  assert.ok(!(await panel.textContent()).includes("我自己的留言"), "刪掉的留言從列表拿掉");
  assert.ok((await panel.textContent()).includes("先踩右邊那顆"), "其他的還在");
  assert.deepEqual(errors, []);
});

test("New~ 讀不到自己的紀錄：卡片寫讀不到、不能記錄，可以再試一次；Spray Wall 讀不到讚數時按讚會提示並重讀", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const r = mock.addRoute(mock.db.zones[0], 4, "藍");
  mock.addAscent(me, r, "project", taipeiDay(-6), { private_note: "卡在最後一手" });
  mock.addComment(other, r, "先踩右邊那顆", { created_at: ago(within(2)) });
  const sw = mock.db.zones.find((z) => z.gym_id === "mingde" && z.kind === "spray");
  const sr = mock.addRoute(sw, 3, "白");
  Object.assign(sr, { kind: "community", name: "阿明的路線", created_by: other, holds: [{ x: 20, y: 80, t: "s" }, { x: 60, y: 20, t: "t" }] });
  mock.addVideo(other, sr, { caption: "Spray 今天", created_at: ago(within(1)) });

  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", "/new");
  await c.waitForTimeout(600);
  const dialog = c.locator("[role=dialog]");
  const close = async () => {
    await c.keyboard.press("Escape");
    await c.waitForTimeout(400);
  };

  // 讀紀錄失敗：不顯示記錄按鈕（不會蓋掉心得），按「再試一次」讀到了才顯示
  mock.state.ascentsReadFail = true;
  await c.click('[role=tab]:has-text("留言")');
  await c.locator('[role=tabpanel]:not([hidden]) button:text-is("看路線 ›")').click();
  await dialog.locator("text=讀不到你在這條路線的紀錄").waitFor({ timeout: 5000 });
  assert.equal(await dialog.locator('button:text-is("完攀")').count(), 0, "讀不到時不能記錄");
  assert.ok((await dialog.textContent()).includes(`明德館・${mock.db.zones[0].name}・${r.code}`), "寫是哪條路線");
  mock.state.ascentsReadFail = false;
  await dialog.locator('button:has-text("再試一次")').click();
  await dialog.locator('button[aria-pressed="true"]', { hasText: "嘗試中" }).waitFor({ timeout: 5000 });
  await dialog.locator('[role=tab]:has-text("紀錄")').click();
  assert.equal(await dialog.locator("#lnote").inputValue(), "卡在最後一手");
  assert.equal(mock.db.ascents.find((a) => a.route_id === r.id).private_note, "卡在最後一手", "心得沒被動到");
  await close();

  // Spray Wall：讀不到讚數 → 按讚提示並重讀 → 讀到出題者、可以按讚
  mock.state.routeLikesReadFail = true;
  await c.click('[role=tab]:has-text("影片")');
  await c.locator('[role=tabpanel]:not([hidden]) li button[aria-label^="播放"]', { hasText: "Spray 今天" }).click();
  const failedLikes = c.waitForResponse((res) => res.url().includes("/rest/v1/route_likes") && res.status() === 500);
  await c.locator('[aria-label="影片播放"] button:has-text("看這條路線")').click();
  await dialog.waitFor();
  await failedLikes;
  await c.waitForTimeout(200);
  mock.state.routeLikesReadFail = false;
  const like = dialog.locator("button", { hasText: "👍" }).first();
  await like.click();
  await c.waitForTimeout(400);
  assert.match(await c.locator("[role=status]").last().textContent(), /讀不到讚數/);
  assert.equal(mock.db.routeLikes.length, 0, "讀不到時不會亂按");
  await dialog.locator("text=阿明 出的").waitFor({ timeout: 5000 });
  await like.click();
  await c.waitForTimeout(400);
  assert.equal(mock.db.routeLikes.length, 1, "重讀後可以按讚");
  assert.equal(await like.getAttribute("aria-pressed"), "true");
  assert.equal((await like.textContent()).replace(/\D/g, ""), "1");
  assert.deepEqual(errors, []);
});

test("New~ 留言：按讚後換一批，再出現時還是按過的", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  for (let i = 1; i <= 13; i++) mock.addComment(other, mock.addRoute(zone, 2, "綠"), `今天留言第${i}則`, { created_at: ago(within(i)) });

  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", "/new");
  await c.waitForTimeout(600);
  await c.click('[role=tab]:has-text("留言")');
  const panel = c.locator("[role=tabpanel]:not([hidden])");
  const first = (await panel.locator("div.bg-sunk p").first().textContent()).match(/今天留言第\d+則/)[0];
  const card = () => panel.locator("div.bg-sunk", { has: c.locator(`p:text-is("${first}")`) });
  await card().locator('button[aria-label^="按讚"]').click();
  await c.waitForTimeout(400);
  assert.equal(mock.db.likes.length, 1);
  // 換到那一則再出現為止（一輪 13 則、一次 10 則，幾次內一定會再出現）
  let back = false;
  for (let k = 0; k < 12 && !back; k++) {
    await panel.locator('button:has-text("換一批")').click();
    await c.waitForTimeout(150);
    back = (await card().count()) === 1;
  }
  assert.ok(back, `「${first}」換一批後有再出現`);
  assert.equal(await card().locator('button[aria-label="收回讚，目前 1 個讚"]').count(), 1, "還是按過的");
  assert.deepEqual(errors, []);
});

test("New~ 訊號差：卡片馬上打開寫讀取中、不能記錄；關掉去看影片，讀到了也不會跳出卡片；上次讀不到、再打開是讀取中；Spray Wall 讚數還沒讀到時按讚提示讀取中", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const r = mock.addRoute(mock.db.zones[0], 4, "藍");
  mock.addAscent(me, r, "project", taipeiDay(-6), { private_note: "卡在最後一手" });
  mock.addComment(other, r, "先踩右邊那顆", { created_at: ago(within(2)) });
  mock.addVideo(other, r, { caption: "藍色今天", created_at: ago(within(1)) });
  const sw = mock.db.zones.find((z) => z.gym_id === "mingde" && z.kind === "spray");
  const sr = mock.addRoute(sw, 3, "白");
  Object.assign(sr, { kind: "community", name: "阿明的路線", created_by: other, holds: [{ x: 20, y: 80, t: "s" }, { x: 60, y: 20, t: "t" }] });
  mock.addVideo(other, sr, { caption: "Spray 今天", created_at: ago(within(3)) });

  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", "/new");
  await c.waitForTimeout(600);
  const dialog = c.locator("[role=dialog]");
  const viewer = c.locator('[aria-label="影片播放"]');
  const openComment = async () => {
    await c.click('[role=tab]:has-text("留言")');
    await c.locator('[role=tabpanel]:not([hidden]) button:text-is("看路線 ›")').click();
    await dialog.waitFor();
    await c.waitForTimeout(300);
  };

  // 讀紀錄很慢：卡片馬上打開、寫讀取中、沒有記錄按鈕
  mock.state.readDelay = { ascents: 2000 };
  await openComment();
  assert.ok((await dialog.textContent()).includes("讀取中"), "馬上打開、寫讀取中");
  assert.equal(await dialog.locator('button:text-is("完攀")').count(), 0, "還沒讀到不能記錄");
  // 等不及關掉、去看影片：讀到了也不會跳出卡片、不會關掉影片
  await c.keyboard.press("Escape");
  await c.click('[role=tab]:has-text("影片")');
  await c.locator('[role=tabpanel]:not([hidden]) li button[aria-label^="播放"]', { hasText: "藍色今天" }).click();
  await viewer.waitFor();
  await c.waitForTimeout(2500);
  assert.equal(await viewer.count(), 1, "影片還在播");
  assert.equal(await c.locator('[role=dialog]:not([aria-label="影片播放"])').count(), 0, "卡片沒有自己跳出來（播放畫面也是 dialog，不算）");
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);

  // 上次讀不到，關掉再打開同一條：先寫讀取中（不是上次的讀不到），讀到就顯示記錄按鈕
  mock.state.readDelay = {};
  mock.state.ascentsReadFail = true;
  await openComment();
  await dialog.locator("text=讀不到你在這條路線的紀錄").waitFor({ timeout: 5000 });
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);
  mock.state.ascentsReadFail = false;
  mock.state.readDelay = { ascents: 1500 };
  await openComment();
  const t = await dialog.textContent();
  assert.ok(t.includes("讀取中") && !t.includes("讀不到"), "再打開是讀取中：" + t.slice(0, 60));
  await dialog.locator('button[aria-pressed="true"]', { hasText: "嘗試中" }).waitFor({ timeout: 5000 });
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);

  // Spray Wall：讚數還沒讀到時按讚 → 提示讀取中、不會亂按；讀到了才按得到
  mock.state.readDelay = { route_likes: 2500 };
  await c.click('[role=tab]:has-text("影片")');
  await c.locator('[role=tabpanel]:not([hidden]) li button[aria-label^="播放"]', { hasText: "Spray 今天" }).click();
  await viewer.locator('button:has-text("看這條路線")').click();
  await dialog.locator('button[aria-pressed="false"]', { hasText: "完攀" }).waitFor({ timeout: 5000 });
  const like = dialog.locator("button", { hasText: "👍" }).first();
  await like.click();
  await c.waitForTimeout(300);
  assert.match(await c.locator("[role=status]").last().textContent(), /讀取中，請稍後再按/);
  assert.equal(mock.db.routeLikes.length, 0);
  await dialog.locator("text=阿明 出的").waitFor({ timeout: 5000 });
  await like.click();
  await c.waitForTimeout(400);
  assert.equal(mock.db.routeLikes.length, 1, "讀到了才按得到");
  assert.deepEqual(errors, []);
});
