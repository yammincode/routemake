"use client";

import type { CSSProperties, ReactNode } from "react";
import { HOLD_COLORS } from "@/lib/design";
import { MASCOT_ART } from "@/lib/mascot-art";
import { useMascot, useMascotMode } from "@/lib/mascot-store";
import {
  MASCOTS,
  ARTSY_DECO,
  MASCOT_BGS,
  TROLL_DECO,
  mascotGymColor,
  mascotInfo,
  mascotOpen,
  partSwatches,
  tint,
  type MascotId,
  type MascotMode,
  type MascotPick,
} from "@/lib/mascots";

// 夥伴圖的顏色：換過的部位設 CSS 變數（--m1…），沒換的用 logo 原本的顏色
function artVars(pick: MascotPick): CSSProperties {
  const v: Record<string, string> = {};
  mascotInfo(pick.id).parts.forEach((p, i) => {
    const c = pick.colors?.[i];
    if (!c) return;
    p.keys.forEach((k) => (v[`--m${k}`] = c));
    p.lite?.forEach((k) => (v[`--m${k}`] = tint(c)));
  });
  return v as CSSProperties;
}
// 卡片背景：自己選的，沒選用夥伴那館的顏色
export const mascotBg = (pick: MascotPick) => pick.bg ?? mascotGymColor(pick.id);

// 幹話模式：刀疤（縫線）＋叼著的棒棒糖，畫在夥伴圖上面（0–100 的座標）
function TrollDeco({ id }: { id: MascotId }) {
  const { scar, angle, mouth } = TROLL_DECO[id];
  const [sx, sy] = scar;
  const [mx, my] = mouth;
  const ex = mx + 15;
  const ey = my + 11;
  const [cx, cy] = [ex + 5, ey + 4];
  return (
    <svg viewBox="0 0 100 100" aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible" data-troll>
      <g transform={`rotate(${angle} ${sx} ${sy})`} strokeLinecap="round">
        <line x1={sx - 12} y1={sy} x2={sx + 12} y2={sy} stroke="#fff" strokeWidth={5.5} />
        <line x1={sx - 12} y1={sy} x2={sx + 12} y2={sy} stroke="#8B1E2D" strokeWidth={2.6} />
        {[-8, -3, 2, 7].map((o) => (
          <line key={o} x1={sx + o} y1={sy - 3} x2={sx + o} y2={sy + 3} stroke="#8B1E2D" strokeWidth={1.6} />
        ))}
      </g>
      <line x1={mx} y1={my} x2={ex} y2={ey} stroke="#fff" strokeWidth={4.5} strokeLinecap="round" />
      <line x1={mx} y1={my} x2={ex} y2={ey} stroke="#E9E4DA" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={10.5} fill="#fff" />
      <circle cx={cx} cy={cy} r={9} fill="#F07BB5" />
      <path d={`M${cx} ${cy} m-6 0 a6 6 0 1 1 6 6 a4 4 0 1 1 -4 -4 a2 2 0 1 1 2 2`} fill="none" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

// 文青：歪戴的貝雷帽＋細圓框眼鏡（白邊讓深色夥伴也看得到）＋手邊一杯拿鐵（cup＝false 時不畫：小頭像畫了會糊成一團）
function ArtsyDeco({ id, cup }: { id: MascotId; cup: boolean }) {
  const { eyes, r, hat, tilt, cup: at } = ARTSY_DECO[id];
  const [[x1, y1], [x2, y2]] = eyes;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const [bx1, by1, bx2, by2] = [x1 + r * Math.cos(a), y1 + r * Math.sin(a), x2 - r * Math.cos(a), y2 - r * Math.sin(a)];
  const bridge = `M${bx1} ${by1} Q${(bx1 + bx2) / 2} ${(by1 + by2) / 2 - 3} ${bx2} ${by2}`;
  const [hx, hy] = hat;
  const [cx, cy] = at;
  const mug = `M${cx - 9} ${cy - 8} h18 l-2 16 a3 3 0 0 1 -3 3 h-8 a3 3 0 0 1 -3 -3z`;
  const handle = `M${cx + 9} ${cy - 4} a4.5 4.5 0 0 1 0 9`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible" data-artsy>
      <g transform={`rotate(${tilt} ${hx} ${hy})`}>
        <path d={`M${hx - 21} ${hy + 2} C${hx - 20} ${hy - 12} ${hx + 20} ${hy - 14} ${hx + 22} ${hy + 1} C${hx + 10} ${hy + 6} ${hx - 10} ${hy + 6} ${hx - 21} ${hy + 2}Z`} fill="#2E2A33" stroke="#fff" strokeWidth={2.4} />
        <path d={`M${hx - 15} ${hy + 1} C${hx - 5} ${hy + 4} ${hx + 8} ${hy + 4} ${hx + 16} ${hy}`} fill="none" stroke="#4A4452" strokeWidth={1.4} />
        <line x1={hx + 1} y1={hy - 9} x2={hx + 3} y2={hy - 14} stroke="#fff" strokeWidth={4} strokeLinecap="round" />
        <line x1={hx + 1} y1={hy - 9} x2={hx + 3} y2={hy - 14} stroke="#2E2A33" strokeWidth={2} strokeLinecap="round" />
      </g>
      {eyes.map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r={r} fill="rgba(255,255,255,.12)" stroke="#fff" strokeWidth={4.2} />
          <circle cx={x} cy={y} r={r} fill="none" stroke="#2B2420" strokeWidth={2} />
        </g>
      ))}
      <path d={bridge} fill="none" stroke="#fff" strokeWidth={4} />
      <path d={bridge} fill="none" stroke="#2B2420" strokeWidth={1.8} />
      {cup && (
        <g data-latte>
          <path d={mug} fill="#fff" stroke="#fff" strokeWidth={4} strokeLinejoin="round" />
          <path d={handle} fill="none" stroke="#fff" strokeWidth={4.5} />
          <path d={handle} fill="none" stroke="#CDBFAE" strokeWidth={2} />
          <path d={mug} fill="#F2EBDF" stroke="#CDBFAE" strokeWidth={1.2} />
          <ellipse cx={cx} cy={cy - 8} rx={9} ry={2.6} fill="#B07A4F" />
          <path d={`M${cx} ${cy - 6.8} c-2.2 -1.6 -3 -3.4 -1.4 -3.8 c.8 -.2 1.2 .3 1.4 .8 c.2 -.5 .6 -1 1.4 -.8 c1.6 .4 .8 2.2 -1.4 3.8z`} fill="#F7EEDF" />
        </g>
      )}
    </svg>
  );
}

// 夥伴圖（填滿外面的框）；mode＝夥伴風格（幹話加刀疤棒棒糖、文青加貝雷帽眼鏡拿鐵）；cup＝false 時文青不畫拿鐵（小頭像）
export function MascotArt({ pick, mode = "plain", cup = true, className = "" }: { pick: MascotPick; mode?: MascotMode; cup?: boolean; className?: string }) {
  const art = MASCOT_ART[pick.id];
  return (
    <span className={`relative block ${className}`} data-mascot={pick.id}>
      <svg viewBox={art.vb} aria-hidden className="block size-full" style={artVars(pick)} dangerouslySetInnerHTML={{ __html: art.body }} />
      {mode === "troll" && <TrollDeco id={pick.id} />}
      {mode === "artsy" && <ArtsyDeco id={pick.id} cup={cup} />}
    </span>
  );
}

// 圓形頭像：夥伴＋淡淡的館色底；pick 是 null＝還在讀，先畫空的圓；40px 以下（留言、影片列）文青不畫拿鐵
export function MascotAvatar({ pick, size = 48, mode = "plain", label }: { pick: MascotPick | null; size?: number; mode?: MascotMode; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size, background: pick ? `${mascotBg(pick)}33` : undefined }}
      className="grid flex-none place-items-center rounded-full bg-sunk"
    >
      {pick && <MascotArt pick={pick} mode={mode} cup={size >= 40} className="size-[84%]" />}
    </span>
  );
}

// 某個人的頭像（留言、影片用）：自動讀那個人的夥伴；夥伴風格照這支手機選的
export function UserAvatar({ userId, size = 22 }: { userId: string | null | undefined; size?: number }) {
  const pick = useMascot(userId);
  const [mode] = useMascotMode();
  return <MascotAvatar pick={pick} size={size} mode={mode} />;
}

// 人物卡上半段（角色卡）：大大的夥伴、背景色、右上角夥伴名字
// pick 是 null＝還在讀（先畫一樣高的灰色方塊）
export function CharacterTop({ pick, mode = "plain", small = false, children }: { pick: MascotPick | null; mode?: MascotMode; small?: boolean; children?: ReactNode }) {
  if (!pick) return <div aria-hidden className={`rounded-card bg-sunk ${small ? "h-[120px]" : "h-[190px]"}`} />;
  const info = mascotInfo(pick.id);
  return (
    <div style={{ background: mascotBg(pick) }} className={`relative grid place-items-center overflow-hidden rounded-card ${small ? "h-[120px]" : "h-[190px]"}`}>
      <span className="absolute top-2.5 left-3 rounded-full bg-surface/90 px-2.5 py-0.5 text-tiny font-bold text-ink">夥伴</span>
      <span className="absolute top-2.5 right-3 text-meta font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.4)]">{info.name}</span>
      <MascotArt pick={pick} mode={mode} className={small ? "size-[100px]" : "size-[160px]"} />
      {children}
    </div>
  );
}

// 選夥伴：六隻一排（手機三隻一排）；還沒開放的館寫「即將登場」、點不了
export function MascotPicker({ value, onChange, mode = "plain" }: { value: MascotId; onChange: (id: MascotId) => void; mode?: MascotMode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {MASCOTS.map((m) => {
        const open = mascotOpen(m.id);
        return (
          <button
            key={m.id}
            type="button"
            disabled={!open}
            aria-pressed={value === m.id}
            onClick={() => onChange(m.id)}
            className="grid justify-items-center gap-0.5 rounded-tile border-2 border-transparent bg-surface px-1 py-2 text-tiny text-muted shadow-card disabled:opacity-45 aria-pressed:border-accent aria-pressed:font-bold aria-pressed:text-ink"
          >
            <MascotArt pick={{ id: m.id }} mode={open ? mode : "plain"} className="size-12" />
            {m.name}
            {!open && <span>即將登場</span>}
          </button>
        );
      })}
    </div>
  );
}

// 色票一排（選中的加框）
function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          onClick={() => onPick(c)}
          style={{ background: c }}
          className="size-[30px] rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.2)] aria-pressed:outline-3 aria-pressed:outline-offset-2 aria-pressed:outline-ink"
        />
      ))}
    </div>
  );
}

// 換色：每個部位一排色票（第一個是原本的顏色）、卡片背景（六館標準色）、換回原本的顏色
export function MascotColors({ pick, onChange }: { pick: MascotPick; onChange: (p: MascotPick) => void }) {
  const info = mascotInfo(pick.id);
  const art = MASCOT_ART[pick.id];
  const colors = info.parts.map((_, i) => pick.colors?.[i] ?? null);
  return (
    <div className="grid gap-3">
      {info.parts.map((p, i) => {
        const orig = art.fills[`cls-${p.keys[0]}`];
        const list = [orig, ...partSwatches(orig).filter((c) => c !== orig)];
        return (
          <div key={p.label} className="grid gap-1">
            <span className="text-note font-bold text-muted">{p.label}</span>
            <Swatches
              label={p.label}
              colors={list}
              value={colors[i] ?? orig}
              onPick={(c) => onChange({ ...pick, colors: colors.map((x, j) => (j === i ? (c === orig ? null : c) : x)) })}
            />
          </div>
        );
      })}
      <div className="grid gap-1">
        <span className="text-note font-bold text-muted">卡片背景</span>
        <Swatches label="卡片背景" colors={MASCOT_BGS} value={mascotBg(pick)} onPick={(c) => onChange({ ...pick, bg: c === mascotGymColor(pick.id).toLowerCase() ? null : c })} />
      </div>
      <button type="button" onClick={() => onChange({ id: pick.id })} className="justify-self-start text-note font-bold text-accent">
        ↺ 換回原本的顏色
      </button>
    </div>
  );
}

// 館首頁的對話泡泡：夥伴小頭像＋一句話；右上角 ✕ 關掉（今天不再出現）
export function MascotBubble({ pick, mode = "plain", text, onClose }: { pick: MascotPick; mode?: MascotMode; text: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex animate-talk items-start gap-2" data-testid="mascot-bubble">
      <MascotAvatar pick={pick} size={40} mode={mode} />
      <p className="relative m-0 flex-1 rounded-card border border-line bg-surface py-2 pr-8 pl-3 text-note leading-normal shadow-card">
        <b className="block text-tiny text-muted">{mascotInfo(pick.id).name}</b>
        {text}
        <button type="button" aria-label="關掉，今天不再出現" onClick={onClose} className="absolute top-1 right-1 px-2 py-1 text-meta text-muted">
          ✕
        </button>
      </p>
    </div>
  );
}

// 右下角小夥伴：一直站在右下角（fixed：底部分頁上面，路線卡片、全螢幕播放蓋在上面）；text 有值時旁邊冒泡泡；點夥伴換一句
// 「🤫 閉嘴」放在泡泡右上角（離下面的列表遠一點，不容易誤按）：今天都不說
export function MascotBuddyView({
  pick,
  mode = "plain",
  text,
  onTap,
  onHush,
  fixed = false,
}: {
  pick: MascotPick;
  mode?: MascotMode;
  text: string | null;
  onTap: () => void;
  onHush: () => void;
  fixed?: boolean;
}) {
  return (
    <div className={`flex items-end gap-1.5 ${fixed ? "fixed right-3 bottom-[calc(72px+env(safe-area-inset-bottom,0px))] z-[15]" : ""}`} data-testid="mascot-buddy">
      {text && (
        <div className="relative mb-1 max-w-[210px] animate-talk rounded-card border border-line bg-surface px-3 py-2 text-note leading-normal shadow-card" role="status">
          <span className="flex items-start justify-between gap-2">
            <b className="text-tiny text-muted">{mascotInfo(pick.id).name}</b>
            <button type="button" onClick={onHush} className="-mt-0.5 -mr-1 px-1 text-tiny font-bold text-accent">
              🤫 閉嘴
            </button>
          </span>
          {text}
        </div>
      )}
      <button type="button" aria-label={`${mascotInfo(pick.id).name}：點我說話`} onClick={onTap} className="rounded-full border-2 border-surface shadow-card">
        <MascotAvatar pick={pick} size={48} mode={mode} />
      </button>
    </div>
  );
}

// 做了事情（記錄完攀、Flash、破紀錄…）：夥伴從上面跳出來說一句；party 撒彩帶（減少動態效果時不撒）
// 彩帶顏色：Flash 黃加上岩點色（紅、藍、綠、粉、白）
const PARTY = ["var(--flash)", HOLD_COLORS.紅, HOLD_COLORS.藍, HOLD_COLORS.綠, HOLD_COLORS.粉, HOLD_COLORS.白];
export function MascotToastView({ pick, mode = "plain", text, party = false, onClose }: { pick: MascotPick; mode?: MascotMode; text: string; party?: boolean; onClose: () => void }) {
  return (
    <>
      {party && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden motion-reduce:hidden" data-party>
          {Array.from({ length: 36 }, (_, i) => (
            <i
              key={i}
              className="absolute -top-3 block h-[11px] w-[7px] animate-confetti rounded-[2px]"
              style={{ left: `${(i * 37) % 100}%`, background: PARTY[i % PARTY.length], animationDelay: `${(i % 9) * 0.05}s` }}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        role="status"
        style={{ background: mascotBg(pick) }}
        className="fixed inset-x-3 top-[calc(12px+env(safe-area-inset-top,0px))] z-30 mx-auto flex max-w-page animate-talk items-center gap-2.5 rounded-card px-3 py-2.5 text-left text-white shadow-card"
        data-testid="mascot-toast"
      >
        <span className="grid flex-none place-items-center rounded-full bg-white/90" style={{ width: 42, height: 42 }}>
          <MascotArt pick={pick} mode={mode} className="size-[84%]" />
        </span>
        <span className="text-sub leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,.3)]">
          <b className="block text-tiny opacity-90">{mascotInfo(pick.id).name}</b>
          {text}
        </span>
      </button>
    </>
  );
}
