"use client";

import { useCallback, useState } from "react";
import { GRADE_BANDS, type BandId } from "./design";

// 難度篩選（全部／入門／進階／挑戰）記在這支手機：館首頁和區域頁用同一個（在哪裡選，另一邊也跟著變），區域頁左右滑換區也保留
// 隱私模式等讀寫失敗就當沒選；名字沿用館首頁原本的（之前選過的照樣記得）
const KEY = "routemake:home-band";

export function savedBand(): BandId | null {
  try {
    const v = localStorage.getItem(KEY);
    return GRADE_BANDS.some((b) => b.id === v) ? (v as BandId) : null;
  } catch {
    return null;
  }
}

export function useBand(): [BandId | null, (b: BandId | null) => void] {
  const [band, setBand] = useState<BandId | null>(savedBand);
  const pick = useCallback((b: BandId | null) => {
    setBand(b);
    try {
      if (b) localStorage.setItem(KEY, b);
      else localStorage.removeItem(KEY);
    } catch {}
  }, []);
  return [band, pick];
}
