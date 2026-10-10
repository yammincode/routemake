// 我的紀錄「本月完攀」直條圖（抱石、上攀分開，黃色是 Flash，點一根才列出路線）；館首頁最新路線在平面圖下面
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, monthGrade, phone } from "./helpers.mjs";
import { taipeiDay } from "./mock-supabase.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("我的紀錄：本月完攀改成直條圖（抱石、上攀分開，Flash 分出來），點一根才列出那個難度的路線，換月份收起來", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zone = (gym, code) => mock.db.zones.find((z) => z.gym_id === gym && z.code === code);
  const created = new Date(Date.now() - 90 * 86400000).toISOString();
  const route = (gym, code, grade, color) => mock.addRoute(zone(gym, code), grade, color, [], 30, 40, created);
  const today = taipeiDay(0);
  // 這個月：V2 三條（兩條 Flash）、V4 一條（有心得）；上攀 5.10b、5.9 Flash
  mock.addAscent(me, route("mingde", "A1", 2, "藍"), "flash", today);
  mock.addAscent(me, route("mingde", "A1", 2, "紅"), "flash", today);
  mock.addAscent(me, route("mingde", "A2", 2, "綠"), "send", today);
  mock.addAscent(me, route("mingde", "A2", 4, "黃"), "send", today, { private_note: "腳要踩高一點" });
  mock.addAscent(me, route("g3", "A", 105, "紫"), "send", today);
  mock.addAscent(me, route("g3", "A", 103, "白"), "flash", today);
  // 不算進長條、但點了要列出來：岩友路線（Spray Wall）V3 Flash、長耐力 5.11 沒爬完
  const own = Object.assign(route("mingde", "S", 3, "白"), { kind: "community", name: "小安的路線" });
  mock.addAscent(me, own, "flash", today);
  const tr = mock.db.zones.find((z) => z.gym_id === "g2" && z.code === "TR");
  tr.grade_system = "endurance";
  const en = Object.assign(route("g2", "TR", 108, "白"), { holds: Array.from({ length: 10 }, (_, i) => ({ x: 10 + i * 8, y: 50, t: i ? (i === 9 ? "t" : "h") : "s" })) });
  mock.addAscent(me, en, "project", today, { highpoint: 3 });
  // 上個月：只有抱石 V6
  const [y, m] = today.split("-").map(Number);
  const lastDay = m === 1 ? `${y - 1}-12-15` : `${y}-${String(m - 1).padStart(2, "0")}-15`;
  mock.addAscent(me, route("mingde", "B1", 6, "黑"), "send", lastDay);

  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/me");
  await page.waitForTimeout(1200);
  const main = () => page.textContent("main");
  const col = (label) => page.locator(`main button[aria-label^="${label}，"]`);
  assert.ok((await main()).includes("本月完攀") && !(await main()).includes("本月難度分布"), "改成本月完攀");
  assert.equal(await col("V2").getAttribute("aria-label"), "V2，完攀 3 條，其中 Flash 2 條", "V2 三條、兩條 Flash");
  assert.equal(await col("V4").getAttribute("aria-label"), "V4，完攀 1 條");
  assert.equal(await col("5.10").getAttribute("aria-label"), "5.10，完攀 1 條", "上攀 5.10a–d 合成一根");
  assert.equal(await col("5.9").getAttribute("aria-label"), "5.9，完攀 1 條，其中 Flash 1 條");
  assert.ok(await col("V5").isDisabled(), "沒紀錄的那根不能點");
  assert.equal(await col("V3").getAttribute("aria-label"), "V3，完攀 0 條，岩友路線 1 條", "岩友路線不算進長條（跟上面的完攀數一樣）");
  assert.equal(await col("5.11").getAttribute("aria-label"), "5.11，完攀 0 條，嘗試中 1 條", "長耐力沒爬完不算完攀");
  assert.ok(!(await col("V3").isDisabled()) && !(await col("5.11").isDisabled()), "只有其他紀錄的那根點得到");
  const totals = (await page.locator("main .rounded-card b.text-note + span").allTextContents()).map((t) => t.replace(/\s+/g, ""));
  assert.deepEqual(totals, ["共4條・Flash2", "共2條・Flash1"], `抱石 4 條、上攀 2 條（${totals.join("｜")}）`);
  assert.equal(await page.locator("main li", { hasText: "藍色" }).count(), 0, "路線列表平常收起來");
  assert.ok((await main()).includes("點一根長條"), "提示點長條");

  // 點 V2：列出這個月 V2 的三條；其他難度的不在裡面；再點一次收起來
  await monthGrade(page, "V2");
  assert.equal(await col("V2").getAttribute("aria-pressed"), "true");
  assert.ok((await main()).includes("V2・3 條"));
  for (const c of ["藍色", "紅色", "綠色"]) assert.equal(await page.locator("main li", { hasText: c }).count(), 1, `V2 列出${c}`);
  assert.equal(await page.locator("main li", { hasText: "黃色" }).count(), 0, "V4 的不列");
  await monthGrade(page, "V4");
  assert.ok((await page.locator("main li", { hasText: "黃色" }).textContent()).includes("腳要踩高一點"), "換點 V4：列出 V4 和心得");
  await monthGrade(page, "V4");
  assert.equal(await page.locator("main li", { hasText: "黃色" }).count(), 0, "再點一次收起來");
  await monthGrade(page, "5.10");
  assert.equal(await page.locator("main li", { hasText: "紫色" }).count(), 1, "上攀 5.10 列出 5.10b");
  await monthGrade(page, "5.11");
  assert.ok((await page.locator("main li", { hasText: "TR-01" }).textContent()).includes("爬到 3／10 點"), "長耐力沒爬完的點 5.11 列出來");
  await monthGrade(page, "V3");
  assert.equal(await page.locator("main li", { hasText: "小安的路線" }).count(), 1, "岩友路線點 V3 列出來");

  // 上個月：只有抱石圖，選的收起來
  await page.click('main button[aria-label="上個月"]');
  await page.waitForTimeout(1000);
  assert.ok((await main()).includes("抱石") && !(await main()).includes("上攀"), "上個月沒爬上攀：只有抱石圖");
  assert.equal(await col("V6").getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator("main li", { hasText: "小安的路線" }).count(), 0, "換月份收起來");
  // 回到這個月：剛剛點開的也收起來了
  await page.click('main button[aria-label="下個月"]');
  await page.waitForTimeout(1000);
  assert.equal(await col("V3").getAttribute("aria-pressed"), "false", "回到這個月也收起來");
  assert.equal(await page.locator("main li", { hasText: "小安的路線" }).count(), 0);
  assert.deepEqual(errors, []);
});

test("館首頁：最新路線在平面圖下面、所有區域上面；這週沒有新路線就不顯示", async () => {
  for (const fresh of [true, false]) {
    const mock = createMock();
    const zA = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "A1");
    mock.addRoute(zA, 3, "藍", [], 30, 40, fresh ? undefined : new Date(Date.now() - 30 * 86400000).toISOString());
    const { page, errors } = await phone(browser, mock);
    await page.goto(`${BASE}/gym/mingde`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const heads = await page.locator("main h3").allTextContents();
    if (fresh) {
      assert.ok(heads.indexOf("最新路線") >= 0 && heads.indexOf("最新路線") < heads.indexOf("所有區域"), `最新路線在所有區域上面（${heads.join("、")}）`);
      const below = await page.evaluate(() => {
        const plan = document.querySelector('main svg[role="img"]');
        const h = [...document.querySelectorAll("main h3")].find((x) => x.textContent === "最新路線");
        return !!(plan && h && plan.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      assert.ok(below, "在平面圖下面");
    } else {
      assert.ok(!heads.includes("最新路線") && !(await page.textContent("main")).includes("這週還沒有新路線"), "沒有新路線就不顯示");
    }
    assert.deepEqual(errors, []);
  }
});
