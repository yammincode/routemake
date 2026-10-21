"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { MascotArt } from "./Mascot";
import Sheet from "./Sheet";
import { Tabs } from "./Tabs";
import {
  CLIMBER_GROUPS,
  CLIMBER_KEYS,
  CLIMBER_TABS,
  climberColor,
  climberItemName,
  climberLock,
  lockCond,
  lockLeft,
  lockProgress,
  type ClimbStats,
  type Climber,
  type ClimberKey,
  type ClimberRule,
  type ClimberTab,
} from "@/lib/climber";
import { climberBgSvg, climberHeadSvg, climberSvg } from "@/lib/climber-art";
import { mascotInfo, type MascotMode, type MascotPick } from "@/lib/mascots";

// 角色的圖畫成 <img src="data:…">：每張圖的 filter、pattern id 各自獨立（同一頁很多頭像也不會互相找錯），
// 白邊濾鏡只在第一次畫時算，捲動長長的留言列表不會一直重算；同樣的角色（同一個人）整個 App 共用一份
const urls = new Map<string, string>();
const svgUrl = (key: string, make: () => string) => {
  let u = urls.get(key);
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(make())}`;
    if (urls.size > 300) urls.clear();
    urls.set(key, u);
  }
  return u;
};
const keyOf = (kind: string, c: Climber) => `${kind}:${JSON.stringify(c)}`;

// 攀岩角色全身（B 貼紙線稿）；填滿外面的框（寬:高＝144:224，四周有留白給岩點和白邊）
export function ClimberArt({ climber, className = "" }: { climber: Climber; className?: string }) {
  const src = useMemo(() => svgUrl(keyOf("body", climber), () => climberSvg(climber)), [climber]);
  return (
    <span data-climber={climber.pose} className={`block ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 程式畫的 SVG（data URI），不用 next/image */}
      <img src={src} alt="" draggable={false} className="block size-full select-none" />
    </span>
  );
}

// 背景（人物卡上半段、解鎖卡）
function ClimberBg({ climber }: { climber: Climber }) {
  const src = useMemo(() => svgUrl(`bg:${climber.bg}:${climber.bg === "plain" ? climber.topC : ""}`, () => climberBgSvg(climber)), [climber]);
  // eslint-disable-next-line @next/next/no-img-element -- 程式畫的 SVG（data URI）
  return <img src={src} alt="" aria-hidden draggable={false} className="absolute inset-0 block size-full object-cover select-none" />;
}

// 小頭像底色：跟背景同色系的淡色
const HEAD_BG: Record<string, string> = { longdong: "#cfeaf7", wall: "#efe4d2", gym: "#e9e3d9", night: "#c9cfe6", wanhua: "#e4def3" };

// 圓形小頭像（留言、影片旁）：只畫頭
export function ClimberHead({ climber, size = 22, label }: { climber: Climber; size?: number; label?: string }) {
  const src = useMemo(() => svgUrl(keyOf("head", climber), () => climberHeadSvg(climber)), [climber]);
  const bg = HEAD_BG[climber.bg] ?? `${climberColor("topC", climber.topC)}33`;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-climber-head
      style={{ width: size, height: size, background: bg }}
      className="grid flex-none place-items-center overflow-hidden rounded-full"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 程式畫的 SVG（data URI） */}
      <img src={src} alt="" draggable={false} className="block size-full select-none" />
    </span>
  );
}

// 人物卡上半段：背景（預設龍洞）＋攀岩角色＋夥伴站旁邊（使用者 10/21 選的：以真人為主、夥伴留著）
export function ClimberScene({
  climber,
  pick,
  mode = "plain",
  small = false,
  children,
}: {
  climber: Climber;
  pick: MascotPick;
  mode?: MascotMode;
  small?: boolean;
  children?: ReactNode;
}) {
  return (
    <div data-testid="climber-scene" className={`relative overflow-hidden rounded-card ${small ? "h-[150px]" : "h-[220px]"}`}>
      <ClimberBg climber={climber} />
      <span className="absolute top-2.5 left-3 rounded-full bg-surface/90 px-2.5 py-0.5 text-tiny font-bold text-ink">夥伴：{mascotInfo(pick.id).name}</span>
      <span className={`absolute bottom-[5%] left-[5%] ${small ? "size-[70px]" : "size-[104px]"}`}>
        <MascotArt pick={pick} mode={mode} className="size-full" />
      </span>
      <ClimberArt climber={climber} className="absolute right-[9%] bottom-0 aspect-[144/224] h-[97%]" />
      {children}
    </div>
  );
}

// 鎖住的款式點了跳出來的解鎖卡（B 案）：先看穿上去的樣子、怎麼解鎖、進度
export function UnlockCard({
  climber,
  item,
  stats,
  onClose,
}: {
  climber: Climber;
  item: { key: ClimberKey; v: string; rule: ClimberRule } | null;
  stats: ClimbStats | null;
  onClose: () => void;
}) {
  const tryOn = item ? { ...climber, [item.key]: item.v } : climber;
  const r = item?.rule;
  const count = r && !("sp" in r) && stats ? `${stats[r.t]} / ${r.n} ${r.t === "days" ? "天" : "條"}，${lockLeft(r, stats)}` : null;
  return (
    <Sheet open={!!item} onClose={onClose}>
      {item && r && (
        <div className="grid gap-2" data-testid="unlock-card">
          <div className="relative h-[170px] overflow-hidden rounded-card">
            <ClimberBg climber={tryOn} />
            <span className="absolute top-2 left-2 rounded-full bg-ink/80 px-2 text-tiny font-bold text-white">試穿</span>
            {item.key !== "bg" && <ClimberArt climber={tryOn} className="absolute bottom-0 left-1/2 aspect-[144/224] h-full -translate-x-1/2" />}
          </div>
          <h3 className="m-0 text-section font-bold">🔒 {climberItemName(item.key, item.v)}</h3>
          <p className="m-0 font-bold text-accent">{"sp" in r ? r.sp : `${lockCond(r)}解鎖`}</p>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lockProgress(r, stats) * 100)} className="h-2 overflow-hidden rounded-full bg-sunk">
            <i className="block h-full rounded-full bg-accent" style={{ width: `${lockProgress(r, stats) * 100}%` }} />
          </div>
          <p className="m-0 text-note text-muted">{"sp" in r ? "特殊獎品：完成徽章或任務才拿得到（之後開放）" : (count ?? "讀取你的紀錄中…")}</p>
          <Button variant="primary" onClick={onClose}>
            知道了
          </Button>
        </div>
      )}
    </Sheet>
  );
}

// 這一組現在用不到（例：運動背心沒有圖案、沒戴帽子不用選帽子顏色、站著沒有岩點）
const unused = (key: ClimberKey, c: Climber) =>
  (key === "print" && !["tee", "tech", "tank", "long", "hood"].includes(c.top)) ||
  (key === "hatC" && c.hat === "none") ||
  (key === "holdC" && !["hang", "reach", "heel", "dyno", "brush"].includes(c.pose));

// 編輯攀岩角色：7 個分頁；鎖住的款式變淡加 🔒、寫還差多少（A 案），點了跳解鎖卡（B 案）
export function ClimberEditor({
  value,
  onChange,
  stats,
  onRandom,
}: {
  value: Climber;
  onChange: (c: Climber) => void;
  stats: ClimbStats | null;
  onRandom: () => void;
}) {
  const [tab, setTab] = useState<ClimberTab>("攀岩");
  const [lock, setLock] = useState<{ key: ClimberKey; v: string; rule: ClimberRule } | null>(null);
  const keys = CLIMBER_KEYS.filter((k) => CLIMBER_GROUPS[k].tab === tab);
  const choose = (key: ClimberKey, v: string) => {
    const rule = climberLock(key, v, stats);
    if (rule) return setLock({ key, v, rule });
    onChange({ ...value, [key]: v });
  };
  return (
    <div data-testid="climber-editor">
      <Tabs tabs={CLIMBER_TABS.map((t) => ({ key: t, label: t }))} value={tab} onChange={setTab} />
      <div className="grid gap-3">
        {keys.map((key) => {
          const g = CLIMBER_GROUPS[key];
          const off = unused(key, value);
          return (
            <div key={key} role="group" aria-label={g.label} className={`grid gap-1.5 ${off ? "opacity-50" : ""}`}>
              <span className="text-note font-bold text-muted">
                {g.label}
                {off && <span className="font-normal">（現在用不到）</span>}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(g.items).map(([v, name]) => {
                  const rule = climberLock(key, v, stats);
                  const pressed = value[key] === v;
                  if (g.colors) {
                    const c = g.colors[v];
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={pressed}
                        aria-label={`${g.label} ${name}${rule ? `（🔒 ${lockCond(rule)}）` : ""}`}
                        onClick={() => choose(key, v)}
                        style={{ background: c === "transparent" ? "repeating-linear-gradient(45deg,#ddd 0 4px,#fff 4px 8px)" : c }}
                        className={`grid size-[30px] place-items-center rounded-full text-[11px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.2)] aria-pressed:outline-3 aria-pressed:outline-offset-2 aria-pressed:outline-ink ${rule ? "opacity-50" : ""}`}
                      >
                        {rule ? "🔒" : ""}
                      </button>
                    );
                  }
                  return (
                    <Chip key={v} pressed={pressed} onClick={() => choose(key, v)} className={rule ? "border-dashed opacity-60" : ""}>
                      {rule ? `🔒 ${name}` : name}
                      {rule && <small className="ml-1 text-tiny">{lockLeft(rule, stats)}</small>}
                    </Chip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <Button className="mt-3" onClick={onRandom}>
        🎲 隨機換一套（只選已解鎖的）
      </Button>
      <UnlockCard climber={value} item={lock} stats={stats} onClose={() => setLock(null)} />
    </div>
  );
}
