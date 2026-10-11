// 離線紀錄不會默默不見：iPhone 的網路錯誤（Load failed）也會排隊、伺服器暫時出錯留著再送、資料庫拒絕才丟（有提示）；
// 還有紀錄沒送出時登出要再按一次；沒網路又登入過期時按登出，手機裡的登入一定清掉（下一個人打開不會又是前一個人）
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import { BASE, WALL, createMock, launch, login, phone } from "./helpers.mjs";

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

test("換別人登入：前一個人排隊的紀錄不會用新帳號送出、也不會算在新帳號", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  mock.addUser("climber99", "password1", { nickname: "小明" });
  const zA = seed(mock);
  const { page } = await phone(browser, mock);
  await login(page, "climber99", "password1", "/zone?id=" + zA.id);
  // 手機裡留著別人（小安）還沒送出的紀錄（例如他的登入自己失效了）
  const other = mock.db.profiles.find((p) => p.username === "climber88").id;
  await page.evaluate(([uid, routeId]) => {
    localStorage.setItem("routemake-pending", JSON.stringify([{ userId: uid, routeId, ascent: { status: "send", climbed_on: "2026-01-01", feel: null, grade_feel: null, private_note: "小安的心得" } }]));
    window.dispatchEvent(new Event("online"));
  }, [other, mock.db.routes[0].id]);
  await page.waitForTimeout(1500);
  assert.equal(mock.db.ascents.length, 0, "不會用小明的帳號送出小安的紀錄");
  assert.doesNotMatch(await status(page), /正在送出/, "小明的畫面不顯示別人的待送筆數");
});
