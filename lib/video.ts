// 影片上傳前在手機上壓縮：用瀏覽器邊播放邊錄成 720p、每秒 30 格（3 Mbps），60 秒大約 22 MB
// 高畫質 60 fps（分享時的開關，原影片要是 60 fps、20 秒以內）：每秒 60 格（4.5 Mbps），20 秒大約 11 MB；檔案大約大一倍，播放流量也是
// 每格照原影片的時間平均取（60 fps 的影片錄成 30 fps 時隔一格取一格），畫面不會一頓一頓
// 只在手機能錄 H.264 MP4 時壓縮（iPhone Safari、新版 Android Chrome），其他情況直接傳原檔，確保大家都看得到
// 壓縮花的時間大約等於影片長度；過程中畫面要開著
// 剪輯也用同一套：只錄開始到結束那一段（花的時間＝剪下來的長度）；靜音就不錄聲音
// 縮圖：分享時順便擷取第 1 秒的畫面（寬 480、WebP 品質 0.7；iPhone 做不出 WebP 時改 JPEG），列表只放縮圖、按了才載入影片（省流量）

const H264 = ['video/mp4;codecs="avc1.640028,mp4a.40.2"', 'video/mp4;codecs="avc1.42E01F,mp4a.40.2"', "video/mp4;codecs=avc1", 'video/mp4;codecs="avc1,mp4a"'];
export const COMPRESS_MIN_BYTES = 8 * 1024 * 1024; // 小於 8 MB 不用壓
const LONG_SIDE = 1280; // 720p
const VIDEO_BPS = 3_000_000;
const HI_BPS = 4_500_000; // 高畫質 60 fps
const AUDIO_BPS = 96_000;
export const HI_MAX_SECONDS = 20; // 高畫質 60 fps 最長幾秒（省流量）

// 測試用：允許其他格式、調低門檻、假裝原影片幾 fps、改高畫質的長度上限
type Win = Window & { __RM_VIDEO_TYPES?: string[]; __RM_VIDEO_MIN?: number; __RM_VIDEO_FPS?: number; __RM_VIDEO_HI_MAX?: number };
const win = () => (typeof window !== "undefined" ? (window as Win) : undefined);
export const compressMinBytes = () => win()?.__RM_VIDEO_MIN || COMPRESS_MIN_BYTES;
export const hiMaxSeconds = () => win()?.__RM_VIDEO_HI_MAX || HI_MAX_SECONDS;

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

// 原影片每秒幾格：靜音播一下，看連續幾格的時間差（取中間值，手機偶爾漏一格不影響）；量不到回傳 null
// 手機播放跟不上 60 格的（量出來 30）也就錄不了 60 fps，所以不給開高畫質剛好
export async function sourceFps(file: Blob): Promise<number | null> {
  const fake = win()?.__RM_VIDEO_FPS;
  if (fake) return fake;
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  try {
    if (!("requestVideoFrameCallback" in video)) return null;
    if (!(video.readyState >= 1 || (await once(video, "loadedmetadata", 8000)))) return null;
    const times: number[] = [];
    const got = new Promise<void>((res) => {
      const t = setTimeout(res, 3000);
      const cb = (_now: number, m: VideoFrameCallbackMetadata) => {
        times.push(m.mediaTime);
        if (times.length >= 24) return clearTimeout(t), res();
        video.requestVideoFrameCallback(cb);
      };
      video.requestVideoFrameCallback(cb);
    });
    await video.play(); // 靜音允許自動播放
    await got;
    const gaps = times
      .slice(1)
      .map((t, i) => t - times[i])
      .filter((d) => d > 0.001)
      .sort((a, b) => a - b);
    if (gaps.length < 8) return null;
    return Math.round(1 / gaps[Math.floor(gaps.length / 2)]);
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

// 剪輯：start、end 是秒；mute 不錄聲音；fps60 錄成高畫質 60 fps
export type VideoEdit = { start: number; end: number; mute: boolean; fps60?: boolean };
// 同一次播放順便多錄一份（加上 overlay）
export type ExtraTake = { overlay: (g: CanvasRenderingContext2D, w: number, h: number) => void; onDone: (file: File | null, thumb: Blob | null) => void };

// 壓縮成功回傳新檔；不支援、失敗、或壓完沒有變小就回傳 null（呼叫的人改傳原檔）
// 有剪輯（edit）時一定重錄：不支援或失敗回傳 null（呼叫的人不能改傳原檔，不然長度、聲音都不對）
// 要在按鈕的點擊事件裡「直接」呼叫（前面不要先 await 別的），iPhone 才允許自動播放
// onThumb：錄到第 1 秒時順便給縮圖（失敗就不給）
// overlay：每一格畫完影片後再畫上去（分享到 IG 的角落小貼紙）；有 overlay 也一定重錄
// signal：中途取消（例如關掉預覽）：馬上停止錄影、回傳 null
// extra：同一次播放順便多錄一份加上 overlay 的（上傳時順便做 IG 版，之後不用再等一次）；做完呼叫 onDone（失敗給 null）；有 extra 也一定重錄
export async function compressVideo(
  file: File,
  onProgress: (ratio: number) => void,
  edit?: VideoEdit,
  onThumb?: (thumb: Blob) => void,
  overlay?: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  signal?: AbortSignal,
  extra?: ExtraTake
): Promise<File | null> {
  const type = compressType();
  const must = !!edit || !!overlay; // 一定要重錄（不能改傳原檔）
  let extraDone = false;
  const giveExtra = (f: File | null, t: Blob | null) => {
    if (extraDone) return;
    extraDone = true;
    try {
      extra?.onDone(f, t);
    } catch {}
  };
  if (!type || (!must && !extra && file.size < compressMinBytes()) || signal?.aborted) {
    giveExtra(null, null);
    return null;
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.muted = !!edit?.mute; // 靜音：不錄聲音，處理時也不會從喇叭播出來
  video.src = url;
  let ac: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let stream2: MediaStream | null = null;
  let rec: MediaRecorder | null = null;
  let rec2: MediaRecorder | null = null;
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

    const fps = edit?.fps60 ? 60 : 30;
    const bps = edit?.fps60 ? HI_BPS : VIDEO_BPS;
    stream = canvas.captureStream(fps);
    // 聲音：影片的聲音只送進錄影，不從喇叭播出；靜音就不錄
    if (!edit?.mute) {
      const src = ac.createMediaElementSource(video);
      const dest = ac.createMediaStreamDestination();
      src.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
    }

    // 多錄的那一份：把畫好的畫面複製到第二張畫布，再加上 overlay（不用再解碼一次影片）
    const c2 = extra ? document.createElement("canvas") : null;
    const g2 = c2?.getContext("2d") ?? null;
    const chunks2: Blob[] = [];
    let stopped2: Promise<void> = Promise.resolve();
    let failed2 = false; // 第二份錄到一半出錯：只放棄第二份，上傳的照常
    let thumb2: Promise<Blob | null> = Promise.resolve(null);
    const draw2 = () => {
      if (!c2 || !g2) return;
      g2.drawImage(canvas, 0, 0);
      extra!.overlay(g2, c2.width, c2.height);
    };
    if (extra && c2 && g2) {
      c2.width = canvas.width;
      c2.height = canvas.height;
      draw2();
      stream2 = c2.captureStream(fps);
      stream.getAudioTracks().forEach((t) => stream2!.addTrack(t.clone()));
      try {
        rec2 = new MediaRecorder(stream2, { mimeType: type, videoBitsPerSecond: bps, ...(edit?.mute ? {} : { audioBitsPerSecond: AUDIO_BPS }) });
        rec2.ondataavailable = (e) => e.data.size && chunks2.push(e.data);
        stopped2 = new Promise<void>((res) => {
          rec2!.onstop = () => res();
          rec2!.onerror = () => ((failed2 = true), res());
        });
      } catch {
        rec2 = null; // 這支手機不能同時錄兩份：只錄原本那份
      }
    }

    const chunks: Blob[] = [];
    const r1 = (rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bps, ...(edit?.mute ? {} : { audioBitsPerSecond: AUDIO_BPS }) }));
    r1.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((res) => (r1.onstop = () => res()));

    // 播到結束點（沒剪輯就是播完）停止
    let done = false;
    let reached: () => void = () => undefined;
    const atEnd = new Promise<void>((res) => (reached = res));
    const shotAt = thumbAt(from, to);
    let shot = !onThumb;
    // 照原影片的時間平均取格：比上一格晚不到 1/fps 秒就不畫（畫布沒變就不會多錄一格）
    let last = -Infinity;
    const draw = (_now?: number, m?: VideoFrameCallbackMetadata) => {
      if (done) return;
      const at = m?.mediaTime ?? video.currentTime;
      if (at - last >= 1 / fps - 0.004) {
        last = at;
        g.drawImage(video, 0, 0, canvas.width, canvas.height);
        overlay?.(g, canvas.width, canvas.height);
        if (rec2) draw2();
      }
      if (!shot && video.currentTime >= shotAt - 0.02) {
        shot = true;
        void encodeThumb(canvas, canvas.width, canvas.height).then((b) => b && onThumb?.(b));
        if (rec2 && c2) thumb2 = encodeThumb(c2, c2.width, c2.height);
      }
      onProgress(Math.min(1, (video.currentTime - from) / (to - from)));
      if (video.currentTime >= to - 0.02) return reached();
      if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(() => draw());
    };
    video.addEventListener("ended", () => reached(), { once: true });
    signal?.addEventListener("abort", () => reached(), { once: true });
    r1.start(1000);
    try {
      rec2?.start(1000);
    } catch {
      rec2 = null; // 這支手機不能同時錄兩份（開始錄才出錯）：只錄原本那份
      failed2 = true;
    }
    await video.play();
    draw();
    const ended = await Promise.race([atEnd.then(() => true), new Promise<boolean>((res) => setTimeout(() => res(false), (to - from) * 1500 + 20000))]);
    done = true;
    video.pause();
    r1.stop();
    if (rec2 && rec2.state !== "inactive") rec2.stop();
    await stopped;
    // 第二份最多再等 3 秒（出錯沒有停下來的手機不會卡住上傳）
    const done2 = rec2 ? await Promise.race([stopped2.then(() => true), new Promise<boolean>((res) => setTimeout(() => res(false), 3000))]) : false;
    if (!ended || signal?.aborted) return null;
    onProgress(1);
    const ext = type.startsWith("video/webm") ? "webm" : "mp4";
    if (rec2 && done2 && !failed2) {
      const b2 = new Blob(chunks2, { type: type.split(";")[0] });
      const t2 = await Promise.race([thumb2, new Promise<null>((res) => setTimeout(() => res(null), 2000))]).catch(() => null);
      giveExtra(b2.size >= 10_000 ? new File([b2], file.name.replace(/\.[^.]+$/, "") + "-ig." + ext, { type: b2.type }) : null, t2);
    }

    const blob = new Blob(chunks, { type: type.split(";")[0] });
    if (blob.size < 10_000 || (!must && blob.size > file.size * 0.85)) return null;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-720p." + ext, { type: blob.type });
  } catch {
    return null;
  } finally {
    giveExtra(null, null); // 失敗、取消、不能同時錄：多錄的那份沒有
    for (const r of [rec, rec2])
      try {
        if (r && r.state !== "inactive") r.stop();
      } catch {}
    video.pause();
    URL.revokeObjectURL(url);
    stream?.getTracks().forEach((t) => t.stop());
    stream2?.getTracks().forEach((t) => t.stop());
    void ac?.close().catch(() => undefined);
  }
}
