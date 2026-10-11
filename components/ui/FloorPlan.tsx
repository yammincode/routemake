"use client";

import { Fragment, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { planText, type FloorPlanShape } from "@/lib/floorplan";
import { buildPlan25d } from "@/lib/plan25d";
import { pressKeys } from "./Gym";

export type PlanZone = { code: string; name: string; done: number; total: number; resetDays: number | null };

// 平面圖畫法：立體（2.5D，預設）或平面；記在這支手機，館首頁和管理後台一起換
export type PlanMode = "3d" | "flat";
const MODE_KEY = "routemake-plan-mode";
const MODE_EVENT = "routemake:plan-mode";
let memMode: PlanMode | null = null; // 存不進手機時（私密瀏覽、空間滿）先記在這裡，這次開著的期間有效
const readMode = (): PlanMode => {
  if (memMode) return memMode;
  try {
    return localStorage.getItem(MODE_KEY) === "flat" ? "flat" : "3d";
  } catch {
    return "3d";
  }
};
const subscribe = (fn: () => void) => {
  window.addEventListener(MODE_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(MODE_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};
export function usePlanMode(): [PlanMode, (m: PlanMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => "3d" as PlanMode);
  const set = (m: PlanMode) => {
    try {
      localStorage.setItem(MODE_KEY, m);
      memMode = null;
    } catch {
      memMode = m;
    }
    window.dispatchEvent(new Event(MODE_EVENT));
  };
  return [mode, set];
}

const isSoon = (z: PlanZone) => z.resetDays != null && z.resetDays >= 0 && z.resetDays <= 7;
const ariaOf = (z: PlanZone, count: boolean, admin: boolean) =>
  `${z.name}，${count ? `牆上 ${z.total} 條` : `完成 ${z.done} / ${z.total}`}${!admin && isSoon(z) ? "，" + (z.resetDays === 0 ? "今天換線" : `${z.resetDays} 天後換線`) : ""}`;
// 區域顏色：管理後台淡色（目前區域深）、沒登入統一、顧客依完成度
const fillOf = (z: PlanZone, on: boolean, admin: boolean, guest: boolean) =>
  admin
    ? `color-mix(in srgb,var(--accent) ${on ? 55 : 14}%,var(--blush))`
    : guest
      ? "color-mix(in srgb,var(--accent) 30%,var(--blush))"
      : `color-mix(in srgb,var(--accent) ${Math.round(18 + (z.total ? z.done / z.total : 0) * 72)}%,var(--blush))`;

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
  const shown = new Set(zones.map((z) => z.code));
  const [mode, setMode] = usePlanMode();
  return (
    <div className="mb-2 rounded-plan bg-surface px-2 pt-2.5 pb-1.5 shadow-card">
      {/* 立體／平面切換（記在這支手機） */}
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <span className="text-tiny text-muted">{mode === "3d" ? "方塊越高，路線越多" : ""}</span>
        <div role="group" aria-label="平面圖畫法" className="inline-flex rounded-full border border-line p-0.5 text-tiny">
          {(
            [
              ["3d", "立體"],
              ["flat", "平面"],
            ] as const
          ).map(([m, t]) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className="rounded-full px-2.5 py-0.5 text-muted aria-pressed:bg-ink aria-pressed:font-bold aria-pressed:text-surface"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {floors.map((shape, fi) => (
        <Fragment key={shape.label ?? fi}>
          {floors.length > 1 && shape.label && (
            <span className={`ml-1 inline-block rounded-cell bg-accent px-2 font-num text-num-chip leading-tight font-bold text-surface ${fi ? "mt-2" : ""}`}>
              {shape.label}
            </span>
          )}
          {mode === "3d" ? (
            <Floor25d
              shape={shape}
              title={`${gymName}${floors.length > 1 && shape.label ? ` ${shape.label} ` : ""}平面圖`}
              zones={zones}
              onSelect={onSelect}
              admin={admin}
              guest={guest}
              selected={selected}
            />
          ) : (
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
              const soon = isSoon(z);
              const on = selected === z.code;
              // 名字沒改過寫簡稱（A1、Slab…），店長改過名字就寫新名字（依旁邊的空間縮小，放不下截短）
              const label = planText(shape, z.code, z.name, 40, shown);
              const fill = fillOf(z, on, admin, guest);
              const count = admin || guest;
              const go = () => onSelect(z.code);
              return (
                <g
                  key={z.code}
                  tabIndex={0}
                  role="button"
                  aria-label={ariaOf(z, count, admin)}
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
          )}
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

// 立體（2.5D 斜俯視）的一層：幾何在 lib/plan25d.ts；方塊越高＝牆上路線越多
// 字的大小固定：量卡片實際寬度，換成平面圖座標單位
// 管理後台選中的區域整塊浮起來、地上留影子，區名變成深色膠囊
// 按鈕（鍵盤、報讀）是區名：照區域順序排，跟平面一樣；方塊照前後順序畫，點方塊也能進那一區；牆、櫃台、地上的字不擋點擊
function Floor25d({
  shape,
  title,
  zones,
  onSelect,
  admin,
  guest,
  selected,
}: {
  shape: FloorPlanShape;
  title: string;
  zones: PlanZone[];
  onSelect: (code: string) => void;
  admin: boolean;
  guest: boolean;
  selected?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // 量到寬度才算（不先用猜的寬度算一次再重算）；藏起來（寬度 0）時用 342 先畫
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.clientWidth);
      setWidth((old) => (w > 0 ? (old == null || Math.abs(old - w) > 1 ? w : old) : (old ?? 342)));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const count = admin || guest;
  const sig = zones.map((z) => `${z.code}:${z.name}:${z.done}:${z.total}`).join("|");
  const m = useMemo(
    () =>
      width == null
        ? null
        : buildPlan25d(shape, zones.map((z) => ({ code: z.code, name: z.name, total: z.total, count: count ? `${z.total} 條` : `${z.done}/${z.total}` })), width),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig 已經包含 zones 的內容
    [shape, sig, width, count]
  );
  if (!m) return <div ref={box} />;
  const byCode = new Map(zones.map((z) => [z.code, z]));
  const { u, H } = m;
  const lift = (on: boolean) => ({ transform: on ? `translate(${(-0.22 * H.lift).toFixed(1)}px,${(-H.lift).toFixed(1)}px)` : "translate(0px,0px)" });
  const goTo = (code: string) => () => onSelect(code);
  const motion = "transition-transform duration-200 ease-out motion-reduce:transition-none";
  const side = (top: string, f: number) => `color-mix(in srgb,${top} ${Math.round(60 + 22 * f)}%,var(--plan-shade))`;
  const wallFill = "color-mix(in srgb,var(--muted) 15%,transparent)";
  return (
    <div ref={box}>
      <svg viewBox={m.viewBox} role="img" aria-label={title} data-plan="3d" className="block h-auto w-full" style={{ "--hw": `${(1.4 * u).toFixed(1)}px` } as CSSProperties}>
        {/* 地板：厚度（看得到的側面）＋地面 */}
        {m.floorFaces.map((f, i) => (
          <polygon key={i} points={f.pts} fill={side("var(--sunk)", f.f)} stroke="var(--line)" strokeWidth={0.6 * u} strokeLinejoin="round" />
        ))}
        <polygon points={m.floorTop} fill="var(--sunk)" stroke="var(--line)" strokeWidth={u} strokeLinejoin="round" />

        {/* 牆、櫃台、區域：由後往前畫 */}
        {m.items.map((it, i) => {
          if (it.kind === "wall")
            return (
              <g key={`w${i}`} fill="none" strokeLinecap="round" aria-hidden pointerEvents="none">
                <polygon points={it.pts} fill={wallFill} />
                {it.posts.map((p, j) => (
                  <polyline key={j} points={p} stroke="color-mix(in srgb,var(--muted) 35%,transparent)" strokeWidth={0.8 * u} />
                ))}
                <polyline points={it.cap} stroke="color-mix(in srgb,var(--muted) 60%,transparent)" strokeWidth={1.3 * u} />
              </g>
            );
          if (it.kind === "fixture")
            return (
              <g key={`f${i}`} strokeLinejoin="round" aria-hidden pointerEvents="none">
                {it.faces.map((f, j) => (
                  <polygon key={j} points={f.pts} fill={side("var(--line)", f.f)} stroke={side("var(--line)", f.f)} strokeWidth={0.4 * u} />
                ))}
                <polygon points={it.top} fill="color-mix(in srgb,var(--line) 55%,var(--surface))" stroke="var(--line)" strokeWidth={0.8 * u} />
              </g>
            );
          const z = byCode.get(it.code)!;
          const on = selected === z.code;
          const soon = isSoon(z);
          const fill = fillOf(z, on, admin, guest);
          return (
            <g key={z.code} data-block={z.code} aria-hidden onClick={goTo(z.code)} className="group cursor-pointer">
              {/* 浮起來時地上的影子 */}
              {on && it.base.map((b, j) => <polygon key={j} points={b} fill="color-mix(in srgb,var(--ink) 22%,transparent)" />)}
              <g className={motion} style={lift(on)}>
                {it.faces.map((f, j) => (
                  <polygon key={j} points={f.pts} fill={side(fill, f.f)} stroke={side(fill, f.f)} strokeWidth={0.4 * u} strokeLinejoin="round" />
                ))}
                {it.tops.map((t, j) => (
                  <polygon
                    key={j}
                    data-top
                    points={t}
                    fill={fill}
                    stroke={on ? "var(--ink)" : soon ? "var(--warn)" : "var(--surface)"}
                    strokeWidth={(on ? 2 : soon ? 1.5 : 0.7) * u}
                    strokeDasharray={soon && !on ? `${(3 * u).toFixed(1)} ${(2 * u).toFixed(1)}` : undefined}
                    strokeLinejoin="round"
                    className={on ? undefined : "group-hover:[stroke-width:var(--hw)] group-hover:[stroke:var(--ink)]"}
                  />
                ))}
              </g>
            </g>
          );
        })}

        {/* 地上的字（櫃台、入口…） */}
        {m.notes.map((n, i) => (
          <text
            key={i}
            x={n.x}
            y={n.y}
            fontSize={H.text}
            textAnchor="middle"
            fill="var(--muted)"
            stroke="var(--sunk)"
            strokeWidth={2 * u}
            strokeLinejoin="round"
            paintOrder="stroke"
            aria-hidden
            pointerEvents="none"
          >
            {n.t}
          </text>
        ))}

        {/* 區名＋條數：正立的字，白邊；被推開的加指引線；點字也能選這一區（鍵盤、報讀的按鈕在這裡） */}
        {m.labels.map((l) => {
          const z = byCode.get(l.code)!;
          const dot = m.dots[l.code];
          const on = selected === l.code;
          const go = goTo(l.code);
          const dx = dot[0] - l.x;
          const dy = dot[1] - l.y;
          const far = Math.hypot(dx, dy) > Math.max(l.h * 0.9, 18 * u) && Math.hypot(l.x - l.ox, l.y - l.oy) > l.h * 0.45;
          const t = Math.min(dx ? l.w / 2 / Math.abs(dx) : Infinity, dy ? l.h / 2 / Math.abs(dy) : Infinity);
          const top = l.y - l.h / 2 + 0.6 * H.pad;
          const nameY = top + 0.86 * H.name;
          const countY = nameY + 0.99 * H.count;
          const ink = on ? "fill-surface" : "fill-ink";
          const halo = on ? undefined : { stroke: "var(--surface)", strokeWidth: 2.4 * u, strokeLinejoin: "round" as const, paintOrder: "stroke" };
          return (
            <g
              key={l.code}
              data-zone={l.code}
              tabIndex={0}
              role="button"
              aria-label={ariaOf(z, count, admin)}
              aria-pressed={admin ? on : undefined}
              onClick={go}
              onKeyDown={pressKeys(go)}
              className="group cursor-pointer focus:outline-none"
            >
              {far && t < 1 && (
                <>
                  <line x1={l.x + dx * t} y1={l.y + dy * t} x2={dot[0]} y2={dot[1]} stroke="var(--muted)" strokeWidth={0.9 * u} />
                  <circle cx={dot[0]} cy={dot[1]} r={1.6 * u} fill="var(--muted)" />
                </>
              )}
              {/* 選中：深色膠囊；鍵盤移到這一區：外圍深色框（選中的也看得到） */}
              {on && <rect x={l.x - l.w / 2} y={l.y - l.h / 2} width={l.w} height={l.h} rx={l.h / 2.6} fill="var(--ink)" />}
              <rect
                x={l.x - l.w / 2 - 1.2 * u}
                y={l.y - l.h / 2 - 1.2 * u}
                width={l.w + 2.4 * u}
                height={l.h + 2.4 * u}
                rx={l.h / 2.6 + 1.2 * u}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={1.5 * u}
                pointerEvents="none"
                className="opacity-0 group-focus-visible:opacity-100"
              />
              <text x={l.x} y={nameY} fontSize={H.name} textAnchor="middle" className={`${ink} font-black`} {...halo}>
                {l.name}
              </text>
              <text x={l.x} y={countY} fontSize={H.count} textAnchor="middle" className={`${ink} font-num font-bold`} {...halo}>
                {l.count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}