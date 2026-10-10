"use client";

import { Fragment } from "react";
import { planText, type FloorPlanShape } from "@/lib/floorplan";
import { pressKeys } from "./Gym";

export type PlanZone = { code: string; name: string; done: number; total: number; resetDays: number | null };

// 館內平面圖（原型 planSVG）：依完成度上色，7 天內換線用紅色虛線框（幾天後換線寫在區域卡片和「即將換線」，圖上不寫，免得壓到旁邊的區名）
// admin：管理後台用，顯示每區路線數，selected 的區域加粗框（目前編輯中）
// guest：沒登入，每區寫路線數、統一底色（沒有完成度）
// shape 可以是好幾層（例如南港 1F、2F）：同一張卡片由上到下畫，每層上方標樓層
export default function FloorPlan({
  shape,
  gymName,
  zones,
  onSelect,
  admin = false,
  guest = false,
  selected,
}: {
  shape: FloorPlanShape | FloorPlanShape[];
  gymName: string;
  zones: PlanZone[];
  onSelect: (code: string) => void;
  admin?: boolean;
  guest?: boolean;
  selected?: string;
}) {
  const floors = Array.isArray(shape) ? shape : [shape];
  return (
    <div className="mb-2 rounded-plan bg-surface px-2 pt-2.5 pb-1.5 shadow-card">
      {floors.map((shape, fi) => (
        <Fragment key={shape.label ?? fi}>
          {floors.length > 1 && shape.label && (
            <span className={`ml-1 inline-block rounded-cell bg-accent px-2 font-num text-num-chip leading-tight font-bold text-surface ${fi ? "mt-2" : ""}`}>
              {shape.label}
            </span>
          )}
          <svg
            viewBox={shape.viewBox}
            role="img"
            aria-label={`${gymName}${floors.length > 1 && shape.label ? ` ${shape.label} ` : ""}平面圖`}
            className="block h-auto w-full"
          >
            <polygon points={shape.outline} fill="var(--sunk)" stroke="var(--line)" strokeWidth={3} />
            {shape.walls?.map((w, i) => (
              <polyline key={i} points={w} fill="none" stroke="var(--line)" strokeWidth={3} />
            ))}
            {shape.fixtures.map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} fill="none" stroke="var(--line)" strokeWidth={3} />
            ))}
            {shape.texts?.map((t, i) => (
              <text key={i} x={t.x} y={t.y} fontSize={26} fill="var(--muted)" textAnchor="middle">
                {t.t}
              </text>
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
              const on = selected === z.code;
              // 名字沒改過寫簡稱（A1、Slab…），店長改過名字就寫新名字（依旁邊的空間縮小，放不下截短）
              const label = planText(shape, z.code, z.name);
              const fill = admin
                ? `color-mix(in srgb,var(--accent) ${on ? 55 : 14}%,var(--blush))`
                : guest
                  ? "color-mix(in srgb,var(--accent) 30%,var(--blush))"
                  : `color-mix(in srgb,var(--accent) ${Math.round(18 + p * 72)}%,var(--blush))`;
              const count = admin || guest;
              const go = () => onSelect(z.code);
              return (
                <g
                  key={z.code}
                  tabIndex={0}
                  role="button"
                  aria-label={`${z.name}，${count ? `牆上 ${z.total} 條` : `完成 ${z.done} / ${z.total}`}${
                    !admin && soon ? "，" + (z.resetDays === 0 ? "今天換線" : `${z.resetDays} 天後換線`) : ""
                  }`}
                  aria-pressed={admin ? on : undefined}
                  onClick={go}
                  onKeyDown={pressKeys(go)}
                  className="group cursor-pointer focus:outline-none"
                >
                  {P.polys.map((pt, i) => (
                    <polygon
                      key={i}
                      points={pt}
                      fill={fill}
                      stroke={on ? "var(--ink)" : soon ? "var(--warn)" : "var(--surface)"}
                      strokeWidth={on ? 6 : soon ? 4 : 2}
                      strokeDasharray={soon ? "10 7" : undefined}
                      className="group-hover:[stroke-width:4] group-hover:[stroke:var(--ink)] group-focus:[stroke-width:4] group-focus:[stroke:var(--ink)]"
                    />
                  ))}
                  <text x={P.lx} y={P.ly} fontSize={label.size} textAnchor="middle" className="fill-ink font-black">
                    {label.text}
                  </text>
                  <text x={P.lx} y={P.ly + 36} fontSize={32} textAnchor="middle" className="fill-ink font-num font-bold">
                    {count ? `${z.total} 條` : `${z.done}/${z.total}`}
                  </text>
                </g>
              );
            })}
          </svg>
        </Fragment>
      ))}
      <div className="flex items-center justify-between px-2 pt-0.5 pb-1 text-tiny text-muted">
        {admin ? (
          <span className="inline-flex items-center gap-[5px]">
            <i className="inline-block h-2.5 w-3.5 rounded-sm border-2 border-ink bg-blush" />
            點區域切換，粗框是目前區域
          </span>
        ) : guest ? (
          <span>點區域看路線</span>
        ) : (
          <span className="inline-flex items-center gap-[5px]">
            完成度 少<i className="inline-block h-2 w-[22px] rounded bg-linear-to-r from-blush to-accent" />多
          </span>
        )}
        <span className="inline-flex items-center gap-[5px]">
          <b className="inline-block h-0 w-3.5 border-t-2 border-dashed border-warn" />7 天內換線
        </span>
      </div>
    </div>
  );
}
