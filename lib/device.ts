// 回饋附上的手機資訊：只留型號類別、系統版本、瀏覽器、是否從主畫面打開（不含個人資料）
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const ios = ua.match(/(iPhone|iPad).*? OS (\d+)_(\d+)/);
  const android = ua.match(/Android (\d+(?:\.\d+)?)/);
  const os = ios ? `${ios[1]} iOS ${ios[2]}.${ios[3]}` : android ? `Android ${android[1]}` : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : "其他";
  const browser = / Line\//.test(ua) ? "LINE" : /FBAN|FBAV/.test(ua) ? "Facebook" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "其他瀏覽器";
  const standalone = matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  return `${os}・${browser}${standalone ? "・主畫面" : ""}・寬 ${window.innerWidth}`.slice(0, 200);
}
