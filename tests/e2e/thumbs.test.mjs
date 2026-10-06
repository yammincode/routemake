// 小縮圖：上傳照片同時產生縮圖；舊照片沒有縮圖時改用原圖；店長一鍵補齊
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, WALL, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

test("照片縮圖：上傳自動產生、舊照片用原圖、後台補齊", async () => {
  const mock = createMock();
  const mgr = mock.addUser("manager1", "password1", { nickname: "店長" });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "mingde", role: "manager" });
  const zB = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "B1");
  // 舊照片：只有原圖、沒有縮圖
  const oldJpg = fs.readFileSync(WALL); // 內容不必是 JPEG，瀏覽器看得懂就好
  Object.assign(zB, { photo_path: "mingde/zones/B1-1.jpg", photo_width: 800, photo_height: 600 });
  mock.db.files[zB.photo_path] = oldJpg;

  const S = await phone(browser, mock);
  const s = S.page;
  const asked = [];
  s.on("request", (r) => r.url().includes("/zone-photos/") && asked.push(new URL(r.url()).pathname.split("/").pop()));
  await s.goto(BASE + "/gym/mingde", { waitUntil: "networkidle" });
  await s.waitForTimeout(800);
  const card = s.locator("main button", { hasText: "B1 區" }).locator("img");
  await card.scrollIntoViewIfNeeded();
  await s.waitForTimeout(800);
  assert.ok(asked.includes("B1-1.thumb.jpg"), "列表先要縮圖");
  assert.ok(await card.evaluate((img) => img.complete && img.naturalWidth > 0), "沒有縮圖時改用原圖，不會破圖");
  assert.ok((await card.getAttribute("src")).endsWith("B1-1.jpg"));

  // 新上傳：同時產生縮圖
  await login(s, "manager1", "password1", "/admin");
  await s.waitForTimeout(1200);
  await s.setInputFiles("input[type=file]", WALL);
  await s.waitForTimeout(2000);
  const zA = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "A1");
  assert.ok(zA.photo_path?.endsWith(".jpg"));
  const thumbA = mock.db.files[zA.photo_path.replace(/\.jpg$/, ".thumb.jpg")];
  assert.ok(thumbA, "上傳時同時產生縮圖");
  assert.ok(thumbA.length < mock.db.files[zA.photo_path].length, "縮圖比原圖小");

  // 後台補齊舊照片
  await s.click('main button:has-text("幫舊照片產生縮圖")');
  await s.waitForTimeout(1500);
  assert.ok(mock.db.files["mingde/zones/B1-1.thumb.jpg"], "補上舊照片的縮圖");
  assert.match(await s.locator("[role=status]").last().textContent(), /已補上 1 張縮圖/);
  await s.click('main button:has-text("幫舊照片產生縮圖")');
  await s.waitForTimeout(1200);
  assert.match(await s.locator("[role=status]").last().textContent(), /都已經有縮圖/, "按第二次不會重複做");
  assert.deepEqual(S.errors.filter((e) => !/404/.test(e)), []);
  await S.ctx.close();
});
