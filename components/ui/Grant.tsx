import type { ReactNode } from "react";
import { ChipRow } from "./Chip";

// 授權名單（營運分頁，老闆用）：一個人一列，下面是可以點的權限膠囊（按下去＝有權限）
export function GrantList({ children }: { children: ReactNode }) {
  return <div className="grid gap-px overflow-hidden rounded-tile bg-line shadow-card">{children}</div>;
}

// 一個人：暱稱、帳號，下面放權限群組
export function GrantRow({ name, username, children }: { name: string; username: string | null; children: ReactNode }) {
  return (
    <div role="group" aria-label={name} className="bg-surface px-4 pt-3 pb-1">
      <span className="block min-w-0 truncate font-bold">
        {name}
        <small className="ml-2 text-meta font-normal text-muted">帳號 {username}</small>
      </span>
      {children}
    </div>
  );
}

// 一組權限：左上小標（例如「📊 使用狀況」），下面是膠囊（例如各館）
export function GrantGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2">
      <small className="mb-1 block text-tiny text-muted">{label}</small>
      <ChipRow wrap>{children}</ChipRow>
    </div>
  );
}
