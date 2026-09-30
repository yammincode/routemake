// 手機操作測試：啟動正式版伺服器（需先 npm run build）→ 跑 tests/e2e → 關掉伺服器
// 用法：npm run test:e2e
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const PORT = process.env.E2E_PORT ?? "3100";
const BASE = `http://localhost:${PORT}`;
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

const files = process.argv.slice(2).length ? process.argv.slice(2) : ["tests/e2e/*.test.mjs"];
const run = spawn(process.execPath, ["--test", "--test-concurrency=1", ...files], { stdio: "inherit", env: { ...process.env, BASE_URL: BASE } });
const code = await new Promise((r) => run.on("exit", r));
server.kill();
process.exit(code ?? 1);
