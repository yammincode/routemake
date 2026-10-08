"use client";

import { useEffect, useState, type ReactNode } from "react";

// 「怎麼看」說明：第一次看到時展開，按「知道了」收成一行小字（記在這支手機），之後點那行可以再打開
// lines：每一點說明一行（不用 ul／li，避免跟頁面上的路線列表混在一起）
export function HowTo({ id, title, lines }: { id: string; title: string; lines: ReactNode[] }) {
  const key = `routemake-howto-${id}`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(key) === "1";
    } catch {}
    if (!seen) void Promise.resolve().then(() => setOpen(true));
  }, [key]);
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(key, "1");
    } catch {}
  };

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mb-2 text-note text-muted underline decoration-line underline-offset-2">
        ⓘ {title}
      </button>
    );
  return (
    <div role="note" className="mb-3 rounded-btn bg-sunk px-3.5 py-2.5 text-note text-ink">
      <b className="mb-1 block">{title}</b>
      <div className="grid gap-0.5">
        {lines.map((l, i) => (
          <p key={i} className="m-0">
            ・{l}
          </p>
        ))}
      </div>
      <button onClick={close} className="mt-1.5 font-bold text-accent">
        知道了
      </button>
    </div>
  );
}
