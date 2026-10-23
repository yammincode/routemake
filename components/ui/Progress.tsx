"use client";

// 路線進度（我的紀錄）：各館圖例、依館分段的長條、抱石／上攀卡片（點一行展開各館）
// 顏色一律用各店標準色（lib/gyms.ts 的 GYM_COLORS）；大滿貫的星星用 Flash 黃
import { useState } from "react";
import { GymDot } from "@/components/ui/Resets";
import { SlamRedeemTag } from "@/components/ui/Slam";
import { gradeLabel } from "@/lib/design";
import { findGym, GYM_COLORS, gymShort } from "@/lib/gyms";
import { isGrandSlam, type GymCount, type ProgressRow } from "@/lib/progress";
import type { SlamAction } from "@/lib/slam";

const gymName = (id: string) => gymShort(findGym(id)?.name ?? id);

export function SlamStar() {
  return (
    <span aria-hidden className="text-flash">
      ★
    </span>
  );
}

// 各館顏色圖例（明德、萬華…）
export function GymLegend({ gyms }: { gyms: string[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-3.5 gap-y-1 text-meta text-muted">
      {gyms.map((g) => (
        <span key={g} className="inline-flex items-center gap-1.5">
          <GymDot gymId={g} />
          {gymName(g)}
        </span>
      ))}
    </div>
  );
}

// 依館分段的長條：每館一段（長度＝完成幾條），of＝滿格是幾條；track＝灰底（牆上進度有；我的進度沒有總數，不畫灰底）
export function GymBar({ gyms, of, track = true }: { gyms: GymCount[]; of: number; track?: boolean }) {
  const segs = gyms.filter((g) => g.done > 0);
  const done = segs.reduce((s, g) => s + g.done, 0);
  return (
    <span aria-hidden className={`flex h-3 gap-[2px] overflow-hidden rounded-md ${track ? "bg-line" : ""}`}>
      {segs.map((g) => (
        <i key={g.gym} data-gym={g.gym} className="block h-full basis-0" style={{ flexGrow: g.done, background: GYM_COLORS[g.gym] ?? "var(--muted)" }} />
      ))}
      {done < of && <i className="block h-full basis-0" style={{ flexGrow: of - done }} />}
    </span>
  );
}

// 抱石或上攀一張卡片
// wall（牆上進度）：右上「你完成 幾 / 幾 條」、大滿貫幾個難度；每行「完成/總數」，全部完成寫「★ 大滿貫」
// mine（我的進度）：右上「累計完攀 幾 條」；每行完攀幾條，長條以最多的那個難度為滿格
// slam（大滿貫兌換，只有牆上進度）：這一行右邊改成「★ 兌換 ›」或「★ 已兌換」，點了打開兌換卡（onSlam）；點這一行其他地方照舊展開各館
// 牆上進度預設只列有完成的難度（10/23 使用者決定），其他收成最下面一行「還有 ○ 個難度還沒完成 ⌄」，點了全部打開
export function ProgressCard({
  title,
  rows,
  mode,
  slam,
  onSlam,
}: {
  title: string;
  rows: ProgressRow[];
  mode: "wall" | "mine";
  slam?: (r: ProgressRow) => SlamAction | null;
  onSlam?: (grade: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const wall = mode === "wall";
  const hidden = wall && !all ? rows.filter((r) => r.done === 0).length : 0;
  const list = wall && !all ? rows.filter((r) => r.done > 0) : rows;
  const done = rows.reduce((s, r) => s + r.done, 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const most = Math.max(1, ...rows.map((r) => r.done));
  const slams = rows.filter(isGrandSlam).length;
  return (
    <section aria-label={title} className="mb-3 rounded-card bg-surface px-4 pt-3.5 pb-4 shadow-card">
      <div className="mb-1 flex items-baseline justify-between">
        <h4 className="text-note font-bold">{title}</h4>
        <span className="text-meta text-muted">
          {wall ? "你完成" : "累計完攀"} <b className="font-num text-num-chip leading-none text-ink">{done}</b>
          {wall ? ` / ${total} 條` : " 條"}
        </span>
      </div>
      {wall && (
        <p className="mb-3 text-meta text-muted">
          {slams ? (
            <>
              <SlamStar /> 大滿貫 {slams} 個難度
            </>
          ) : (
            "還沒有大滿貫"
          )}
        </p>
      )}
      <div className={`grid gap-2.5 ${wall ? "" : "mt-3"}`}>
        {list.map((r) => {
          const isOpen = open === r.grade;
          const act = wall && onSlam ? (slam?.(r) ?? null) : null;
          const head = (
            <>
              <span className="font-num text-num-bar font-bold">{gradeLabel(r.grade)}</span>
              <GymBar gyms={r.gyms} of={wall ? r.total : most} track={wall} />
            </>
          );
          return (
            <div key={r.grade}>
              {act ? (
                // 有兌換：展開和兌換分成兩個按鈕（按鈕裡不能再放按鈕），排起來跟一般的行一樣
                <div className="grid grid-cols-[1fr_76px] items-center gap-2.5">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : r.grade)}
                    className="grid w-full grid-cols-[52px_1fr] items-center gap-2.5 text-left"
                  >
                    {head}
                  </button>
                  <button
                    type="button"
                    aria-label={`${gradeLabel(r.grade)} 大滿貫${act === "redeemed" ? "，已兌換，看兌換卡" : "，打開兌換卡"}`}
                    onClick={() => onSlam!(r.grade)}
                    className="justify-self-end"
                  >
                    <SlamRedeemTag redeemed={act === "redeemed"} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : r.grade)}
                  className="grid w-full grid-cols-[52px_1fr_76px] items-center gap-2.5 text-left"
                >
                  {head}
                  {wall && isGrandSlam(r) ? (
                    <span className="text-right text-meta leading-none font-bold whitespace-nowrap">
                      <SlamStar /> 大滿貫
                    </span>
                  ) : (
                    <span className="text-right font-num text-num-chip leading-none font-semibold text-muted">
                      {wall ? (
                        `${r.done}/${r.total}`
                      ) : (
                        <>
                          {r.done}
                          <small className="ml-0.5 font-sans text-meta font-normal">條</small>
                        </>
                      )}
                    </span>
                  )}
                </button>
              )}
              {isOpen && (
                <div className="mt-2 mb-1 ml-[62px] grid grid-cols-2 gap-x-3 gap-y-1 rounded-tile bg-bg px-3 py-2 text-meta">
                  {r.gyms.map((g) => (
                    <span key={g.gym} className="inline-flex items-center gap-1.5">
                      <GymDot gymId={g.gym} />
                      {gymName(g.gym)}
                      <b className="font-num text-sub">
                        {wall ? (
                          `${g.done}/${g.total}`
                        ) : (
                          <>
                            {g.done}
                            <small className="ml-0.5 font-sans text-meta font-normal">條</small>
                          </>
                        )}
                      </b>
                      {wall && isGrandSlam(g) && <SlamStar />}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {wall && (hidden > 0 || all) && rows.some((r) => r.done === 0) && (
        <button aria-expanded={all} onClick={() => setAll(!all)} className={`${list.length ? "mt-2.5" : ""} w-full py-1 text-center text-meta font-bold text-accent`}>
          {all ? "只看有完成的 ⌃" : list.length ? `還有 ${hidden} 個難度還沒完成 ⌄` : `${hidden} 個難度都還沒完成，點了打開 ⌄`}
        </button>
      )}
    </section>
  );
}
