// 手機操作測試：啟動正式版伺服器（需先 npm run build）→ 跑 tests/e2e → 關掉伺服器
// 用法：npm run test:e2e（全部）、npm run test:e2e -- tests/e2e/檔名（只跑指定的檔，一次一個）
// 全部跑時分兩段，省時間：
//   1. 一般的測試檔同時跑 3 個（每個檔有自己的瀏覽器和假資料庫，互不干擾；只共用網站伺服器，伺服器不存資料）
//   2. 電腦忙時容易超時的（SOLO：真的錄影片、有計時、要等登入換新和送出重試）最後一個一個跑
// 環境變數 E2E_CONCURRENCY 可以改同時跑幾個（電腦慢、常超時就設 1，跟以前一樣一次一個）
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const PORT = process.env.E2E_PORT ?? "3100";
const BASE = `http://localhost:${PORT}`;
const DIR = "tests/e2e";
// 單獨跑：videos、share-ig（真的錄影片、壓縮，跟影片一樣久）、speed（有計時）、offline-sync（要等登入換新、送出失敗重試；電腦忙時「登出」那項曾經超時）
const SOLO = ["videos", "share-ig", "speed", "offline-sync"];
// 比較久的先開始跑，最後才不會剩一個大的在等
const FIRST = ["zone-rename", "auth", "plan3d", "zone-swipe", "admin-and-customer", "pwa-offline"];
const CONCURRENCY = Number(process.env.E2E_CONCURRENCY) || Math.max(1, Math.min(3, os.availableParallelism() - 1));

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", PORT], { stdio: ["ignore", "ignore", "inherit"] });

let ok = false;
for (let i = 0; i < 60 && !ok; i++) {
  await wait(500);
  ok = await fetch(BASE).then((r) => r.ok, () => false);
}
if (!ok) {
  server.kill();
  console.error("伺服器沒有啟動，請先執行 npm run build");
  process.exit(1);
}

const name = (f) => path.basename(f).replace(/\.test\.mjs$/, "");
const args = process.argv.slice(2);
let phases;
if (args.length) {
  phases = [{ label: "指定的檔", files: args, concurrency: Number(process.env.E2E_CONCURRENCY) || 1 }];
} else {
  const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".test.mjs")).sort().map((f) => `${DIR}/${f}`);
  const rank = (f) => (FIRST.includes(name(f)) ? FIRST.indexOf(name(f)) : FIRST.length);
  const together = all.filter((f) => !SOLO.includes(name(f))).sort((a, b) => rank(a) - rank(b));
  const solo = all.filter((f) => SOLO.includes(name(f)));
  phases = [
    { label: `同時跑 ${CONCURRENCY} 個`, files: together, concurrency: CONCURRENCY },
    { label: "單獨跑（錄影片、有計時、離線送出）", files: solo, concurrency: 1 },
  ].filter((p) => p.files.length);
}

// 畫面照原本的樣子（終端機是 spec、存到檔案是 TAP）；另外寫一份 TAP 到暫存檔算合計
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "routemake-e2e-"));
const total = { tests: 0, pass: 0, fail: 0, skipped: 0, cancelled: 0 };
const times = [];
let failed = false;
try {
  for (const [i, p] of phases.entries()) {
    const tap = path.join(tmp, `${i}.tap`);
    const rep = process.stdout.isTTY ? "spec" : "tap";
    console.log(`\n# ==== e2e ${i + 1}/${phases.length}：${p.label}（${p.files.length} 個檔）====`);
    const t0 = Date.now();
    const run = spawn(
      process.execPath,
      ["--test", `--test-concurrency=${p.concurrency}`, `--test-reporter=${rep}`, "--test-reporter-destination=stdout", "--test-reporter=tap", `--test-reporter-destination=${tap}`, ...p.files],
      { stdio: "inherit", env: { ...process.env, BASE_URL: BASE } },
    );
    const code = await new Promise((r) => run.on("exit", r));
    times.push(`${p.label} ${Math.round((Date.now() - t0) / 1000)} 秒`);
    if (code !== 0) failed = true;
    const text = fs.existsSync(tap) ? fs.readFileSync(tap, "utf8") : "";
    for (const k of Object.keys(total)) total[k] += Number(text.match(new RegExp(`^# ${k} (\\d+)$`, "m"))?.[1] ?? 0);
  }
} finally {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 合計（給人看，也給腳本用 grep "^# tests" | tail -1 抓）
console.log("\n# ==== e2e 合計 ====");
for (const [k, v] of Object.entries(total)) console.log(`# ${k} ${v}`);
console.log(`# 時間：${times.join("、")}`);
process.exit(failed ? 1 : 0);
