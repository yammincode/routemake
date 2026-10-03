// 註冊、登入、填暱稱、登出、錯誤訊息、登入後跳轉只允許站內
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("註冊流程與錯誤提示", async () => {
  const mock = createMock();
  const { page, errors } = await phone(browser, mock);
  await page.goto(BASE + "/login?mode=signup&next=/me", { waitUntil: "networkidle" });
  assert.equal(await page.locator("input[type=password]").count(), 1, "只要輸入一次密碼");

  await page.fill("#username", "ab");
  await page.fill("#password", "password1");
  await page.click("button[type=submit]");
  assert.match(await page.textContent("[role=alert]"), /4–20 個字/);

  await page.fill("#username", "Ter 0123456");
  assert.equal(await page.inputValue("#username"), "ter0123456", "自動轉小寫、去空白");
  await page.fill("#password", "short");
  await page.click("button[type=submit]");
  assert.match(await page.textContent("[role=alert]"), /至少 8 碼/);

  await page.check("input[type=checkbox]");
  assert.equal(await page.getAttribute("#password", "type"), "text", "顯示密碼");

  mock.state.signupError = { status: 429, body: { error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" } };
  await page.fill("#password", "password1");
  await page.click("button[type=submit]");
  await page.waitForTimeout(300);
  assert.match(await page.textContent("[role=alert]"), /Confirm email.*over_email_send_rate_limit/);

  mock.state.signupError = null;
  await page.click("button[type=submit]");
  await page.waitForURL("**/welcome**");
  await page.waitForTimeout(400);
  assert.equal(await page.inputValue("#nickname"), "ter0123456", "暱稱預設帶入帳號");
  await page.fill("#nickname", "小安");
  await page.click("button[type=submit]");
  await page.waitForURL("**/me");
  await page.waitForTimeout(500);
  const main = await page.textContent("main");
  assert.ok(main.includes("小安") && main.includes("帳號 ter0123456"));
  assert.match(await page.textContent("[data-app-version]"), /^v\d+\.\d+ 試用版$/, "我的紀錄頁最下面顯示版本號");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  assert.ok((await page.textContent("main")).includes("小安"), "重新整理後還是登入");

  await page.click("text=登出");
  await page.waitForTimeout(400);
  assert.ok(await page.isVisible("text=註冊帳號"), "登出後顯示登入／註冊");

  await page.goto(BASE + "/login?mode=signup", { waitUntil: "networkidle" });
  await page.fill("#username", "ter0123456");
  await page.fill("#password", "password9");
  await page.click("button[type=submit]");
  await page.waitForSelector("[role=alert]");
  assert.match(await page.textContent("[role=alert]"), /已經有人使用/);

  await page.click('main button:text-is("登入")');
  await page.fill("#username", "ter0123456");
  await page.fill("#password", "wrongpass");
  await page.click("button[type=submit]");
  await page.waitForTimeout(400);
  assert.equal(await page.textContent("[role=alert]"), "帳號或密碼錯誤");
  assert.deepEqual(errors, []);
});

test("登入後只會跳到站內頁面（擋掉外部網址）", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  for (const evil of ["//evil.example", "/\\evil.example", "https://evil.example"]) {
    const { page, ctx } = await phone(browser, mock);
    await login(page, "climber88", "password1", evil);
    assert.equal(new URL(page.url()).origin, BASE, `next=${evil} 不能離開網站`);
    await ctx.close();
  }
});

test("管理後台：未登入、沒權限、員工", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const setter = mock.addUser("setter1", "password1", { nickname: "定線長" });
  mock.db.staff_roles.push({ user_id: setter, gym_id: "mingde", role: "setter" });

  const a = await phone(browser, mock);
  await a.page.goto(BASE + "/admin", { waitUntil: "networkidle" });
  assert.ok((await a.page.textContent("main")).includes("請先登入"));
  await login(a.page, "climber88", "password1", "/admin");
  assert.match(await a.page.textContent("main"), /ter|climber88.*還沒有管理權限/s);
  assert.ok((await a.page.textContent("main code")).includes("where username = 'climber88'"), "顯示開通用的 SQL");

  const b = await phone(browser, mock);
  await login(b.page, "setter1", "password1", "/admin");
  await b.page.waitForTimeout(800);
  assert.ok(await b.page.isVisible("text=你的身分：定線長"));
  await b.page.goto(BASE + "/me", { waitUntil: "networkidle" });
  await b.page.waitForTimeout(500);
  assert.ok((await b.page.textContent("main")).includes("員工身分：明德館定線長"));
  assert.deepEqual([...a.errors, ...b.errors], []);
});
