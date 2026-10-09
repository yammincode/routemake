// 速度：區域頁只問資料庫一次；第二次進來先顯示手機裡上次的資料，不用等網路；字型不塞進第一次下載；點區域不等網路
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("區域頁：一次拿齊資料，第二次進來先顯示上次的資料", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "A1");
  const r1 = mock.addRoute(zA, 3, "藍", ["技巧"], 30, 40);
  mock.addRoute(zA, 1, "蒂芬妮", [], 60, 50);
  mock.addAscent(me, r1, "send", "2026-10-01");
  mock.db.comments.push({ id: "c1", route_id: r1.id, user_id: me, body: "好爬", created_at: new Date().toISOString(), deleted_at: null, edited_at: null });

  const { page, ctx, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/gym/mingde");
  await page.waitForTimeout(600);

  const asked = [];
  page.on("request", (r) => r.url().includes("/rest/v1/") && asked.push(new URL(r.url()).pathname.replace("/rest/v1/", "")));
  await page.goto(`${BASE}/zone?id=${zA.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  assert.ok(await page.isVisible("main ul li >> text=A1-01"), "路線列表出現");
  assert.ok((await page.locator("main ul li", { hasText: "A1-01" }).textContent()).includes("1"), "顯示留言數");
  const zoneAsks = asked.filter((p) => !["rpc/my_access", "rpc/record_open", "scoring_rules"].includes(p));
  assert.deepEqual(zoneAsks, ["rpc/zone_view"], `區域頁只問資料庫一次（實際：${asked.join(", ")}）`);

  // 網路變很慢：先顯示手機裡上次的資料
  await page.route("**/rest/v1/rpc/zone_view", async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.fallback();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  assert.ok(await page.isVisible("main ul li >> text=A1-01"), "網路還沒回來就先顯示上次的路線");
  await page.waitForTimeout(3500);
  assert.ok(await page.isVisible("main ul li >> text=A1-02"));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("區域頁：資料庫還沒套用 step17 時改用原本的方式，照樣看得到", async () => {
  const mock = createMock();
  const zA = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "A1");
  mock.addRoute(zA, 2, "灰", [], 30, 40);
  const { page, ctx, errors } = await phone(browser, mock);
  await page.route("**/rest/v1/rpc/zone_view", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST202", message: "Could not find the function public.zone_view" }) })
  );
  await page.goto(`${BASE}/zone?id=${zA.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.ok(await page.isVisible("main ul li >> text=A1-01"), "照樣顯示路線");
  assert.deepEqual(errors.filter((e) => !/404/.test(e)), []);
  await ctx.close();
});

test("第一次打開：字型不放進預先下載、中文字型只宣告一份", async () => {
  const sw = await (await fetch(BASE + "/sw.js")).text();
  assert.ok(sw.includes("/_next/static/chunks/"), "預先下載清單還在（程式檔）");
  assert.ok(!/\/_next\/static\/media\/[^"'\s]+\.woff2/.test(sw), "字型檔不在預先下載清單裡");
  const html = await (await fetch(BASE + "/")).text();
  const css = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
  assert.ok(css.length > 0);
  let faces = 0;
  for (const href of css) faces += ((await (await fetch(new URL(href, BASE))).text()).match(/@font-face/g) ?? []).length;
  assert.ok(faces > 0 && faces < 150, `字型宣告 ${faces} 條（原本同一批字型重複宣告 4 次，超過 400 條）`);
});

test("點區域：手機裡有上次的資料就直接畫出來，不用等網路", async () => {
  const mock = createMock();
  mock.addUser("climber88", "password1", { nickname: "小安" });
  const zA = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "A1");
  mock.addRoute(zA, 3, "藍", [], 30, 40);
  mock.addRoute(zA, 5, "紅", [], 60, 50);
  const { page, errors } = await phone(browser, mock);
  await login(page, "climber88", "password1", "/gym/mingde");
  await page.waitForTimeout(800);
  // 第一次進區域（存下資料）→ 回館首頁
  await page.locator("main button", { hasText: "A1 區" }).first().click();
  await page.waitForURL("**/zone?id=**");
  await page.waitForTimeout(800);
  await page.goBack();
  await page.waitForURL("**/gym/mingde");
  await page.waitForTimeout(600);

  // 網路變很慢：資料庫 3 秒才回應
  await page.route("**/rest/v1/rpc/zone_view**", async (r) => {
    await new Promise((res) => setTimeout(res, 3000));
    await r.fallback();
  });
  const t0 = Date.now();
  await page.locator("main button", { hasText: "A1 區" }).first().click();
  await page.locator("main ul li", { hasText: "A1-02" }).waitFor({ timeout: 2500 });
  const ms = Date.now() - t0;
  assert.ok(ms < 1500, `資料庫還沒回應就先畫出上次的路線（${ms} ms）`);
  assert.equal(await page.locator("main", { hasText: "讀取中" }).count(), 0, "沒有先閃「讀取中」");
  await page.waitForTimeout(3200);
  assert.deepEqual(errors, []);
});
