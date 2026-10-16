"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Check, Label, MultiOptionGrid, OptionGrid, TextField, Toggle } from "@/components/ui/Form";
import { ClosedNotice } from "@/components/ui/Comments";
import { suspendActive } from "@/components/ui/Account";
import { UserAvatar } from "@/components/ui/Mascot";
import { useToast } from "@/components/ui/Toast";
import { ShareOffer, SharePicker, SharePreview } from "@/components/ui/Share";
import { PickedFile, VideoList, VideoPickButton, VideoResult, VideoRow, VideoTrim, VideoViewer, type VideoCard } from "@/components/ui/Video";
import { captureThumb, compressMinBytes, compressType, compressVideo, hiMaxSeconds, sourceFps, type VideoEdit } from "@/lib/video";
import { checkPickedVideo, deleteVideo, seqTotal, durText, getVideos, likeVideo, unlikeVideo, uploadVideo, videoDaySupported, videoLimit, videoMaxSeconds, videoThumbUrl, videoUrl, type DbError, type Route, type Video } from "@/lib/data";
import { HEIGHT_KEY_PREFIX } from "@/lib/offline";
import { videoWhen } from "@/lib/date";
import { findGym } from "@/lib/gyms";
import { canShareIg } from "@/lib/share";
import { composeFrame, makeVideoSticker, type VideoSticker } from "@/lib/share-cards";
import { loadShow, saveShow, type VideoShow } from "@/lib/share-options";
import { CLIMB_MOVES, FEEL_TAG_MAX, FEEL_TAGS, HEIGHT_BANDS, feelTagText, videoTagText, type ClimbMove, type FeelTag, type HeightBand, type Status } from "@/lib/design";

// 身高記在這支手機、分帳號記，下次分享不用再選；登出時清掉（lib/offline clearCache）；隱私模式等讀寫失敗就當沒記
const heightKey = (uid: string) => `${HEIGHT_KEY_PREFIX}${uid}`;
function savedHeight(uid: string): HeightBand | null {
  try {
    const v = localStorage.getItem(heightKey(uid));
    return HEIGHT_BANDS.some((h) => h.v === v) ? (v as HeightBand) : null;
  } catch {
    return null;
  }
}

// 分享到 IG 的檔名（不帶原本的檔名）
const igName = (f: File, code: string) => new File([f], `routemake-${code || "video"}.${f.type.includes("webm") ? "webm" : "mp4"}`, { type: f.type || "video/mp4" });

// 上傳時順便做 IG 版的開關（記在這支手機，預設打開）
const IG_PREP_KEY = "routemake:ig-prep";
function readIgPrep(): boolean {
  try {
    return localStorage.getItem(IG_PREP_KEY) !== "0";
  } catch {
    return true;
  }
}
function writeIgPrep(on: boolean) {
  try {
    localStorage.setItem(IG_PREP_KEY, on ? "1" : "0");
  } catch {}
}

// 篩選：一次一個標籤（身高、動作或型態）；影片要有那個標籤才留下
type TagFilter = HeightBand | ClimbMove | FeelTag;
const hasTag = (v: Video, t: TagFilter) => v.height_band === t || v.move === t || !!v.feel_tags?.includes(t as FeelTag);

// 路線卡片的「影片」分頁：一支一列（心得、誰、紀錄、身高・動作・型態），上面用標籤篩選；
// 分享時可選型態（你爬起來覺得？最多 2 個）配上心得，再選身高、動作（都選填）
// onCount 回報影片數（分頁標籤用）
// 規則跟留言一樣：路線在牆上、留言開放才能分享；路線下架時影片會一起刪除
export default function RouteVideos({
  route: r,
  gymId,
  zoneName = "",
  open,
  active = true,
  staff,
  myStatus,
  myDay = null,
  onLogin,
  onCount,
  onProfile,
}: {
  onProfile?: (userId: string) => void;
  route: Route;
  gymId: string;
  zoneName?: string; // 分享到 IG 的角落小貼紙用
  open: boolean;
  active?: boolean; // 「影片」分頁打開時才放影片縮圖（縮圖會下載影片開頭，打開路線卡片時不跟記錄搶網路）
  staff: boolean;
  myStatus: Status | null;
  myDay?: string | null; // 本人紀錄的攀爬日：分享時資料庫會一起記在影片上
  onLogin: () => void;
  onCount?: (n: number) => void;
}) {
  const { session, access } = useAuth();
  const toast = useToast();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [height, setHeight] = useState<HeightBand | null>(null);
  const [move, setMove] = useState<ClimbMove | null>(null);
  const [feel, setFeel] = useState<FeelTag[]>([]);
  const [filter, setFilter] = useState<TagFilter | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [squeeze, setSqueeze] = useState<number | null>(null); // 壓縮（剪輯）進度 0–1
  const [editing, setEditing] = useState(false); // 正在處理的是剪輯（按鈕寫「剪輯中」）還是只有壓縮
  // 剪輯：手機能重新錄影（compressType）而且讀得到長度才能剪；trim null＝不剪；超過上限一定要剪
  const [dur, setDur] = useState<number | null>(null);
  const [trim, setTrim] = useState<[number, number] | null>(null);
  const [mute, setMute] = useState(false);
  // 高畫質 60 fps：原影片是 60 fps（srcFps 量到 45 以上）、能重錄才出現；要分享的那段 20 秒以內才能開；預設關
  const [srcFps, setSrcFps] = useState<number | null>(null);
  const [hi, setHi] = useState(false);
  const picked = useRef<File | null>(null); // 量 fps 量到一半換了影片：舊的結果不要用
  const [preview, setPreview] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const liking = useRef(new Set<string>()); // 正在送出讚的影片
  // 分享到 IG（B2）：剛分享到原岩的那支影片（手機裡的檔案，已剪輯、壓縮）＋它第 1 秒的畫面（沒有貼紙，預覽用）
  // 只留在這個畫面：關掉路線卡片就沒了（之後要分享得整支從伺服器下載，費流量，先不做）
  const igOk = canShareIg(access);
  const [igSrc, setIgSrc] = useState<{ file: File; plain: File; base: Blob | null } | null>(null);
  // 預覽面板開著：progress＝正在處理（加上標籤重錄）的進度；failed＝這次處理沒有成功（分享原本那支）
  const [ig, setIg] = useState<{ progress: number | null; failed: boolean } | null>(null);
  const [igPv, setIgPv] = useState<string | null>(null); // 預覽圖：第 1 秒的畫面＋現在勾選的標籤
  // 勾選要放的資料（10/16 使用者選 A 案；記在這支手機）；key 用來比對做好的影片是不是同一組勾選
  const [videoShow, setVideoShow] = useState<VideoShow>(() => loadShow("video"));
  const showKey = JSON.stringify(videoShow);
  // 小貼紙：照現在的勾選先畫好；undefined＝還在準備；null＝什麼都沒勾（或畫不出來）＝分享原本那支
  const [stk, setStk] = useState<{ key: string; st: VideoSticker | null } | null>(null);
  // 標籤內容：勾選＋標籤上的字（攀爬日、Flash／完攀、暱稱上傳後還會改）；做好的影片要跟現在的內容一樣才直接用
  const seqN = seqTotal(r);
  const stickerText = r.name ? r.name : seqN ? `${zoneName} ${r.code}・${seqN} 點` : `${zoneName} ${r.hold_color}色`;
  const nickname = access?.nickname ?? "";
  const contentKey = JSON.stringify([showKey, r.grade, gymId, stickerText, myStatus, myDay, nickname]);
  const sticker = stk?.key === contentKey ? stk.st : undefined;
  // 做好的 IG 版：上傳時順便做的（igReady）、按了才做的（igMade）；勾選一樣才直接用
  const [igPrep, setIgPrep] = useState(readIgPrep);
  const [igReady, setIgReady] = useState<{ src: File; key: string; file: File } | null>(null);
  const [igMade, setIgMade] = useState<{ src: File; key: string; file: File } | null>(null);
  const [prepping, setPrepping] = useState(false); // 這次上傳有順便做 IG 版（按鈕寫「壓縮中（順便做 IG 版）」）
  const [prepMiss, setPrepMiss] = useState(false); // 有順便做、但沒做成（例如這支手機不能同時錄兩份）
  const igRun = useRef<AbortController | null>(null); // 正在重錄的那一次：關掉預覽、改勾選、關掉卡片就停
  const [confirmDel, setConfirmDel] = useState<string | null>(null); // 刪除要按兩次（刪了不能復原）；換到別支影片就重來

  useEffect(() => {
    getVideos(r.id)
      .then(setVideos)
      .catch(() => setVideos([]));
  }, [r.id]);
  useEffect(() => {
    if (videos) onCount?.(videos.length);
  }, [videos, onCount]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  // 小貼紙先畫好（要等字型），按「也分享到 IG」、「套用並處理」時才能直接開始重錄（iPhone 只允許在點的那一下開始播放）
  useEffect(() => {
    // 登入、打開「影片」分頁、選了影片或剛分享完才畫（要下載字型，不在每次打開路線卡片時做）
    if (!igOk || !open || !session || !active || (!file && !igSrc)) return;
    let on = true;
    makeVideoSticker({
      grade: r.grade,
      gymName: findGym(gymId)?.name ?? "",
      zone: stickerText,
      status: myStatus,
      date: myDay ? `${+myDay.slice(5, 7)}/${+myDay.slice(8, 10)}` : null,
      nickname,
      show: JSON.parse(showKey) as VideoShow,
    })
      .then((st) => void (on && setStk({ key: contentKey, st })))
      .catch(() => void (on && setStk({ key: contentKey, st: null })));
    return () => void (on = false);
  }, [igOk, open, session, active, file, igSrc, r.grade, gymId, stickerText, myStatus, myDay, nickname, showKey, contentKey]);
  // 預覽圖：面板開著時，第 1 秒的畫面加上現在勾選的標籤（改勾選馬上重畫）
  const igOpen = !!ig;
  useEffect(() => {
    if (!igOpen || !igSrc || sticker === undefined) return;
    let on = true;
    let url: string | null = null;
    composeFrame(igSrc.base, sticker).then((u) => {
      if (on) setIgPv((url = u));
      else if (u) URL.revokeObjectURL(u);
    });
    return () => {
      on = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [igOpen, igSrc, sticker]);
  useEffect(() => () => igRun.current?.abort(), []);

  // 按讚、收回：先改畫面，失敗再改回來（已經按過＝別的分頁按的，不用改回）
  const toggleLike = async (v: Video) => {
    if (!session) return onLogin();
    if (liking.current.has(v.id)) return; // 上一次還沒送完：不收新的（快速連按時順序才不會亂）
    liking.current.add(v.id);
    const me = session.user.id;
    const had = !!v.likers?.includes(me);
    const flip = (on: boolean) =>
      setVideos((vs) => vs?.map((x) => (x.id === v.id && x.likers ? { ...x, likers: on ? [...x.likers.filter((u) => u !== me), me] : x.likers.filter((u) => u !== me) } : x)) ?? null);
    flip(!had);
    try {
      await (had ? unlikeVideo(v.id) : likeVideo(v.id));
    } catch (e) {
      if ((e as DbError).code !== "23505") {
        flip(had);
        toast((e as Error).message);
      }
    } finally {
      liking.current.delete(v.id);
    }
  };

  const canShare = open && !r.archived_at;
  // 篩選鈕只出現這條路線影片裡有的標籤：身高由矮到高，再來動態、靜態，最後型態；選的標籤不見了（例如刪掉影片）就回到全部
  const tagOpts = [
    ...HEIGHT_BANDS.map((h) => ({ v: h.v as TagFilter, label: h.cm })),
    ...CLIMB_MOVES.map((m) => ({ v: m.v as TagFilter, label: m.label })),
    ...FEEL_TAGS.map((f) => ({ v: f.v as TagFilter, label: f.label })),
  ].filter((o) => videos?.some((v) => hasTag(v, o.v)));
  const tag = filter && tagOpts.some((o) => o.v === filter) ? filter : null;
  const shown = (videos ?? []).filter((v) => !tag || hasTag(v, tag));
  const cards: VideoCard[] = shown.map((v) => ({
    key: v.id,
    src: videoUrl(v.path),
    thumb: v.thumb_path ? videoThumbUrl(v.thumb_path) : null,
    name: v.nickname,
    avatar: <UserAvatar userId={v.user_id} />,
    ago: videoWhen(v.climbed_on, v.created_at),
    caption: v.caption,
    status: v.status,
    duration: v.duration_s,
    feel: feelTagText(v.feel_tags),
    tags: videoTagText(v.height_band, v.move),
    onName: onProfile ? () => (setPlaying(null), onProfile(v.user_id)) : undefined,
    ...(v.likers ? { likes: v.likers.length, liked: !!session && v.likers.includes(session.user.id), onLike: () => void toggleLike(v) } : {}),
  }));
  if (!canShare && videos && !videos.length) return <ClosedNotice>這條路線目前不開放分享影片</ClosedNotice>;

  // 上攀路線最長 3 分鐘、100 MB；其他 60 秒、50 MB
  const lim = videoLimit(r);
  const max = videoMaxSeconds(lim);
  const editable = !!compressType() && dur != null;
  const pick = async (f: File) => {
    setIgSrc(null); // 選了新的影片：上一支就不提供分享到 IG 了
    setIgReady(null);
    setIgMade(null);
    setPrepMiss(false);
    igRun.current?.abort();
    try {
      const d = await checkPickedVideo(f, !!compressType(), lim);
      setFile(f);
      setDur(d);
      setTrim(d != null && d > max + 0.5 ? [0, max] : null); // 太長：先選好前 max 秒，再自己拉
      setMute(false);
      setHi(false);
      setSrcFps(null);
      picked.current = f;
      if (compressType() && d != null) void sourceFps(f).then((fps) => void (picked.current === f && setSrcFps(fps)));
      setPreview(compressType() && d != null ? URL.createObjectURL(f) : null);
      if (session) setHeight(savedHeight(session.user.id)); // 帶入這個帳號上次選的身高
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const reset = () => {
    setFile(null);
    setCaption("");
    setMove(null);
    setFeel([]);
    setConsent(false);
    setDur(null);
    setTrim(null);
    setMute(false);
    setHi(false);
    setSrcFps(null);
    picked.current = null;
    setPreview(null);
  };

  // 有剪（選的不是整支）或靜音才要剪輯
  const trimmed = !!trim && dur != null && (trim[0] > 0.05 || trim[1] < dur - 0.1);
  const seg = dur == null ? null : trim ? trim[1] - trim[0] : dur; // 要分享的那段幾秒
  const hiShown = editable && (srcFps ?? 0) >= 45;
  const hiOk = seg != null && Math.round(seg) <= hiMaxSeconds(); // 跟畫面上寫的秒數一致
  const useHi = hiShown && hiOk && hi;
  if (hi && !hiOk) setHi(false); // 拉到超過上限就關掉（再剪短不會自己打開）
  const edit: VideoEdit | undefined =
    editable && (trimmed || mute || useHi) ? { start: trimmed ? trim![0] : 0, end: trimmed ? trim![1] : dur!, mute, ...(useHi ? { fps60: true } : {}) } : undefined;
  // 上傳時順便做 IG 版：只在這支影片本來就要重錄（剪輯、靜音、要壓縮的大檔案）時一起做，小影片不為了 IG 多等一次
  const prepFits = igOk && igPrep && !!compressType() && !!file && (!!edit || file.size >= compressMinBytes());
  // 要順便做時，等小貼紙準備好才能按「分享影片」（不然這次就沒順便做到）
  const prepWait = prepFits && sticker === undefined;
  const upload = async () => {
    if (!session || !file || !consent) return;
    setBusy(true);
    try {
      // 先在手機上壓成 720p（不支援或沒變小就傳原檔）；剪輯、靜音一定重錄，失敗就不傳（不然長度、聲音不對）
      // 要在點擊當下直接開始，iPhone 才允許播放
      // 上傳時順便做 IG 版：同一次播放多錄一份加上小貼紙（小檔案本來不用壓縮，打開開關時也一起重錄）
      const took: { v: File | null } = { v: null };
      const prepKey = contentKey;
      const extra = prepFits && sticker ? { overlay: sticker, onDone: (f: File | null) => void (took.v = f) } : undefined;
      const willSqueeze = !!edit || !!extra || (file.size >= compressMinBytes() && !!compressType());
      if (willSqueeze) setSqueeze(0);
      setEditing(trimmed || mute); // 只開高畫質寫「壓縮中」
      setPrepping(!!extra);
      // 縮圖（列表只放縮圖、按了才載入影片）：壓縮時順便擷取；沒壓縮或沒擷取到就從要上傳的檔案擷取；失敗照樣分享
      let thumb: Blob | null = null;
      const small = willSqueeze ? await compressVideo(file, setSqueeze, edit, (b) => (thumb = b), undefined, undefined, extra) : null;
      setSqueeze(null);
      if (edit && !small)
        throw new Error(
          useHi ? "高畫質 60 fps 沒有成功，請關掉高畫質再試一次" : trimmed ? "剪輯沒有成功，請再試一次，或先在手機相簿剪短再分享" : "靜音沒有成功，請再試一次"
        );
      thumb ??= await captureThumb(small ?? file).catch(() => null);
      await uploadVideo(
        session.user.id,
        gymId,
        r.id,
        small ?? file,
        {
          caption: caption.trim() || null,
          status: myStatus,
          climbed_on: myStatus ? myDay : null,
          height_band: height,
          move,
          feel_tags: feel,
          thumb,
        },
        edit ? { duration: edit.end - edit.start } : small ? { source: file } : undefined,
        lim,
      );
      try {
        if (height) localStorage.setItem(heightKey(session.user.id), height);
        else localStorage.removeItem(heightKey(session.user.id));
      } catch {}
      if (igOk) {
        const src = small ?? file;
        setIgSrc({ file: src, plain: igName(src, r.code), base: thumb });
        setIgReady(took.v ? { src, key: prepKey, file: igName(took.v, r.code) } : null);
        setIgMade(null);
        setPrepMiss(!!extra && !took.v);
      }
      reset();
      setFilter(null); // 回到全部，剛分享的才看得到
      setVideos(await getVideos(r.id));
      toast("已分享影片");
    } catch (e) {
      toast((e as Error).message);
    }
    setSqueeze(null);
    setBusy(false);
  };

  // 也分享到 IG：要分享哪一支——
  // 不能壓縮的手機、什麼都沒勾 → 原本那支；勾選跟做好的一樣 → 做好的那支；處理沒有成功 → 原本那支；都不是 → 要處理（重錄加上標籤）
  const canStick = !!compressType();
  const igHit = [igReady, igMade].find((x) => x && igSrc && x.src === igSrc.file && x.key === contentKey) ?? null;
  const igPlain = !canStick || sticker === null || !!ig?.failed;
  const igFile = !igSrc || !ig ? null : igHit ? igHit.file : igPlain ? igSrc.plain : null;
  const igNeedsWork = !!igSrc && !!ig && !igFile;

  // 重錄一次加上標籤（大約等影片的長度）；要在點擊當下直接開始（前面不能先 await）
  const record = async () => {
    const src = igSrc;
    const st = sticker;
    const key = contentKey;
    if (!src || !st) return;
    igRun.current?.abort();
    const run = new AbortController();
    igRun.current = run;
    setIg({ progress: 0, failed: false });
    const out = await compressVideo(src.file, (p) => !run.signal.aborted && setIg((g) => g && { ...g, progress: p }), undefined, undefined, st, run.signal);
    if (run.signal.aborted) return; // 關掉了、改了勾選：這一次的結果不要
    igRun.current = null;
    if (out) setIgMade({ src: src.file, key, file: igName(out, r.code) });
    setIg((g) => g && { progress: null, failed: !out });
  };
  // 按「也分享到 IG」：打開預覽；還沒做好又能做的就直接開始處理
  const makeIg = () => {
    if (!igSrc) return;
    if (!igHit && canStick && sticker) return void record();
    setIg({ progress: null, failed: false });
  };
  const stopIg = () => {
    igRun.current?.abort();
    igRun.current = null;
  };
  const closeIg = () => {
    stopIg();
    setIg(null);
    setIgPv(null);
  };
  // 改勾選：記在手機；正在處理的停掉（勾選不一樣了）
  const pickVideo = (next: VideoShow) => {
    saveShow("video", next);
    setVideoShow(next);
    setIgPv(null); // 新的標籤畫好前不顯示舊的
    stopIg();
    setIg((g) => g && { progress: null, failed: false });
  };

  const remove = async (id: string) => {
    if (confirmDel !== id) return setConfirmDel(id);
    try {
      await deleteVideo(id);
      setPlaying(null);
      setFilter(null);
      setVideos((vs) => vs?.filter((v) => v.id !== id) ?? null);
      toast("已刪除影片");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      {videos && videos.length > 0 ? (
        active && (
          <>
            {tagOpts.length > 0 && (
              <ChipRow wrap>
                <Chip pressed={tag == null} onClick={() => (setPlaying(null), setFilter(null))}>
                  全部
                  <span className="ml-1 font-num opacity-60">{videos.length}</span>
                </Chip>
                {tagOpts.map((o) => (
                  <Chip key={o.v} pressed={tag === o.v} onClick={() => (setPlaying(null), setFilter(tag === o.v ? null : o.v))}>
                    {o.label}
                  </Chip>
                ))}
              </ChipRow>
            )}
            <VideoList>
              {cards.map((c, i) => (
                <VideoRow key={c.key} v={c} onClick={() => (setConfirmDel(null), setPlaying(i))} />
              ))}
            </VideoList>
            {tag && (
              <p className="mt-2.5 mb-0 text-center text-meta text-muted">
                <span className="font-num text-sub font-semibold">
                  {shown.length} / {videos.length}
                </span>{" "}
                支
              </p>
            )}
            <VideoViewer
              items={cards}
              index={playing}
              onIndex={(i) => (setConfirmDel(null), setPlaying(i))}
              actions={(i) => {
                const v = shown[i];
                return session && (v.user_id === session.user.id || staff) ? (
                  <button onClick={() => void remove(v.id)} className={`text-meta text-warn ${confirmDel === v.id ? "font-bold" : ""}`}>
                    {confirmDel === v.id ? "確定刪除？再按一次" : "刪除這支影片"}
                  </button>
                ) : null;
              }}
            />
          </>
        )
      ) : (
        <p className="mt-1 mb-2.5 text-note text-muted">{videos ? "還沒有人分享影片，拍下你的攀爬過程吧。" : "讀取中…"}</p>
      )}
      {canShare && (
        <div className={videos?.length && active ? "mt-3" : ""}>
          {!session ? (
            <Button onClick={onLogin}>登入後分享影片</Button>
          ) : access?.suspension && suspendActive(access.suspension.until) ? (
            <ClosedNotice>帳號暫停中，暫時不能分享影片</ClosedNotice>
          ) : !file ? (
            <>
              {igSrc && (
                <ShareOffer
                  title={<b>影片已分享到原岩，也可以發到 IG</b>}
                  button={igHit || (canStick && sticker) ? "也分享到 IG（加上原岩標記）" : sticker === undefined && canStick ? "準備中…" : "也分享到 IG"}
                  disabled={!igHit && canStick && sticker === undefined}
                  hint={
                    igHit
                      ? "上傳時已經做好（左下角加上原岩標記），按了馬上可以分享；可以在預覽下面改要放的資料；關掉路線卡片後就不能分享到 IG 了"
                      : canStick
                        ? `${prepMiss ? "上傳時沒有順便做成 IG 版；" : ""}左下角加上原岩標記，要在手機上重新處理一次，大約等影片的長度；關掉路線卡片後就不能分享到 IG 了`
                        : "這支手機加不了原岩標記，會分享原本的影片；關掉路線卡片後就不能分享到 IG 了"
                  }
                  onClick={makeIg}
                />
              )}
              <VideoPickButton onPick={pick} disabled={busy}>
                分享攀爬影片
              </VideoPickButton>
              <p className="mt-1.5 mb-0 text-tiny text-muted">
                {compressType()
                  ? `最長 ${durText(max)}，太長的選好後可以剪；會先壓縮成 720p${lim.seconds > 60 ? "（影片越長等越久，3 分鐘大約等 3 分鐘）" : ""}`
                  : `最長 ${durText(max)}、${Math.round(lim.bytes / 1048576)} MB 以內`}
                ；這條路線換線時影片會一起刪除
              </p>
            </>
          ) : (
            <>
              <PickedFile name={file.name} size={file.size} onClear={busy ? undefined : reset} />
              {editable && preview && (
                <>
                  {trim ? (
                    <>
                      {dur! > max + 0.5 && <p className="mt-2 mb-0 text-note text-warn">影片 {durText(dur!)}，最長 {durText(max)}：拉下面的開始、結束選要分享的那一段</p>}
                      <VideoTrim src={preview} duration={dur!} start={trim[0]} end={trim[1]} max={max} onChange={(a, b) => setTrim([a, b])} disabled={busy} />
                      {dur! <= max + 0.5 && !busy && <LinkButton onClick={() => setTrim(null)}>不剪了，分享整支</LinkButton>}
                    </>
                  ) : (
                    <Button className="mt-2" disabled={busy} onClick={() => setTrim([0, Math.min(dur!, max)])}>
                      ✂ 剪輯長度
                    </Button>
                  )}
                  <Toggle checked={mute} onChange={setMute} label="靜音" hint="不放影片的聲音（例如館內音樂、旁邊的人聊天）" disabled={busy} />
                  {hiShown && (
                    <Toggle
                      checked={useHi}
                      onChange={setHi}
                      label="高畫質 60 fps"
                      hint={
                        hiOk ? (
                          "動態、跳躍動作看得更順；檔案大約大一倍"
                        ) : (
                          <>
                            動態、跳躍動作看得更順；檔案大約大一倍。
                            <b className="text-warn">
                              影片 {durText(seg!)}，剪到 {hiMaxSeconds()} 秒內才能開
                            </b>
                          </>
                        )
                      }
                      disabled={busy || !hiOk}
                    />
                  )}
                </>
              )}
              <Label>你爬起來覺得？（選填，最多 {FEEL_TAG_MAX} 個）</Label>
              <MultiOptionGrid options={FEEL_TAGS} value={feel} onChange={setFeel} max={FEEL_TAG_MAX} />
              <Label htmlFor="vcap">心得（選填）</Label>
              <TextField id="vcap" maxLength={40} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="例如：最後一手超遠，用左腳勾" />
              <p className="mt-1.5 mb-0 text-tiny text-muted">會當成影片標題，大家都看得到；沒寫的話，標題會顯示「{access?.nickname ?? "你"}的攀爬」</p>
              <Label>你的身高（公分，選填）</Label>
              <OptionGrid cols={4} options={HEIGHT_BANDS} value={height} onChange={setHeight} />
              <p className="mt-1.5 mb-0 text-tiny text-muted">
                會顯示在影片上，方便身高相近的人參考（分享後不能改）；
                <span className="whitespace-nowrap">下次不用再選</span>
              </p>
              <Label>動作（選填）</Label>
              <OptionGrid cols={2} options={CLIMB_MOVES} value={move} onChange={setMove} />
              <p className="mt-4 mb-0 flex flex-wrap items-center gap-x-1 text-note text-muted">
                {myStatus ? (
                  <>
                    你在這條的紀錄會一起顯示：
                    {myDay && videoDaySupported() && <span>{videoWhen(myDay, myDay)}</span>}
                    <VideoResult status={myStatus} />
                  </>
                ) : (
                  "你還沒記錄這條，影片上不會顯示紀錄"
                )}
              </p>
              {igOk && !!compressType() && sticker !== null && (
                <Toggle
                  checked={igPrep}
                  onChange={(on) => (setIgPrep(on), writeIgPrep(on))}
                  label="上傳時順便做 IG 版（加原岩標記）"
                  hint="要壓縮的影片上傳時一起做，上傳完馬上可以分享到 IG；不分享的話這份不會存，關掉就丟掉，只是處理時手機比較吃力"
                  disabled={busy}
                />
              )}
              <Check checked={consent} onChange={setConsent}>
                影片裡的其他人都同意入鏡，內容符合
                <Link href="/rules" className="underline">
                  分享規範
                </Link>
              </Check>
              <Button variant="primary" className="mt-3.5" disabled={!consent || busy || prepWait} onClick={upload}>
                {prepWait && !busy ? "準備原岩標記中…" : squeeze != null ? `${editing ? "剪輯中" : "壓縮中"} ${Math.round(squeeze * 100)}%，請不要關閉畫面…` : busy ? "上傳中，請不要關閉畫面…" : "分享影片"}
              </Button>
              {prepping && squeeze != null && <p className="mt-1.5 mb-0 text-tiny text-muted">同時在做 IG 版（加原岩標記），上傳完馬上可以分享</p>}
              {!busy && <LinkButton onClick={reset}>取消</LinkButton>}
            </>
          )}
        </div>
      )}
      <SharePreview
        open={!!ig}
        onClose={closeIg}
        title="分享影片到 IG"
        what="影片"
        file={igFile}
        image={igPv}
        progress={ig?.progress}
        picker={canStick && <SharePicker kind="video" show={videoShow} onChange={pickVideo} />}
        action={
          igNeedsWork
            ? ig?.progress != null
              ? { label: `處理中 ${Math.round(ig.progress * 100)}%，請不要關閉畫面…`, run: () => undefined, disabled: true }
              : { label: sticker === undefined ? "準備中…" : "套用並處理（大約等影片的長度）", run: () => void record(), disabled: sticker === undefined }
            : undefined
        }
        note={
          !canStick
            ? "這支手機加不了原岩標記，分享的是原本的影片。限時動態一則最長 60 秒，比較長的 IG 會切成好幾段。"
            : ig?.failed
              ? "加原岩標記沒有成功（處理時畫面要開著），分享的是原本的影片；改一下勾選或關掉再按一次可以重試。"
              : sticker === null
                ? "沒有勾任何資料，分享原本的影片。"
                : "改了勾選要重新處理一次（大約等影片的長度）；勾選會記在這支手機。限時動態一則最長 60 秒，比較長的 IG 會切成好幾段。"
        }
      />
    </>
  );
}
