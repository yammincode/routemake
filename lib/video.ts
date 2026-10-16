// 影片上傳前在手機上壓縮：用瀏覽器邊播放邊錄成 720p（約 2 Mbps），60 秒大約 15 MB
// 只在手機能錄 H.264 MP4 時壓縮（iPhone Safari、新版 Android Chrome），其他情況直接傳原檔，確保大家都看得到
// 壓縮花的時間大約等於影片長度；過程中畫面要開著
// 剪輯也用同一套：只錄開始到結束那一段（花的時間＝剪下來的長度）；靜音就不錄聲音
// 縮圖：分享時順便擷取第 1 秒的畫面（寬 480、WebP 品質 0.7；iPhone 做不出 WebP 時改 JPEG），列表只放縮圖、按了才載入影片（省流量）

const H264 = ['video/mp4;codecs="avc1.640028,mp4a.40.2"', 'video/mp4;codecs="avc1.42E01F,mp4a.40.2"', "video/mp4;codecs=avc1", 'video/mp4;codecs="avc1,mp4a"'];
export const COMPRESS_MIN_BYTES = 8 * 1024 * 1024; // 小於 8 MB 不用壓
const LONG_SIDE = 1280; // 720p
const VIDEO_BPS = 2_000_000;
const AUDIO_BPS = 96_000;

type Win = Window & { __RM_VIDEO_TYPES?: string[]; __RM_VIDEO_MIN?: number }; // 測試用：允許其他格式、調低門檻
export const compressMinBytes = () => (typeof window !== "undefined" && (window as Win).__RM_VIDEO_MIN) || COMPRESS_MIN_BYTES;

// 這支手機能用哪種格式壓縮（null＝不能壓縮，直接傳原檔）
export function compressType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return null;
  const list = (window as Win).__RM_VIDEO_TYPES ?? H264;
  return list.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

const once = (el: EventTarget, ok: string, ms: number) =>
  new Promise<boolean>((res) => {
    const t = setTimeout(() => res(false), ms);
    el.addEventListener(ok, () => (clearTimeout(t), res(true)), { once: true });
    el.addEventListener("error", () => (clearTimeout(t), res(false)), { once: true });
  });

// ---------- 縮圖 ----------
const THUMB_WIDTH = 480;
const THUMB_QUALITY = 0.7;
const THUMB_MAX_BYTES = 1024 * 1024; // 資料庫 video-thumbs 的上限
const toBlob = (c: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((res) => {
    try {
      c.toBlob(res, type, THUMB_QUALITY);
    } catch {
      res(null);
    }
  });
// 把目前的畫面縮成寬 480 的縮圖；WebP 做不出來（iPhone Safari 會變成 PNG）就改 JPEG；失敗回傳 null
async function encodeThumb(src: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  if (!w || !h) return null;
  const width = Math.min(THUMB_WIDTH, w);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.max(1, Math.round((h * width) / w));
  try {
    const g = c.getContext("2d");
    if (!g) return null;
    g.drawImage(src, 0, 0, c.width, c.height);
    let b = await toBlob(c, "image/webp");
    if (!b || b.type !== "image/webp") b = await toBlob(c, "image/jpeg");
    return b && (b.type === "image/webp" || b.type === "image/jpeg") && b.size > 0 && b.size <= THUMB_MAX_BYTES ? b : null;
  } catch {
    return null; // 例如畫面讀不到（不同網域）
  } finally {
    c.width = c.height = 0; // 放掉記憶體
  }
}
// 縮圖取哪一秒：第 1 秒；影片不到 2 秒取中間
export const thumbAt = (from: number, to: number) => from + Math.min(1, Math.max(0, to - from) / 2);

// 從手機裡的影片檔擷取縮圖（沒有壓縮的影片用）；任何問題都回傳 null，不擋分享
// at：第幾秒（剪輯過的影片傳剪下來那段的時間）
export async function captureThumb(file: Blob, at?: number): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  try {
    if (!(video.readyState >= 1 || (await once(video, "loadedmetadata", 8000)))) return null;
    // iPhone 沒播放過的影片畫不出畫面：靜音播一下再停（靜音允許自動播放）
    await video.play().catch(() => undefined);
    video.pause();
    const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const t = at ?? (d ? thumbAt(0, d) : 0);
    if (Math.abs(video.currentTime - t) > 0.05) {
      video.currentTime = t;
      if (!(await once(video, "seeked", 5000))) return null;
    }
    if (video.readyState < 2 && !(await once(video, "loadeddata", 5000))) return null;
    return await encodeThumb(video, video.videoWidth, video.videoHeight);
  } catch {
    return null;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

// 影片長度：有些影片（例如其他 App 錄的 WebM）一開始讀到的長度是無限大，跳到最後再讀一次
async function realDuration(video: HTMLVideoElement): Promise<number | null> {
  let d = video.duration;
  if (!Number.isFinite(d)) {
    video.currentTime = 1e9;
    await once(video, "seeked", 8000);
    d = video.duration;
  }
  if (video.currentTime !== 0) {
    video.currentTime = 0;
    await once(video, "seeked", 8000);
  }
  return Number.isFinite(d) && d > 0 ? d : null;
}

// 剪輯：start、end 是秒；mute 不錄聲音
export type VideoEdit = { start: number; end: number; mute: boolean };

// 壓縮成功回傳新檔；不支援、失敗、或壓完沒有變小就回傳 null（呼叫的人改傳原檔）
// 有剪輯（edit）時一定重錄：不支援或失敗回傳 null（呼叫的人不能改傳原檔，不然長度、聲音都不對）
// 要在按鈕的點擊事件裡「直接」呼叫（前面不要先 await 別的），iPhone 才允許自動播放
// onThumb：錄到第 1 秒時順便給縮圖（失敗就不給）
// overlay：每一格畫完影片後再畫上去（分享到 IG 的角落小貼紙）；有 overlay 也一定重錄
// signal：中途取消（例如關掉預覽）：馬上停止錄影、回傳 null
export async function compressVideo(
  file: File,
  onProgress: (ratio: number) => void,
  edit?: VideoEdit,
  onThumb?: (thumb: Blob) => void,
  overlay?: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  signal?: AbortSignal
): Promise<File | null> {
  const type = compressType();
  const must = !!edit || !!overlay; // 一定要重錄（不能改傳原檔）
  if (!type || (!must && file.size < compressMinBytes()) || signal?.aborted) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.muted = !!edit?.mute; // 靜音：不錄聲音，處理時也不會從喇叭播出來
  video.src = url;
  let ac: AudioContext | null = null;
  let stream: MediaStream | null = null;
  try {
    // 在點擊當下先解鎖播放與聲音
    ac = new AudioContext();
    void ac.resume();
    void video.play().catch(() => undefined);

    if (!(video.readyState >= 1 || (await once(video, "loadedmetadata", 15000)))) return null;
    video.pause();
    const duration = await realDuration(video);
    if (!duration || !video.videoWidth) return null;
    // 要錄的那一段（沒剪輯就是整支）
    const from = edit ? Math.max(0, Math.min(edit.start, duration)) : 0;
    const to = edit ? Math.max(from, Math.min(edit.end, duration)) : duration;
    if (to - from < 0.5) return null;
    if (from > 0) {
      video.currentTime = from;
      if (!(await once(video, "seeked", 8000))) return null;
    }

    const scale = Math.min(1, LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((video.videoWidth * scale) / 2) * 2;
    canvas.height = Math.round((video.videoHeight * scale) / 2) * 2;
    const g = canvas.getContext("2d");
    if (!g) return null;
    g.drawImage(video, 0, 0, canvas.width, canvas.height);
    overlay?.(g, canvas.width, canvas.height);

    stream = canvas.captureStream(30);
    // 聲音：影片的聲音只送進錄影，不從喇叭播出；靜音就不錄
    if (!edit?.mute) {
      const src = ac.createMediaElementSource(video);
      const dest = ac.createMediaStreamDestination();
      src.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
    }

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: VIDEO_BPS, ...(edit?.mute ? {} : { audioBitsPerSecond: AUDIO_BPS }) });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((res) => (rec.onstop = () => res()));

    // 播到結束點（沒剪輯就是播完）停止
    let done = false;
    let reached: () => void = () => undefined;
    const atEnd = new Promise<void>((res) => (reached = res));
    const shotAt = thumbAt(from, to);
    let shot = !onThumb;
    const draw = () => {
      if (done) return;
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      overlay?.(g, canvas.width, canvas.height);
      if (!shot && video.currentTime >= shotAt - 0.02) {
        shot = true;
        void encodeThumb(canvas, canvas.width, canvas.height).then((b) => b && onThumb?.(b));
      }
      onProgress(Math.min(1, (video.currentTime - from) / (to - from)));
      if (video.currentTime >= to - 0.02) return reached();
      if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };
    video.addEventListener("ended", () => reached(), { once: true });
    signal?.addEventListener("abort", () => reached(), { once: true });
    rec.start(1000);
    await video.play();
    draw();
    const ended = await Promise.race([atEnd.then(() => true), new Promise<boolean>((res) => setTimeout(() => res(false), (to - from) * 1500 + 20000))]);
    done = true;
    video.pause();
    rec.stop();
    await stopped;
    if (!ended || signal?.aborted) return null;
    onProgress(1);

    const blob = new Blob(chunks, { type: type.split(";")[0] });
    if (blob.size < 10_000 || (!must && blob.size > file.size * 0.85)) return null;
    const ext = type.startsWith("video/webm") ? "webm" : "mp4";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-720p." + ext, { type: blob.type });
  } catch {
    return null;
  } finally {
    video.pause();
    URL.revokeObjectURL(url);
    stream?.getTracks().forEach((t) => t.stop());
    void ac?.close().catch(() => undefined);
  }
}
