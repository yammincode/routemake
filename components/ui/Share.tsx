"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { canShareFiles, saveFile, shareFile, shareMessage } from "@/lib/share";

// 分享到 IG 的小按鈕（膠囊；路線卡片記錄後、我的紀錄、分享影片完成後）
export function ShareButton({ className = "", children, ...rest }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-full border border-accent px-3 py-1.5 text-note font-bold text-accent disabled:opacity-40 ${className}`}
      {...rest}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth={2}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.6" className="fill-current" />
      </svg>
      {children}
    </button>
  );
}

// 預覽＋分享：先看做好的圖（影片看第 1 秒的畫面），再按「分享到 IG」叫出手機的分享選單
// 手機只允許「按按鈕的那一下」叫出選單，圖或影片要花時間做，所以做好後要再按一次
// file 還沒做好時 progress 是進度（0–1，沒有進度就寫「製作中」）
export function SharePreview({
  open,
  onClose,
  title,
  what,
  file,
  image,
  progress,
  note,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  what: "圖片" | "影片";
  file: File | null;
  image: string | null;
  progress?: number | null;
  note?: ReactNode;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const menu = file ? canShareFiles(file) : canShareFiles();
  const share = async () => {
    if (!file || busy) return;
    setBusy(true);
    const r = await shareFile(file);
    setBusy(false);
    const msg = shareMessage(r, what);
    if (msg) toast(msg);
  };
  const save = () => toast(saveFile(file!) ? (shareMessage("saved", what) ?? "") : (shareMessage("failed", what) ?? ""));
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetTitle>{title}</SheetTitle>
      <SheetSub>{menu ? "按「分享到 IG」，在選單裡選 Instagram，再選限時動態或貼文。" : "這支手機叫不出分享選單：先存到手機，再打開 IG 從相簿選。"}</SheetSub>
      <div className="grid place-items-center rounded-tile bg-sunk p-3" data-testid="share-preview">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 手機上做的圖（blob），不經過 Next 的圖片處理
          <img src={image} alt={`要分享的${what}`} className="block max-h-[52vh] w-auto max-w-full rounded-field shadow-card" />
        ) : (
          <p className="my-16 text-note text-muted">
            {file ? `${what}做好了（這支手機做不出預覽畫面）` : progress != null ? `製作中 ${Math.round(progress * 100)}%，請不要關閉畫面…` : "製作中…"}
          </p>
        )}
      </div>
      {note && <p className="mt-2 mb-0 text-tiny text-muted">{note}</p>}
      <Button variant="primary" className="mt-3" disabled={!file || busy} onClick={menu ? () => void share() : save}>
        {menu ? "分享到 IG" : `存${what}到手機`}
      </Button>
      {menu && file && <LinkButton onClick={save}>存到手機就好</LinkButton>}
      <LinkButton onClick={onClose}>關閉</LinkButton>
    </Sheet>
  );
}

// 分享影片完成後的提示框：「也分享到 IG」
export function ShareOffer({ title, button, hint, onClick, disabled }: { title: ReactNode; button: ReactNode; hint: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="mb-3 rounded-tile bg-sunk p-3" data-testid="share-offer">
      <p className="m-0 text-note">{title}</p>
      <ShareButton className="mt-2" onClick={onClick} disabled={disabled}>
        {button}
      </ShareButton>
      <p className="mt-1.5 mb-0 text-tiny text-muted">{hint}</p>
    </div>
  );
}
