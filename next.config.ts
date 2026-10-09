import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // 字型（中文切成上百片、約 4MB）不放進安裝時的預先下載：第一次打開不會被背景下載塞滿網路；用到的字由 sw.ts 的字型快取存起來
  exclude: [/\.map$/, /^manifest.*\.js$/, /\.woff2$/],
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  // Netlify 建置的才是正式版；其他（自己電腦的試用版、測試）版本號旁顯示「試用版」
  env: { NEXT_PUBLIC_RELEASE: process.env.NETLIFY === "true" ? "1" : "0" },
  // 試用版：讓同一個 Wi-Fi 的手機用電腦的 IP（例如 192.168.1.23:3000）連進來
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // 試用版（next dev）用 Turbopack；Serwist 只在正式建置（webpack）時產生 Service Worker
  turbopack: {},
  // 防護標頭：不能被別的網站嵌入、只載入自己與 Supabase 的資源（正式版才加 CSP，試用版需要即時更新）
  async headers() {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://*.supabase.co";
    const base = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ];
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${supabase}`,
      `media-src 'self' blob: ${supabase}`,
      "font-src 'self'",
      `connect-src 'self' ${supabase}`,
      "worker-src 'self'",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    const headers = process.env.NODE_ENV === "production" ? [...base, { key: "Content-Security-Policy", value: csp }] : base;
    return [{ source: "/:path*", headers }];
  },
  // 舊的區域網址 /zone/{id} 轉到 /zone?id={id}
  async redirects() {
    return [{ source: "/zone/:id", destination: "/zone?id=:id", permanent: true }];
  },
};

export default withSerwist(nextConfig);
