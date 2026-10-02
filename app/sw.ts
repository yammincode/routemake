import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// 頁面一律「有網路先抓最新，沒網路才用快取」（defaultCache 的 NetworkFirst，存在 others 快取）
// 安裝時先把分頁放進快取，第一次打開後就算離線也看得到
const OFFLINE_PAGES = ["/", "/gyms", "/gym/mingde", "/gym/g2", "/gym/g3", "/gym/g4", "/gym/g5", "/card", "/me", "/admin"];
// 區域頁 /zone?id=… 不管哪一區都是同一份頁面，快取時忽略網址參數
const ZONE_CACHE = "zone-shell";
// 網路幾秒沒回應就先用手機裡存的頁面
const PAGE_TIMEOUT = 3;

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open("others").then((cache) => cache.addAll(OFFLINE_PAGES)),
      caches.open(ZONE_CACHE).then((cache) => cache.add("/zone")),
    ]).catch(() => undefined)
  );
});

// Supabase 的資料（登入、紀錄、心得、留言）一律不存進 Service Worker 快取：
// 快取不會隨登出清掉，共用手機時可能被下一個人看到。離線用的資料改由 App 存在手機並在登出時清除。
// 公開照片（storage/v1/object/public）不含個人資料，仍照一般圖片快取
const supabaseData = {
  matcher: ({ url }: { url: URL }) => url.hostname.endsWith(".supabase.co") && !url.pathname.startsWith("/storage/v1/object/public/"),
  handler: new NetworkOnly(),
};

// 顧客影片完全不經過 Service Worker：直接由瀏覽器向 Supabase 讀取
// （iPhone Safari 的影片分段讀取經過 Service Worker 轉手時常常播不出來；也不佔手機快取空間）
// 這個監聽要比 Serwist 先註冊，stopImmediatePropagation 讓 Serwist 不處理這個請求
self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("/storage/v1/object/public/route-videos/")) event.stopImmediatePropagation();
});

const zoneShell = {
  matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => sameOrigin && url.pathname === "/zone",
  handler: new NetworkFirst({ cacheName: ZONE_CACHE, matchOptions: { ignoreSearch: true }, networkTimeoutSeconds: PAGE_TIMEOUT }),
};

// 岩牆照片：每次上傳都是新檔名（含時間），舊網址的內容不會變，存過就直接用手機裡的，不再重新下載
const wallPhotos = {
  matcher: ({ url }: { url: URL }) => url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/zone-photos/"),
  handler: new CacheFirst({ cacheName: "zone-photos", plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 86400 })] }),
};

// 換頁：網路 3 秒沒回應就先用手機裡的畫面（預設會一直等網路），網路回來後下次就是最新的
const pages = defaultCache.map((entry) =>
  entry.handler instanceof NetworkFirst && ["pages-rsc-prefetch", "pages-rsc", "pages", "others"].includes(entry.handler.cacheName)
    ? { ...entry, handler: new NetworkFirst({ cacheName: entry.handler.cacheName, plugins: entry.handler.plugins, networkTimeoutSeconds: PAGE_TIMEOUT }) }
    : entry
);

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [wallPhotos, supabaseData, zoneShell, ...pages],
});

serwist.addEventListeners();
