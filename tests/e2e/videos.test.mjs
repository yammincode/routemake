// 顧客分享影片：上傳、刪除自己的、員工在後台刪除、下架路線時影片一起刪除
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const clip = (name = "climb.mp4", mimeType = "video/mp4") => ({ name, mimeType, buffer: Buffer.from("fake video bytes") });

test("顧客分享影片、刪除自己的；員工刪影片並記錄；下架路線影片一起刪除", async () => {
  const mock = createMock();
  const me = mock.addUser("climber88", "password1", { nickname: "小安" });
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const setter = mock.addUser("setterx", "password1", { nickname: "阿定" });
  mock.db.staff_roles.push({ user_id: setter, gym_id: "mingde", role: "setter" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  mock.addRoute(zone, 2, "紅");
  mock.addVideo(other, r1, { caption: "第三手用左腳勾", status: "flash" });

  // ---- 顧客 ----
  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", `/zone?id=${zone.id}`);
  await c.waitForTimeout(600);
  await c.locator("main ul li button", { hasText: "A-01" }).click();
  await c.waitForTimeout(600);
  const dialog = c.locator("[role=dialog]");
  assert.ok((await dialog.textContent()).includes("第三手用左腳勾"), "看得到別人分享的影片");
  assert.equal(await dialog.locator("video").count(), 1);
  assert.equal(await dialog.locator('button:text-is("刪除")').count(), 0, "別人的影片沒有刪除鍵");

  await dialog.locator("input[type=file]").setInputFiles(clip("clip.avi", "video/x-msvideo"));
  await c.waitForTimeout(400);
  assert.ok((await c.locator("[role=status]").last().textContent()).includes("只能分享 MP4"), "不支援的格式被擋");

  await dialog.locator("input[type=file]").setInputFiles(clip());
  await c.waitForTimeout(600);
  assert.ok(await dialog.locator('button:text-is("上傳影片")').isDisabled(), "沒勾同意不能上傳");
  await c.fill("#vcap", "我的 beta");
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("上傳影片")').click();
  await c.waitForTimeout(1000);
  assert.equal(mock.db.videos.length, 2);
  const mine = mock.db.videos.find((v) => v.user_id === me);
  assert.ok(mine.path.startsWith(`mingde/${r1.id}/${me}/`) && mine.path.endsWith(".mp4"), "路徑是 場館/路線/本人/檔名");
  assert.equal(mine.caption, "我的 beta");
  assert.ok(mock.db.vfiles[mine.path], "檔案已上傳");
  assert.equal(await dialog.locator("video").count(), 2);

  await dialog.locator('button:text-is("刪除")').click();
  await c.waitForTimeout(600);
  assert.equal(mock.db.videos.length, 1, "刪除自己的影片");
  assert.ok(!mock.db.vfiles[mine.path], "檔案也刪掉");

  await dialog.locator("input[type=file]").setInputFiles(clip("again.mov", "video/quicktime"));
  await c.waitForTimeout(600);
  await dialog.locator("input[type=checkbox]").check();
  await dialog.locator('button:text-is("上傳影片")').click();
  await c.waitForTimeout(1000);
  assert.equal(mock.db.videos.length, 2);
  assert.ok(mock.db.videos.some((v) => v.user_id === me && v.path.endsWith(".mov")));

  // ---- 定線長 ----
  const S = await phone(browser, mock);
  const s = S.page;
  await login(s, "setterx", "password1", "/admin");
  await s.waitForTimeout(1200);
  const main = await s.textContent("main");
  assert.ok(main.includes("明德館顧客影片") && /目前\s*2\s*支/.test(main), "後台看得到影片數");
  const item = s.locator("main div.overflow-hidden", { hasText: "第三手用左腳勾" });
  await item.locator('button:text-is("刪除")').click();
  await s.waitForTimeout(200);
  assert.ok((await item.textContent()).includes("再按一次"), "刪除要按兩次");
  await item.locator('button:text-is("刪除")').click();
  await s.waitForTimeout(800);
  assert.equal(mock.db.videos.length, 1);
  assert.ok(mock.db.audit.some((a) => a.action === "video.delete" && a.detail.author_nickname === "阿明"), "員工刪影片寫操作紀錄");

  await s.locator("main ul li button", { hasText: "A-01" }).click();
  await s.click("[role=dialog] >> text=下架這條路線");
  assert.match(await s.textContent("[role=dialog] button.text-warn"), /影片會一起刪除/);
  await s.click("[role=dialog] button.text-warn");
  await s.waitForTimeout(800);
  assert.equal(mock.db.videos.length, 0, "下架後影片資料刪除");
  assert.equal(Object.keys(mock.db.vfiles).length, 0, "下架後影片檔案刪除");
  assert.deepEqual([...C.errors, ...S.errors], []);
});

test("未登入看得到影片、要登入才能分享；留言關閉且沒有影片時不顯示影片區", async () => {
  const mock = createMock();
  const other = mock.addUser("other22", "password1", { nickname: "阿明" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍");
  const r2 = mock.addRoute(zone, 2, "紅");
  r2.comments_enabled = false;
  mock.addVideo(other, r1, { caption: "看我的" });

  const G = await phone(browser, mock);
  const g = G.page;
  await g.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await g.waitForTimeout(600);
  await g.locator("main ul li button", { hasText: "A-01" }).click();
  await g.waitForTimeout(600);
  const text = await g.textContent("[role=dialog]");
  assert.ok(text.includes("看我的") && text.includes("登入後分享影片"));
  assert.equal(await g.locator("[role=dialog] input[type=file]").count(), 0);
  await g.keyboard.press("Escape");
  await g.waitForTimeout(400);
  await g.locator("main ul li button", { hasText: "A-02" }).click();
  await g.waitForTimeout(600);
  assert.ok(!(await g.textContent("[role=dialog]")).includes("影片"), "留言關閉、沒有影片：不顯示影片區");
  assert.deepEqual(G.errors, []);
});
