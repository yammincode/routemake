"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Check, Label, MultiOptionGrid, OptionGrid, TextField, Toggle } from "@/components/ui/Form";
import { ClosedNotice } from "@/components/ui/Comments";
import { useToast } from "@/components/ui/Toast";
import { PickedFile, VideoList, VideoPickButton, VideoResult, VideoRow, VideoTrim, VideoViewer, type VideoCard } from "@/components/ui/Video";
import { captureThumb, compressMinBytes, compressType, compressVideo, type VideoEdit } from "@/lib/video";
import { checkPickedVideo, deleteVideo, durText, getVideos, likeVideo, unlikeVideo, uploadVideo, videoDaySupported, videoLimit, videoMaxSeconds, videoThumbUrl, videoUrl, type DbError, type Route, type Video } from "@/lib/data";
import { HEIGHT_KEY_PREFIX } from "@/lib/offline";
import { videoWhen } from "@/lib/date";
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
  const [preview, setPreview] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
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

  // 按讚、收回：先改畫面，失敗再改回來（已經按過＝別的分頁按的，不用改回）
  const toggleLike = async (v: Video) => {
    if (!session) return onLogin();
    const me = session.user.id;
    const had = !!v.likers?.includes(me);
    const flip = (on: boolean) =>
      setVideos((vs) => vs?.map((x) => (x.id === v.id && x.likers ? { ...x, likers: on ? [...x.likers.filter((u) => u !== me), me] : x.likers.filter((u) => u !== me) } : x)) ?? null);
    flip(!had);
    try {
      await (had ? unlikeVideo(v.id) : likeVideo(v.id));
    } catch (e) {
      if ((e as DbError).code === "23505") return;
      flip(had);
      toast((e as Error).message);
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
    try {
      const d = await checkPickedVideo(f, !!compressType(), lim);
      setFile(f);
      setDur(d);
      setTrim(d != null && d > max + 0.5 ? [0, max] : null); // 太長：先選好前 max 秒，再自己拉
      setMute(false);
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
    setPreview(null);
  };

  // 有剪（選的不是整支）或靜音才要剪輯
  const trimmed = !!trim && dur != null && (trim[0] > 0.05 || trim[1] < dur - 0.1);
  const edit: VideoEdit | undefined = editable && (trimmed || mute) ? { start: trimmed ? trim![0] : 0, end: trimmed ? trim![1] : dur!, mute } : undefined;
  const upload = async () => {
    if (!session || !file || !consent) return;
    setBusy(true);
    try {
      // 先在手機上壓成 720p（不支援或沒變小就傳原檔）；剪輯、靜音一定重錄，失敗就不傳（不然長度、聲音不對）
      // 要在點擊當下直接開始，iPhone 才允許播放
      const willSqueeze = !!edit || (file.size >= compressMinBytes() && !!compressType());
      if (willSqueeze) setSqueeze(0);
      setEditing(!!edit);
      // 縮圖（列表只放縮圖、按了才載入影片）：壓縮時順便擷取；沒壓縮或沒擷取到就從要上傳的檔案擷取；失敗照樣分享
      let thumb: Blob | null = null;
      const small = willSqueeze ? await compressVideo(file, setSqueeze, edit, (b) => (thumb = b)) : null;
      setSqueeze(null);
      if (edit && !small) throw new Error(trimmed ? "剪輯沒有成功，請再試一次，或先在手機相簿剪短再分享" : "靜音沒有成功，請再試一次");
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
          ) : !file ? (
            <>
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
              <Check checked={consent} onChange={setConsent}>
                影片裡的其他人都同意入鏡，內容符合
                <Link href="/rules" className="underline">
                  分享規範
                </Link>
              </Check>
              <Button variant="primary" className="mt-3.5" disabled={!consent || busy} onClick={upload}>
                {squeeze != null ? `${editing ? "剪輯中" : "壓縮中"} ${Math.round(squeeze * 100)}%，請不要關閉畫面…` : busy ? "上傳中，請不要關閉畫面…" : "分享影片"}
              </Button>
              {!busy && <LinkButton onClick={reset}>取消</LinkButton>}
            </>
          )}
        </div>
      )}
    </>
  );
}
