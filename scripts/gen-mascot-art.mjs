// 產生原岩夥伴的圖（lib/mascot-art.ts）：從 public/logos 的六館 logo 拿掉粉紅 T 圓圈和白色圓底，
// 裁到動物的範圍，顏色改成 CSS 變數（--mc1、--mc2…，沒設定就用原本的顏色）讓顧客換色
// 用法：node scripts/gen-mascot-art.mjs（logo 換了才要重新產生；要 Chromium：CHROME_PATH 或 /opt/pw-browsers）
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const IDS = ["mingde", "wanhua", "zhonghe", "nangang", "xindian", "zhongli"];
const exe = [process.env.CHROME_PATH, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"].find(
  (p) => p && existsSync(p)
);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
const out = {};
for (const id of IDS) {
  const src = readFileSync(new URL(`../public/logos/${id}.svg`, import.meta.url), "utf8");
  await page.setContent(`<div id="w">${src.slice(src.indexOf("<svg"))}</div>`);
  out[id] = await page.evaluate(() => {
    const svg = document.querySelector("#w svg");
    const fills = {};
    for (const m of svg.querySelector("style").textContent.matchAll(/\.(cls-\d+)\s*\{\s*fill:\s*([^;]+);/g)) fills[m[1]] = m[2].trim().toLowerCase();
    const vbw = svg.viewBox.baseVal.width;
    const shapes = [...svg.querySelectorAll("path,circle,ellipse,polygon,rect,polyline")];
    // 粉紅 T 圓圈（logo 的品牌色）和比畫面一半還大的白色圓底都拿掉
    const drop = (el) => {
      const c = fills[el.getAttribute("class")];
      return c === "#e5006e" || c === "#d41768" || (c === "#fff" && el.getBBox().width > vbw * 0.55);
    };
    let box = null;
    for (const el of shapes) {
      if (drop(el)) {
        el.remove();
        continue;
      }
      const b = el.getBBox();
      if (!b.width) continue;
      box = box
        ? { x: Math.min(box.x, b.x), y: Math.min(box.y, b.y), X: Math.max(box.X, b.x + b.width), Y: Math.max(box.Y, b.y + b.height) }
        : { x: b.x, y: b.y, X: b.x + b.width, Y: b.y + b.height };
    }
    svg.querySelector("defs")?.remove();
    for (const el of svg.querySelectorAll("[class]")) {
      const k = el.getAttribute("class");
      el.removeAttribute("class");
      el.setAttribute("fill", `var(--m${k.slice(4)},${fills[k]})`);
    }
    for (const g of svg.querySelectorAll("g")) if (!g.children.length) g.remove();
    const w = box.X - box.x, h = box.Y - box.y, s = Math.max(w, h) * 1.04;
    const r = (n) => Math.round(n * 10) / 10;
    return { vb: [box.x + w / 2 - s / 2, box.y + h / 2 - s / 2, s, s].map(r).join(" "), body: svg.innerHTML.replace(/\s+/g, " ").replace(/> </g, "><").trim(), fills };
  });
}
await browser.close();
writeFileSync(
  new URL("../lib/mascot-art.ts", import.meta.url),
  `// 自動產生（scripts/gen-mascot-art.mjs），請勿手動修改\n// 原岩夥伴的圖：六館 logo 的動物，拿掉 T 圓圈和白色圓底；顏色是 CSS 變數 --m1、--m2…（沒設定用原本的顏色）\n` +
    `export const MASCOT_ART: Record<string, { vb: string; body: string; fills: Record<string, string> }> = ${JSON.stringify(out, null, 1)};\n`
);
console.log("已產生 lib/mascot-art.ts");
