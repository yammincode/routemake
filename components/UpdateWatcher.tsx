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
