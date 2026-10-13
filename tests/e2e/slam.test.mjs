// 大滿貫兌換：牆上進度的「★ 兌換 ›」（活動關著只有老闆看得到）、兌換卡（膠帶顏色、QR code、兌換碼、條紋在動、時間在跳）、
// 員工兌換頁（核對暱稱、選館、確認兌換；顧客打開只看到說明；牆上沒有全部完成擋下；手打兌換碼）、顧客的卡自動蓋「已兌換」、
// 老闆在營運改活動設定和看兌換紀錄；資料庫還沒套用 step40 時照舊
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";
import { taipeiDay } from "./mock-supabase.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

function setup() {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const boss = mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const clerk = mock.addUser("clerk_md", "password1", { nickname: "櫃檯阿明" });
  const clerk2 = mock.addUser("clerk_wh", "password1", { nickname: "萬華櫃檯" });
  mock.db.staff_roles.push({ user_id: clerk, gym_id: "mingde", role: "setter" }, { user_id: clerk2, gym_id: "g2", role: "setter" });
  const zone = (gym, code) => mock.db.zones.find((z) => z.gym_id === gym && z.code === code);
  const created = new Date(Date.now() - 30 * 86400000).toISOString();
  const route = (z, grade) => mock.addRoute(z, grade, "紅", [], 30, 40, created);
  // V5：明德、萬華、新店各一條（3 條，測試把最少條數設 3）；V3：兩條（少於最少條數，大滿貫也不能兌換）
  const v5 = [route(zone("mingde", "A1"), 5), route(zone("g2", "A"), 5), route(zone("g5", "A1"), 5)];
  const v3 = [route(zone("mingde", "B1"), 3), route(zone("g2", "B1"), 3)];
  for (const u of [me, boss]) for (const r of [...v5, ...v3]) mock.addAscent(u, r, "send", taipeiDay(-2));
  mock.state.slam.min_routes = 3;
  return { mock, me, boss, v5, zone, route };
}
const slamBtn = (page, grade, redeemed = false) => page.locator(`main button[aria-label="${grade} 大滿貫${redeemed ? "，已兌換，看兌換卡" : "，打開兌換卡"}"]`);
const ticket = (page, grade) => page.locator(`main section[aria-label="${grade} 大滿貫兌換卡"]`);

test("活動關著：顧客看不到兌換、老闆看得到（可以先試）；牆上少於最少條數的難度沒有兌換；資料庫還沒套用 step40 時照舊", async () => {
  const { mock } = setup();
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me");
  await page.waitForTimeout(1500);
  assert.ok((await page.textContent("main")).includes("大滿貫"), "牆上進度照樣寫 ★ 大滿貫");
  assert.equal(await slamBtn(page, "V5").count(), 0, "活動關著，顧客看不到兌換");

  const boss = await phone(browser, mock);
  await login(boss.page, "boss", "password1", "/me");
  await boss.page.waitForTimeout(1500);
  assert.equal(await slamBtn(boss.page, "V5").count(), 1, "老闆看得到 V5 兌換");
  assert.equal(await slamBtn(boss.page, "V3").count(), 0, "V3 只有 2 條（最少 3 條），沒有兌換");
  assert.ok((await slamBtn(boss.page, "V5").textContent()).includes("兌換"));

  // 還沒套用 step40：沒有兌換，畫面照舊、沒有錯誤
  mock.state.noSlam = true;
  mock.state.slam.enabled = true;
  await boss.page.reload({ waitUntil: "networkidle" });
  await boss.page.waitForTimeout(1200);
  assert.equal(await slamBtn(boss.page, "V5").count(), 0, "資料庫還沒套用：不顯示兌換");
  assert.ok((await boss.page.textContent("main")).includes("大滿貫"));
  assert.deepEqual(errors, []);
  assert.deepEqual(boss.errors, []);
});

test("兌換卡：膠帶顏色、QR code、兌換碼、條紋在動、時間在跳；員工掃了確認兌換，顧客的卡自動蓋「已兌換」，我的紀錄寫已兌換", async () => {
  const { mock } = setup();
  mock.state.slam.enabled = true;
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me");
  await page.waitForTimeout(1500);
  await slamBtn(page, "V5").click();
  await page.waitForURL(/\/slam\?g=5/);
  const t = ticket(page, "V5");
  await t.waitFor();
  const text = await t.textContent();
  assert.match(text, /[A-Z2-9]{4}-[A-Z2-9]{4}/, "兌換碼 4-4");
  for (const w of ["V5", "大滿貫", "全原岩 3 條", "小安", "洽櫃檯", "前"]) assert.ok(text.includes(w), `兌換卡有「${w}」：${text}`);
  assert.equal(await t.locator('svg[role="img"]').count(), 1, "有 QR code");
  // 上半段是 V5 的膠帶顏色（紅 #D9402F）
  assert.equal(await t.locator("div").first().evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(217, 64, 47)");
  // 條紋在動、時間在跳（截圖的話不會動）
  assert.equal(await t.locator("[data-live-stripe]").evaluate((el) => getComputedStyle(el).animationName), "slam-stripe");
  const clock = t.locator("[data-live-clock]");
  const c1 = await clock.textContent();
  await page.waitForTimeout(1300);
  assert.notEqual(await clock.textContent(), c1, "時間在跳");
  assert.match(c1, /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(mock.db.slamClaims.length, 1);
  const code = mock.db.slamClaims[0].code;
  assert.ok(text.includes(`${code.slice(0, 4)}-${code.slice(4)}`));
  // QR code 裡只有員工兌換頁的網址（沒有暱稱）
  assert.equal(await page.locator('main svg[role="img"]').getAttribute("aria-label"), `兌換碼 ${code.slice(0, 4)}-${code.slice(4)} 的 QR code`);

  // 再打開一次是同一組碼
  await page.reload({ waitUntil: "networkidle" });
  await ticket(page, "V5").waitFor();
  assert.equal(mock.db.slamClaims.length, 1, "再打開不會多一組碼");

  // 員工掃 QR code → 兌換頁：核對暱稱、只有明德館的權限所以自動選明德、確認兌換
  const staff = await phone(browser, mock);
  await login(staff.page, "clerk_md", "password1");
  await staff.page.goto(`${BASE}/redeem?c=${code}`, { waitUntil: "networkidle" });
  await staff.page.locator("[data-slam-lookup]").waitFor();
  const info = await staff.page.textContent("[data-slam-lookup]");
  for (const w of ["小安", "V5", "✓ 完成 3 / 3 條"]) assert.ok(info.includes(w), `兌換頁有「${w}」：${info}`);
  await staff.page.locator("main button", { hasText: "確認兌換（明德館）" }).click();
  await staff.page.locator('main [role="status"]', { hasText: "已兌換" }).waitFor();
  assert.equal(mock.db.slamClaims[0].redeemed_gym, "mingde");
  assert.ok(mock.db.audit.some((a) => a.action === "slam.redeem" && a.detail.nickname === "小安"), "操作紀錄");
  assert.equal(await staff.page.locator("main button", { hasText: "確認兌換" }).count(), 0, "兌換後沒有確認按鈕");

  // 顧客的卡自動蓋「已兌換」：條紋停住、時間不見
  await page.locator('main section[data-redeemed="1"]').waitFor({ timeout: 10000 });
  const done = await ticket(page, "V5").textContent();
  assert.ok(done.includes("已兌換") && done.includes("明德館"), done);
  assert.equal(await page.locator("main [data-live-clock]").count(), 0);
  assert.equal(await page.locator("main [data-live-stripe]").getAttribute("data-live-stripe"), "stopped");

  // 我的紀錄：V5 寫已兌換，點了還看得到兌換卡
  await page.goto(`${BASE}/me`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await slamBtn(page, "V5", true).click();
  await page.waitForURL(/\/slam\?g=5/);
  await page.locator('main section[data-redeemed="1"]').waitFor();
  assert.equal(mock.db.slamClaims.length, 1, "看已兌換的卡不會再拿碼");
  assert.deepEqual(errors, []);
  assert.deepEqual(staff.errors, []);
});

test("員工兌換頁：顧客和沒登入只看到說明；牆上這個難度多了沒完成的就擋下；別館員工只能選自己的館；手打兌換碼查詢", async () => {
  const { mock, me, zone, route } = setup();
  mock.state.slam.enabled = true;
  const code = "K7Q482MD";
  mock.db.slamClaims.push({ code, user_id: me, grade: 5, total: 3, achieved_on: taipeiDay(-2), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), redeemed_at: null, redeemed_gym: null, redeemed_by: null });

  const guest = await phone(browser, mock);
  await guest.page.goto(`${BASE}/redeem?c=${code}`, { waitUntil: "networkidle" });
  assert.ok((await guest.page.textContent("main")).includes("請把手機上的兌換卡給櫃檯員工掃"));
  assert.equal(await guest.page.locator("main button", { hasText: "我是員工，登入" }).count(), 1);

  const cust = await phone(browser, mock);
  await login(cust.page, "climber88");
  await cust.page.goto(`${BASE}/redeem?c=${code}`, { waitUntil: "networkidle" });
  await cust.page.waitForTimeout(500);
  assert.ok((await cust.page.textContent("main")).includes("請把手機上的兌換卡給櫃檯員工掃"), "顧客自己掃只看到說明");
  assert.equal(await cust.page.locator("main button", { hasText: "確認兌換" }).count(), 0);

  // 萬華的員工：只能選萬華館；牆上多一條 V5 沒完成 → 擋下
  const staff = await phone(browser, mock);
  await login(staff.page, "clerk_wh");
  route(zone("g3", "BO"), 5);
  await staff.page.goto(`${BASE}/redeem?c=${code}`, { waitUntil: "networkidle" });
  await staff.page.locator("[data-slam-lookup]").waitFor();
  assert.ok((await staff.page.textContent("[data-slam-lookup]")).includes("✗ 完成 3 / 4 條"));
  assert.ok((await staff.page.textContent('main [role="alert"]')).includes("現在沒有全部完成（3 / 4 條）"));
  assert.equal(await staff.page.locator("main button", { hasText: "確認兌換" }).count(), 0, "沒有全部完成不能按兌換");

  // 那條下架後可以兌換；只有萬華館可以選
  mock.db.routes.at(-1).archived_at = new Date().toISOString();
  // 手打兌換碼（小寫、加槓也可以）
  await staff.page.goto(`${BASE}/redeem`, { waitUntil: "networkidle" });
  await staff.page.fill("#redeem-code", "k7q4-82md");
  await staff.page.locator("main button", { hasText: "查詢" }).click();
  await staff.page.waitForURL(/\/redeem\?c=K7Q482MD/);
  await staff.page.locator("[data-slam-lookup]").waitFor();
  assert.ok((await staff.page.textContent("[data-slam-lookup]")).includes("小安"));
  assert.deepEqual(await staff.page.locator("main button[aria-pressed]").allTextContents(), ["萬華館"], "只有自己館");
  await staff.page.locator("main button", { hasText: "確認兌換（萬華館）" }).click();
  await staff.page.locator('main [role="status"]', { hasText: "已兌換" }).waitFor();
  assert.equal(mock.db.slamClaims[0].redeemed_gym, "g2");
  assert.deepEqual(guest.errors, []);
  assert.deepEqual(cust.errors, []);
  assert.deepEqual(staff.errors, []);
});

test("兌換卡：牆上還沒全部完成時說還差幾條；沒網路時說要連上網路", async () => {
  const { mock, zone, route } = setup();
  mock.state.slam.enabled = true;
  route(zone("g4", "A1"), 5);
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88");
  await page.goto(`${BASE}/slam?g=5`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.ok((await page.textContent("main")).includes("還有 1 條沒完成（3 / 4）"));
  assert.equal(mock.db.slamClaims.length, 0);
  mock.db.routes.at(-1).archived_at = new Date().toISOString();
  mock.state.offline = true;
  await page.locator("main button", { hasText: "重新整理" }).click();
  await page.waitForTimeout(800);
  assert.ok((await page.textContent("main")).includes("要連上網路才能打開兌換卡"));
  mock.state.offline = false;
  await page.locator("main button", { hasText: "重新整理" }).click();
  await ticket(page, "V5").waitFor();
  assert.deepEqual(errors, []);
});

test("營運：老闆打開活動、改最少條數、期限、獎品；兌換紀錄；不是老闆看不到", async () => {
  const { mock } = setup();
  const { page, errors } = await phone(browser, mock);
  await login(page, "boss", "password1", "/ops");
  await page.locator("main button", { hasText: "🏆 大滿貫兌換" }).click();
  await page.waitForURL(/\/ops\/slam/);
  await page.locator('main [role="switch"]').waitFor();
  assert.equal(await page.getAttribute('main [role="switch"]', "aria-checked"), "false", "預設關");
  await page.click('main [role="switch"]');
  await page.fill("#slam-min", "3");
  await page.fill("#slam-days", "14");
  await page.fill("#slam-prize", "原岩毛巾");
  await page.locator("main button", { hasText: "儲存" }).click();
  await page.waitForTimeout(600);
  assert.deepEqual(mock.state.slam, { enabled: true, min_routes: 3, valid_days: 14, prize: "原岩毛巾" });
  assert.ok((await page.textContent("main")).includes("還沒有人拿兌換碼"));

  // 顧客拿碼：卡片上寫獎品；老闆的兌換紀錄列出來
  const cust = await phone(browser, mock);
  await login(cust.page, "climber88");
  await cust.page.goto(`${BASE}/slam?g=5`, { waitUntil: "networkidle" });
  await ticket(cust.page, "V5").waitFor();
  assert.ok((await ticket(cust.page, "V5").textContent()).includes("原岩毛巾"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('main ul[aria-label="兌換紀錄"] li').first().waitFor();
  const row = await page.textContent('main ul[aria-label="兌換紀錄"] li');
  assert.ok(row.includes("小安") && row.includes("V5") && row.includes("還沒兌換"), row);

  // 員工（不是老闆）：營運沒有這顆、打開設定頁只看到說明
  const staff = await phone(browser, mock);
  await login(staff.page, "clerk_md");
  await staff.page.goto(`${BASE}/ops/slam`, { waitUntil: "networkidle" });
  await staff.page.waitForTimeout(500);
  assert.ok((await staff.page.textContent("main")).includes("只有老闆可以改"));
  assert.deepEqual(errors, []);
  assert.deepEqual(cust.errors, []);
  assert.deepEqual(staff.errors, []);
});
