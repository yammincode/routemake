// 使用狀況的數據分析（step45）：本週重點、分頁 人｜路線｜互動（記在手機）、路線一次看一間館；管理後台「路線分析」給那一館的員工；還沒套用 step45 照舊
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

// 明德 A1 區：V4 三條裡一條大家都爬不上（可能太難）、V3 三條裡一條大家都 Flash（可能太簡單）、V2 一條上牆 20 天沒人爬（冷門）
// 跟同一個難度的其他路線比，同難度要有 3 條 5 人以上試過的才判斷
function seed(mock) {
  const z = mock.db.zones.find((x) => x.gym_id === "mingde" && x.code === "A1");
  const old = new Date(Date.now() - 20 * 86400000).toISOString();
  const hard = mock.addRoute(z, 4, "紅");
  const v4 = [mock.addRoute(z, 4, "藍"), mock.addRoute(z, 4, "白")];
  const easy = mock.addRoute(z, 3, "綠");
  const v3 = [mock.addRoute(z, 3, "黑"), mock.addRoute(z, 3, "紫")];
  mock.addRoute(z, 2, "黃", [], 30, 40, old);
  const day = taipeiDay();
  for (let i = 0; i < 6; i++) {
    const u = mock.addUser(`climber${i}`, "password1", { nickname: `岩友${i}` });
    mock.addAscent(u, hard, "project", day);
    for (const r of v4) mock.addAscent(u, r, "send", day);
    mock.addAscent(u, easy, "flash", day, { grade_feel: i < 3 ? -1 : null });
    for (const r of v3) mock.addAscent(u, r, "send", day);
  }
}

test("數據分析：老闆看本週重點、分頁（記在手機）、選館看路線；點重點跳到那一段", async () => {
  const mock = createMock();
  seed(mock);
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const { page, errors } = await phone(browser, mock);
  await login(page, "boss", "password1", "/ops/usage");
  await page.waitForTimeout(1200);

  let text = await page.textContent("main");
  assert.ok(text.includes("本週重點") && text.includes("路線的重點要選一間館才看得到"), "全部館：本週重點，路線要選館");
  assert.deepEqual(await page.locator('main [role="tab"]').allTextContents(), ["人", "路線", "互動"], "三個分頁");
  assert.ok(text.includes("活躍人數") && text.includes("回頭率") && text.includes("新客人第一週") && text.includes("常客分群") && text.includes("程度分布") && text.includes("幾點最多人用"), "人：原本的＋新的分析");
  assert.equal(await page.locator('main [aria-label="每個小時有幾人次在用"] button').count(), 24, "24 小時");

  await page.click('main [role="tab"]:text-is("路線")');
  await page.waitForTimeout(300);
  text = await page.textContent("main");
  assert.ok(text.includes("一次看一間館，請在上面選館") && text.includes("熱門路線"), "全部館：路線分頁要選館，熱門路線照舊");

  // 選明德：重點多了路線的事，點了跳到路線分頁的完攀率
  await page.click('main button:text-is("明德館")');
  await page.waitForTimeout(1200);
  text = await page.textContent("main");
  assert.ok(text.includes("路線完攀率") && text.includes("可能太難") && text.includes("可能太簡單") && text.includes("多人說偏軟"), "標出太難、太簡單、偏軟");
  assert.ok(text.includes("冷門路線") && text.includes("上牆 20 天") && text.includes("各區熱度") && text.includes("換線效果") && text.includes("難度供需") && text.includes("進階 V3–V5"), "冷門、熱度、換線、供需");
  assert.ok(!text.includes("岩友0"), "路線分析不出現客人的暱稱");
  await page.click('main button:has-text("看全部 7 條路線")');
  await page.waitForTimeout(200);
  assert.equal(await page.locator("main #rates li").count(), 7, "可以看全部路線");

  await page.click('main [role="tab"]:text-is("人")');
  await page.waitForTimeout(200);
  const card = page.locator('main button:has-text("條路線可能太難或太簡單")');
  assert.ok((await card.textContent()).startsWith("2"), "重點：2 條路線可能太難或太簡單");
  await card.click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('main [role="tab"][aria-selected="true"]').textContent(), "路線", "跳到路線分頁");
  const top = await page.locator("main #rates").evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(top < 300, `捲到完攀率那一段（top ${top}）`);

  // 分頁記在手機
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('main [role="tab"][aria-selected="true"]').textContent(), "路線", "重新整理還在路線分頁");

  // 使用狀況點路線：返回寫「‹ 使用狀況」，回來還是明德館、路線分頁
  await page.click('main button:text-is("明德館")');
  await page.locator("main #cold").waitFor({ timeout: 5000 });
  await page.locator('main #cold button').first().click();
  await page.waitForURL((x) => x.pathname === "/zone" && x.searchParams.get("from") === "usage");
  await page.locator("[role=dialog]").waitFor({ timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.ok((await page.locator("main").textContent()).startsWith("‹ 使用狀況"), "返回寫「‹ 使用狀況」");
  await page.locator('main button:has-text("使用狀況")').first().click();
  await page.waitForURL((x) => x.pathname === "/ops/usage");
  await page.locator("main #cold").waitFor({ timeout: 5000 });
  assert.equal(await page.locator('main button[aria-pressed="true"]:text-is("明德館")').count(), 1, "還是明德館");
  assert.equal(await page.locator('main [role="tab"][aria-selected="true"]').textContent(), "路線", "還在路線分頁");

  await page.click('main [role="tab"]:text-is("互動")');
  await page.waitForTimeout(300);
  text = await page.textContent("main");
  assert.ok(text.includes("互動（最近 14 天）") && text.includes("最熱門的影片和留言") && text.includes("大家選的原岩夥伴") && text.includes("高山猛牛"), "互動分頁");
  assert.deepEqual(errors, []);
});

test("數據分析：管理後台「路線分析」給那一館的員工；顧客進不了；被授權的人也只看授權的館", async () => {
  const mock = createMock();
  seed(mock);
  const st = mock.addUser("setter1", "password1", { nickname: "定線員" });
  mock.db.staff_roles.push({ user_id: st, gym_id: "mingde", role: "setter" });
  const { page, errors } = await phone(browser, mock);
  await login(page, "setter1", "password1", "/admin");
  await page.waitForTimeout(1500);
  assert.ok((await page.textContent("main")).includes("明德館路線分析"), "後台有路線分析");
  await page.click('main button:has-text("看路線分析")');
  await page.waitForTimeout(1000);
  const text = await page.textContent("main");
  assert.ok(text.includes("可能太難") && text.includes("冷門路線") && text.includes("難度供需"), "定線員看得到自己館的路線分析");
  // 點路線：跳到那條路線的區域頁（標出那一條、打開卡片），返回寫「‹ 後台」，回來路線分析還開著
  const row = page.locator('main #rates button:has-text("可能太難")');
  const code = (await row.textContent()).match(/A1-\d{2}/)[0];
  await row.click();
  await page.waitForURL((u) => u.pathname === "/zone");
  const u = new URL(page.url());
  assert.equal(u.searchParams.get("from"), "admin", "從後台來");
  const dialog = page.locator("[role=dialog]");
  await dialog.waitFor({ timeout: 5000 });
  assert.ok((await dialog.textContent()).includes(code), `打開那條路線的卡片（${code}：${(await dialog.textContent()).slice(0, 80)}）`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.ok((await page.locator("main").textContent()).startsWith("‹ 後台"), "返回寫「‹ 後台」");
  await page.locator('main button:has-text("後台")').first().click();
  await page.waitForURL((x) => x.pathname === "/admin");
  await page.locator("main #rates").waitFor({ timeout: 5000 });
  assert.equal(await page.locator('main button:has-text("看路線分析")').count(), 0, "回來路線分析還開著");
  await page.waitForTimeout(400);
  const top = await page.locator("main #rates").evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(top < 844, `捲回路線分析（top ${top}）`);
  await page.click('main button:text-is("收起來")');
  assert.equal(await page.locator('main button:has-text("看路線分析")').count(), 1, "可以收起來");
  // 定線員還是看不到使用狀況（人、互動）
  await page.goto(BASE + "/ops/usage", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.ok((await page.textContent("main")).includes("使用狀況要老闆授權才看得到"), "定線員看不到使用狀況");
  assert.deepEqual(errors, []);
});

test("數據分析：還沒套用 step45 照舊（人分頁原本的數字、路線分頁熱門路線、說明要套用 step45；後台路線分析也說明）", async () => {
  const mock = createMock();
  seed(mock);
  mock.state.noInsights = true;
  const v = mock.addUser("viewer1", "password1", { nickname: "小美" });
  mock.db.usageViewers.push({ user_id: v, gym_id: "mingde" });
  mock.db.staff_roles.push({ user_id: v, gym_id: "mingde", role: "manager" });
  const { page, errors } = await phone(browser, mock);
  await login(page, "viewer1", "password1", "/ops/usage");
  await page.waitForTimeout(1200);
  let text = await page.textContent("main");
  assert.ok(text.includes("活躍人數") && text.includes("每天使用人數") && text.includes("step45"), "人：原本的照舊、寫要套用 step45");
  assert.ok(!text.includes("本週重點"), "沒有本週重點");
  await page.click('main [role="tab"]:text-is("路線")');
  await page.waitForTimeout(300);
  text = await page.textContent("main");
  assert.ok(text.includes("熱門路線") && text.includes("step45"), "路線：熱門路線照舊");
  await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.click('main button:has-text("看路線分析")');
  await page.waitForTimeout(800);
  assert.ok((await page.textContent("main")).includes("step45"), "後台路線分析說明要套用 step45");
  assert.deepEqual(errors.filter((e) => !/404/.test(e)), []);
});
