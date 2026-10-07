"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SectionTitle, Tip } from "@/components/ui/Card";
import { Label } from "@/components/ui/Form";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { updateScoringRules } from "@/lib/data";
import { gradeLabel, GRADES, STYLE_TAGS, YDS_GRADES } from "@/lib/design";
import { ascentPoints, routePoints, type ScoringRules } from "@/lib/scoring";
import { setScoringRules, useScoring } from "@/lib/useScoring";

const numField = "w-full rounded-field border border-line bg-sunk px-1 py-2 text-center font-num text-num-picker font-semibold";

// 計分規則（只有老闆）：難度分數、風格加成、加成上限、Flash 倍數；改了之後所有人的分數自動重算
export default function ScoringPanel() {
  const rules = useScoring();
  return rules ? <Editor key={JSON.stringify(rules)} rules={rules} /> : null;
}

function Editor({ rules }: { rules: ScoringRules }) {
  const toast = useToast();
  const [r, setR] = useState<ScoringRules>(rules);
  const [busy, setBusy] = useState(false);
  const int = (v: string) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0)));

  const save = async () => {
    if (r.flash_multiplier < 1 || r.flash_multiplier > 3) return toast("Flash 倍數要在 1～3 之間");
    setBusy(true);
    try {
      await updateScoringRules(r);
      setScoringRules(r);
      toast("已更新計分規則，所有人的分數會自動重算");
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <SectionTitle>計分規則</SectionTitle>
      <SetBox>
        <Label>難度分數（抱石 V 級）</Label>
        <div className="grid grid-cols-6 gap-1.5">
          {GRADES.map((g) => (
            <label key={g} className="grid gap-0.5 text-center">
              <span className="font-num text-[15px] font-bold">{gradeLabel(g)}</span>
              <input
                inputMode="numeric"
                className={numField}
                value={g < 0 ? (r.vb_points ?? 0) : r.grade_points[g]}
                onChange={(e) =>
                  setR(g < 0 ? { ...r, vb_points: int(e.target.value) } : { ...r, grade_points: r.grade_points.map((v, i) => (i === g ? int(e.target.value) : v)) })
                }
              />
            </label>
          ))}
        </div>
        {r.yds_points && (
          <>
            <Label>難度分數（上攀 YDS）</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {YDS_GRADES.map((label, i) => (
                <label key={label} className="grid gap-0.5 text-center">
                  <span className="font-num text-[14px] font-bold">{label}</span>
                  <input
                    inputMode="numeric"
                    className={numField}
                    value={r.yds_points![i]}
                    onChange={(e) => setR({ ...r, yds_points: r.yds_points!.map((v, j) => (j === i ? int(e.target.value) : v)) })}
                  />
                </label>
              ))}
            </div>
          </>
        )}
        <Label>風格加成（%）</Label>
        <div className="grid grid-cols-5 gap-1.5">
          {STYLE_TAGS.map((t) => (
            <label key={t} className="grid gap-0.5 text-center text-meta">
              {t}
              <input
                inputMode="numeric"
                className={numField}
                value={r.style_bonus[t] ?? 0}
                onChange={(e) => setR({ ...r, style_bonus: { ...r.style_bonus, [t]: Math.min(100, int(e.target.value)) } })}
              />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label htmlFor="maxbonus">風格加成上限（%）</Label>
            <input id="maxbonus" inputMode="numeric" className={numField} value={r.max_style_bonus} onChange={(e) => setR({ ...r, max_style_bonus: Math.min(200, int(e.target.value)) })} />
          </div>
          <div>
            <Label htmlFor="flashx">Flash 倍數</Label>
            <input
              id="flashx"
              inputMode="decimal"
              className={numField}
              defaultValue={r.flash_multiplier}
              onChange={(e) => setR({ ...r, flash_multiplier: Math.round((Number(e.target.value) || 1) * 100) / 100 })}
            />
          </div>
        </div>
        <Tip>
          例：V4 動態＋指力 → 完攀 {routePoints(4, ["動態", "指力"], r)} 分、Flash {ascentPoints(4, ["動態", "指力"], "flash", r)} 分
        </Tip>
        <Button variant="primary" disabled={busy} onClick={save}>
          儲存計分規則
        </Button>
        <Tip>只有老闆可以修改。改了之後，所有人過去的紀錄也會用新規則重新計算。</Tip>
      </SetBox>
    </>
  );
}
