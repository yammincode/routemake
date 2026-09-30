"use client";

import type { FloorPlanShape } from "@/lib/floorplan";
import { pressKeys } from "./Gym";

export type PlanZone = { code: string; name: string; done: number; total: number; resetDays: number | null };

// 館內平面圖（原型 planSVG）：依完成度上色，7 天內換線用紅色虛線框
export default function FloorPlan({ shape, gymName, zones, onSelect }: { shape: FloorPlanShape; gymName: string; zones: PlanZone[]; onSelect: (code: string) => void }) {
  return (
    <div className="mb-2 rounded-plan bg-surface px-2 pt-2.5 pb-1.5 shadow-card">
      <svg viewBox={shape.viewBox} role="img" aria-label={`${gymName}平面圖`} className="block h-auto w-full">
        <polygon points={shape.outline} fill="var(--sunk)" stroke="var(--line)" strokeWidth={3} />
        {shape.fixtures.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill="none" stroke="var(--line)" strokeWidth={3} />
        ))}
        {shape.entrance && (
          <text x={shape.entrance.x} y={shape.entrance.y} fontSize={26} fill="var(--muted)" textAnchor="middle">
            入口
          </text>
        )}
        {zones.map((z) => {
          const P = shape.zones[z.code];
          if (!P) return null;
          const p = z.total ? z.done / z.total : 0;
          const soon = z.resetDays != null && z.resetDays >= 0 && z.resetDays <= 7;
          const fill = `color-mix(in srgb,var(--accent) ${Math.round(18 + p * 72)}%,var(--blush))`;
          const go = () => onSelect(z.code);
          return (
            <g
              key={z.code}
              tabIndex={0}
              role="button"
              aria-label={`${z.name}，完成 ${z.done} / ${z.total}${soon ? "，" + (z.resetDays === 0 ? "今天換線" : `${z.resetDays} 天後換線`) : ""}`}
              onClick={go}
              onKeyDown={pressKeys(go)}
              className="group cursor-pointer focus:outline-none"
            >
              {P.polys.map((pt, i) => (
                <polygon
                  key={i}
                  points={pt}
                  fill={fill}
                  stroke={soon ? "var(--warn)" : "var(--surface)"}
                  strokeWidth={soon ? 4 : 2}
                  strokeDasharray={soon ? "10 7" : undefined}
                  className="group-hover:[stroke-width:4] group-hover:[stroke:var(--ink)] group-focus:[stroke-width:4] group-focus:[stroke:var(--ink)]"
                />
              ))}
              <text x={P.lx} y={P.ly} fontSize={40} textAnchor="middle" className="fill-ink font-black">
                {z.name.replace(" 區", "")}
              </text>
              <text x={P.lx} y={P.ly + 36} fontSize={32} textAnchor="middle" className="fill-ink font-num font-bold">
                {z.done}/{z.total}
              </text>
              {soon && (
                <text x={P.lx} y={P.ly + 68} fontSize={24} textAnchor="middle" className="fill-warn font-bold">
                  {z.resetDays === 0 ? "今天換線" : `${z.resetDays} 天後換線`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between px-2 pt-0.5 pb-1 text-tiny text-muted">
        <span className="inline-flex items-center gap-[5px]">
          完成度 少<i className="inline-block h-2 w-[22px] rounded bg-linear-to-r from-blush to-accent" />多
        </span>
        <span className="inline-flex items-center gap-[5px]">
          <b className="inline-block h-0 w-3.5 border-t-2 border-dashed border-warn" />7 天內換線
        </span>
      </div>
    </div>
  );
}
