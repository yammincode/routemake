// New~：大家最新的影片（所有開放的館；10/21 拿掉留言分頁）：今天的隨機排、不到 10 筆用之前的補滿、超過 10 筆可以換一批；
// 看路線跳到區域頁標出那一條、回來照原樣；Spray Wall 的路線照舊在這頁打開卡片
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
// Spray Wall 上岩友出的路線（New~ 點了照舊在這頁打開卡片）
function sprayRoute(mock, by, name, grade = 4) {
  const sw = mock.db.zones.find((z) => z.gym_id === "mingde" && z.kind === "spray");
  const r = mock.addRoute(sw, grade, "白");
  return Object.assign(r, { kind: "community", name, created_by: by, holds: [{ x: 20, y: 80, t: "s" }, { x: 60, y: 20, t: "t" }] });
}
// 跳到區域頁：網址帶那條路線、照片上那個點標出來（其他變淡）、一下子後打開卡片停在紀錄；返回寫「‹ New~」
async function landedOnZone(c, zone, r) {
  await c.waitForURL((u) => u.pathname === "/zone");
  const u = new URL(c.url());
  assert.deepEqual([u.searchParams.get("id"), u.searchParams.get("route"), u.searchParams.get("from")], [zone.id, r.id, "new"], "跳到那條路線的區域頁");
  const pin = c.locator('main button[aria-current="true"]');
  await pin.waitFor();
  assert.ok((await pin.getAttribute("aria-label")).endsWith(r.code), "照片上標出那一條");
  const dialog = c.locator("[role=dialog]");
  await dialog.waitFor({ timeout: 5000 });
  assert.ok((await dialog.textContent()).includes(r.code), "打開那條路線的卡片");
  assert.match(await dialog.locator('[role=tab][aria-selected="true"]').textContent(), /紀錄/, "停在紀錄分頁");
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);
  assert.equal(await c.locator('main button[aria-current="true"]').count(), 1, "關掉卡片黃圈還在");
}
function closedGymRoute(mock) {
  const z = { ...mock.db.zones[0], id: "00000000-0000-4000-8000-00000000c601", gym_id: "g6", code: "A", name: "A 區", route_seq: 0 };
  mock.db.zones.push(z);
  return mock.addRoute(z, 3, "紅");
}

test("New~ 影片：今天的隨機排、不到 10 支用之前的補滿；寫店名・區域・路線；看這條路線跳到區域頁標出那一條、返回照原樣；沒開放的館不出現；不用登入", async () => {
  const mock = createMock();
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const mingde = mock.db.zones[0];
  const r1 = mock.addRoute(mingde, 4, "藍");
  const zh = mock.db.zones.find((z) => z.gym_id === "g3" && z.code === "A");
  const r2 = mock.addRoute(zh, 108, "紅");
  zh.photo_path = "g3/zones/A-1.jpg"; // 有照片才有點可以標
  const xd = mock.db.zones.find((z) => z.gym_id === "g5" && z.code === "A1");
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
  const rows = c.locator('main li button[aria-label^="播放"]');
  assert.equal(await rows.count(), 10, "最多 10 支");
  assert.equal(await c.locator("main video").count(), 0, "省流量：列表只放縮圖，沒有 <video>（按了才下載影片）");
  const texts = await rows.allTextContents();
  assert.deepEqual(texts.slice(0, 3).map((t) => t.match(/今天(明德|中和|新店)/)?.[0]).sort(), ["今天中和", "今天新店", "今天明德"], "今天的 3 支在前面");
  assert.deepEqual(texts.slice(3).map((t) => t.match(/之前 \d+/)?.[0]), ["之前 1", "之前 2", "之前 3", "之前 4", "之前 5", "之前 6", "之前 7"], "不到 10 支用之前最新的補滿");
  const page = await c.textContent("main");
  assert.ok(page.includes("今天新分享（3 支）") && page.includes("今天不到 10 支，補上最近的"), "分兩段");
  assert.ok(!page.includes("沒開放的館"), "沒開放的館不出現");
  assert.ok(!page.includes("換一批"), "今天不到 10 支沒有換一批");
  const zhRow = rows.filter({ hasText: "今天中和" });
  assert.ok((await zhRow.textContent()).includes(`中和館・A 區・${r2.code}`), "寫店名・區域・路線");

  // 點影片全螢幕播放 →「看這條路線 ›」跳到中和 A 區的區域頁、標出那一條
  await zhRow.click();
  const viewer = c.locator('[aria-label="影片播放"]');
  await viewer.waitFor();
  assert.ok((await viewer.textContent()).includes(`中和館・A 區・${r2.code}`), "播放畫面也寫哪條路線");
  await viewer.locator('button:has-text("看這條路線")').click();
  await landedOnZone(c, zh, r2);
  assert.equal(await viewer.count(), 0, "播放關掉");

  // 「‹ New~」回來：同一批、同一個順序（不重新洗牌）
  await c.locator('main button:has-text("New~")').first().click();
  await c.waitForURL((u) => u.pathname === "/new");
  await rows.first().waitFor();
  assert.deepEqual(await rows.allTextContents(), texts, "回來還是同一批、同一個順序");
  // 再打開一次 New~（不是從區域頁回來）照常重新洗牌：記下的只用一次
  assert.equal(await c.evaluate(() => sessionStorage.getItem("routemake-new-back")), null, "記下的用過就丟");
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
  const rows = c.locator('main li button[aria-label^="播放"]');
  const shown = async () => (await rows.allTextContents()).map((t) => t.match(/今天第\d+支|之前的/)?.[0]);
  const a = await shown();
  assert.equal(a.length, 10);
  assert.ok(a.every((t) => t?.startsWith("今天")), "只放今天的");
  const main = await c.textContent("main");
  assert.ok(main.includes("今天新分享（13 支裡隨機 10 支）") && !main.includes("補上最近的"));
  await c.click('main button:has-text("換一批")');
  await c.waitForTimeout(300);
  const b = await shown();
  const unseen = Array.from({ length: 13 }, (_, i) => `今天第${i + 1}支`).filter((t) => !a.includes(t));
  assert.ok(unseen.every((t) => b.includes(t)), `換成還沒看過的 3 支：${unseen.join("、")}`);
  assert.ok(b.every((t) => t?.startsWith("今天")) && b.length === 10);
  assert.deepEqual(errors, []);
});

test("New~ 只有影片（10/21 拿掉留言分頁）：沒有「影片｜留言」切換、留言不出現", async () => {
  const mock = createMock();
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const r = mock.addRoute(mock.db.zones[0], 2, "綠");
  mock.addComment(other, r, "今天的留言", { created_at: ago(within(1)) });
  mock.addVideo(other, r, { caption: "今天的影片", created_at: ago(within(2)) });

  const { page: c, errors } = await phone(browser, mock);
  await c.goto(BASE + "/new", { waitUntil: "networkidle" });
  await c.waitForTimeout(600);
  assert.equal(await c.locator("main [role=tab]").count(), 0, "沒有影片｜留言切換");
  const t = await c.textContent("main");
  assert.ok(t.includes("今天的影片") && !t.includes("今天的留言"), "只有影片");
  assert.deepEqual(errors, []);
});

test("New~ 打開自己記錄過的 Spray Wall 路線（照舊在這頁打開卡片）：卡片帶著原本的紀錄，再點狀態不會蓋掉心得；卡片裡按讚，關掉後列表也更新", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const r = sprayRoute(mock, other, "阿明的路線");
  mock.addAscent(me, r, "project", taipeiDay(-6), { private_note: "卡在最後一手" });
  mock.addVideo(other, r, { caption: "今天的", created_at: ago(within(1)) });
  mock.addVideo(other, r, { caption: "先踩右邊那顆", created_at: ago(within(2)) });
  mock.addVideo(me, sprayRoute(mock, other, "阿明的第二條", 2), { caption: "我自己的影片", created_at: ago(within(3)) });
  const asc = () => mock.db.ascents.find((a) => a.route_id === r.id);

  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", "/new");
  await c.waitForTimeout(600);
  const play = (t) => c.locator('main li button[aria-label^="播放"]', { hasText: t }).click();
  await play("今天的");
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

  // 從另一支影片再打開同一條：是剛剛存的「完攀」；在卡片裡按讚，關掉後 New~ 的列表也是按過的
  const panel = c.locator("main");
  await play("先踩右邊那顆");
  await viewer.locator('button:has-text("看這條路線")').click();
  await dialog.waitFor();
  await c.waitForTimeout(400);
  assert.equal(await pressed("完攀").count(), 1, "記住剛剛存的");
  await dialog.locator('[role=tab]:has-text("影片")').click();
  await dialog.locator('li', { hasText: "先踩右邊那顆" }).locator('button[aria-label^="按讚"]').click();
  await c.waitForTimeout(400);
  assert.equal(mock.db.videoLikes.length, 1);
  await c.keyboard.press("Escape");
  await c.waitForTimeout(600);
  assert.equal(await panel.locator("li", { hasText: "先踩右邊那顆" }).locator('button[aria-label="收回讚，目前 1 個讚"]').count(), 1, "列表也更新");

  // 在卡片裡刪掉自己的影片，關掉後列表也拿掉
  await play("我自己的影片");
  await viewer.locator('button:has-text("看這條路線")').click();
  await dialog.waitFor();
  await dialog.locator('[role=tab]:has-text("影片")').click();
  await dialog.locator('li button[aria-label^="播放"]', { hasText: "我自己的影片" }).click();
  await c.locator('button:has-text("刪除這支影片")').click();
  await c.locator('button:has-text("確定刪除？再按一次")').click();
  await c.waitForTimeout(500);
  await c.keyboard.press("Escape");
  await c.waitForTimeout(300);
  if (await dialog.count()) await c.keyboard.press("Escape");
  await c.waitForTimeout(600);
  assert.ok(!(await panel.textContent()).includes("我自己的影片"), "刪掉的影片從列表拿掉");
  assert.ok((await panel.textContent()).includes("先踩右邊那顆"), "其他的還在");
  assert.deepEqual(errors, []);
});

test("New~ 讀不到自己的紀錄（Spray Wall 的卡片）：卡片寫讀不到、不能記錄，可以再試一次；Spray Wall 讀不到讚數時按讚會提示並重讀", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const r = sprayRoute(mock, other, "阿明的難路線");
  mock.addAscent(me, r, "project", taipeiDay(-6), { private_note: "卡在最後一手" });
  mock.addVideo(other, r, { caption: "先踩右邊那顆", created_at: ago(within(2)) });
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
  await c.locator('main li button[aria-label^="播放"]', { hasText: "先踩右邊那顆" }).click();
  await c.locator('[aria-label="影片播放"] button:has-text("看這條路線")').click();
  await dialog.locator("text=讀不到你在這條路線的紀錄").waitFor({ timeout: 5000 });
  assert.equal(await dialog.locator('button:text-is("完攀")').count(), 0, "讀不到時不能記錄");
  assert.ok((await dialog.textContent()).includes("明德館・Spray Wall・阿明的難路線"), "寫是哪條路線");
  mock.state.ascentsReadFail = false;
  await dialog.locator('button:has-text("再試一次")').click();
  await dialog.locator('button[aria-pressed="true"]', { hasText: "嘗試中" }).waitFor({ timeout: 5000 });
  await dialog.locator('[role=tab]:has-text("紀錄")').click();
  assert.equal(await dialog.locator("#lnote").inputValue(), "卡在最後一手");
  assert.equal(mock.db.ascents.find((a) => a.route_id === r.id).private_note, "卡在最後一手", "心得沒被動到");
  await close();

  // Spray Wall：讀不到讚數 → 按讚提示並重讀 → 讀到出題者、可以按讚
  mock.state.routeLikesReadFail = true;
    await c.locator('main li button[aria-label^="播放"]', { hasText: "Spray 今天" }).click();
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

test("New~ 影片：按讚後換一批，再出現時還是按過的", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  for (let i = 1; i <= 13; i++) mock.addVideo(other, mock.addRoute(zone, 2, "綠"), { caption: `今天第${i}支`, created_at: ago(within(i)) });

  const { page: c, errors } = await phone(browser, mock);
  await login(c, "climber88", "password1", "/new");
  await c.waitForTimeout(600);
  const panel = c.locator("main");
  const first = (await panel.locator('li button[aria-label^="播放"]').first().textContent()).match(/今天第\d+支/)[0];
  const card = () => panel.locator("li", { hasText: new RegExp(`${first}(?!\\d)`) });
  await card().locator('button[aria-label^="按讚"]').click();
  await c.waitForTimeout(400);
  assert.equal(mock.db.videoLikes.length, 1);
  // 換到那一支再出現為止（一輪 13 支、一次 10 支，幾次內一定會再出現）
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

test("New~ 訊號差（Spray Wall 的卡片）：卡片馬上打開寫讀取中、不能記錄；關掉去看影片，讀到了也不會跳出卡片；上次讀不到、再打開是讀取中；Spray Wall 讚數還沒讀到時按讚提示讀取中", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const r = sprayRoute(mock, other, "阿明的難路線");
  mock.addAscent(me, r, "project", taipeiDay(-6), { private_note: "卡在最後一手" });
  mock.addVideo(other, r, { caption: "先踩右邊那顆", created_at: ago(within(2)) });
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
    await c.locator('main li button[aria-label^="播放"]', { hasText: "先踩右邊那顆" }).click();
    await viewer.locator('button:has-text("看這條路線")').click();
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
    await c.locator('main li button[aria-label^="播放"]', { hasText: "藍色今天" }).click();
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
    await c.locator('main li button[aria-label^="播放"]', { hasText: "Spray 今天" }).click();
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

test("New~ 看路線：改篩選黃圈就拿掉；看的時候剛好下架了，區域頁提示已經下架；從館首頁進區域頁照舊寫館名", async () => {
  const mock = createMock();
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  zone.photo_path = "mingde/zones/A1-1.jpg";
  const r = mock.addRoute(zone, 4, "藍");
  const r2 = mock.addRoute(zone, 2, "綠");
  mock.addVideo(other, r, { caption: "藍色好玩", created_at: ago(within(1)) });
  mock.addVideo(other, r2, { caption: "綠色好玩", created_at: ago(within(2)) });

  const { page: c, errors } = await phone(browser, mock);
  await c.goto(BASE + "/new", { waitUntil: "networkidle" });
  const panel = c.locator("main");
  const look = async (t) => {
    await panel.locator('li button[aria-label^="播放"]', { hasText: t }).click();
    await c.locator('[aria-label="影片播放"] button:has-text("看這條路線")').click();
  };
  await look("藍色好玩");
  await landedOnZone(c, zone, r);
  assert.ok((await c.locator("main").textContent()).startsWith("‹ New~"), "返回寫「‹ New~」");
  await c.locator('main button:text-is("綠")').click();
  await c.waitForTimeout(200);
  assert.equal(await c.locator('main button[aria-current="true"]').count(), 0, "改篩選黃圈就拿掉");

  // 剛好下架：提示，照片上沒有標
  await c.goBack();
  await c.waitForURL((u) => u.pathname === "/new");
  await panel.locator('li button[aria-label^="播放"]').first().waitFor();
  r2.archived_at = ago(1);
  await look("綠色好玩");
  await c.waitForURL((u) => u.pathname === "/zone");
  await c.locator("[role=status]", { hasText: "這條路線已經下架了" }).waitFor({ timeout: 5000 });
  assert.equal(await c.locator('main button[aria-current="true"]').count(), 0);
  await c.waitForTimeout(1200);
  assert.equal(await c.locator("[role=dialog]").count(), 0, "不會打開卡片");

  // 從館首頁點進來的區域頁：照舊寫館名
  await c.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await c.waitForTimeout(500);
  assert.ok((await c.locator("main").textContent()).startsWith("‹ 明德館"), "平常還是「‹ 館名」");
  assert.deepEqual(errors, []);
});
