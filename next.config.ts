import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// 每次部署換一個版本號，讓手機上的快取跟著更新
const revision = process.env.COMMIT_REF ?? String(Date.now());

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // 三個分頁先放進快取，離線也打得開
  additionalPrecacheEntries: ["/", "/me", "/admin"].map((url) => ({ url, revision })),
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
