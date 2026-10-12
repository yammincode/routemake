// 舊影片補縮圖的腳本（scripts/video-thumbs.mjs）：用本機的假 Supabase 跑一遍
// 試跑、錯誤訊息不用 ffmpeg；真的補（--run）需要 ffmpeg（環境變數 FFMPEG_PATH、npm 裝的 ffmpeg-static、或電腦裡的 ffmpeg），都沒有就跳過那一項
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function ffmpegBin() {
  const list = [process.env.FFMPEG_PATH];
  try {
    list.push(createRequire(path.join(ROOT, "package.json"))("ffmpeg-static"));
  } catch {}
  list.push("ffmpeg");
  return list.filter(Boolean).find((b) => spawnSync(b, ["-version"], { stdio: "ignore" }).status === 0) ?? null;
}
const FFMPEG = ffmpegBin();

// 假的 Supabase：影片清單（PostgREST）、公開網址讀影片（ffmpeg 用）、下載影片、上傳縮圖、寫回 thumb_path
// 腳本一定要用 thumb_path=is.null 篩選（不然會重做、蓋掉 App 做好的縮圖），沒帶就回錯誤
function fakeSupabase(videos, files) {
  const thumbs = {};
  const downloads = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const json = (code, data) => (res.writeHead(code, { "content-type": "application/json" }), res.end(JSON.stringify(data)));
      if (u.pathname.startsWith("/storage/v1/object/public/route-videos/") && req.method === "GET") {
        const f = files[decodeURIComponent(u.pathname.replace("/storage/v1/object/public/route-videos/", ""))];
        if (!f) return json(404, { message: "Object not found" });
        res.writeHead(200, { "content-type": "video/mp4", "content-length": f.length });
        return res.end(f);
      }
      if (req.headers.authorization !== "Bearer test-service-key") return json(401, { message: "需要管理金鑰" });
      if (u.pathname.startsWith("/rest/v1/route_videos") && u.searchParams.get("thumb_path") !== "is.null") return json(400, { message: "沒有用 thumb_path=is.null 篩選" });
      if (u.pathname === "/rest/v1/route_videos" && req.method === "GET") {
        const rows = videos.filter((v) => !v.thumb_path).map(({ id, path: p, duration_s }) => ({ id, path: p, duration_s }));
        return json(200, rows);
      }
      if (u.pathname === "/rest/v1/route_videos" && req.method === "PATCH") {
        const id = (u.searchParams.get("id") || "").replace(/^eq\./, "");
        const v = videos.find((x) => x.id === id && !x.thumb_path);
        if (v) v.thumb_path = JSON.parse(body.toString()).thumb_path;
        res.writeHead(204);
        return res.end();
      }
      if (u.pathname.startsWith("/storage/v1/object/route-videos/") && req.method === "GET") {
        const p = decodeURIComponent(u.pathname.replace("/storage/v1/object/route-videos/", ""));
        downloads.push(p);
        const f = files[p];
        if (!f) return json(404, { message: "Object not found" });
        res.writeHead(200, { "content-type": "video/mp4" });
        return res.end(f);
      }
      if (u.pathname.startsWith("/storage/v1/object/video-thumbs/") && req.method === "POST") {
        const p = decodeURIComponent(u.pathname.replace("/storage/v1/object/video-thumbs/", ""));
        thumbs[p] = { buf: body, type: req.headers["content-type"], cache: req.headers["cache-control"], upsert: req.headers["x-upsert"] };
        return json(200, { Key: "video-thumbs/" + p });
      }
      json(404, { message: "not found " + u.pathname });
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, thumbs, downloads, url: `http://127.0.0.1:${server.address().port}` })));
}

function runScript(url, args = [], key = "test-service-key") {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [path.join(ROOT, "scripts/video-thumbs.mjs"), ...args], {
      cwd: os.tmpdir(), // 不讀專案的 .env.local
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, ...(FFMPEG ? { FFMPEG_PATH: FFMPEG } : {}) },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => ok({ code, out }));
  });
}

test("補縮圖腳本：試跑不改東西；--run 讀影片網址（不整支下載）做 WebP 縮圖（寬 480、快取 1 小時）、寫回資料庫；壞檔案報錯、再跑會跳過做好的", async (ctx) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rm-thumb-test-"));
  const mk = (name, args) => {
    if (!FFMPEG) return Buffer.from("fake");
    const f = path.join(dir, name);
    assert.equal(spawnSync(FFMPEG, ["-v", "error", "-y", ...args, f]).status, 0);
    return fs.readFileSync(f);
  };
  const files = {
    "mingde/r1/u1/a.mp4": mk("a.mp4", ["-f", "lavfi", "-i", "testsrc=duration=2:size=1280x720:rate=30", "-pix_fmt", "yuv420p"]),
    "mingde/r1/u1/short.mp4": mk("short.mp4", ["-f", "lavfi", "-i", "testsrc=duration=0.5:size=640x360:rate=30", "-pix_fmt", "yuv420p"]),
    "mingde/r1/u2/bad.mp4": Buffer.from("這不是影片"),
  };
  const videos = [
    { id: "v1", path: "mingde/r1/u1/a.mp4", duration_s: 2, thumb_path: null },
    { id: "v2", path: "mingde/r1/u1/short.mp4", duration_s: 0.5, thumb_path: null },
    { id: "v3", path: "mingde/r1/u2/bad.mp4", duration_s: 5, thumb_path: null },
    { id: "v4", path: "mingde/r1/u2/done.mp4", duration_s: 5, thumb_path: "mingde/r1/u2/done.webp" },
  ];
  const sb = await fakeSupabase(videos, files);
  try {
    const dry = await runScript(sb.url);
    assert.equal(dry.code, 0, dry.out);
    assert.match(dry.out, /還沒有縮圖的影片：3 支/);
    assert.match(dry.out, /試跑/);
    assert.match(dry.out, /流量：每支只讀開頭需要的部分/, "試跑說明流量");
    assert.equal(Object.keys(sb.thumbs).length, 0, "試跑不上傳");
    assert.ok(videos.every((v) => v.id === "v4" || !v.thumb_path), "試跑不寫資料庫");

    if (!FFMPEG) return ctx.diagnostic("沒有 ffmpeg：--run 那一段沒有測（設定 FFMPEG_PATH 或 npm install --no-save ffmpeg-static）");
    const run = await runScript(sb.url, ["--run"]);
    assert.equal(run.code, 1, "有失敗的要回報");
    assert.match(run.out, /補了 2 支，1 支失敗/);
    assert.match(run.out, /bad\.mp4 ✗/);
    const t = sb.thumbs["mingde/r1/u1/a.webp"];
    assert.ok(t, "a.mp4 的縮圖叫 a.webp");
    assert.equal(t.type, "image/webp");
    assert.deepEqual(sb.downloads, ["mingde/r1/u2/bad.mp4"], "好的影片直接讀網址，不整支下載；讀不了的才下載");
    assert.equal(t.cache, "max-age=3600", "快取 1 小時（跟影片一樣）");
    assert.equal(t.buf.subarray(0, 4).toString(), "RIFF", "是 WebP");
    assert.equal(t.buf.readUInt16LE(26) & 0x3fff, 480, "寬 480");
    assert.ok(sb.thumbs["mingde/r1/u1/short.webp"], "不到 1 秒的影片也做得出來");
    assert.equal(videos.find((v) => v.id === "v1").thumb_path, "mingde/r1/u1/a.webp", "寫回資料庫");
    assert.equal(videos.find((v) => v.id === "v3").thumb_path, null, "壞檔案不寫");
    assert.equal(videos.find((v) => v.id === "v4").thumb_path, "mingde/r1/u2/done.webp", "已經有縮圖的不動");

    const again = await runScript(sb.url, ["--run"]);
    assert.match(again.out, /還沒有縮圖的影片：1 支/, "再跑只剩失敗的那支");
  } finally {
    sb.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("補縮圖腳本：沒有管理金鑰、貼成公開金鑰、資料庫還沒有縮圖欄位時說清楚；.env.local 有 BOM 也讀得到", async () => {
  const noKey = await new Promise((ok) => {
    const p = spawn(process.execPath, [path.join(ROOT, "scripts/video-thumbs.mjs")], { cwd: os.tmpdir(), env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "" } });
    let out = "";
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => ok({ code, out }));
  });
  assert.equal(noKey.code, 1);
  assert.match(noKey.out, /SUPABASE_SERVICE_ROLE_KEY/);

  const pub = await runScript("http://127.0.0.1:9", [], "sb_publishable_abc");
  assert.equal(pub.code, 1);
  assert.match(pub.out, /公開金鑰/, "貼成公開金鑰時說清楚");

  // .env.local 用記事本存成「UTF-8 有 BOM」也讀得到網址和金鑰
  const sb = await fakeSupabase([{ id: "v1", path: "mingde/r1/u1/a.mp4", duration_s: 2, thumb_path: null }], {});
  const envDir = fs.mkdtempSync(path.join(os.tmpdir(), "rm-thumb-env-"));
  try {
    fs.writeFileSync(path.join(envDir, ".env.local"), `﻿NEXT_PUBLIC_SUPABASE_URL=${sb.url}\r\nSUPABASE_SERVICE_ROLE_KEY=test-service-key\r\n`);
    const env = { ...process.env };
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    const bom = await new Promise((ok) => {
      const p = spawn(process.execPath, [path.join(ROOT, "scripts/video-thumbs.mjs")], { cwd: envDir, env });
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (out += d));
      p.on("close", (code) => ok({ code, out }));
    });
    assert.equal(bom.code, 0, bom.out);
    assert.match(bom.out, /還沒有縮圖的影片：1 支/, ".env.local 有 BOM 也讀得到");
  } finally {
    sb.server.close();
    fs.rmSync(envDir, { recursive: true, force: true });
  }

  const server = http.createServer((req, res) => {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "42703", message: "column route_videos.thumb_path does not exist" }));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const r = await runScript(`http://127.0.0.1:${server.address().port}`);
    assert.equal(r.code, 1);
    assert.match(r.out, /step38/, "提醒先執行 step38");
  } finally {
    server.close();
  }
});
