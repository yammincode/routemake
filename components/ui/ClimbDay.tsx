"use client";

import { useState } from "react";
import { daysAgoYmd, md, todayYmd } from "@/lib/date";
import { Chip } from "./Chip";
import { TextField } from "./Form";

// 攀爬日膠囊（路線卡片 Flash／完攀／嘗試中上面，使用者選的 1A）：預設今天；點開「今天／昨天／前天／📅 選日期」
// min＝路線設定那天、max＝今天（下架的路線是下架那天）；超出範圍的那一顆變淡點不了
export function dayLabel(d: string) {
  const name = d === todayYmd() ? "今天" : d === daysAgoYmd(1) ? "昨天" : d === daysAgoYmd(2) ? "前天" : null;
  return name ? `${name} ${md(d)}` : md(d);
}

export function ClimbDay({ value, min, max, disabled = false, onChange }: { value: string; min: string; max: string; disabled?: boolean; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const quick = [0, 1, 2].map((n) => ({ n, d: daysAgoYmd(n) }));
  const pick = (d: string) => {
    if (d < min || d > max) return;
    setOpen(false);
    setCustom(false);
    if (d !== value) onChange(d);
  };
  return (
    <div className="mb-2" data-testid="climb-day">
      <div className="flex items-center justify-between gap-2">
        <span className="text-note text-muted">攀爬日</span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`攀爬日 ${dayLabel(value)}，點了改日期`}
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-accent bg-accent-soft px-3 py-[2px] text-note font-bold text-accent disabled:opacity-45"
        >
          {dayLabel(value)} <span aria-hidden>{open ? "▴" : "▾"}</span>
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
          {quick.map(({ n, d }) => (
            <Chip key={n} pressed={value === d} disabled={d < min || d > max} onClick={() => pick(d)}>
              {["今天", "昨天", "前天"][n]}
            </Chip>
          ))}
          <Chip pressed={custom || !quick.some((q) => q.d === value)} onClick={() => setCustom(!custom)}>
            📅 選日期
          </Chip>
        </div>
      )}
      {open && custom && (
        <TextField
          id="climb-day"
          type="date"
          aria-label="選攀爬日"
          className="mt-2"
          value={value}
          min={min}
          max={max}
          onChange={(e) => e.target.value && pick(e.target.value)}
        />
      )}
    </div>
  );
}
