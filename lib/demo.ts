// 只給 /design 元件展示頁用的示範資料（照原型的產生方式），正式頁面不會用到
import { HOLD_COLOR_NAMES, HOLD_COLORS, type HoldColor } from "@/lib/design";

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 原型的示意岩牆：木板底色＋隨機岩點，回傳圖片與岩點位置（百分比）
export function fakeWall(seed: number) {
  const R = rng(seed);
  let s = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='#CBAE82'/>";
  for (let x = 100; x < 400; x += 100) s += `<line x1='${x}' y1='0' x2='${x}' y2='300' stroke='#A9895D' stroke-width='1.5'/>`;
  s += "<line x1='0' y1='150' x2='400' y2='150' stroke='#A9895D' stroke-width='1.5'/>";
  for (let x = 10; x < 400; x += 20) for (let y = 10; y < 300; y += 20) s += `<circle cx='${x}' cy='${y}' r='1.3' fill='#7A5E3A' opacity='.5'/>`;
  const holds: { x: number; y: number; c: HoldColor }[] = [];
  for (let i = 0; i < 46; i++) {
    const x = 20 + R() * 360, y = 30 + R() * 250, c = HOLD_COLOR_NAMES[Math.floor(R() * HOLD_COLOR_NAMES.length)];
    const rx = 5 + R() * 9, ry = 4 + R() * 7, rot = R() * 180;
    holds.push({ x: x / 4, y: y / 3, c });
    s += `<ellipse cx='${x.toFixed(1)}' cy='${y.toFixed(1)}' rx='${rx.toFixed(1)}' ry='${ry.toFixed(1)}' transform='rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})' fill='${HOLD_COLORS[c]}' stroke='rgba(0,0,0,.35)'/>`;
  }
  return { uri: "data:image/svg+xml," + encodeURIComponent(s + "</svg>"), holds };
}
