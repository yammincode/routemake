import type { ReactNode } from "react";
import { HoldDot } from "@/components/ui/Route";
import { gradeLabel, type HoldColor } from "@/lib/design";
import { md } from "@/lib/date";

// 停權到哪天：「10/22」；永久寫「永久」
export const suspendUntilText = (until: string | null) => (until ? md(new Date(until).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" })) : "永久");
// 停權還沒結束（永久的一直是 true）
export const suspendActive = (until: string | null) => !until || new Date(until).getTime() > Date.now();
// 還有幾天（不到 1 天算 1 天）
export const suspendDaysLeft = (until: string | null) => (until ? Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000)) : null);

// 被停權的人每一頁最上面的提示條（2A 案）
export function SuspendNotice({ until, reason }: { until: string | null; reason: string }) {
  const left = suspendDaysLeft(until);
  return (
    <div role="status" data-suspend-notice className="mb-3 rounded-tile border-[1.5px] border-warn bg-blush px-3.5 py-3">
      <b className="block text-sub text-warn">{until ? `帳號暫停到 ${suspendUntilText(until)}（還有 ${left} 天）` : "帳號已停權"}</b>
      <span className="block text-meta">原因：{reason}</span>
      <span className="block text-tiny text-muted">這段時間可以看路線、記錄自己的完攀，不能留言、分享影片、按讚。有問題請洽櫃檯。</span>
    </div>
  );
}

// 帳號管理：一個人的摘要（暱稱、帳號、註冊日、數量、最近完攀、停權中）
export function AccountSummary({
  avatar,
  nickname,
  username,
  meta,
  recent,
  suspension,
  children,
}: {
  avatar?: ReactNode;
  nickname: string;
  username: string;
  meta: string;
  recent?: { gym: string; zone: string; code: string; color: HoldColor; grade: number }[];
  suspension?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-tile border-[1.5px] border-line bg-surface p-3">
      <div className="flex items-center gap-2.5">
        {avatar}
        <span className="min-w-0">
          <b className="block truncate text-sub">
            {nickname}
            <small className="ml-1.5 font-normal text-meta text-muted">@{username}</small>
          </b>
          <small className="block text-meta text-muted">{meta}</small>
        </span>
      </div>
      {recent && (
        <div className="mt-2 rounded-field bg-sunk px-3 py-2">
          <b className="block text-meta">先跟本人核對</b>
          <span className="text-meta">
            暱稱「{nickname}」・最近完攀：
            {recent.length === 0
              ? "沒有"
              : recent.map((r, i) => (
                  <span key={i} className="whitespace-nowrap">
                    {i > 0 && "、"}
                    {r.gym} {r.zone} <HoldDot color={r.color} className="inline-block size-2.5 align-middle" /> {gradeLabel(r.grade)}
                  </span>
                ))}
          </span>
        </div>
      )}
      {suspension}
      {children}
    </div>
  );
}

// 停權中的一行說明（帳號管理、人物卡）
export function SuspendedLine({ until, reason, by, at }: { until: string | null; reason: string; by?: string | null; at?: string }) {
  const left = suspendDaysLeft(until);
  return (
    <p className="mt-2 mb-0 text-meta">
      <b className="text-warn">停權中</b>：{until ? `到 ${suspendUntilText(until)}（還有 ${left} 天）` : "永久"}・{reason}
      {(by || at) && (
        <small className="block text-tiny text-muted">
          {at ? md(new Date(at).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" })) : ""} {by ?? ""} 停權
        </small>
      )}
    </p>
  );
}

// 櫃檯產生的重設碼：大字 6 位數、還剩幾分鐘、請客人怎麼做
export function ResetCodeBox({ code, left, username }: { code: string; left: string; username: string }) {
  return (
    <div data-reset-code className="mt-3 grid justify-items-center gap-1 rounded-tile border-[1.5px] border-accent bg-blush px-3 py-4 text-center">
      <b className="text-meta text-accent">重設碼</b>
      <span className="font-num text-num-stat tracking-[0.12em]" aria-label={`重設碼 ${code.split("").join(" ")}`}>
        {code.slice(0, 3)} {code.slice(3)}
      </span>
      <span className="text-meta">{left}・只能用一次</span>
      <span className="text-meta text-muted">
        請客人在登入頁按「忘記密碼？」，輸入帳號 <b className="text-ink">{username}</b> 和這組數字，再設新密碼
      </span>
    </div>
  );
}
