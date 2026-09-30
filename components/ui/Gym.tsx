"use client";

import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import type { HoldColor } from "@/lib/design";
import { Button } from "./Button";
import { HoldDot } from "./Route";

// 換線倒數文字
export function dueText(days: number | null) {
  if (days == null) return "";
  return days < 0 ? "換線日已過" : days === 0 ? "今天換線" : `${days} 天後換線`;
}

// 進度條
export function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <span className="h-[5px] max-w-[100px] flex-1 overflow-hidden rounded-[3px] bg-line">
      <i className="block h-full rounded-[3px] bg-accent" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
    </span>
  );
}

// 區域卡片（原型 .zcard）
export function ZoneCard({
  photo,
  name,
  done,
  total,
  resetDays,
  ...rest
}: ComponentProps<"button"> & { photo: string; name: string; done: number; total: number; resetDays: number | null }) {
  const soon = resetDays != null && resetDays <= 7;
  return (
    <button className="flex w-full items-center gap-3.5 rounded-card bg-surface p-2.5 text-left shadow-card" {...rest}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="" className="h-[72px] w-24 flex-none rounded-field bg-line object-cover" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-section font-bold">{name}</span>
        <span className="flex items-center gap-2 font-num text-[16px] leading-[1.3] font-semibold text-muted">
          <ProgressBar done={done} total={total} />
          {done} / {total}
        </span>
        <span className={`text-meta ${soon ? "font-bold text-warn" : "text-muted"}`}>{dueText(resetDays)}</span>
      </span>
    </button>
  );
}

export function ZoneList({ children }: { children: ReactNode }) {
  return <div className="grid gap-2.5">{children}</div>;
}

// 即將換線列表（原型 .resets）
export function ResetList({ items }: { items: { key: string; name: string; date: string; left: number; days: number }[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-tile bg-line shadow-card">
      {items.map((z) => {
        const soon = z.days <= 7;
        return (
          <div key={z.key} className="flex items-center justify-between bg-surface px-4 py-3">
            <span>
              {z.name}
              <br />
              <small className="text-meta text-muted">
                {z.date} 換線，還有 {z.left} 條沒完攀
              </small>
            </span>
            <span className={`font-num text-num-reset font-bold ${soon ? "text-warn" : ""}`}>{z.days === 0 ? "今天" : `${z.days} 天`}</span>
          </div>
        );
      })}
    </div>
  );
}

// 最新路線橫向卡片（原型 .newcard）
export function NewRouteRow({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pt-0.5 pb-2">{children}</div>;
}
export function NewRouteCard({ color, grade, zone, ago, ...rest }: ComponentProps<"button"> & { color: HoldColor; grade: number; zone: string; ago: string }) {
  return (
    <button className="w-[118px] flex-none rounded-tile bg-surface p-3 text-left shadow-card" {...rest}>
      <span className="mb-1.5 flex items-center gap-2 font-num text-num-card font-bold">
        <HoldDot color={color} />V{grade}
      </span>
      <small className="block text-meta leading-[1.4] text-muted">
        {zone}
        <br />
        {ago}設定
      </small>
    </button>
  );
}

// 場館選擇列（原型 .gymrow）
export function GymRow({ name, live, selected, logo, ...rest }: ComponentProps<"button"> & { name: string; live: boolean; selected: boolean; logo?: string }) {
  return (
    <button
      aria-pressed={selected}
      className={`flex w-full items-center justify-between rounded-btn bg-sunk px-4 text-left font-medium aria-pressed:shadow-[inset_0_0_0_2px_var(--ink)] ${logo ? "py-2.5" : "py-3.5"}`}
      {...rest}
    >
      <span className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img src={logo} alt="" width={48} height={48} className={`size-12 flex-none ${live ? "" : "opacity-60 grayscale-[40%]"}`} />}
        {name}
      </span>
      <small className={`text-meta ${live ? "font-bold text-accent" : "font-normal text-muted"}`}>{live ? "已上線" : "即將上線"}</small>
    </button>
  );
}

// 即將上線（原型 .soon-box）
export function SoonBox({ name, onBack, backLabel }: { name: string; onBack: () => void; backLabel: string }) {
  return (
    <div className="rounded-plan bg-surface px-6 py-10 text-center shadow-card">
      <strong className="mb-1.5 block text-sheet">{name}即將上線</strong>
      <p className="mt-0 mb-5 text-muted">路線資料建置中，完成後就能在這裡看路線、記錄完攀。</p>
      <Button variant="primary" className="mx-auto max-w-[220px]" onClick={onBack}>
        {backLabel}
      </Button>
    </div>
  );
}

// 鍵盤操作：Enter / 空白鍵等同點擊
export const pressKeys = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};
