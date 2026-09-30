import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// 頁面一律「有網路先抓最新，沒網路才用快取」（defaultCache 的 NetworkFirst，存在 others 快取）
// 安裝時先把分頁放進快取，第一次打開後就算離線也看得到
const OFFLINE_PAGES = ["/", "/gyms", "/gym/mingde", "/me", "/admin"];
// 區域頁 /zone?id=… 不管哪一區都是同一份頁面，快取時忽略網址參數
const ZONE_CACHE = "zone-shell";

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open("others").then((cache) => cache.addAll(OFFLINE_PAGES)),
      caches.open(ZONE_CACHE).then((cache) => cache.add("/zone")),
    ]).catch(() => undefined)
  );
});

const zoneShell = {
  matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => sameOrigin && url.pathname === "/zone",
  handler: new NetworkFirst({ cacheName: ZONE_CACHE, matchOptions: { ignoreSearch: true }, networkTimeoutSeconds: 5 }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [zoneShell, ...defaultCache],
});

serwist.addEventListeners();
