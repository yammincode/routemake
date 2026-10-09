"use client";

import { useEffect } from "react";

// 有新版時自動換成新版：
// 1. 每次回到 App（切回前景）就檢查有沒有新版
// 2. 新版接手後自動重新整理一次
export default function UpdateWatcher() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onChange = () => {
      // 第一次安裝不用重新整理，只有「舊版換新版」才需要
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    const check = () => {
      if (document.visibilityState === "visible") {
        navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => undefined);
      }
    };
    // 第一次打開時，Service Worker 還沒接手前下載的中文字型片段沒存進字型快取：接手後補存（離線時字才不會變成手機內建字體）
    navigator.serviceWorker.ready
      .then((reg) => {
        const fonts = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin + "/_next/static/media/") && u.endsWith(".woff2"));
        if (fonts.length) reg.active?.postMessage({ type: "CACHE_URLS", payload: { urlsToCache: fonts } });
      })
      .catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
