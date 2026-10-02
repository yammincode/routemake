"use client";

import { useEffect, useState } from "react";
import { getScoringRules } from "@/lib/data";
import { withCache } from "@/lib/offline";
import type { ScoringRules } from "@/lib/scoring";

// 計分規則：整個 App 共用一份，讀一次就好（離線時用上次存的）
let cached: ScoringRules | null = null;
let pending: Promise<ScoringRules | null> | null = null;
const listeners = new Set<(r: ScoringRules) => void>();

function load() {
  const apply = (data: ScoringRules) => {
    cached = data;
    listeners.forEach((l) => l(data));
  };
  // 先用手機裡上次的規則顯示分數，抓到最新的再換掉
  pending ??= withCache("scoring", getScoringRules, apply)
    .then(({ data }) => {
      apply(data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

// 後台改完規則後呼叫，讓所有畫面換成新分數
export function setScoringRules(r: ScoringRules) {
  cached = r;
  listeners.forEach((l) => l(r));
}

export function useScoring(): ScoringRules | null {
  const [rules, setRules] = useState<ScoringRules | null>(cached);
  useEffect(() => {
    listeners.add(setRules);
    if (!cached) void load();
    return () => void listeners.delete(setRules);
  }, []);
  return rules;
}
