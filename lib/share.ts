// 分享到 IG（使用者 10/16 選 A3 岩牆照片完攀圖、B2 影片加角落小貼紙、C1 本月完攀圖）
// 網站不能直接發到 IG：做好圖或影片，交給手機的分享選單（Web Share），客人自己選 Instagram → 限時動態／貼文；
// 叫不出分享選單（電腦、IG／LINE 內建瀏覽器、舊手機）就改成存到手機，客人自己到 IG 上傳。
// 圖、影片都在手機上做，不從伺服器多下載東西（省流量）；圖上不放私人心得
import type { Access } from "@/lib/auth";

// 先只給老闆試（10/16 使用者說：老闆試過沒問題再開放）；開放給大家時改成 true
export const SHARE_IG_PUBLIC = false;
export const canShareIg = (a: Access | null) => SHARE_IG_PUBLIC || !!a?.is_owner;

type ShareNav = Navigator & { canShare?: (d: ShareData) => boolean };
// 這支手機能不能把檔案交給分享選單（不能就只能存到手機）
export function canShareFiles(sample?: File): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as ShareNav;
  if (!nav.share || !nav.canShare) return false;
  try {
    return nav.canShare({ files: [sample ?? new File([""], "x.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

// 存到手機（下載）；成功回傳 true
export function saveFile(file: File): boolean {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

// 交給分享選單；要在按鈕的點擊裡直接呼叫（前面不要先 await 別的，手機才允許叫出選單）
// 只放檔案、不放文字和網址（IG 收到文字會把圖丟掉）
// shared：選了 App；cancel：客人自己關掉選單；saved：叫不出選單，改存到手機；failed：都不行
export type ShareResult = "shared" | "cancel" | "saved" | "failed";
export async function shareFile(file: File): Promise<ShareResult> {
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancel";
      // NotAllowedError 等：叫不出選單，改存到手機
    }
  }
  return saveFile(file) ? "saved" : "failed";
}

export const shareMessage = (r: ShareResult, what: "圖片" | "影片") =>
  r === "saved" ? `已存${what}，打開 IG 從相簿選這${what === "圖片" ? "張" : "支"}` : r === "failed" ? `${what}存不下來，請再試一次` : null;

// QR code 的網址：在自己電腦跑試用版（localhost、區網 IP）時不放 QR code（掃了也打不開，還會印出區網位址）
export function shareUrl(path: string): string | null {
  const h = location.hostname;
  if (h === "localhost" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith(".local")) return null;
  return location.origin + path;
}
