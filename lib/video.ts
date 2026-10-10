// 影片上傳前在手機上壓縮：用瀏覽器邊播放邊錄成 720p（約 2 Mbps），60 秒大約 15 MB
// 只在手機能錄 H.264 MP4 時壓縮（iPhone Safari、新版 Android Chrome），其他情況直接傳原檔，確保大家都看得到
// 壓縮花的時間大約等於影片長度；過程中畫面要開著
// 剪輯也用同一套：只錄開始到結束那一段（花的時間＝剪下來的長度）；靜音就不錄聲音

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
export async function compressVideo(file: File, onProgress: (ratio: number) => void, edit?: VideoEdit): Promise<File | null> {
  const type = compressType();
  if (!type || (!edit && file.size < compressMinBytes())) return null;

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
    const draw = () => {
      if (done) return;
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress(Math.min(1, (video.currentTime - from) / (to - from)));
      if (video.currentTime >= to - 0.02) return reached();
      if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };
    video.addEventListener("ended", () => reached(), { once: true });
    rec.start(1000);
    await video.play();
    draw();
    const ended = await Promise.race([atEnd.then(() => true), new Promise<boolean>((res) => setTimeout(() => res(false), (to - from) * 1500 + 20000))]);
    done = true;
    video.pause();
    rec.stop();
    await stopped;
    if (!ended) return null;
    onProgress(1);

    const blob = new Blob(chunks, { type: type.split(";")[0] });
    if (blob.size < 10_000 || (!edit && blob.size > file.size * 0.85)) return null;
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
