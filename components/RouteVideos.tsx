"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Check, Label, OptionGrid, TextField, Toggle } from "@/components/ui/Form";
import { ClosedNotice } from "@/components/ui/Comments";
import { useToast } from "@/components/ui/Toast";
import { PickedFile, VideoList, VideoPickButton, VideoResult, VideoRow, VideoTrim, VideoViewer, type VideoCard } from "@/components/ui/Video";
import { compressMinBytes, compressType, compressVideo, type VideoEdit } from "@/lib/video";
import { checkPickedVideo, deleteVideo, getVideos, uploadVideo, videoMaxSeconds, videoUrl, type Route, type Video } from "@/lib/data";
import { HEIGHT_KEY_PREFIX } from "@/lib/offline";
import { ago } from "@/lib/date";
import { CLIMB_MOVES, HEIGHT_BANDS, videoTagText, type ClimbMove, type HeightBand, type Status } from "@/lib/design";

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

// 篩選：一次一個標籤（身高或動作）；影片要有那個標籤才留下
type TagFilter = HeightBand | ClimbMove;
const hasTag = (v: Video, t: TagFilter) => v.height_band === t || v.move === t;

// 路線卡片的「影片」分頁：一支一列（說明、誰、紀錄、身高・動作），上面用身高或動作篩選；分享時可選身高、動作（選填）
// onCount 回報影片數（分頁標籤用）
// 規則跟留言一樣：路線在牆上、留言開放才能分享；路線下架時影片會一起刪除
export default function RouteVideos({
  route: r,
  gymId,
  open,
  active = true,
  staff,
  myStatus,
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
  const [filter, setFilter] = useState<TagFilter | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [squeeze, setSqueeze] = useState<number | null>(null); // 壓縮（剪輯）進度 0–1
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

  const canShare = open && !r.archived_at;
  // 篩選鈕只出現這條路線影片裡有的標籤：身高由矮到高，再來動態、靜態；選的標籤不見了（例如刪掉影片）就回到全部
  const tagOpts = [
    ...HEIGHT_BANDS.map((h) => ({ v: h.v as TagFilter, label: h.cm })),
    ...CLIMB_MOVES.map((m) => ({ v: m.v as TagFilter, label: m.label })),
  ].filter((o) => videos?.some((v) => hasTag(v, o.v)));
  const tag = filter && tagOpts.some((o) => o.v === filter) ? filter : null;
  const shown = (videos ?? []).filter((v) => !tag || hasTag(v, tag));
  const cards: VideoCard[] = shown.map((v) => ({
    key: v.id,
    src: videoUrl(v.path),
    name: v.nickname,
    ago: ago(v.created_at),
    caption: v.caption,
    status: v.status,
    duration: v.duration_s,
    tags: videoTagText(v.height_band, v.move),
    onName: onProfile ? () => (setPlaying(null), onProfile(v.user_id)) : undefined,
  }));
  if (!canShare && videos && !videos.length) return <ClosedNotice>這條路線目前不開放分享影片</ClosedNotice>;

  const max = videoMaxSeconds();
  const editable = !!compressType() && dur != null;
  const pick = async (f: File) => {
    try {
      const d = await checkPickedVideo(f, !!compressType());
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
    setConsent(false);
    setDur(null);
    setTrim(null);
    setMute(false);
    setPreview(null);
  };

  // 有剪（選的不是整支）或靜音才要剪輯
  const trimmed = !!trim && dur != null && (trim[0] > 0.05 || trim[1] < dur - 0.05);
  const edit: VideoEdit | undefined = editable && (trimmed || mute) ? { start: trimmed ? trim![0] : 0, end: trimmed ? trim![1] : dur!, mute } : undefined;
  const upload = async () => {
    if (!session || !file || !consent) return;
    setBusy(true);
    try {
      // 先在手機上壓成 720p（不支援或沒變小就傳原檔）；剪輯、靜音一定重錄，失敗就不傳（不然長度、聲音不對）
      // 要在點擊當下直接開始，iPhone 才允許播放
      const willSqueeze = !!edit || (file.size >= compressMinBytes() && !!compressType());
      if (willSqueeze) setSqueeze(0);
      const small = willSqueeze ? await compressVideo(file, setSqueeze, edit) : null;
      setSqueeze(null);
      if (edit && !small) throw new Error(trimmed ? "剪輯沒有成功，請再試一次，或先在手機相簿剪短再分享" : "靜音沒有成功，請再試一次");
      await uploadVideo(
        session.user.id,
        gymId,
        r.id,
        small ?? file,
        {
          caption: caption.trim() || null,
          status: myStatus,
          height_band: height,
          move,
        },
        edit ? { duration: edit.end - edit.start } : small ? { source: file } : undefined,
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
                {compressType() ? `最長 ${max} 秒，太長的選好後可以剪；會先壓縮成 720p` : `最長 ${max} 秒、50 MB 以內`}；這條路線換線時影片會一起刪除
              </p>
            </>
          ) : (
            <>
              <PickedFile name={file.name} size={file.size} onClear={busy ? undefined : reset} />
              {editable && preview && (
                <>
                  {trim ? (
                    <>
                      {dur! > max + 0.5 && <p className="mt-2 mb-0 text-note text-warn">影片 {Math.round(dur!)} 秒，最長 {max} 秒：拉下面的開始、結束選要分享的那一段</p>}
                      <VideoTrim src={preview} duration={dur!} start={trim[0]} end={trim[1]} max={max} onChange={(a, b) => setTrim([a, b])} />
                      {dur! <= max + 0.5 && !busy && <LinkButton onClick={() => setTrim(null)}>不剪了，分享整支</LinkButton>}
                    </>
                  ) : (
                    <Button className="mt-2" disabled={busy} onClick={() => setTrim([0, Math.min(dur!, max)])}>
                      ✂ 剪輯長度
                    </Button>
                  )}
                  <Toggle checked={mute} onChange={setMute} label="靜音" hint="不放影片的聲音（例如館內音樂、旁邊的人聊天）" />
                </>
              )}
              <Label htmlFor="vcap">一句說明（選填）</Label>
              <TextField id="vcap" maxLength={40} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="例如：最後一手用左腳勾" />
              <p className="mt-1.5 mb-0 text-tiny text-muted">沒寫的話，標題會顯示「{access?.nickname ?? "你"}的攀爬」</p>
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
                {squeeze != null ? `${edit ? "剪輯中" : "壓縮中"} ${Math.round(squeeze * 100)}%，請不要關閉畫面…` : busy ? "上傳中，請不要關閉畫面…" : "分享影片"}
              </Button>
              {!busy && <LinkButton onClick={reset}>取消</LinkButton>}
            </>
          )}
        </div>
      )}
    </>
  );
}
