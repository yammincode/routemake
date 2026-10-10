// 人物卡：預設不公開；本人在我的紀錄設定並公開；別人從留言點名字看到；不能放聯絡方式；店長可清除
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("人物卡：設定、公開、從留言點名字查看、店長清除", async () => {
  const mock = createMock();
  const b = mock.addUser("climberb", "password1", { nickname: "小安" });
  mock.addUser("viewer01", "password1", { nickname: "阿明" });
  const mgr = mock.addUser("manager1", "password1", { nickname: "店長" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "mingde", role: "manager" });
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 5, "藍", ["指力", "動態"]);
  mock.addAscent(b, r, "send", new Date().toISOString().slice(0, 10));
  mock.db.comments.push({ id: crypto.randomUUID(), route_id: r.id, user_id: b, body: "第三手好遠", created_at: new Date().toISOString(), edited_at: null, deleted_at: null });

  const openCard = async (page) => {
    await page.goto(`${process.env.BASE_URL ?? "http://localhost:3100"}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.locator("main ul li button", { hasText: "A1-01" }).click();
    await page.waitForTimeout(700);
    await page.click('[role=dialog] [role=tab]:has-text("留言")');
    await page.click('[role=dialog] button:text-is("小安")');
    await page.waitForTimeout(500);
    return page.locator("[role=dialog]").last();
  };

  // 別人看：預設不公開
  const V = await phone(browser, mock);
  await login(V.page, "viewer01");
  let card = await openCard(V.page);
  assert.ok((await card.textContent()).includes("還沒有公開人物卡"), "預設不公開");
  assert.equal(await card.locator('svg[aria-label="能力六角形"]').count(), 0);

  // 本人設定
  const B = await phone(browser, mock);
  await login(B.page, "climberb", "password1", "/card");
  await B.page.waitForTimeout(1000);
  const p = B.page;
  assert.ok((await p.textContent("main")).includes("目前只有你看得到"), "人物卡頁顯示未公開");
  await p.click('main button:text-is("編輯人物卡")');
  await p.fill("#cbio", "加我 IG 聊");
  await p.click('main button[role=switch]');
  await p.click('main button:text-is("儲存人物卡")');
  await p.waitForTimeout(500);
  assert.ok((await p.locator("[role=status]").last().textContent()).includes("不能放聯絡方式"), "擋聯絡方式");
  assert.ok(!mock.db.profiles.find((x) => x.id === b).card_public, "沒有存進去");
  await p.fill("#cbio", "喜歡動態路線");
  await p.click('main button:text-is("1–3 年")');
  // 常去的館可以複選：五間都看得到（換行排、不用往右滑）；點兩次取消；照場館順序存
  const gymChip = (name) => p.locator(`main button[aria-pressed]:text-is("${name}")`);
  const vw = p.viewportSize().width;
  for (const name of ["明德館", "萬華館", "中和館", "南港館", "新店館"]) {
    const bb = await gymChip(name).boundingBox();
    assert.ok(bb && bb.x >= 0 && bb.x + bb.width <= vw, `${name} 整顆看得到`);
  }
  await gymChip("中和館").click();
  await gymChip("新店館").click();
  await gymChip("明德館").click();
  await gymChip("新店館").click();
  assert.equal(await gymChip("新店館").getAttribute("aria-pressed"), "false", "再點一次取消");
  assert.ok((await p.textContent("main")).includes("常去明德館、中和館"), "預覽照場館順序");
  for (const [i, a] of ["力量", "指力", "動態", "耐力", "技巧", "柔軟"].entries()) await p.click(`main button[aria-label="${a} ${(i % 5) + 1} 分"]`);
  await p.click('main button:text-is("儲存人物卡")');
  await p.waitForTimeout(500);
  const saved = mock.db.profiles.find((x) => x.id === b);
  assert.ok(saved.card_public && saved.bio === "喜歡動態路線" && saved.climbing_years === "1-3");
  assert.deepEqual(saved.home_gyms, ["mingde", "g3"], "存了兩間館，照場館順序");
  assert.deepEqual(saved.self_stats, [1, 2, 3, 4, 5, 1]);

  // 別人看：公開後看得到
  card = await openCard(V.page);
  const text = await card.textContent();
  assert.ok(text.includes("喜歡動態路線") && text.includes("攀岩 1–3 年・常去明德館、中和館") && text.includes("V5"), "看得到人物卡");
  assert.equal(await card.locator('svg[aria-label="能力六角形"]').count(), 1, "有六角形能力表");
  assert.equal(await card.locator("text=清除不當的自我介紹").count(), 0, "顧客不能清除");
  assert.equal(await card.locator("text=私訊").count(), 0);

  // 店長清除
  const M = await phone(browser, mock);
  await login(M.page, "manager1");
  card = await openCard(M.page);
  await card.locator("text=清除不當的自我介紹（店長）").click();
  await card.locator("text=確定清除這段自我介紹？再按一次").click();
  await M.page.waitForTimeout(500);
  assert.equal(mock.db.profiles.find((x) => x.id === b).bio, null);
  assert.ok(mock.db.audit.some((x) => x.action === "card.clear" && x.detail.bio === "喜歡動態路線"));
  assert.deepEqual([...V.errors, ...B.errors, ...M.errors], []);
});

test("常去的館：原本只填一間的照樣顯示、可以加選；資料庫還沒套用 step31 時維持單選", async () => {
  for (const old of [false, true]) {
    const mock = createMock();
    mock.state.noHomeGyms = old;
    const b = mock.addUser("climberb", "password1", { nickname: "小安" });
    Object.assign(mock.db.profiles.find((x) => x.id === b), { card_public: true, home_gym: "g2", home_gyms: ["g2"] });
    const { page: p, errors } = await phone(browser, mock);
    await login(p, "climberb", "password1", "/card");
    await p.waitForTimeout(1000);
    assert.ok((await p.textContent("main")).includes("常去萬華館"), "原本填的館");
    await p.click('main button:text-is("編輯人物卡")');
    const gymChip = (name) => p.locator(`main button[aria-pressed]:text-is("${name}")`);
    assert.equal(await gymChip("萬華館").getAttribute("aria-pressed"), "true", "原本填的館已選");
    assert.equal((await p.textContent("main")).includes("可複選"), !old, old ? "還沒套用 step31：不寫可複選" : "寫可複選");
    await gymChip("明德館").click();
    // 還沒套用 step31：只能存一間，點別間就換成那一間（不會畫面上選兩間、實際只存一間）
    assert.equal(await gymChip("萬華館").getAttribute("aria-pressed"), old ? "false" : "true");
    await p.click('main button:text-is("儲存人物卡")');
    await p.waitForTimeout(800);
    const saved = mock.db.profiles.find((x) => x.id === b);
    if (old) assert.equal(saved.home_gym, "mingde", "還沒套用 step31：存選的那一間");
    else assert.deepEqual(saved.home_gyms, ["mingde", "g2"], "存兩間");
    assert.ok((await p.locator("[role=status]").last().textContent()).includes("已儲存"));
    // 存好後畫面照實際存的顯示；重新整理也一樣
    for (let i = 0; i < 2; i++) {
      const t = await p.textContent("main");
      assert.ok(old ? t.includes("常去明德館") && !t.includes("萬華館") : t.includes("常去明德館、萬華館"), `${i ? "重新整理後" : "存好後"}照實際存的顯示`);
      await p.reload({ waitUntil: "networkidle" });
      await p.waitForTimeout(1000);
    }
    assert.deepEqual(errors.filter((e) => !/404/.test(e)), []);
  }
});
