// 速度：區域頁只問資料庫一次；第二次進來先顯示手機裡上次的資料，不用等網路
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
