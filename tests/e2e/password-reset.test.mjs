// 忘記密碼（step43）：櫃檯員工在後台「帳號管理」產生 6 位數重設碼 → 客人在登入頁「忘記密碼？」設新密碼並登入；
// 打錯、過期的說明；作廢；我的紀錄「改密碼」（要先輸入現在的密碼）；還沒套用 step43 時說明請洽櫃檯
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, openAccount } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

async function fillReset(page, username, code, password) {
  await page.fill("#r-username", username);
  await page.fill("#r-code", code);
  await page.fill("#r-password", password);
  await page.click('main button[type=submit]:has-text("設定新密碼")');
  await page.waitForTimeout(800);
}

test("忘記密碼：櫃檯產生重設碼、客人在登入頁設新密碼並登入", async () => {
  const mock = createMock();
  const c = mock.addUser("climber88", "oldpass11", { nickname: "小安" });
  const st = mock.addUser("manager1", "password1", { nickname: "王店長" });
  mock.db.staff_roles.push({ user_id: st, gym_id: "mingde", role: "manager" });

  // 店長在帳號管理產生重設碼（定線長沒有這個按鈕，見 accounts）
  const S = await phone(browser, mock);
  const s = S.page;
  await login(s, "manager1", "password1", "/admin");
  await s.waitForTimeout(1500);
  await s.fill("#accsearch", "小安");
  await s.waitForTimeout(800);
  const row = s.locator('[data-account="climber88"]').first();
  await row.locator('button:text-is("重設密碼")').click();
  await row.locator('button:text-is("產生重設碼")').click();
  await s.waitForTimeout(600);
  const box = row.locator("[data-reset-code]");
  const shown = (await box.locator(".font-num").textContent()).replace(/\s/g, "");
  assert.match(shown, /^\d{6}$/, "大字 6 位數");
  assert.equal(shown, mock.db.resets[c].code);
  assert.ok((await box.textContent()).includes("內有效") && (await box.textContent()).includes("climber88"), "倒數、告訴客人帳號");
  assert.ok(mock.db.audit.some((a) => a.action === "user.reset_code" && a.target_id === c && a.user_id === st), "寫進操作紀錄");

  // 客人：登入頁 → 忘記密碼？
  const C = await phone(browser, mock);
  const p = C.page;
  await p.goto(BASE + "/login?next=/me", { waitUntil: "networkidle" });
  await p.click('main button:text-is("忘記密碼？")');
  assert.ok((await p.textContent("main")).includes("先到任一館櫃檯拿重設碼"));
  // 打錯
  await fillReset(p, "climber88", shown === "000000" ? "111111" : "000000", "newpass99");
  assert.ok((await p.textContent("[role=alert]")).includes("帳號或重設碼不對"));
  await fillReset(p, "climber88", "12", "newpass99");
  assert.ok((await p.textContent("[role=alert]")).includes("6 位數字"));
  await fillReset(p, "climber88", shown, "short");
  assert.ok((await p.textContent("[role=alert]")).includes("至少 8 碼"));
  // 對了：設好直接登入，回到原本要去的頁
  await fillReset(p, "climber88", shown, "newpass99");
  await p.waitForURL("**/me");
  assert.equal(mock.db.users["climber88@users.routemake.local"].password, "newpass99");
  assert.equal(mock.db.resets[c], undefined, "用過就沒了");
  assert.ok(mock.db.audit.some((a) => a.action === "user.password_reset" && a.target_id === c));

  // 再產生一組又作廢：不能用
  await row.locator('button:text-is("作廢這組碼")').click();
  await s.waitForTimeout(400);
  await row.locator('button:text-is("產生重設碼")').click();
  await s.waitForTimeout(600);
  const second = mock.db.resets[c].code;
  await row.locator('button:text-is("作廢這組碼")').click();
  await s.waitForTimeout(500);
  assert.equal(mock.db.resets[c], undefined, "作廢了");
  const D = await phone(browser, mock);
  await D.page.goto(BASE + "/login?mode=reset", { waitUntil: "networkidle" });
  await fillReset(D.page, "climber88", second, "another99");
  assert.ok((await D.page.textContent("[role=alert]")).includes("帳號或重設碼不對"));

  assert.deepEqual([...S.errors, ...C.errors, ...D.errors], []);
  await Promise.all([S.ctx.close(), C.ctx.close(), D.ctx.close()]);
});

test("重設碼：打錯 5 次、過期都要請櫃檯再產生", async () => {
  const mock = createMock();
  const c = mock.addUser("climber88", "oldpass11", { nickname: "小安" });
  mock.db.resets[c] = { code: "482917", expires_at: new Date(Date.now() + 600000).toISOString(), tries: 0 };
  const C = await phone(browser, mock);
  const p = C.page;
  await p.goto(BASE + "/login?mode=reset", { waitUntil: "networkidle" });
  for (let i = 0; i < 4; i++) await fillReset(p, "climber88", "000000", "newpass99");
  assert.ok((await p.textContent("[role=alert]")).includes("帳號或重設碼不對"));
  await fillReset(p, "climber88", "000000", "newpass99");
  assert.ok((await p.textContent("[role=alert]")).includes("請到櫃檯再拿一組"), "第 5 次就失效");
  await fillReset(p, "climber88", "482917", "newpass99");
  assert.ok((await p.textContent("[role=alert]")).includes("請到櫃檯再拿一組"), "失效後正確的也不行");
  mock.db.resets[c] = { code: "482917", expires_at: new Date(Date.now() - 1000).toISOString(), tries: 0 };
  await fillReset(p, "climber88", "482917", "newpass99");
  assert.ok((await p.textContent("[role=alert]")).includes("超過 15 分鐘"), "過期");
  assert.equal(mock.db.users["climber88@users.routemake.local"].password, "oldpass11", "密碼沒變");
  assert.deepEqual(C.errors, []);
  await C.ctx.close();
});

test("我的紀錄：改密碼要先輸入現在的密碼", async () => {
  const mock = createMock();
  mock.addUser("climber88", "oldpass11", { nickname: "小安" });
  const C = await phone(browser, mock);
  const p = C.page;
  await login(p, "climber88", "oldpass11", "/me");
  await p.waitForTimeout(800);
  await openAccount(p);
  await p.click('main button:text-is("改密碼")');
  await p.fill("#pw-old", "wrongpass1");
  await p.fill("#pw-new", "newpass99");
  await p.click('main button:text-is("儲存新密碼")');
  await p.waitForTimeout(800);
  assert.ok((await p.textContent("main [role=alert]")).includes("現在的密碼不對"));
  assert.equal(mock.db.users["climber88@users.routemake.local"].password, "oldpass11");
  await p.fill("#pw-old", "oldpass11");
  await p.click('main button:text-is("儲存新密碼")');
  await p.waitForTimeout(800);
  assert.equal(mock.db.users["climber88@users.routemake.local"].password, "newpass99");
  assert.equal(await p.locator("#pw-old").count(), 0, "改好後收起來");
  assert.deepEqual(C.errors, []);
  await C.ctx.close();
});

test("還沒套用 step43：忘記密碼頁說明請洽櫃檯", async () => {
  const mock = createMock();
  mock.addUser("climber88", "oldpass11", { nickname: "小安" });
  mock.state.noAccounts = true;
  const C = await phone(browser, mock);
  await C.page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await C.page.click('main button:text-is("忘記密碼？")');
  await fillReset(C.page, "climber88", "123456", "newpass99");
  assert.ok((await C.page.textContent("[role=alert]")).includes("請洽櫃檯"));
  assert.deepEqual(C.errors.filter((e) => !/404/.test(e)), []);
  await C.ctx.close();
});
