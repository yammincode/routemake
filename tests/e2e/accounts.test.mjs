// 帳號管理（step43）：店長從人物卡停權（1A）、被停權的人每頁上方看到提示條（2A）、不能留言按讚但照常記錄；
// 老闆解除、永久停權；後台「帳號管理」搜尋、看留言、停權中名單、刪帳號（連影片檔）；顧客自己刪帳號；還沒套用 step43 照常
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BASE, createMock, launch, login, phone, taipeiDay } from "./helpers.mjs";

let browser;
before(async () => (browser = await launch()));
after(async () => browser?.close());

// 打開某條路線卡片的留言分頁
async function openComments(page, zone, code) {
  await page.goto(`${BASE}/zone?id=${zone.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.locator("main ul li button", { hasText: code }).click();
  await page.waitForTimeout(700);
  await page.click('[role=dialog] [role=tab]:has-text("留言")');
  await page.waitForTimeout(300);
}
const toastText = async (page) => (await page.locator("[role=status]:not([data-suspend-notice])").last().textContent()) ?? "";

function setup() {
  const mock = createMock();
  const bad = mock.addUser("badguy", "password1", { nickname: "壞人" });
  const other = mock.addUser("climber88", "password1", { nickname: "小安" });
  const mgr = mock.addUser("manager1", "password1", { nickname: "王店長" });
  const st = mock.addUser("setter1", "password1", { nickname: "定線阿德" });
  mock.addUser("boss", "password1", { nickname: "老闆", is_owner: true });
  mock.db.staff_roles.push({ user_id: mgr, gym_id: "mingde", role: "manager" }, { user_id: st, gym_id: "mingde", role: "setter" });
  const zone = mock.db.zones[0];
  const r1 = mock.addRoute(zone, 4, "藍", ["技巧"]);
  const r2 = mock.addRoute(zone, 3, "紅");
  mock.addAscent(bad, r1, "send", taipeiDay());
  mock.addComment(bad, r1, "亂留言一");
  mock.addComment(bad, r2, "亂留言二");
  mock.addComment(other, r2, "起步腳點很滑");
  return { mock, bad, other, mgr, st, zone, r1, r2 };
}

test("停權：店長從人物卡停權、被停權的人看到提示條且不能留言按讚、照常記錄；老闆解除", async () => {
  const { mock, bad, zone, r2 } = setup();

  // 定線長看人物卡：沒有停權（只有店長、老闆）
  const S = await phone(browser, mock);
  await login(S.page, "setter1");
  await openComments(S.page, zone, "A1-01");
  await S.page.click('[role=dialog] button:text-is("壞人")');
  await S.page.waitForTimeout(600);
  assert.equal(await S.page.locator("[data-suspend-form]").count(), 0, "定線長不能停權");

  // 店長：點留言上的名字 → 人物卡下面停權
  const M = await phone(browser, mock);
  const m = M.page;
  await login(m, "manager1");
  await openComments(m, zone, "A1-01");
  await m.click('[role=dialog] button:text-is("壞人")');
  await m.waitForTimeout(800);
  const card = m.locator("[role=dialog]").last();
  assert.ok((await card.textContent()).includes("還沒有公開人物卡"), "沒公開人物卡也能停權");
  assert.ok((await card.textContent()).includes("留言 2 則"), "看得到留言數");
  const form = card.locator("[data-suspend-form]");
  assert.equal(await form.locator('button:text-is("永久")').count(), 0, "店長不能選永久");
  assert.equal(await form.locator('button:text-is("7 天")').getAttribute("aria-pressed"), "true", "預設 7 天");
  assert.ok(await form.locator("input[type=checkbox]").isChecked(), "預設勾選刪掉他的留言");
  assert.ok((await form.textContent()).includes("同時刪掉他在這館的留言（2 則）"), "店長只刪這館的");
  await form.locator('button:has-text("停權 7 天")').click();
  await m.waitForTimeout(300);
  assert.ok((await toastText(m)).includes("請寫停權原因"), "要寫原因");
  await form.locator("input[id^=why-]").fill("留言騷擾其他顧客");
  await form.locator('button:has-text("停權 7 天")').click();
  assert.ok((await form.textContent()).includes("確定停權 7 天？再按一次"), "按兩次");
  assert.ok(!mock.db.profiles.find((p) => p.id === bad).suspended_until, "按一次還沒停權");
  await form.locator('button:has-text("確定停權")').click();
  await m.waitForTimeout(800);
  const p = mock.db.profiles.find((x) => x.id === bad);
  assert.ok(p.suspended_until > new Date(Date.now() + 6.9 * 86400000).toISOString(), "停 7 天");
  assert.equal(p.suspended_reason, "留言騷擾其他顧客");
  assert.equal(mock.db.comments.filter((c) => c.user_id === bad && !c.deleted_at).length, 0, "他的留言都刪了");
  assert.ok(mock.db.audit.some((a) => a.action === "user.suspend" && a.target_id === bad && a.detail.comments_deleted === 2), "寫進操作紀錄");
  assert.ok((await card.textContent()).includes("停權中"), "人物卡改成顯示停權中");
  assert.ok((await card.textContent()).includes("提早解除停權"), "店長可以提早解除");

  // 被停權的人：每一頁上面都有提示條
  const B = await phone(browser, mock);
  const b = B.page;
  await login(b, "badguy", "password1", "/me");
  await b.waitForTimeout(800);
  const notice = b.locator("[data-suspend-notice]");
  assert.ok((await notice.textContent()).includes("帳號暫停到") && (await notice.textContent()).includes("還有 7 天"), "到哪天、還有幾天");
  assert.ok((await notice.textContent()).includes("留言騷擾其他顧客"), "原因");
  await openComments(b, zone, "A1-02");
  assert.equal(await b.locator("[data-suspend-notice]").count(), 1, "區域頁也有提示條");
  // 不能留言、按讚
  await b.fill('[role=dialog] textarea[placeholder^="公開留言"]', "放我出來");
  await b.click('[role=dialog] button:text-is("送出")');
  await b.waitForTimeout(600);
  assert.ok((await toastText(b)).includes("暫停中"), "留言被擋，說明原因");
  assert.ok(!mock.db.comments.some((c) => c.body === "放我出來"));
  await b.locator('[role=dialog] button[aria-label^="按讚"]').first().click();
  await b.waitForTimeout(800);
  assert.equal(mock.db.likes.filter((l) => l.user_id === bad).length, 0, "按讚被擋");
  assert.ok((await toastText(b)).includes("暫停中"), "按讚被擋，說明原因");
  // 不能分享影片（不用等壓縮完才被擋）
  await b.click('[role=dialog] [role=tab]:has-text("影片")');
  await b.waitForTimeout(300);
  assert.ok((await b.textContent("[role=dialog]")).includes("帳號暫停中，暫時不能分享影片"));
  // 照常記錄自己的完攀
  await b.click('[role=dialog] [role=tab]:has-text("紀錄")');
  await b.click('[role=dialog] button:has-text("完攀")');
  await b.waitForTimeout(800);
  assert.ok(mock.db.ascents.some((a) => a.user_id === bad && a.route_id === r2.id && a.status === "send"), "完攀照常記錄");

  // 老闆在帳號管理：停權中名單 → 改成永久、再解除
  const O = await phone(browser, mock);
  const o = O.page;
  await login(o, "boss", "password1", "/admin");
  await o.waitForTimeout(1500);
  const row = o.locator('[data-account="badguy"]').last();
  assert.ok((await row.textContent()).includes("停權中") && (await row.textContent()).includes("留言騷擾其他顧客"), "停權中名單");
  await row.locator('button:has-text("停權中")').click();
  await row.locator('button:has-text("提早解除停權")').click();
  await o.waitForTimeout(800);
  assert.ok(!mock.db.profiles.find((x) => x.id === bad).suspended_until, "解除了");
  assert.ok(mock.db.audit.some((a) => a.action === "user.unsuspend"), "解除寫進操作紀錄");
  await b.reload({ waitUntil: "networkidle" });
  await b.waitForTimeout(800);
  assert.equal(await b.locator("[data-suspend-notice]").count(), 0, "解除後提示條不見");

  // 老闆可以永久停權；店長不能解除永久的
  await o.fill("#accsearch", "壞人");
  await o.waitForTimeout(800);
  const hit = o.locator('[data-account="badguy"]').first();
  await hit.locator('button:text-is("停權…")').click();
  await hit.locator('button:text-is("永久")').click();
  await hit.locator("input[id^=why-]").fill("屢勸不聽");
  await hit.locator('button:has-text("停權（永久）")').click();
  await hit.locator('button:has-text("確定停權")').click();
  await o.waitForTimeout(800);
  assert.equal(mock.db.profiles.find((x) => x.id === bad).suspended_until, "infinity");
  await b.reload({ waitUntil: "networkidle" });
  await b.waitForTimeout(800);
  assert.ok((await b.locator("[data-suspend-notice]").textContent()).includes("帳號已停權"), "永久停權的提示");
  await m.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await m.waitForTimeout(1500);
  const mrow = m.locator('[data-account="badguy"]').last();
  await mrow.locator('button:has-text("停權中")').click();
  assert.equal(await mrow.locator('button:has-text("解除停權")').count(), 0, "店長不能解除永久停權");
  assert.ok((await mrow.textContent()).includes("永久停權只有老闆可以解除"));

  assert.deepEqual([...S.errors, ...M.errors, ...B.errors, ...O.errors].filter((e) => !/403/.test(e)), []);
  await Promise.all([S.ctx.close(), M.ctx.close(), B.ctx.close(), O.ctx.close()]);
});

test("帳號管理：定線長搜尋核對、看留言刪留言；員工不能停權；老闆刪帳號連影片檔", async () => {
  const { mock, bad, zone, r1 } = setup();
  const v = mock.addVideo(bad, r1, { thumb: true });

  // 定線長：搜尋 → 核對最近完攀 → 看留言、刪一則；沒有停權、刪帳號
  const S = await phone(browser, mock);
  const s = S.page;
  await login(s, "setter1", "password1", "/admin");
  await s.waitForTimeout(1500);
  assert.ok((await s.textContent("main")).includes("帳號管理"), "所有員工都有帳號管理");
  assert.ok((await s.textContent("main")).includes("目前沒有停權中的帳號"));
  await s.fill("#accsearch", "badg");
  await s.waitForTimeout(800);
  const row = s.locator('[data-account="badguy"]').first();
  const text = await row.textContent();
  assert.ok(text.includes("壞人") && text.includes("@badguy") && text.includes("留言 2") && text.includes("影片 1"), "暱稱、帳號、數量");
  assert.ok(text.includes("先跟本人核對") && text.includes("A1 區") && text.includes("V4"), "最近完攀");
  assert.equal(await row.locator('button:has-text("停權")').count(), 0, "定線長不能停權");
  assert.equal(await row.locator('button:has-text("刪帳號")').count(), 0, "定線長不能刪帳號");
  assert.equal(await row.locator('button:text-is("重設密碼")').count(), 1, "定線長可以重設密碼");
  await row.locator('button:text-is("看留言")').click();
  await s.waitForTimeout(600);
  assert.ok((await row.textContent()).includes("亂留言一") && (await row.textContent()).includes("亂留言二"));
  const del = row.locator("li", { hasText: "亂留言一" }).locator('button:text-is("刪除")');
  await del.click();
  await row.locator("li", { hasText: "亂留言一" }).locator('button:has-text("確定刪除")').click();
  await s.waitForTimeout(600);
  assert.ok(mock.db.comments.find((c) => c.body === "亂留言一").deleted_at, "刪掉了");
  // 搜員工：定線長看不到重設密碼（員工的帳號只有老闆能重設）
  await s.fill("#accsearch", "manager1");
  await s.waitForTimeout(800);
  const staffRow = s.locator('[data-account="manager1"]').first();
  assert.ok((await staffRow.textContent()).includes("員工"));
  assert.equal(await staffRow.locator('button:text-is("重設密碼")').count(), 0);

  // 老闆刪帳號：要打對暱稱，刪掉資料和影片檔
  const O = await phone(browser, mock);
  const o = O.page;
  await login(o, "boss", "password1", "/admin");
  await o.waitForTimeout(1500);
  await o.fill("#accsearch", "壞人");
  await o.waitForTimeout(800);
  const hit = o.locator('[data-account="badguy"]').first();
  await hit.locator('button:has-text("刪帳號")').click();
  const go = hit.locator('button:text-is("永久刪除這個帳號")');
  assert.ok(await go.isDisabled(), "沒打暱稱不能刪");
  await hit.locator("input[id^=del-]").fill("壞");
  assert.ok(await go.isDisabled());
  await hit.locator("input[id^=del-]").fill("壞人");
  await go.click();
  await o.waitForTimeout(1000);
  assert.ok(!mock.db.profiles.some((p) => p.id === bad), "帳號刪了");
  assert.ok(!mock.db.comments.some((c) => c.user_id === bad) && !mock.db.ascents.some((a) => a.user_id === bad), "紀錄、留言刪了");
  assert.ok(!mock.db.vfiles[v.path] && !mock.db.tfiles[v.thumb_path], "影片檔和縮圖一起刪");
  assert.ok(mock.db.audit.some((a) => a.action === "user.delete" && a.detail.username === "badguy"));
  // 員工帳號沒有刪帳號
  await o.fill("#accsearch", "setter1");
  await o.waitForTimeout(800);
  assert.equal(await o.locator('[data-account="setter1"] button:has-text("刪帳號")').count(), 0);

  assert.deepEqual([...S.errors, ...O.errors], []);
  await Promise.all([S.ctx.close(), O.ctx.close()]);
});

test("刪除我的帳號：密碼錯不刪、密碼對刪掉並登出（影片檔一起刪）；員工沒有這個按鈕", async () => {
  const { mock, other, zone } = setup();
  const r = mock.addRoute(zone, 2, "黃");
  const v = mock.addVideo(other, r);
  const C = await phone(browser, mock);
  const c = C.page;
  await login(c, "climber88", "password1", "/me");
  await c.waitForTimeout(800);
  await c.click('main button:text-is("刪除我的帳號")');
  const box = c.locator("[data-delete-me]");
  assert.ok((await box.textContent()).includes("不能復原"));
  await box.locator("#del-pw").fill("wrongpass1");
  await box.locator('button:text-is("永久刪除我的帳號")').click();
  await c.waitForTimeout(600);
  assert.ok((await box.textContent()).includes("密碼不對"));
  assert.ok(mock.db.profiles.some((p) => p.id === other), "還在");
  assert.ok(mock.db.videos.some((x) => x.id === v.id), "密碼錯不會先刪影片");
  await box.locator("#del-pw").fill("password1");
  await box.locator('button:text-is("永久刪除我的帳號")').click();
  await c.waitForTimeout(1200);
  assert.ok(!mock.db.profiles.some((p) => p.id === other), "帳號刪了");
  assert.ok(!mock.db.vfiles[v.path], "影片檔刪了");
  assert.ok((await c.textContent("main")).includes("註冊帳號"), "登出了");

  // 員工：沒有刪除我的帳號
  const M = await phone(browser, mock);
  await login(M.page, "manager1", "password1", "/me");
  await M.page.waitForTimeout(800);
  assert.equal(await M.page.locator('main button:text-is("刪除我的帳號")').count(), 0);
  assert.deepEqual([...C.errors, ...M.errors], []);
  await Promise.all([C.ctx.close(), M.ctx.close()]);
});

test("還沒套用 step43：人物卡沒有停權、後台說明要套用、其他照常", async () => {
  const { mock, zone } = setup();
  mock.state.noAccounts = true;
  const M = await phone(browser, mock);
  const m = M.page;
  await login(m, "manager1");
  await openComments(m, zone, "A1-01");
  await m.click('[role=dialog] button:text-is("壞人")');
  await m.waitForTimeout(800);
  assert.equal(await m.locator("[data-suspend-form]").count(), 0, "沒有停權");
  assert.ok((await m.locator("[role=dialog]").last().textContent()).includes("還沒有公開人物卡"), "人物卡照常");
  await m.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await m.waitForTimeout(1500);
  assert.ok((await m.textContent("main")).includes("還沒套用 step43"), "帳號管理說明要套用");
  assert.deepEqual(M.errors.filter((e) => !/404/.test(e)), []);
  await M.ctx.close();
});
