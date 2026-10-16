// 分享到 IG 的圖：在手機上用 canvas 畫，1080×1920（限時動態的大小）
// A3 完攀圖：區域照片（以起步點為中心裁成直的）＋下方白色貼紙（膠帶色難度、區域、館名、日期、QR code）
// C1 本月完攀圖：完攀條數、積分、Flash、攀爬天數、本月完攀直條圖（膠帶色）、原岩夥伴
// B2 影片角落小貼紙：膠帶色難度＋館名・區域，壓縮影片時畫在每一格左下角
// 圖上的顏色是固定的（分享出去的圖不跟著手機深色模式變），一律用 lib/design.ts、lib/gyms.ts 的顏色
import QRCode from "qrcode";
import { HOLD_COLORS, gradeColor, gradeLabel, gradeShort, holdTextColor, type HoldColor, type Status } from "@/lib/design";
import { BRAND_MARK, GYM_COLORS, GYMS, gymShort } from "@/lib/gyms";
import { inkOn } from "@/lib/resets";
import { MASCOT_ART } from "@/lib/mascot-art";
import { mascotInfo, tint, type MascotPick } from "@/lib/mascots";
import type { Hold } from "@/lib/data";
import type { MonthShow, SendShow, VideoShow } from "@/lib/share-options";

const W = 1080;
const H = 1920;
// 跟 app/globals.css 淺色模式一樣（分享出去的圖固定用淺色）
const C = {
  ink: "#15201B",
  muted: "#5E6A64",
  surface: "#FAFBF9",
  sunk: "#EEF0EC",
  line: "#D2D7D2",
  accent: "#6B2D3C",
  flash: "#F5B700",
  flashInk: "#2B2100",
  start: "#1fa45a",
  mid: "#2f7de1",
  top: "#e5484d",
};

// ---------- 共用 ----------
type Fonts = { sans: string; num: string };
// 字型要先載好才畫（中文字型切成很多片，只載這張圖用到的字）；載不到就用手機內建字型照樣畫
async function loadFonts(text: string): Promise<Fonts> {
  const sans = getComputedStyle(document.body).fontFamily || "sans-serif";
  const probe = document.createElement("span");
  probe.className = "font-num";
  document.body.appendChild(probe);
  const num = getComputedStyle(probe).fontFamily || sans;
  probe.remove();
  try {
    await Promise.race([
      Promise.all([
        ...["400", "500", "700", "900"].map((w) => document.fonts.load(`${w} 40px ${sans}`, text)),
        document.fonts.load(`700 40px ${num}`, "VB0123456789.+-abcd/%"),
      ]),
      new Promise((res) => setTimeout(res, 4000)),
    ]);
  } catch {}
  return { sans, num };
}

const loadImg = (src: string, cors: boolean) =>
  new Promise<HTMLImageElement | null>((res) => {
    const i = new Image();
    if (cors) i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

// 太長的字縮小到放得下（最小到 0.6 倍），再放不下就加「…」
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, weight: string, size: number, family: string) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > max && s > size * 0.6) {
    s -= 2;
    g.font = `${weight} ${s}px ${family}`;
  }
  let t = text;
  while (g.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + "…";
  g.fillText(t, x, y);
}

// 膠帶色（V9、V10、上攀沒有膠帶顏色：用原岩酒紅）
const tape = (grade: number) => gradeColor(grade) ?? { bg: C.accent, fg: "#fff" };

async function qrImage(url: string, size: number) {
  try {
    const d = await QRCode.toDataURL(url, { width: size, margin: 1, color: { dark: C.ink, light: "#FFFFFF" } });
    return await loadImg(d, false);
  } catch {
    return null;
  }
}

// 原岩夥伴（照自己換的顏色）：把 SVG 裡的 var(--mN,原色) 換成顏色，畫成圖片
async function mascotImage(pick: MascotPick) {
  const art = MASCOT_ART[pick.id];
  const vars: Record<string, string> = {};
  mascotInfo(pick.id).parts.forEach((p, i) => {
    const c = pick.colors?.[i];
    if (!c) return;
    p.keys.forEach((k) => (vars[k] = c));
    p.lite?.forEach((k) => (vars[k] = tint(c)));
  });
  const body = art.body.replace(/var\(--m(\d+),\s*([^)]+)\)/g, (_, k: string, orig: string) => vars[k] ?? orig);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.vb}" width="600" height="600">${body}</svg>`;
  return loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, false);
}

// 左上角：原岩 T 標誌＋「原岩攀岩館」
async function brand(g: CanvasRenderingContext2D, f: Fonts, x: number, y: number, color: string) {
  const mark = await loadImg(BRAND_MARK, false);
  if (mark) g.drawImage(mark, x, y - 44, 88, 88);
  g.fillStyle = color;
  g.font = `900 44px ${f.sans}`;
  g.textBaseline = "middle";
  g.fillText("原岩攀岩館", x + (mark ? 104 : 0), y + 2);
}

// 膠囊：Flash 黃色、完攀白底酒紅字
function statusPill(g: CanvasRenderingContext2D, f: Fonts, status: Status, right: number, y: number, outline = false) {
  const flash = status === "flash";
  const text = flash ? "FLASH" : "完攀";
  g.font = flash ? `700 60px ${f.num}` : `900 48px ${f.sans}`;
  const w = g.measureText(text).width + 64;
  rrect(g, right - w, y - 44, w, 88, 44);
  g.fillStyle = flash ? C.flash : "#fff";
  g.fill();
  if (outline) {
    g.lineWidth = 4;
    g.strokeStyle = C.ink;
    g.stroke();
  }
  g.fillStyle = flash ? C.flashInk : C.accent;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, right - w / 2, y + 3);
  g.textAlign = "left";
}

const toJpeg = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => {
    try {
      c.toBlob((b) => (b ? res(b) : rej(new Error("圖片做不出來"))), "image/jpeg", 0.9);
    } catch (e) {
      rej(e);
    }
  });

function canvas(w = W, h = H) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("這支手機做不出圖片");
  return { c, g };
}

// ---------- A3 完攀圖 ----------
export type SendCardInfo = {
  photo: { src: string; fallback?: string } | null; // 區域照片（路線卡片最上面那張）
  pin: { x: number; y: number; color: HoldColor } | null; // 起步點（照片上的百分比）
  holds: Hold[] | null; // Spray Wall 的圈圈
  seq: Hold[] | null; // 長耐力的編號點
  grade: number;
  status: Status; // flash、send
  title: string; // 區域・顏色・編號（或 Spray Wall 路線名稱）
  gym: string; // 館名
  date: string; // 攀爬日（2026.10.16）
  nickname: string;
  url: string | null; // QR code：打開這條路線（試用版在自己電腦跑時不放，免得印出區網位址）
  mascot: MascotPick;
  show: SendShow; // 客人勾選要放的資料（lib/share-options.ts）
};

export async function drawSendCard(info: SendCardInfo): Promise<Blob> {
  const on = info.show;
  const f = await loadFonts(`原岩攀岩館完攀${info.title}${info.gym}${info.date}${info.nickname}掃看這條路線`);
  const { c, g } = canvas();
  const t = tape(info.grade);

  // 照片：已經在卡片上顯示過（手機裡有），用同一個網址再讀一次；讀不到（或畫不上去）、背景選膠帶色就用膠帶色底
  let img = info.photo && on.bg === "photo" ? await loadImg(info.photo.src, true) : null;
  if (!img && info.photo?.fallback && on.bg === "photo") img = await loadImg(info.photo.fallback, true);
  let photoOk = false;
  if (img && img.naturalWidth) {
    // 照片要對準的點：起步點；Spray Wall、長耐力是所有點的中間
    const pts = info.pin ? [info.pin] : (info.holds ?? info.seq ?? []);
    const fx = pts.length ? pts.reduce((s, p) => s + p.x, 0) / pts.length : 50;
    const fy = pts.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : 50;
    // 起步點常常在牆的下面：會被下方貼紙蓋住時把照片放大，讓起步點能往上移到貼紙上面（最多放大 2.5 倍）
    const limit = H - 72 - 320 - 150;
    const base = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const lift = fy < 99 ? (H - limit) / ((1 - fy / 100) * img.naturalHeight) : base;
    const s = (fy / 100) * img.naturalHeight * base > limit ? Math.min(base * 2.5, Math.max(base, lift)) : base;
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    const ox = Math.min(0, Math.max(W - dw, W / 2 - (fx / 100) * dw));
    const oy = Math.min(0, Math.max(H - dh, Math.min(H * 0.42, limit) - (fy / 100) * dh));
    try {
      g.drawImage(img, ox, oy, dw, dh);
      g.getImageData(0, 0, 1, 1); // 照片不能放進圖片（不同網域）時這裡會出錯，改用膠帶色底
      photoOk = true;
    } catch {
      g.clearRect(0, 0, W, H);
    }
    if (photoOk) {
      const at = (p: { x: number; y: number }) => [ox + (p.x / 100) * dw, oy + (p.y / 100) * dh] as const;
      if (info.pin) {
        const [px, py] = at(info.pin);
        g.lineWidth = 10;
        g.strokeStyle = info.status === "flash" && on.status ? C.flash : "#fff";
        g.beginPath();
        g.arc(px, py, 96, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(px, py, 56, 0, Math.PI * 2);
        g.fillStyle = HOLD_COLORS[info.pin.color];
        g.fill();
        g.lineWidth = 8;
        g.strokeStyle = "#fff";
        g.stroke();
        g.fillStyle = holdTextColor(info.pin.color);
        g.font = `700 ${info.grade >= 100 ? 44 : 60}px ${f.num}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        if (on.grade) g.fillText(gradeShort(info.grade), px, py + 3);
        g.textAlign = "left";
      }
      for (const h of info.holds ?? []) {
        const [hx, hy] = at(h);
        g.lineWidth = 12;
        g.strokeStyle = "#fff";
        g.beginPath();
        g.arc(hx, hy, 30 + (h.r ?? 2) * 12, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = 7;
        g.strokeStyle = h.t === "s" ? C.start : h.t === "t" ? C.top : C.mid;
        g.stroke();
      }
      (info.seq ?? []).forEach((h, i) => {
        const [hx, hy] = at(h);
        g.beginPath();
        g.arc(hx, hy, 30, 0, Math.PI * 2);
        g.fillStyle = C.accent;
        g.fill();
        g.lineWidth = 6;
        g.strokeStyle = "#fff";
        g.stroke();
        g.fillStyle = "#fff";
        g.font = `700 34px ${f.num}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(i + 1), hx, hy + 2);
        g.textAlign = "left";
      });
    }
  }
  if (!photoOk) {
    // 沒有照片：膠帶色底＋大大的難度（沒勾難度就只有底色）
    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);
    if (on.grade) {
      g.fillStyle = t.fg;
      g.font = `700 ${info.grade >= 100 ? 340 : 460}px ${f.num}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(gradeLabel(info.grade), W / 2, H * 0.42);
      g.textAlign = "left";
    }
  }

  // 上下加一點暗，字和貼紙才看得清楚
  const top = g.createLinearGradient(0, 0, 0, 300);
  top.addColorStop(0, "rgba(0,0,0,0.55)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = top;
  g.fillRect(0, 0, W, 300);
  const bot = g.createLinearGradient(0, H - 560, 0, H);
  bot.addColorStop(0, "rgba(0,0,0,0)");
  bot.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = bot;
  g.fillRect(0, H - 560, W, 560);

  // 淺色膠帶底（VB 白、V0 螢光黃…）上面的字改深色
  const lightBg = !photoOk && t.fg !== "#fff";
  await brand(g, f, 56, 110, lightBg ? C.ink : "#fff");
  if (on.status) statusPill(g, f, info.status, W - 56, 110, lightBg);

  // 下方白色貼紙：只放勾選的；什麼都沒勾就不放貼紙
  const lines: { text: string; bold: boolean }[] = [];
  if (on.route) lines.push({ text: info.title, bold: true });
  const sub = [on.gym && info.gym, on.date && info.date].filter(Boolean).join("・");
  if (sub) lines.push({ text: sub, bold: false });
  if (on.nick && info.nickname) lines.push({ text: info.nickname, bold: false });
  const qr = on.qr && info.url ? await qrImage(info.url, 220) : null;
  const sticker = on.grade || lines.length > 0 || !!qr;
  const sx = 48;
  const sw = W - 96;
  const sh = 320;
  const sy = H - 72 - sh;
  if (on.mascot) {
    const m = await mascotImage(info.mascot);
    if (m) g.drawImage(m, W - 48 - 280, (sticker ? sy : H - 72) - 280 - 16, 280, 280);
  }
  if (sticker) {
    g.save();
    g.shadowColor = "rgba(0,0,0,0.3)";
    g.shadowBlur = 30;
    g.shadowOffsetY = 8;
    rrect(g, sx, sy, sw, sh, 44);
    g.fillStyle = "#fff";
    g.fill();
    g.restore();
    let tx = sx + 48;
    if (on.grade) {
      // 膠帶色難度
      rrect(g, sx + 36, sy + 40, 240, 240, 28);
      g.fillStyle = t.bg;
      g.fill();
      if (t.bg === gradeColor(-1)?.bg) {
        g.lineWidth = 3;
        g.strokeStyle = C.line;
        g.stroke();
      }
      g.fillStyle = t.fg;
      g.textAlign = "center";
      g.textBaseline = "middle";
      fitText(g, gradeLabel(info.grade), sx + 156, sy + 166, 210, "700", 150, f.num);
      g.textAlign = "left";
      tx = sx + 312;
    }
    // 文字：一到三行，垂直置中
    const tmax = sx + sw - tx - (qr ? 260 : 40);
    g.textBaseline = "alphabetic";
    const gap = 66;
    let y = sy + sh / 2 - ((lines.length - 1) * gap) / 2 + 18;
    for (const l of lines) {
      g.fillStyle = l.bold ? C.ink : C.muted;
      fitText(g, l.text, tx, y, tmax, l.bold ? "900" : "500", l.bold ? 60 : 40, f.sans);
      y += gap;
    }
    if (qr) {
      g.drawImage(qr, sx + sw - 256, sy + 40, 220, 220);
      g.fillStyle = C.muted;
      g.font = `500 26px ${f.sans}`;
      g.textAlign = "center";
      g.fillText("掃 QR 看這條路線", sx + sw - 146, sy + 296);
      g.textAlign = "left";
    }
  }
  return toJpeg(c);
}

// ---------- C1 本月完攀圖 ----------
export type MonthCardInfo = {
  year: number;
  month: number;
  sends: number;
  flashes: number;
  days: number;
  points: number | null;
  top: string | null; // 最高難度
  gyms: string[]; // 這個月去過的館（館的固定順序）
  boulder: { label: string; grade: number; n: number }[]; // VB–V10
  rope: { label: string; n: number }[]; // 上攀（沒有就空的）
  mascot: MascotPick;
  nickname: string;
  mainGym: string | null; // 這個月最常去的館（背景選「館的顏色」用）
  show: MonthShow;
};

export async function drawMonthCard(info: MonthCardInfo): Promise<Blob> {
  const on = info.show;
  const gymNames = info.gyms.map((id) => gymShort(GYMS.find((g) => g.id === id)?.name ?? ""));
  const f = await loadFonts(`原岩攀岩館年月條完攀積分Flash攀爬天數最高難度去了間館抱石上攀本月${info.nickname}${gymNames.join("")}`);
  const { c, g } = canvas();
  // 背景：白底，或這個月最常去那間館的標準色（字改白色）
  // 淺色的館（中和蒂芬妮綠…）字用深色，深色的館用白字
  const gymBg = GYM_COLORS[info.mainGym ?? ""] ?? C.accent;
  const dark = on.bg === "gym" && inkOn(gymBg) === "#fff";
  const tinted = on.bg === "gym";
  const ink = dark ? "#fff" : C.ink;
  const muted = dark ? "rgba(255,255,255,0.78)" : tinted ? "rgba(21,32,27,0.72)" : C.muted;
  const tileBg = dark ? "rgba(255,255,255,0.14)" : tinted ? "rgba(255,255,255,0.45)" : C.sunk;
  g.fillStyle = tinted ? gymBg : C.surface;
  g.fillRect(0, 0, W, H);
  // 上方色帶（白底時酒紅，館色時加深一點）
  g.fillStyle = tinted ? "rgba(0,0,0,0.22)" : C.accent;
  g.fillRect(0, 0, W, 220);
  await brand(g, f, 56, 110, "#fff");
  g.fillStyle = "#fff";
  g.font = `700 48px ${f.sans}`;
  g.textAlign = "right";
  g.fillText(`${info.year} 年 ${info.month} 月`, W - 56, 112);
  g.textAlign = "left";

  // 原岩夥伴放右上（大數字旁邊）
  if (on.mascot) {
    const m = await mascotImage(info.mascot);
    if (m) g.drawImage(m, W - 40 - 260, 290, 260, 260);
  }
  const right = on.mascot ? W - 320 : W - 56;
  let y = 300;
  g.textBaseline = "alphabetic";
  if (on.sends) {
    // 大數字：完攀條數（三位數以上縮小，不撞到夥伴）
    g.fillStyle = ink;
    const big = String(info.sends);
    g.font = `700 ${big.length <= 2 ? 340 : big.length === 3 ? 250 : 190}px ${f.num}`;
    g.fillText(big, 56, 590);
    const bw = g.measureText(big).width;
    g.font = `900 64px ${f.sans}`;
    g.fillText("條完攀", 56 + bw + 28, 500);
    if (on.nick) {
      g.fillStyle = muted;
      fitText(g, info.nickname, 56 + bw + 28, 576, right - (56 + bw + 28), "500", 44, f.sans);
    }
    y = 650;
  } else if (on.nick && info.nickname) {
    g.fillStyle = ink;
    fitText(g, info.nickname, 56, 450, right - 56, "900", 80, f.sans);
    y = 560;
  } else if (on.mascot) y = 580;

  // 小格：積分、Flash、攀爬天數（只放勾選的）
  const tiles: [string, string, string][] = [];
  if (on.points) tiles.push([info.points != null ? info.points.toLocaleString("en-US") : "–", "積分", ink]);
  if (on.flash) tiles.push([String(info.flashes), "Flash", dark ? "#FFD34D" : tinted ? C.ink : "#B58800"]);
  if (on.days) tiles.push([String(info.days), "攀爬天數", ink]);
  if (tiles.length) {
    const tw = (W - 112 - (tiles.length - 1) * 24) / tiles.length;
    tiles.forEach(([v, l, col], i) => {
      const x = 56 + i * (tw + 24);
      rrect(g, x, y, tw, 200, 28);
      g.fillStyle = tileBg;
      g.fill();
      g.fillStyle = col;
      fitText(g, v, x + 30, y + 120, tw - 60, "700", 110, f.num);
      g.fillStyle = muted;
      g.font = `500 34px ${f.sans}`;
      g.fillText(l, x + 30, y + 172);
    });
    y += 270;
  }
  const line = [on.top && info.top && `最高 ${info.top}`, on.gyms && info.gyms.length > 0 && `去了 ${info.gyms.length} 間館`].filter(Boolean).join("・");
  if (line) {
    g.fillStyle = muted;
    g.font = `500 38px ${f.sans}`;
    g.fillText(line, 56, y);
    y += 80;
  }

  // 本月完攀直條圖（只畫有完攀的那一段難度：最低到最高，少於 6 根補到 6 根）；高度用剩下的空間
  const chart = (title: string, cols: { label: string; n: number; color: string }[], top: number, hgt: number) => {
    g.fillStyle = ink;
    g.font = `900 40px ${f.sans}`;
    g.fillText(title, 56, top);
    const max = Math.max(1, ...cols.map((x) => x.n));
    const gap = 14;
    const cw = (W - 112 - gap * (cols.length - 1)) / cols.length;
    const base = top + 80 + hgt;
    cols.forEach((col, i) => {
      const x = 56 + i * (cw + gap);
      const h = col.n ? Math.max(16, (col.n / max) * hgt) : 6;
      rrect(g, x, base - h, cw, h, 8);
      g.fillStyle = col.n ? col.color : tinted ? "rgba(255,255,255,0.35)" : C.line;
      g.fill();
      if (col.n && (tinted || col.color === gradeColor(-1)?.bg)) {
        g.lineWidth = 3;
        g.strokeStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(21,32,27,0.3)";
        g.stroke();
      }
      g.textAlign = "center";
      if (col.n) {
        g.fillStyle = ink;
        g.font = `700 ${cw > 90 ? 52 : 42}px ${f.num}`;
        g.fillText(String(col.n), x + cw / 2, base - h - 14);
      }
      g.fillStyle = muted;
      g.font = `700 ${cw > 90 ? 40 : 32}px ${f.num}`;
      g.fillText(col.label, x + cw / 2, base + 46);
      g.textAlign = "left";
    });
  };
  const span = <T extends { n: number }>(cols: T[], min = 6) => {
    const has = cols.map((x, i) => (x.n ? i : -1)).filter((i) => i >= 0);
    if (!has.length) return [];
    let a = has[0];
    let b = has[has.length - 1];
    while (b - a + 1 < Math.min(min, cols.length)) {
      if (b < cols.length - 1) b++;
      else a--;
    }
    return cols.slice(a, b + 1);
  };
  if (on.chart) {
    // V9、V10 沒有膠帶顏色（用主色）：在深色的館色上改白色，不然跟背景一樣
    const boulder = span(info.boulder).map((x) => ({ label: x.label, n: x.n, color: !gradeColor(x.grade) && dark ? "#fff" : tape(x.grade).bg }));
    const rope = span(info.rope, 4).map((x) => ({ label: x.label, n: x.n, color: dark ? "#fff" : C.accent }));
    const n = (boulder.length ? 1 : 0) + (rope.length ? 1 : 0);
    const room = (on.gyms ? H - 190 : H - 90) - y - n * 196; // 每張圖的標題、數字、難度字大約 196
    const hb = Math.max(120, Math.min(480, n === 2 ? room * 0.58 : room));
    const hr = Math.max(100, Math.min(480, n === 2 ? room * 0.42 : room));
    if (boulder.length) {
      chart("抱石", boulder, y, hb);
      y += 196 + hb;
    }
    if (rope.length) chart("上攀", rope, y, hr);
  }

  // 最下面：去過的館（各店標準色）
  if (on.gyms) {
    let gx = 56;
    g.font = `700 36px ${f.sans}`;
    info.gyms.forEach((id, i) => {
      g.beginPath();
      g.arc(gx + 14, H - 112, 14, 0, Math.PI * 2);
      g.fillStyle = GYM_COLORS[id] ?? C.accent;
      g.fill();
      if (tinted) {
        g.lineWidth = 3;
        g.strokeStyle = dark ? "#fff" : C.ink;
        g.stroke();
      }
      g.fillStyle = ink;
      g.fillText(gymNames[i], gx + 38, H - 99);
      gx += 38 + g.measureText(gymNames[i]).width + 34;
    });
  }
  return toJpeg(c);
}

// ---------- B2 影片角落小貼紙 ----------
// 先畫好一張小圖（要先等字型），壓縮影片時每一格縮放貼到左下角；只放勾選的資料，什麼都沒勾回傳 null（不貼）
export type VideoSticker = (g: CanvasRenderingContext2D, w: number, h: number) => void;
export type VideoStickerInfo = { grade: number; gymName: string; zone: string; status: Status | null; date: string | null; nickname: string; show: VideoShow };
export async function makeVideoSticker(info: VideoStickerInfo): Promise<VideoSticker | null> {
  const on = info.show;
  const top = [on.gym && info.gymName && `原岩 ${gymShort(info.gymName)}`, on.nick && info.nickname].filter(Boolean).join("・");
  const bottom = [on.zone && info.zone, on.status && info.status && info.status !== "project" && (info.status === "flash" ? "Flash" : "完攀"), on.date && info.date].filter(Boolean).join("・");
  // 只有一行時放大字
  const [line1, line2] = top ? [top, bottom] : [bottom, ""];
  if (!on.grade && !line1) return null;
  const f = await loadFonts(line1 + line2);
  const { c, g } = canvas(900, 180);
  rrect(g, 0, 0, 900, 180, 36);
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fill();
  let tx = 36;
  if (on.grade) {
    const t = tape(info.grade);
    rrect(g, 20, 20, 140, 140, 24);
    g.fillStyle = t.bg;
    g.fill();
    g.fillStyle = t.fg;
    g.textAlign = "center";
    g.textBaseline = "middle";
    fitText(g, gradeLabel(info.grade), 90, 94, 124, "700", 92, f.num);
    g.textAlign = "left";
    tx = 188;
  }
  g.textBaseline = "alphabetic";
  g.fillStyle = "#fff";
  if (line1) fitText(g, line1, tx, line2 ? 84 : 112, 900 - tx - 36, "900", 54, f.sans);
  if (line2) {
    g.fillStyle = "rgba(255,255,255,0.85)";
    fitText(g, line2, tx, 142, 900 - tx - 36, "500", 40, f.sans);
  }
  // 貼紙實際的寬度（右邊多出來的透明部分不畫）
  g.font = `500 40px ${f.sans}`;
  const w2 = line2 ? g.measureText(line2).width : 0;
  g.font = `900 54px ${f.sans}`;
  const w1 = line1 ? g.measureText(line1).width : 0;
  const used = Math.round(Math.min(900, line1 ? tx + Math.max(w1, w2) + 36 : 180));
  const { c: s, g: sg } = canvas(used, 180);
  sg.drawImage(c, 0, 0);
  sg.globalCompositeOperation = "destination-in";
  rrect(sg, 0, 0, used, 180, 36);
  sg.fill();
  // 大小照影片的長邊算（橫的影片放到限時動態會縮小，貼紙不會小到看不清楚）；
  // 左下角，離左邊 7%、離下面 8%（10/16 使用者說往右上一點點）
  return (dg, w, h) => {
    const sh0 = Math.max(w, h) * 0.07;
    const sw = Math.min(w * 0.7, (used / 180) * sh0);
    const sh = (sw * 180) / used;
    dg.drawImage(s, Math.round(w * 0.07), Math.round(h - h * 0.08 - sh), sw, sh);
  };
}

// 影片 IG 版的預覽：第 1 秒的畫面（沒有貼紙的那張）加上現在勾選的小貼紙；改勾選時馬上重畫，不用重錄影片
export async function composeFrame(base: Blob | null, sticker: VideoSticker | null): Promise<string | null> {
  if (!base) return null;
  const url = URL.createObjectURL(base);
  try {
    const img = await loadImg(url, false);
    if (!img?.naturalWidth) return null;
    const { c, g } = canvas(img.naturalWidth, img.naturalHeight);
    g.drawImage(img, 0, 0);
    sticker?.(g, c.width, c.height);
    const b = await toJpeg(c);
    return URL.createObjectURL(b);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
