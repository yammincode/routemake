// 區域改名：按鍵盤右下角的鍵（完成）、「儲存名稱」、點別的地方都會存，只送一次；平面圖改寫新名字，沒改名的區照舊寫簡稱
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

// lib/floorplan.ts 每一區的原本名字（n）和簡稱（t），照平面圖分館
const PLAN_GYM = { MINGDE_PLAN: "mingde", WANHUA_PLAN: "g2", ZHONGHE_PLAN: "g3", NANGANG_PLAN: "g4", NANGANG_2F: "g4", XINDIAN_PLAN: "g5" };
function planEntries() {
  const out = [];
  let gym = null;
  for (const line of readFileSync(new URL("../../lib/floorplan.ts", import.meta.url), "utf8").split("\n")) {
    const b = line.match(/^export const (\w+): FloorPlanShape/);
    if (b) gym = PLAN_GYM[b[1]] ?? null;
    const m = line.match(/^\s+(\w+): \{ n: "([^"]*)", t: "([^"]*)"/);
    if (m && gym) out.push({ gym, code: m[1], n: m[2], t: m[3] });
  }
  return out;
}
const planTexts = (page) => page.locator("main svg g[role=button] text:first-of-type").allTextContents();

test("平面圖：每一區記的原本名字跟資料庫一樣，沒改名時各館平面圖都寫簡稱", async () => {
  const mock = createMock();
  const entries = planEntries();
  assert.ok(entries.length >= 50, `讀到平面圖的區域（${entries.length}）`);
  for (const e of entries) {
    const z = mock.db.zones.find((x) => x.gym_id === e.gym && x.code === e.code);
    assert.equal(z?.name, e.n, `${e.gym} ${e.code} 的原本名字要跟資料庫一樣`);
  }
  const { page, errors } = await phone(browser, mock);
  for (const gym of ["mingde", "g2", "g3", "g4", "g5"]) {
    await page.goto(`${BASE}/gym/${gym}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const want = entries.filter((e) => e.gym === gym).map((e) => e.t).sort();
    assert.deepEqual((await planTexts(page)).sort(), want, `${gym} 平面圖寫簡稱`);
  }
  assert.deepEqual(errors, []);
});

test("區域改名：按鍵盤完成鍵或「儲存名稱」都會存、只送一次；平面圖和顧客頁改寫新名字；定線長不能改", async () => {
  const mock = createMock();
  const mgr = mock.addUser("manager1", "password1", { nickname: "萬華店長" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "g2", role: "manager" });
  const st = mock.addUser("setter1", "password1", { nickname: "定線長" });
  mock.db.staff_roles.push({ user_id: st, gym_id: "g2", role: "setter" });
  const zone = (code) => mock.db.zones.find((z) => z.gym_id === "g2" && z.code === code);

  const M = await phone(browser, mock);
  const m = M.page;
  const patches = [];
  m.on("request", (r) => r.method() === "PATCH" && r.url().includes("/rest/v1/zones") && patches.push(r.url()));
  await login(m, "manager1", "password1", "/admin");
  await m.waitForTimeout(1000);
  await m.locator('main svg [aria-label^="教學區 Slab"]').click();
  await m.waitForTimeout(600);
  assert.equal(await m.inputValue("#zname"), "教學區 Slab");
  assert.equal(await m.locator('main button:text-is("儲存名稱")').count(), 0, "沒改名字時沒有儲存按鈕");

  // 注音、拼音選字時按的 Enter（輸入法還在組字）：不存
  await m.fill("#zname", "天花板");
  assert.equal(await m.locator('main button:text-is("儲存名稱")').count(), 1, "改了名字出現儲存按鈕");
  await m.dispatchEvent("#zname", "keydown", { key: "Enter", isComposing: true });
  await m.dispatchEvent("#zname", "keydown", { key: "Enter", keyCode: 229 });
  await m.waitForTimeout(600);
  assert.equal(patches.length, 0, "選字的 Enter 不會存");
  assert.equal(zone("SL").name, "教學區 Slab");
  // 鍵盤右下角的鍵（Enter）：存一次、跳出提示，按鈕消失
  await m.press("#zname", "Enter");
  await m.waitForTimeout(1000);
  assert.equal(zone("SL").name, "天花板", "按完成鍵就存");
  assert.equal(patches.length, 1, `只送一次（實際 ${patches.length} 次）`);
  assert.ok((await m.textContent("body")).includes("已更新區域名稱"));
  assert.equal(await m.locator('main button:text-is("儲存名稱")').count(), 0, "存好後按鈕消失");
  const labels = await planTexts(m);
  assert.ok(labels.includes("天花板") && !labels.includes("Slab"), `平面圖改寫新名字（${labels.join("、")}）`);
  assert.ok(labels.includes("B1") && labels.includes("訓練區"), "沒改名的區照舊");

  // 「儲存名稱」按鈕：長名字在平面圖上縮小
  await m.locator('main svg [aria-label^="B1 區"]').dispatchEvent("click");
  await m.waitForTimeout(600);
  await m.fill("#zname", "攀岩洞穴入口");
  await m.click('main button:text-is("儲存名稱")');
  await m.waitForTimeout(1000);
  assert.equal(zone("B1").name, "攀岩洞穴入口", "按儲存名稱就存");
  assert.equal(patches.length, 2, `點按鈕（輸入框同時失去焦點）也只送一次（實際 ${patches.length} 次）`);
  const big = m.locator("main svg g[role=button] text:first-of-type", { hasText: "攀岩洞穴入口" });
  assert.ok(+(await big.getAttribute("font-size")) < 40, "長名字字變小");
  assert.equal(await m.locator("main svg g[role=button] text:first-of-type", { hasText: "天花板" }).getAttribute("font-size"), "40", "三個字以內維持原本大小");

  // 顧客看到的平面圖、區域卡片也是新名字
  const C = await phone(browser, mock);
  await C.page.goto(BASE + "/gym/g2", { waitUntil: "networkidle" });
  await C.page.waitForTimeout(800);
  const cl = await planTexts(C.page);
  assert.ok(cl.includes("天花板") && cl.includes("攀岩洞穴入口") && !cl.includes("Slab"), `顧客平面圖寫新名字（${cl.join("、")}）`);

  // 定線長：名稱只能看不能改
  const S = await phone(browser, mock);
  await login(S.page, "setter1", "password1", "/admin");
  await S.page.waitForTimeout(1000);
  assert.equal(await S.page.getAttribute("#zname", "readonly"), "");
  await S.page.press("#zname", "Enter");
  assert.equal(await S.page.locator('main button:text-is("儲存名稱")').count(), 0);
  assert.deepEqual([...M.errors, ...C.errors, ...S.errors], []);
});

test("平面圖：每一區都改成新名字時，各館平面圖上的字都不會疊在一起（太長的會縮小或截短）", async () => {
  for (const name of ["測試牆", "非常非常長的區域名字"]) {
    const mock = createMock();
    for (const z of mock.db.zones) z.name = name;
    const { page, ctx, errors } = await phone(browser, mock);
    for (const gym of ["mingde", "g2", "g3", "g4", "g5"]) {
      await page.goto(`${BASE}/gym/${gym}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      // 每張平面圖（南港有 1F、2F 兩張）各自檢查：區域標籤的框兩兩不重疊
      const overlaps = await page.locator("main svg").evaluateAll((svgs) =>
        svgs.flatMap((svg) => {
          const boxes = [...svg.querySelectorAll("g[role=button] text:first-of-type")].map((t) => ({ t: t.textContent, b: t.getBBox() }));
          const hit = [];
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i].b, c = boxes[j].b;
              if (a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height) hit.push(`${boxes[i].t}／${boxes[j].t}`);
            }
          return hit;
        })
      );
      assert.deepEqual(overlaps, [], `${gym}「${name}」標籤不重疊`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

