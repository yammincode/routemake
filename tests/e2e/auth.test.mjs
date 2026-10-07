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
  assert.equal(await page.getAttribute("#password", "type"), "text", "註冊時預設顯示密碼");
  assert.ok((await page.textContent("main")).includes("至少 8 碼，英文、數字都可以"), "密碼規則直接寫出來");

  await page.fill("#username", "ab");
  assert.match(await page.textContent("[data-hint=username]"), /還差 2 個字/, "帳號名稱邊打邊提示");
  await page.fill("#password", "pass");
  assert.match(await page.textContent("[data-hint=password]"), /還差 4 碼/, "密碼邊打邊提示");
  await page.fill("#password", "password1");
  assert.match(await page.textContent("[data-hint=password]"), /✓/);
  await page.click("button[type=submit]");
  assert.match(await page.textContent("p[role=alert]"), /4–20 個字/);

  await page.fill("#username", "Ter 0123456");
  assert.equal(await page.inputValue("#username"), "ter0123456", "自動轉小寫、去空白");
  assert.match(await page.textContent("[data-hint=username]"), /✓/);
  await page.fill("#password", "short");
  await page.click("button[type=submit]");
  assert.match(await page.textContent("p[role=alert]"), /至少 8 碼/);

  await page.check("input[type=checkbox]");
  assert.equal(await page.getAttribute("#password", "type"), "text", "顯示密碼");

  mock.state.signupError = { status: 429, body: { error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" } };
  await page.fill("#password", "password1");
  await page.click("button[type=submit]");
  await page.waitForTimeout(300);
  assert.match(await page.textContent("p[role=alert]"), /Confirm email.*over_email_send_rate_limit/);

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
  assert.equal(await page.locator("[data-app-version]").count(), 0, "一般會員看不到版本號");

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
  await page.waitForSelector("p[role=alert]");
  assert.match(await page.textContent("p[role=alert]"), /已經有人使用/);

  await page.click('main button:text-is("登入")');
  await page.fill("#username", "ter0123456");
  await page.fill("#password", "wrongpass");
  await page.click("button[type=submit]");
  await page.waitForTimeout(400);
  assert.equal(await page.textContent("p[role=alert]"), "帳號或密碼錯誤");
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

test("註冊：以為卡住又按一次會直接登入；太久沒回應會提示", async () => {
  const mock = createMock();
  mock.addUser("veritas0830", "password1");
  const { page, ctx } = await phone(browser, mock);
  await page.goto(BASE + "/login?mode=signup&next=/me", { waitUntil: "networkidle" });
  await page.fill("#username", "veritas0830");
  await page.fill("#password", "password1");
  await page.click("button[type=submit]");
  await page.waitForURL("**/welcome**");
  assert.ok(true, "帳號已經建好、密碼一樣：直接登入");

  const B = await phone(browser, createMock());
  await B.page.goto(BASE + "/login?mode=signup&next=/me", { waitUntil: "networkidle" });
  await B.page.route("**/auth/v1/signup**", () => new Promise(() => {})); // 永遠不回應
  await B.page.fill("#username", "slowuser1");
  await B.page.fill("#password", "password1");
  await B.page.click("button[type=submit]");
  assert.equal(await B.page.textContent("button[type=submit]"), "請稍候…");
  await B.page.waitForSelector("p[role=alert]", { timeout: 20000 });
  assert.match(await B.page.textContent("p[role=alert]"), /連線太久/, "15 秒沒回應就提示");
  assert.equal(await B.page.textContent("button[type=submit]"), "註冊並登入", "按鈕可以再按");
  await B.ctx.close();
  await ctx.close();
});
