// 離線紀錄不會默默不見：iPhone 的網路錯誤（Load failed）也會排隊、伺服器暫時出錯留著再送、資料庫拒絕才丟（有提示）；
// 還有紀錄沒送出時登出要再按一次；沒網路又登入過期時按登出，手機裡的登入一定清掉（下一個人打開不會又是前一個人）
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import { BASE, WALL, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

function seed(mock) {
  const zA = mock.db.zones[0];
  mock.db.files["mingde/zones/A-1.jpg"] = fs.readFileSync(WALL);
  zA.photo_path = "mingde/zones/A-1.jpg";
  mock.addRoute(zA, 2, "紅", [], 20, 30);
  mock.addRoute(zA, 4, "藍", [], 60, 50);
  return zA;
}
// iPhone Safari 連不上時，fetch 的錯誤訊息是「Load failed」（Chrome 是「Failed to fetch」）
const safariFetch = (ctx) =>
  ctx.addInitScript(() => {
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (window.__rmLoadFailed && url.includes(".supabase.co/rest/")) return Promise.reject(new TypeError("Load failed"));
      return real(input, init);
    };
  });
const status = async (page) => (await page.locator("[role=status]").allTextContents()).join(" ");
const retryNow = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
const flash = async (page) => {
  await page.click('main button[aria-label^="V4"]');
  await page.click('[role=dialog] button:has-text("Flash")');
  await page.waitForTimeout(600);
};

test("iPhone 收訊差（Load failed）：記錄會排隊、送不出去時留著，網路好了自動送出", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = seed(mock);
  const { page, ctx } = await phone(browser, mock);
  await safariFetch(ctx);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(800);

  await page.evaluate(() => (window.__rmLoadFailed = true));
  await flash(page);
  assert.match(await page.locator('[role=status]:has-text("送不出去")').first().textContent(), /目前送不出去，連上網路後會自動送出/);
  await page.waitForTimeout(1200);
  assert.equal(mock.db.ascents.length, 0, "還沒送出");
  assert.match(await status(page), /正在送出 1 筆紀錄/, "自動送出也失敗：紀錄留著，不會被丟掉");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("routemake-pending") ?? "[]").length), 1);

  await page.evaluate(() => (window.__rmLoadFailed = false));
  await retryNow(page); // App 回到前景（或過 30 秒）會再試一次
  await page.waitForTimeout(1500);
  assert.equal(mock.db.ascents.length, 1, "網路好了自動送出");
  assert.equal(mock.db.ascents[0].status, "flash");
  assert.doesNotMatch(await status(page), /正在送出/);
});

test("伺服器暫時出錯（503）：排隊的紀錄留著；資料庫拒絕（日期不合法）才丟掉，而且會告訴你", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = seed(mock);
  const { page, ctx, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(800);

  mock.state.offline = true;
  await ctx.setOffline(true);
  await flash(page);
  assert.match(await status(page), /1 筆紀錄會在連上網路後送出/);

  mock.state.ascentsFail = { status: 503, type: "text/html", body: "<html><body>503 Service Unavailable</body></html>" };
  mock.state.offline = false;
  await ctx.setOffline(false);
  await page.waitForTimeout(2000);
  assert.equal(mock.db.ascents.length, 0);
  assert.match(await status(page), /正在送出 1 筆紀錄/, "伺服器出錯：留著下次再送");

  mock.state.ascentsFail = { status: 400, body: JSON.stringify({ code: "22008", message: "日期不能晚於路線下架日" }) };
  await retryNow(page);
  await page.waitForTimeout(1200);
  assert.match((await page.locator("[role=status]").allTextContents()).join(" "), /有 1 筆離線時的紀錄存不進去：日期不能晚於路線下架日/, "丟掉時要告訴使用者");
  assert.doesNotMatch(await status(page), /正在送出/, "資料庫拒絕的不會一直卡著");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("routemake-pending") ?? "[]").length), 0);
  assert.deepEqual(errors.filter((e) => !/503|400/.test(e)), []);
});

test("還有紀錄沒送出時按登出：先提醒，再按一次才登出（沒送出的會刪掉）", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = seed(mock);
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(800);
  mock.state.ascentsFail = { status: 503, type: "text/html", body: "<html>503</html>" };
  await flash(page);
  await page.goto(BASE + "/me", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  await page.click('main button:has-text("登出")');
  await page.waitForTimeout(300);
  assert.ok((await page.textContent("main")).includes("還有 1 筆紀錄沒送出，登出會刪掉，再按一次"), "先提醒");
  assert.ok(!(await page.isVisible("text=註冊帳號")), "還沒登出");
  await page.click('main button:has-text("再按一次")');
  await page.waitForTimeout(600);
  assert.ok(await page.isVisible("text=註冊帳號"), "再按一次就登出");
  assert.equal(await page.evaluate(() => localStorage.getItem("routemake-pending")), null, "沒送出的紀錄跟著清掉（下一個人不會送出前一個人的心得）");
  assert.deepEqual(errors.filter((e) => !/503/.test(e)), []);
});

test("沒網路、登入又剛好過期時按登出：手機裡的登入一定清掉，連上網路後不會自動登回去", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  seed(mock);
  const { page, ctx } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me");
  await page.waitForTimeout(500);

  mock.state.offline = true;
  await ctx.setOffline(true);
  // 登入憑證過期（例如 App 放在背景超過 1 小時）
  await page.evaluate(() => {
    const k = "routemake-auth";
    const s = JSON.parse(localStorage.getItem(k));
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(k, JSON.stringify(s));
  });
  const t0 = Date.now();
  await page.click('main button:has-text("登出")');
  await page.locator("text=註冊帳號").waitFor({ timeout: 6000 });
  assert.ok(Date.now() - t0 < 5000, `按登出幾秒內就登出（不會卡住 30 秒，實際 ${Date.now() - t0}ms）`);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("routemake-auth"))), [], "手機裡沒有登入資料");

  mock.state.offline = false;
  await ctx.setOffline(false);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  assert.ok(await page.isVisible("text=註冊帳號"), "連上網路、重新打開：還是登出狀態");
});

test("換別人登入：前一個人排隊的紀錄（含私人心得）不會用新帳號送出，也不會留在手機", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  mock.addUser("climber99", "password1", { nickname: "小明" });
  const zA = seed(mock);
  const { page } = await phone(browser, mock);
  // 手機裡留著小安還沒送出的紀錄（例如他的登入自己失效了），日期合法：如果用小明的帳號送出，資料庫會存進小明那邊
  const other = mock.db.profiles.find((p) => p.username === "climber88").id;
  await page.goto(BASE + "/gyms", { waitUntil: "networkidle" });
  await page.evaluate(([uid, routeId, day]) => {
    localStorage.setItem("routemake-pending", JSON.stringify([{ userId: uid, routeId, ascent: { status: "send", climbed_on: day, feel: null, grade_feel: null, private_note: "小安的心得" } }]));
  }, [other, mock.db.routes[0].id, taipeiDay(0)]);
  await login(page, "climber99", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(1500);
  assert.equal(mock.db.ascents.length, 0, "不會用小明的帳號送出小安的紀錄");
  assert.doesNotMatch(await status(page), /正在送出|存不進去/);
  assert.equal(await page.evaluate(() => localStorage.getItem("routemake-pending")?.includes("小安的心得") ?? false), false, "小安的心得不留在手機");
});

test("登入過期、收訊差換新失敗：排隊的紀錄不會被當成沒登入送出而丟掉，換新成功後照樣送出", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = seed(mock);
  const { page, ctx } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(800);
  mock.state.offline = true;
  await ctx.setOffline(true);
  await flash(page);
  assert.match(await status(page), /1 筆紀錄會在連上網路後送出/);

  // 登入憑證過期，換新又一直失敗（Supabase 會改用沒登入的身分送，資料庫回「沒有權限」）
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("routemake-auth"));
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem("routemake-auth", JSON.stringify(s));
  });
  mock.state.refreshFail = true;
  mock.state.offline = false;
  await ctx.setOffline(false);
  await page.waitForTimeout(30000); // Supabase 換新會重試大約 25 秒
  assert.equal(mock.db.ascents.length, 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("routemake-pending") ?? "[]").length), 1, "紀錄留著，沒有被丟掉");
  assert.doesNotMatch(await status(page), /存不進去/);

  mock.state.refreshFail = false;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  assert.equal(mock.db.ascents.length, 1, "換新成功後自動送出");
});

test("有網路但登入過期、換新失敗時記錄：先排隊（不會顯示「沒有權限」），換新成功後送出", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = seed(mock);
  const { page } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("routemake-auth"));
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem("routemake-auth", JSON.stringify(s));
  });
  mock.state.refreshFail = true;
  const toasts = [];
  await flash(page);
  // Supabase 換新會重試大約 25 秒，之後用沒登入的身分送出、資料庫回「沒有權限」→ App 判斷是登入過期，先排隊
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("routemake-pending") ?? "[]").length === 1, null, { timeout: 45000 });
  toasts.push(...(await page.locator("[role=status]").allTextContents()));
  assert.ok(!toasts.some((t) => t.includes("沒有權限")), `不會顯示沒有權限（${toasts.join("／")}）`);
  assert.equal(mock.db.ascents.length, 0);

  mock.state.refreshFail = false;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  assert.equal(mock.db.ascents.length, 1, "換新成功後自動送出");
});

test("排隊中的舊紀錄不會蓋掉後來直接存成功的新紀錄", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = seed(mock);
  const { page } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/zone?id=" + zA.id);
  await page.waitForTimeout(800);
  mock.state.ascentsFail = { status: 503, type: "text/html", body: "<html>503</html>" };
  await page.click('main button[aria-label^="V4"]');
  await page.click('[role=dialog] button:has-text("嘗試中")');
  await page.waitForTimeout(1200);
  assert.match(await status(page), /正在送出 1 筆紀錄/, "伺服器出錯：嘗試中排隊");

  mock.state.ascentsFail = null;
  await page.click('[role=dialog] button:has-text("Flash")');
  await page.waitForTimeout(800);
  assert.equal(mock.db.ascents[0]?.status, "flash", "Flash 直接存成功");
  await retryNow(page);
  await page.waitForTimeout(1500);
  assert.equal(mock.db.ascents.length, 1);
  assert.equal(mock.db.ascents[0].status, "flash", "排隊的「嘗試中」不會再送出蓋掉 Flash");
  assert.doesNotMatch(await status(page), /正在送出/);
});
