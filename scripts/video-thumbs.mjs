#!/usr/bin/env node
// =====================================================================
// 一次性：幫已經分享的舊影片補縮圖（影片列表只放縮圖、按了才載入影片，省 Supabase 流量）
// 新分享的影片 App 會自己做縮圖；這支只補「還沒有縮圖」的舊影片，可以重複跑（做過的會跳過）
//
// 先做好：
//   1. 在 Supabase SQL Editor 執行 supabase/setup/step38-video-thumbs.sql
//   2. .env.local 加一行管理金鑰（Supabase → Project Settings → API Keys → secret key 或 service_role）：
//        SUPABASE_SERVICE_ROLE_KEY=（貼上金鑰）
//      管理金鑰可以跳過所有權限：只能放 .env.local（不會上傳 GitHub），不要放到 Netlify、不要加 NEXT_PUBLIC_
//      補完可以在 Supabase 把這把金鑰刪掉或換新
//   3. 安裝 ffmpeg（只裝在這台電腦，不會改到專案）：npm install --no-save ffmpeg-static
//
// 用法（在專案資料夾）：
//   node scripts/video-thumbs.mjs          試跑：只列出要補幾支，不會改任何東西
//   node scripts/video-thumbs.mjs --run    真的補
//   node scripts/video-thumbs.mjs --run --limit 5   只補前 5 支（先試試看）
// =====================================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const RUN = args.includes("--run");
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) || 0 : 0;
const THUMB_WIDTH = 480;
const MAX_BYTES = 1024 * 1024; // 資料庫 video-thumbs 的上限

// 讀 .env.local（已經有設定的環境變數優先，測試用）
function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ffmpeg：環境變數 FFMPEG_PATH → npm 裝的 ffmpeg-static → 電腦裡的 ffmpeg
function findFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH];
  try {
    candidates.push(createRequire(path.join(process.cwd(), "package.json"))("ffmpeg-static"));
  } catch {}
  candidates.push("ffmpeg");
  for (const bin of candidates.filter(Boolean)) {
    if (spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0) return bin;
  }
  return null;
}

// 從影片擷取一格：第 1 秒（不到 2 秒的取中間），寬 480；先做 WebP，ffmpeg 不支援就做 JPEG
function makeThumb(ffmpeg, input, duration, dir) {
  const at = duration && duration < 2 ? duration / 2 : 1;
  const scale = `scale='min(${THUMB_WIDTH},iw)':-2`;
  const tries = [
    { ext: "webp", type: "image/webp", codec: ["-c:v", "libwebp", "-quality", "70"] },
    { ext: "jpg", type: "image/jpeg", codec: ["-q:v", "4"] },
  ];
  for (const seek of [at, 0]) {
    for (const t of tries) {
      const out = path.join(dir, `thumb.${t.ext}`);
      fs.rmSync(out, { force: true });
      const r = spawnSync(ffmpeg, ["-v", "error", "-y", "-ss", String(seek), "-i", input, "-frames:v", "1", "-vf", scale, ...t.codec, out]);
      if (r.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) {
        const buf = fs.readFileSync(out);
        if (buf.length <= MAX_BYTES) return { ...t, buf };
      }
    }
  }
  return null;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return fail("找不到 NEXT_PUBLIC_SUPABASE_URL：請在專案資料夾執行（要有 .env.local）");
  if (!key) return fail("找不到 SUPABASE_SERVICE_ROLE_KEY：請在 .env.local 加上管理金鑰（說明在這個檔案開頭）");
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return fail("找不到 ffmpeg：請先執行 npm install --no-save ffmpeg-static");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 還沒有縮圖的影片（一次讀 1000 筆）
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await sb.from("route_videos").select("id,path,duration_s").is("thumb_path", null).order("created_at").range(from, from + 999);
    if (r.error) {
      if (r.error.code === "42703") return fail("資料庫還沒有縮圖欄位：請先在 Supabase 執行 supabase/setup/step38-video-thumbs.sql");
      return fail(`讀影片清單失敗：${r.error.message}`);
    }
    rows.push(...r.data);
    if (r.data.length < 1000) break;
  }
  const todo = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(`還沒有縮圖的影片：${rows.length} 支${LIMIT ? `（這次做前 ${todo.length} 支）` : ""}`);
  if (!RUN) {
    todo.slice(0, 10).forEach((v) => console.log(`  ${v.path}`));
    if (todo.length > 10) console.log(`  …還有 ${todo.length - 10} 支`);
    console.log("這是試跑，沒有改任何東西。確定要補就加 --run：node scripts/video-thumbs.mjs --run");
    return;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "routemake-thumbs-"));
  let ok = 0;
  const failed = [];
  try {
    for (const [i, v] of todo.entries()) {
      const tag = `[${i + 1}/${todo.length}] ${v.path}`;
      try {
        const dl = await sb.storage.from("route-videos").download(v.path);
        if (dl.error) throw new Error(`下載失敗（${dl.error.message}）`);
        const input = path.join(dir, "video" + path.extname(v.path));
        fs.writeFileSync(input, Buffer.from(await dl.data.arrayBuffer()));
        const thumb = makeThumb(ffmpeg, input, v.duration_s ? Number(v.duration_s) : null, dir);
        if (!thumb) throw new Error("ffmpeg 擷取不到畫面（可能是檔案壞了）");
        const thumbPath = v.path.replace(/\.[^./]+$/, "") + "." + thumb.ext;
        // upsert：上次傳了縮圖但沒寫進資料庫時，這次覆蓋再寫
        const up = await sb.storage.from("video-thumbs").upload(thumbPath, thumb.buf, { contentType: thumb.type, cacheControl: "31536000", upsert: true });
        if (up.error) throw new Error(`上傳縮圖失敗（${up.error.message}）`);
        const upd = await sb.from("route_videos").update({ thumb_path: thumbPath }).eq("id", v.id).is("thumb_path", null);
        if (upd.error) throw new Error(`寫入資料庫失敗（${upd.error.message}）`);
        ok++;
        console.log(`${tag} ✓（${Math.round(thumb.buf.length / 1024)} KB）`);
      } catch (e) {
        failed.push(v.path);
        console.log(`${tag} ✗ ${e.message}`);
      } finally {
        for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`完成：補了 ${ok} 支${failed.length ? `，${failed.length} 支失敗（再跑一次會重試）` : ""}`);
  if (failed.length) process.exitCode = 1;
}

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

main().catch((e) => fail(`出錯了：${e.message}`));
