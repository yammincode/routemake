"use client";

import { useEffect, useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";

// 加到主畫面教學 + LINE／Facebook／Instagram 內建瀏覽器處理
// 第一次用瀏覽器打開時跳出一次；「我的紀錄」頁可以再打開（事件 routemake:install）

const DISMISS_KEY = "routemake-install-seen";
type Env = "ios" | "android" | "inapp" | "other";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const detect = (): { env: Env; line: boolean; standalone: boolean } => {
  const ua = navigator.userAgent;
  const line = /\bLine\//i.test(ua);
  const inapp = line || /FBAN|FBAV|Instagram|MicroMessenger/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return { env: inapp ? "inapp" : ios ? "ios" : /Android/i.test(ua) ? "android" : "other", line, standalone };
};

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="inline size-5 fill-none stroke-current align-[-4px]" strokeWidth={2} aria-label="分享圖示">
    <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="inline size-5 fill-none stroke-current align-[-4px]" strokeWidth={2} aria-label="加號圖示">
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-btn bg-sunk px-3.5 py-3 text-sub">
      <b className="grid size-6 flex-none place-items-center rounded-full bg-ink font-num text-[15px] text-surface">{n}</b>
      <span>{children}</span>
    </li>
  );
}

export default function InstallHelp() {
  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState<Env>("other");
  const [install, setInstall] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const d = detect();
    // LINE：網址加上 openExternalBrowser=1，LINE 會自動改用手機的瀏覽器打開
    if (d.line) {
      const url = new URL(location.href);
      if (url.searchParams.get("openExternalBrowser") !== "1") {
        url.searchParams.set("openExternalBrowser", "1");
        location.replace(url.toString());
        return;
      }
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const onOpen = () => {
      setEnv(detect().env);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("routemake:install", onOpen);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seen = true;
    try {
      seen = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    // 內建瀏覽器一律提示；手機瀏覽器第一次打開時提示一次；電腦和已經從主畫面打開的不提示
    if (!d.standalone && (d.env === "inapp" || (!seen && d.env !== "other"))) {
      timer = setTimeout(() => {
        setEnv(d.env);
        setOpen(true);
      }, 1500);
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("routemake:install", onOpen);
    };
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  return (
    <Sheet open={open} onClose={close}>
      {env === "inapp" ? (
        <>
          <SheetTitle>請用瀏覽器開啟</SheetTitle>
          <SheetSub>在 LINE、Facebook 裡面打開的網頁，沒辦法加到主畫面，登入狀態也可能不見。</SheetSub>
          <ol className="m-0 grid list-none gap-2 p-0">
            <Step n={1}>點右上角的「⋯」或選單</Step>
            <Step n={2}>選「用預設瀏覽器開啟」或「在 Safari／Chrome 中開啟」</Step>
          </ol>
        </>
      ) : env === "ios" ? (
        <>
          <SheetTitle>加到主畫面</SheetTitle>
          <SheetSub>像 App 一樣從主畫面打開，全螢幕、登入狀態會保留。</SheetSub>
          <ol className="m-0 grid list-none gap-2 p-0">
            <Step n={1}>
              點 Safari 下方（或上方）的分享按鈕 <ShareIcon />
            </Step>
            <Step n={2}>
              往下滑，選「加入主畫面」 <PlusIcon />
            </Step>
            <Step n={3}>按右上角「加入」，主畫面就會出現「原岩路線」</Step>
          </ol>
        </>
      ) : (
        <>
          <SheetTitle>加到主畫面</SheetTitle>
          <SheetSub>像 App 一樣從主畫面打開，全螢幕、登入狀態會保留。</SheetSub>
          {install ? (
            <Button
              variant="primary"
              onClick={async () => {
                await install.prompt();
                await install.userChoice;
                setInstall(null);
                close();
              }}
            >
              安裝到主畫面
            </Button>
          ) : (
            <ol className="m-0 grid list-none gap-2 p-0">
              <Step n={1}>點 Chrome 右上角的「⋮」選單</Step>
              <Step n={2}>選「加到主畫面」或「安裝應用程式」</Step>
              <Step n={3}>按「安裝」，主畫面就會出現「原岩路線」</Step>
            </ol>
          )}
        </>
      )}
      <LinkButton onClick={close}>我知道了</LinkButton>
    </Sheet>
  );
}
