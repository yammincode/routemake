import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// 頁面一律「有網路先抓最新，沒網路才用快取」（defaultCache 的 NetworkFirst，存在 others 快取）
// 安裝時先把三個分頁放進快取，第一次打開後就算離線也看得到
const OFFLINE_PAGES = ["/", "/me", "/admin"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open("others")
      .then((cache) => cache.addAll(OFFLINE_PAGES))
      .catch(() => undefined)
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
