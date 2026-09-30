import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  // 試用版：讓同一個 Wi-Fi 的手機用電腦的 IP（例如 192.168.1.23:3000）連進來
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // 試用版（next dev）用 Turbopack；Serwist 只在正式建置（webpack）時產生 Service Worker
  turbopack: {},
  // 舊的區域網址 /zone/{id} 轉到 /zone?id={id}
  async redirects() {
    return [{ source: "/zone/:id", destination: "/zone?id=:id", permanent: true }];
  },
};

export default withSerwist(nextConfig);
