import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  // 舊的區域網址 /zone/{id} 轉到 /zone?id={id}
  async redirects() {
    return [{ source: "/zone/:id", destination: "/zone?id=:id", permanent: true }];
  },
};

export default withSerwist(nextConfig);
