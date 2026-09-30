"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

// 底部提示（原型 .toast），顯示 2.2 秒
const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div role="status" className="fixed bottom-[92px] left-1/2 z-30 -translate-x-1/2 rounded-full bg-ink px-[18px] py-2.5 text-note whitespace-nowrap text-surface">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
