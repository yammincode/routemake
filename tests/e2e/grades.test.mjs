// 難度膠帶顏色與 VB：後台選難度的按鈕塗成膠帶顏色；可以新增 VB 路線（分數比 V0 低）；顧客的難度篩選也有顏色；區域頁「顏色和分數怎麼看」
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { BASE, WALL, createMock, launch, login, phone } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

const bg = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);

test("難度按鈕用膠帶顏色、新增 VB 路線、顧客用顏色篩選", async () => {
  const mock = createMock();
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  const zA = mock.db.zones.find((z) => z.gym_id === "mingde" && z.code === "A1");
  Object.assign(zA, { photo_path: "mingde/zones/A1-1.jpg", photo_width: 800, photo_height: 600 });
  mock.db.files[zA.photo_path] = fs.readFileSync(WALL);
  mock.addRoute(zA, 3, "藍", [], 70, 60);

  const A = await phone(browser, mock);
  const a = A.page;
  await login(a, "boss", "password1", "/admin");
  await a.waitForTimeout(1000);
  const wall = a.locator("main div.cursor-crosshair");
  await wall.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bb = await wall.boundingBox();
  await a.mouse.click(bb.x + bb.width * 0.3, bb.y + bb.height * 0.5);
  await a.waitForTimeout(400);
  const dlg = a.locator("[role=dialog]");
  const labels = await dlg.locator('button:text-matches("^V(B|\\\\d+)$")').allTextContents();
  assert.deepEqual(labels, ["VB", "V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10"], "難度從 VB 開始");
  assert.equal(await bg(dlg.locator('button:text-is("V3")')), "rgb(46, 134, 200)", "V3 是藍色膠帶");
  assert.equal(await bg(dlg.locator('button:text-is("V0")')), "rgb(216, 230, 43)", "V0 是螢光黃");
  assert.equal(await bg(dlg.locator('button:text-is("VB")')), "rgb(242, 241, 236)", "VB 是白色");
  await dlg.locator('button[aria-label="紅"]').click();
  await dlg.locator('button:text-is("VB")').click();
  assert.equal(await dlg.locator('button:text-is("VB")').getAttribute("aria-pressed"), "true");
  await dlg.locator('button:text-is("新增路線")').click();
  await a.waitForTimeout(700);
  const vb = mock.db.routes.find((r) => r.grade === -1);
  assert.ok(vb, "新增了 VB 路線");
  assert.ok((await a.locator("main ul li", { hasText: vb.code }).textContent()).includes("5分"), "VB 是 5 分（比 V0 低）");

  // 顧客：難度篩選有顏色，VB 排最前面
  const C = await phone(browser, mock);
  const c = C.page;
  await c.goto(`${BASE}/zone?id=${zA.id}`, { waitUntil: "networkidle" });
  await c.waitForTimeout(800);
  const chips = c.locator("main button[aria-pressed]").filter({ hasText: /^V(B|\d+)$/ });
  assert.deepEqual(await chips.allTextContents(), ["VB", "V3"], "只列牆上有的難度，VB 在前");
  assert.equal(await bg(chips.nth(1)), "rgb(46, 134, 200)", "篩選的 V3 是藍色");
  await chips.first().click();
  await c.waitForTimeout(300);
  assert.equal(await c.locator("main ul li").count(), 1, "篩選 VB");
  assert.ok((await c.locator("main ul li").first().textContent()).includes("VB"));
  assert.deepEqual([...A.errors, ...C.errors], []);
  await Promise.all([A.ctx.close(), C.ctx.close()]);
});

test("區域頁「顏色和分數怎麼看」：第一次展開，按知道了收起來，重新進來還是收著", async () => {
  const mock = createMock();
  const zA = mock.db.zones[0];
  mock.addRoute(zA, 3, "藍", [], 50, 50);
  const { page, errors } = await phone(browser, mock);
  await page.goto(BASE + "/zone?id=" + zA.id, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const note = page.locator("main [role=note]");
  const text = await note.textContent();
  assert.ok(text.includes("顏色是岩點的顏色") && text.includes("例如 V3") && text.includes("膠帶的顏色"), "說明圓點和膠帶顏色");
  assert.match(text, /Flash：第一次嘗試就完攀，分數 ×1\.2/, "Flash 和倍數");
  await page.click('main [role=note] button:text-is("知道了")');
  assert.equal(await note.count(), 0, "按知道了收起來");
  assert.ok(await page.isVisible('main button:has-text("顏色和分數怎麼看")'), "收成一行小字");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  assert.equal(await note.count(), 0, "重新進來還是收著");
  await page.click('main button:has-text("顏色和分數怎麼看")');
  assert.equal(await note.count(), 1, "點一下可以再看");
  assert.deepEqual(errors, []);
});
