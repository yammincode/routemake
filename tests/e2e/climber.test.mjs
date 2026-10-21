// 攀岩角色（step48）：換裝室（全螢幕）做角色、鎖住的寫還差多少（A）、點了跳解鎖卡（B）、按完成才存；別人看到頭像和人物卡；
// 記完攀剛好解鎖：夥伴跳出來，點了到人物卡編輯；還沒套用 step48 照舊是夥伴；款式和開放條件跟資料庫一樣
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const days = (n) => new Date(Date.now() - n * 86400000).toISOString();
// 前 n 天每天記一條嘗試中（攀爬日 n 天）
const climbDays = (mock, uid, n) => {
  const zone = mock.db.zones[0];
  for (let i = 1; i <= n; i++) mock.addAscent(uid, mock.addRoute(zone, 2, "黃", [], 10 + i * 5, 20, days(30)), "project", taipeiDay(-i));
};

test("款式和開放條件：App（lib/climber-*.json）跟資料庫（migration 0054）一樣", () => {
  const sql = fs.readFileSync(new URL("../../supabase/migrations/20261117000054_climber.sql", import.meta.url), "utf8");
  const lit = (fn) => JSON.parse(sql.match(new RegExp(`function public\\.${fn}\\(\\)[\\s\\S]*?select '(.*?)'::jsonb`))[1]);
  const json = (f) => JSON.parse(fs.readFileSync(new URL(`../../lib/${f}`, import.meta.url), "utf8"));
  assert.deepEqual(lit("climber_values"), json("climber-values.json"));
  assert.deepEqual(lit("climber_rules"), json("climber-rules.json"));
});

test("攀岩角色：做角色、鎖住的寫還差多少、點了看解鎖卡（試穿、進度）、存起來；別人看到小頭像和人物卡", async () => {
  const mock = createMock();
  const me = mock.addUser("climber77", "password1", { nickname: "小岩" });
  mock.addUser("viewer02", "password1", { nickname: "阿明" });
  climbDays(mock, me, 4);
  const zone = mock.db.zones[0];
  const r = mock.addRoute(zone, 5, "藍", [], 50, 50, days(30));
  mock.db.comments.push({ id: crypto.randomUUID(), route_id: r.id, user_id: me, body: "腳換右邊就過了", created_at: new Date().toISOString(), edited_at: null, deleted_at: null });

  const A = await phone(browser, mock);
  const p = A.page;
  await login(p, "climber77", "password1", "/card");
  await p.waitForSelector('main [data-mascot="mingde"]');
  assert.equal(await p.getByTestId("climber-scene").count(), 0, "還沒做角色：人物卡照舊只有夥伴");
  // 換裝室（A 案）：人物卡上按「👕 換裝」打開全螢幕
  await p.click('main button:has-text("換裝")');
  const ed = p.getByTestId("climber-room");
  await ed.waitFor();
  // 上面的角色和分頁固定住：點選項前先捲到下面看得到的地方（不然會點到上面那塊）
  const tap = async (loc) => {
    await loc.evaluate((e) => e.scrollIntoView({ block: "end" }));
    await loc.click();
  };
  await ed.locator('button:text-is("做我的攀岩角色")').click();
  await ed.locator("[data-testid=climber-scene]").waitFor();
  assert.ok((await ed.locator("[data-testid=climber-scene]").textContent()).includes("夥伴：高山猛牛"), "夥伴站在旁邊");

  // 爬了 4 天：伸手抓點（1 天）開了；腳跟勾（5 天）鎖住，寫還差多少
  const reach = ed.locator('button:has-text("伸手抓點")');
  assert.ok(!(await reach.textContent()).includes("🔒"));
  await tap(reach);
  assert.equal(await reach.getAttribute("aria-pressed"), "true");
  const heel = ed.locator('button:has-text("腳跟勾")');
  assert.ok((await heel.textContent()).includes("🔒"));
  assert.ok((await heel.textContent()).includes("再爬 1 天"), "選項上寫還差多少（A 案）");
  assert.ok((await ed.locator('button:has-text("Dyno")').textContent()).includes("Flash 再 5 條"));
  // 點鎖住的：跳出解鎖卡（B 案），不會選上
  await tap(heel);
  const card = p.getByTestId("unlock-card");
  await card.waitFor();
  const t = (await card.textContent()).replace(/\s+/g, " ");
  assert.ok(t.includes("🔒 腳跟勾") && t.includes("攀爬 5 天解鎖") && t.includes("4 / 5 天，再爬 1 天"), t);
  assert.equal(await card.locator('[role=progressbar]').getAttribute("aria-valuenow"), "80");
  assert.equal(await card.locator("[data-climber=heel]").count(), 1, "試穿：卡片上是腳跟勾的樣子");
  await card.locator('button:text-is("知道了")').click();
  await p.waitForTimeout(400);
  assert.equal(await heel.getAttribute("aria-pressed"), "false", "鎖住的點了不會選上");
  // 特殊獎品：寫怎麼拿
  await ed.locator('[role=tab]:has-text("衣服")').click();
  await tap(ed.locator('button[aria-label^="上衣顏色 金"]'));
  await card.waitFor();
  assert.ok((await card.textContent()).includes("任一徽章升到金"));
  await card.locator('button:text-is("知道了")').click();
  await p.waitForTimeout(400);
  await tap(ed.getByRole("button", { name: "攀岩背心", exact: true }));
  await tap(ed.locator('button[aria-label="上衣顏色 萬華"]'));
  await ed.locator('[role=tab]:has-text("頭髮")').click();
  await tap(ed.getByRole("button", { name: "馬尾", exact: true }));
  // 換裝室上面的預覽馬上換；按「完成」才存，人物卡跟著換
  assert.equal(await ed.locator("[data-testid=climber-scene] [data-climber=reach]").count(), 1);
  assert.equal(mock.state.climberSaves ?? 0, 0, "還沒按完成不會存");
  await ed.locator('button:text-is("完成")').click();
  await p.waitForSelector("main [data-testid=climber-scene] [data-climber=reach]");
  assert.equal(await ed.count(), 0, "存好換裝室關掉");
  const saved = mock.db.profiles.find((x) => x.id === me).climber;
  assert.equal(saved.pose, "reach");
  assert.equal(saved.hair, "pony");
  assert.equal(saved.top, "tank");
  assert.equal(saved.topC, "wanhua");
  assert.equal(saved.bg, "longdong", "背景預設龍洞");
  assert.deepEqual(A.errors, []);

  // 別人看：留言旁的小頭像是角色的頭、人物卡是角色＋夥伴
  const V = await phone(browser, mock);
  const v = V.page;
  await login(v, "viewer02");
  await v.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await v.locator("main ul li button", { hasText: "藍色" }).click();
  await v.waitForTimeout(600);
  await v.click('[role=dialog] [role=tab]:has-text("留言")');
  await v.waitForSelector("[role=dialog] [data-climber-head]");
  await v.locator('[role=dialog] button:text-is("小岩")').first().click();
  await v.waitForSelector('[role=dialog] [data-testid=climber-scene] [data-climber="reach"]');
  assert.deepEqual(V.errors, []);
});

test("記完攀剛好解鎖：夥伴跳出來說解鎖了什麼，點了到人物卡編輯", async () => {
  const mock = createMock();
  const me = mock.addUser("climber78", "password1", { nickname: "小岩" });
  climbDays(mock, me, 4);
  const zone = mock.db.zones[0];
  mock.addRoute(zone, 4, "紅", [], 60, 60, days(30));
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber78", "password1", `/zone?id=${zone.id}`);
  // 打開 App 時先記下現在的數字（4 天）
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("routemake:climb-stats:")));
  await page.locator("main ul li button", { hasText: "紅色" }).click();
  await page.waitForTimeout(500);
  await page.locator('[role=dialog] button:has-text("完攀")').first().click();
  const toast = page.getByTestId("mascot-toast");
  await page.waitForFunction(() => document.querySelector("[data-testid=mascot-toast]")?.textContent.includes("解鎖新款式"), null, { timeout: 8000 });
  assert.ok((await toast.textContent()).includes("腳跟勾"), await toast.textContent());
  await toast.click();
  await page.waitForSelector('[data-testid=climber-room] button:text-is("做我的攀岩角色")');
  await page.waitForURL((u) => u.pathname === "/card" && !u.search, { timeout: 5000 });
  assert.deepEqual(errors, []);
});

test("還沒套用 step48：人物卡、頭像照舊是夥伴，編輯寫要執行 step48", async () => {
  const mock = createMock();
  mock.state.noClimber = true;
  mock.addUser("climber79", "password1", { nickname: "小岩" });
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber79", "password1", "/card");
  await page.waitForSelector('main [data-mascot="mingde"]');
  await page.click('main button:has-text("換裝")');
  const room = page.getByTestId("climber-room");
  await room.waitFor();
  // 打開先在「夥伴」：夥伴照樣能換、能存；攀岩那幾頁寫要執行 step48
  await room.locator('[role=tab]:has-text("攀岩")').click();
  await room.locator("text=請老闆在 Supabase 執行 step48").waitFor();
  assert.equal(await page.getByTestId("climber-scene").count(), 0);
  await room.locator('[role=tab]:has-text("夥伴")').click();
  await room.locator("button", { hasText: "星際猿猿" }).click();
  await room.locator('button:text-is("完成")').click();
  await page.waitForTimeout(600);
  assert.equal(mock.db.profiles.find((x) => x.username === "climber79").mascot.id, "wanhua");
  assert.deepEqual(errors, []);
});
