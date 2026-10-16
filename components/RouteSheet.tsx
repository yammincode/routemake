"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import ProfileSheet from "@/components/ProfileSheet";
import RouteVideos from "@/components/RouteVideos";
import { Button, LinkButton } from "@/components/ui/Button";
import { ClimbDay } from "@/components/ui/ClimbDay";
import { HighpointPicker, NumberMarks } from "@/components/ui/Endurance";
import { ClosedNotice, CommentForm, CommentItem, CommentList, PrivateHint } from "@/components/ui/Comments";
import { Label, Segmented, TextArea } from "@/components/ui/Form";
import { UserAvatar } from "@/components/ui/Mascot";
import { Grade, SetterNote, StatusPicker, Tags, Tape } from "@/components/ui/Route";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";
import { HoldMarks } from "@/components/ui/Spray";
import { useToast } from "@/components/ui/Toast";
import { Pin, WallPhoto } from "@/components/ui/Wall";
import { isStaffOf } from "@/lib/auth";
import {
  clearAscent,
  deleteComment,
  editComment,
  getComments,
  photoUrl,
  likeComment,
  postComment,
  saveAscent,
  seqTotal,
  unlikeComment,
  type Ascent,
  type Comment,
  type DbError,
  type Route,
} from "@/lib/data";
import { ago, md, todayYmd, ymd } from "@/lib/date";
import { FEEL, GRADE_FEEL, STATUS_LABEL, type Status } from "@/lib/design";
import { herePath } from "@/lib/nav";
import { cheerComment, cheerSend } from "@/lib/mascot-events";
import { isRetryable, queueAscent, unqueue } from "@/lib/offline";
import { loginExpired } from "@/lib/supabase";
import { ascentPoints, routePoints } from "@/lib/scoring";
import { useScoring } from "@/lib/useScoring";

// 路線卡片（全螢幕，使用者選的 3B）：最上面滿版照片（一般路線標出起步點、Spray Wall 畫圈圈、長耐力畫編號點），
// 下面路線資訊與攀爬日＋一排「點一下就記錄」，再下面分頁：紀錄（感受、心得）、影片、留言
// photo：長耐力路線的區域照片（畫出全部的點）；zonePhoto：一般路線的區域照片（標出這條的起步點；沒有就不放照片）；initialTab：打開時停在哪個分頁（New~ 點 Spray Wall 的影片、留言進來；New~ 看路線跳到區域頁停在紀錄）
// pending：還沒讀到自己的紀錄時先顯示這個（讀到才顯示記錄按鈕，不然再點一次狀態會蓋掉原本的心得和日期）
export type RouteTab = "log" | "video" | "comment";
export default function RouteSheet({
  route,
  photo,
  zonePhoto,
  zoneName,
  gymId,
  gymCommentsOn,
  ascent,
  onClose,
  onSaved,
  spray,
  initialTab,
  pending,
}: {
  route: Route | null;
  photo?: string | null;
  zonePhoto?: { src: string; fallback?: string } | null;
  zoneName: string;
  gymId: string;
  gymCommentsOn: boolean;
  ascent: Ascent | null;
  onClose: () => void;
  onSaved: (a: Ascent | null) => void;
  spray?: SprayExtras;
  initialTab?: RouteTab;
  pending?: ReactNode;
}) {
  const hero = route && !pending ? heroOf(route, photo ?? null, zonePhoto ?? null, spray) : null;
  return (
    <Sheet open={!!route} onClose={onClose} full bare={!!hero}>
      {route && pending}
      {route && !pending && (
        <RouteBody
          key={route.id}
          route={route}
          hero={hero}
          zoneName={zoneName}
          gymId={gymId}
          gymCommentsOn={gymCommentsOn}
          ascent={ascent}
          onClose={onClose}
          onSaved={onSaved}
          spray={spray}
          initialTab={initialTab}
        />
      )}
    </Sheet>
  );
}

// Spray Wall 路線額外的內容：公版照片（顯示這條路線的圈圈）、出題者、讚、修改／刪除
export type SprayExtras = {
  photo: string | null;
  routePhoto?: string | null; // 岩館路線自己的照片路徑（step44；列表讀到的在 route.photo_path，New~ 另外讀）
  author: string | null;
  likes: number;
  liked: boolean;
  onLike: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  deleteLabel?: string; // 本人「刪除」、員工「下架」
};

// 最上面的照片：Spray Wall 畫圈圈；長耐力畫編號點；一般路線用區域照片標起步點
type Hero = { src: string; fallback?: string; kind: "spray" | "seq" | "pin" };
function heroOf(r: Route, photo: string | null, zonePhoto: { src: string; fallback?: string } | null, spray?: SprayExtras): Hero | null {
  if (spray) {
    const own = photoUrl(r.photo_path ?? spray.routePhoto ?? null);
    if (own) return { src: own, kind: "spray" };
    return spray.photo && r.holds?.length ? { src: spray.photo, kind: "spray" } : null;
  }
  if (seqTotal(r)) return photo && r.holds ? { src: photo, kind: "seq" } : null;
  // Spray Wall 的路線（有名字）在我的紀錄打開：起步點標在公版照片上對不上，不放照片
  if (r.name) return null;
  return zonePhoto ? { ...zonePhoto, kind: "pin" } : null;
}

function RouteBody({
  route: r,
  hero,
  zoneName,
  gymId,
  gymCommentsOn,
  ascent,
  onClose,
  onSaved,
  spray,
  initialTab,
}: {
  route: Route;
  hero: Hero | null;
  zoneName: string;
  gymId: string;
  gymCommentsOn: boolean;
  ascent: Ascent | null;
  onClose: () => void;
  onSaved: (a: Ascent | null) => void;
  spray?: SprayExtras;
  initialTab?: RouteTab;
}) {
  const { session, access } = useAuth();
  const rules = useScoring();
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(ascent?.status ?? null);
  // 還沒記錄：預設今天（下架的路線預設下架那天，資料庫不收晚於下架日的紀錄）
  const [date, setDate] = useState(() => ascent?.climbed_on ?? (r.archived_at && ymd(r.archived_at) < todayYmd() ? ymd(r.archived_at) : todayYmd()));
  const [feel, setFeel] = useState<number | null>(ascent?.feel ?? null);
  const [gfeel, setGfeel] = useState<number | null>(ascent?.grade_feel ?? null);
  const [note, setNote] = useState(ascent?.private_note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // 長耐力：總點數（其他路線 0）、最高爬到第幾點（只有嘗試中才有意義）
  const total = spray ? 0 : seqTotal(r);
  const [hp, setHp] = useState<number | null>(ascent?.status === "project" ? (ascent?.highpoint ?? null) : null);
  // 打開卡片時的紀錄：判斷「上次嘗試中、這次爬完／爬得更高」用（這次打開後按錯又改回來不算）
  const [opened] = useState(() => ({ status: ascent?.status ?? null, date: ascent?.climbed_on ?? null, hp: ascent?.highpoint ?? null }));
  // 這次打開後自己在攀爬日膠囊選過日期：之後嘗試中改完攀、爬得更高都照選的日期（不自動改成今天）
  const dayPicked = useRef(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<RouteTab | null>(initialTab ?? null);
  const [details, setDetails] = useState(!!(ascent && (ascent.feel != null || ascent.grade_feel != null || ascent.private_note)));
  const [videoCount, setVideoCount] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const onVideoCount = useCallback((n: number) => setVideoCount(n), []);

  const commentsOpen = gymCommentsOn && r.comments_enabled;
  const staff = isStaffOf(access, gymId);
  const minDate = ymd(r.created_at);
  const maxDate = r.archived_at ? ymd(r.archived_at) : todayYmd();

  useEffect(() => {
    if (!commentsOpen) return;
    getComments(r.id)
      .then(setComments)
      .catch(() => setComments([]));
  }, [r.id, commentsOpen]);

  // 回傳 saved（存好了）、queued（先排隊）、failed（被擋下）
  const persist = async (a: Omit<Ascent, "id" | "route_id">, msg: string): Promise<"saved" | "queued" | "failed"> => {
    if (!session) return "failed";
    setBusy(true);
    let result: "saved" | "queued" | "failed" = "saved";
    try {
      await saveAscent(session.user.id, r.id, a);
      unqueue(session.user.id, r.id); // 之前排隊的舊版本不用再送（不然會蓋掉這次存的）
      onSaved({ id: ascent?.id ?? "", route_id: r.id, ...a });
      toast(msg);
    } catch (e) {
      // 送不出去，或登入剛好過期、換新失敗（Supabase 改用沒登入的身分送，資料庫回「沒有權限」）：先排隊，之後自動送出
      if (isRetryable(e) || ((e as DbError).code === "42501" && loginExpired())) {
        queueAscent({ userId: session.user.id, routeId: r.id, ascent: a });
        onSaved({ id: ascent?.id ?? "", route_id: r.id, ...a });
        toast("目前送不出去，連上網路後會自動送出");
        result = "queued";
      } else {
        toast((e as Error).message);
        result = "failed";
      }
    }
    setBusy(false);
    return result;
  };
  const current = (s: Status, day = date, high = hp) => ({
    status: s,
    climbed_on: day || todayYmd(),
    feel: s === "project" ? null : feel,
    grade_feel: s === "project" ? null : gfeel,
    private_note: note.trim() || null,
    // 長耐力才帶最高點：Flash、完攀＝最後一點
    ...(total ? { highpoint: s === "project" ? high : total } : {}),
  });
  // 長耐力：拉桿子選最高點，停 0.7 秒才存（拉的過程不會一直送）；關掉卡片前還沒存的會馬上存
  const hpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hpPending = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      if (hpTimer.current) clearTimeout(hpTimer.current);
      hpPending.current?.();
    },
    []
  );
  // 改狀態、儲存、清除紀錄前：還沒送出的最高點不送了（不然 0.7 秒後會把剛記的完攀蓋回嘗試中、或把清掉的紀錄寫回來）
  const dropHp = () => {
    if (hpTimer.current) clearTimeout(hpTimer.current);
    hpTimer.current = null;
    hpPending.current = null;
  };
  const pickHp = (v: number) => {
    setHp(v);
    dropHp();
    // 爬得比上次高：日期改成今天（分數算在進步那天）；自己改過日期就照改的
    const better = v > (opened.hp ?? 0) && !dayPicked.current;
    const day = better ? (todayYmd() > maxDate ? maxDate : todayYmd()) : date;
    const pts = rules ? ascentPoints(r.grade, r.style_tags, "project", rules, v, total) : 0;
    const run = () => {
      hpPending.current = null;
      hpTimer.current = null;
      setDate(day);
      void persist(current("project", day, v), `已記錄：爬到第 ${v} 點 +${pts} 分`);
    };
    hpPending.current = run;
    hpTimer.current = setTimeout(run, 700);
  };

  // 點 Flash／完攀／嘗試中：直接記錄；點已選的狀態就打開細節
  const quick = async (s: Status) => {
    if (!session) return toLogin();
    if (busy) return; // 上一次還在存（很快連點完攀、Flash 不會送兩次、夥伴也不會說兩次）
    if (s === status && ascent) {
      setTab("log");
      setDetails(true);
      return;
    }
    dropHp();
    // 上次記「嘗試中」、這次爬完：日期改成今天（不然分數會記到第一次嘗試那天）
    // 自己在攀爬日膠囊選過日期就照選的；已下架的路線不超過下架那天（資料庫會擋）
    const wasProject = opened.status === "project" && s !== "project";
    const day = wasProject && !dayPicked.current ? (todayYmd() > maxDate ? maxDate : todayYmd()) : date;
    const before = status;
    setStatus(s);
    setDate(day);
    const pts = rules ? ascentPoints(r.grade, r.style_tags, s, rules, s === "project" ? hp : null, total) : 0;
    // 岩友路線不算積分
    const msg =
      r.kind === "community"
        ? `已記錄：${STATUS_LABEL[s]}（岩友路線不算積分）`
        : s === "project" && total
          ? hp
            ? `已記錄：嘗試中，爬到第 ${hp} 點 +${pts} 分`
            : "已記錄：嘗試中，拉下面的桿子記錄最高爬到第幾點"
        : s === "flash"
          ? wasProject
            ? `Flash +${pts} 分（試過幾次的一般記完攀）`
            : `Flash！漂亮 +${pts} 分`
          : s === "send"
            ? `完攀 +${pts} 分`
            : "已記錄：嘗試中";
    const saved = await persist(current(s, day), msg);
    // 原岩夥伴：第一次記完攀、Flash（原本沒紀錄或嘗試中）就跳出來說一句；完攀、Flash 互換不算；岩友路線不算
    if (saved !== "failed" && s !== "project" && (before == null || before === "project") && r.kind !== "community" && session)
      void cheerSend({ userId: session.user.id, routeId: r.id, grade: r.grade, status: s, climbedOn: day || todayYmd(), queued: saved === "queued" });
  };

  // 攀爬日膠囊：還沒記錄只是先選好（按 Flash／完攀／嘗試中時用）；記過的馬上存，存不進去改回原本的日期
  const pickDay = async (d: string) => {
    dayPicked.current = true;
    const prev = date;
    setDate(d);
    if (!status || !session) return;
    dropHp();
    const saved = await persist(current(status, d), `攀爬日改成 ${md(d)}`);
    if (saved === "failed") setDate(prev);
  };

  const save = async () => {
    if (!status) return;
    dropHp();
    await persist(current(status), "已儲存紀錄");
    setDetails(false);
  };

  // 清除紀錄要按兩次：心得會一起刪掉，不能復原
  const clear = async () => {
    if (!session) return;
    if (!confirmClear) return setConfirmClear(true);
    dropHp();
    setBusy(true);
    try {
      await clearAscent(session.user.id, r.id);
      unqueue(session.user.id, r.id);
      onSaved(null);
      onClose();
      toast("已清除紀錄");
    } catch (e) {
      if (isRetryable(e) || ((e as DbError).code === "42501" && loginExpired())) {
        queueAscent({ userId: session.user.id, routeId: r.id, ascent: null });
        onSaved(null);
        onClose();
        toast("目前送不出去，連上網路後會自動清除");
      } else toast((e as Error).message);
    }
    setBusy(false);
  };

  const post = async () => {
    const body = draft.trim();
    if (!body) return toast("留言不能是空的");
    try {
      await postComment(r.id, body);
      if (session) void cheerComment(session.user.id);
      setDraft("");
      setComments(await getComments(r.id));
      toast("已送出留言");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const saveEdit = async (id: string) => {
    const body = draft.trim();
    if (!body) return toast("留言不能是空的");
    try {
      await editComment(id, body);
      setDraft("");
      setEditing(false);
      setComments(await getComments(r.id));
      toast("已更新留言");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteComment(id);
      setEditing(false);
      setComments((cs) => cs?.filter((c) => c.id !== id) ?? null);
      toast("已刪除留言");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  // 👍 先更新畫面，失敗再改回來
  const toggleLike = async (c: Comment) => {
    if (!session) return toLogin();
    const uid = session.user.id;
    const had = c.likers.includes(uid);
    const flip = (on: boolean) =>
      setComments((cs) => cs?.map((x) => (x.id === c.id ? { ...x, likers: on ? [...x.likers, uid] : x.likers.filter((u) => u !== uid) } : x)) ?? null);
    flip(!had);
    try {
      await (had ? unlikeComment(c.id) : likeComment(c.id));
    } catch (e) {
      flip(had);
      toast((e as Error).message);
    }
  };

  const toLogin = () => router.push(`/login?next=${encodeURIComponent(herePath())}`);

  // 自己的留言排第一，其他依讚數、新到舊；每人每條路線只能一則
  const uid = session?.user.id;
  const mine = comments?.find((c) => c.user_id === uid) ?? null;
  const sorted = [...(comments ?? [])].sort(
    (a, b) => Number(b.user_id === uid) - Number(a.user_id === uid) || b.likers.length - a.likers.length || b.created_at.localeCompare(a.created_at)
  );
  // 預設不開「影片」分頁：影片縮圖要下載影片開頭，點了「影片」才載入
  const shownTab = tab ?? (comments?.length ? "comment" : "log");

  return (
    <>
      {hero && (
        <div className="-mx-5 mb-3.5 bg-ink pt-[env(safe-area-inset-top,0px)]" data-testid="route-hero">
          <WallPhoto edge src={hero.src} fallback={hero.fallback} alt={hero.kind === "spray" ? `${r.name ?? "路線"}的圈圈` : hero.kind === "seq" ? `${r.code} 的 ${total} 個點` : `${zoneName} 照片，標出 ${r.code} 的起步點`}>
            {hero.kind === "spray" && !!r.holds?.length && <HoldMarks holds={r.holds} />}
            {hero.kind === "seq" && r.holds && <NumberMarks holds={r.holds} reached={status === "project" ? hp : null} />}
            {hero.kind === "pin" && <Pin x={r.pin_x} y={r.pin_y} color={r.hold_color} grade={r.grade} status={status} focus label={`${r.code} 的起步點`} />}
          </WallPhoto>
        </div>
      )}
      <SheetTitle>
        {total > 0 ? (
          <>
            <Grade grade={r.grade} className="text-num-sheet" />
            {r.code}・{total} 點
          </>
        ) : r.name ? (
          <>
            <Grade grade={r.grade} className="text-num-sheet" />
            <span className="min-w-0 break-words">{r.name}</span>
          </>
        ) : (
          <>
            <Tape color={r.hold_color} className="h-[34px]" />
            <Grade grade={r.grade} className="text-num-sheet" />
            {r.hold_color}色
          </>
        )}
      </SheetTitle>
      <SheetSub>
        {spray ? `${spray.author ?? "攀岩者"} 出的・${ago(r.created_at)}` : `${zoneName} ${r.code}・${ago(r.created_at)}設定`}
        {r.archived_at ? "・已下架" : ""}
        {r.kind === "community" && "・岩友路線不算積分"}
        {rules && r.kind !== "community" && (
          <>
            {"・"}完攀 <b className="font-num text-[16px] text-ink">{routePoints(r.grade, r.style_tags, rules)}</b> 分・Flash{" "}
            <b className="font-num text-[16px] text-ink">{ascentPoints(r.grade, r.style_tags, "flash", rules)}</b> 分
            {total > 0 && "・沒爬完照比例"}
          </>
        )}
      </SheetSub>
      <Tags tags={r.style_tags} />
      {r.setter_note && <SetterNote>{r.setter_note}</SetterNote>}
      {r.description && <SetterNote>{r.description}</SetterNote>}
      {spray && (
        <div className="mt-2 flex items-center gap-2">
          <button
            aria-pressed={spray.liked}
            onClick={spray.onLike}
            className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-note text-muted aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-bold aria-pressed:text-accent"
          >
            👍 <span className="font-num">{spray.likes}</span>
          </button>
          <span className="flex-1" />
          {spray.onEdit && (
            <button onClick={spray.onEdit} className="px-1 py-1 text-note font-bold text-accent">
              修改
            </button>
          )}
          {spray.onDelete && (
            <button onClick={spray.onDelete} className="px-1 py-1 text-note text-warn">
              {spray.deleteLabel ?? "下架"}
            </button>
          )}
        </div>
      )}

      <div className="mt-3">
        {session && <ClimbDay value={date || todayYmd()} min={minDate} max={maxDate} disabled={busy} onChange={(d) => void pickDay(d)} />}
        <StatusPicker compact value={session ? status : null} onChange={(s) => void quick(s)} />
        {session && total > 0 && status === "project" && (
          <HighpointPicker
            value={hp}
            total={total}
            onChange={pickHp}
            aside={hp && rules ? `得 ${ascentPoints(r.grade, r.style_tags, "project", rules, hp, total)} 分` : undefined}
          />
        )}
      </div>

      <Tabs
        tabs={[
          { key: "log", label: "紀錄" },
          { key: "video", label: "影片", count: videoCount ?? 0 },
          { key: "comment", label: "留言", count: commentsOpen ? (comments?.length ?? 0) : 0 },
        ]}
        value={shownTab}
        onChange={setTab}
      />

      <div role="tabpanel" hidden={shownTab !== "log"}>
        {!session ? (
          <>
            <p className="mt-0 mb-2.5 text-note text-muted">登入後點上面的按鈕就能記錄完攀，也可以寫只有自己看得到的心得。</p>
            <Button variant="primary" onClick={toLogin}>
              登入
            </Button>
          </>
        ) : !status ? (
          <p className="my-1 text-note text-muted">點上面的 Flash、完攀或嘗試中，一下就記錄好。</p>
        ) : (
          <>
            <div className="flex items-center justify-between text-note">
              <span className="text-muted">
                已記錄 <b className="text-ink">{STATUS_LABEL[status]}</b>
                {total > 0 && status === "project" && hp ? `（${hp}／${total} 點）` : ""}
              </span>
              <button onClick={() => setDetails(!details)} className="px-1 py-1 text-note font-bold text-accent">
                {details ? "收起" : "＋ 加上心得與感受"}
              </button>
            </div>
            {details && (
              <>
                {status !== "project" && (
                  <>
                    <Label>爬起來的感覺</Label>
                    <Segmented small options={FEEL} value={feel} onChange={setFeel} />
                    <Label>難度體感</Label>
                    <Segmented small options={GRADE_FEEL} value={gfeel} onChange={setGfeel} />
                  </>
                )}
                <Label htmlFor="lnote">心得</Label>
                <TextArea
                  id="lnote"
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={status === "project" ? "卡在哪一手？下次想怎麼試？" : "這條路線哪裡最有感？"}
                />
                <PrivateHint />
                <Button variant="primary" className="mt-3" disabled={busy} onClick={save}>
                  儲存
                </Button>
              </>
            )}
            {ascent && (
              <LinkButton disabled={busy} onClick={clear} className={confirmClear ? "font-bold text-warn" : ""}>
                {confirmClear ? "確定清除？心得也會一起刪掉，再按一次" : "清除紀錄"}
              </LinkButton>
            )}
          </>
        )}
      </div>

      <div role="tabpanel" hidden={shownTab !== "video"}>
        <RouteVideos route={r} gymId={gymId} open={commentsOpen} active={shownTab === "video"} staff={staff} myStatus={ascent?.status ?? null} myDay={ascent?.climbed_on ?? null} onLogin={toLogin} onCount={onVideoCount} onProfile={setProfile} />
      </div>

      <div role="tabpanel" hidden={shownTab !== "comment"}>
        {!commentsOpen ? (
          <ClosedNotice>這條路線的留言已關閉</ClosedNotice>
        ) : (
          <>
            {comments && comments.length > 0 ? (
              <>
                <CommentList scroll={comments.length >= 3}>
                  {sorted.map((c) => (
                    <CommentItem
                      key={c.id}
                      name={c.nickname}
                      avatar={<UserAvatar userId={c.user_id} />}
                      ago={ago(c.created_at)}
                      body={c.body}
                      edited={!!c.edited_at}
                      onName={() => setProfile(c.user_id)}
                      likes={c.likers.length}
                      liked={!!uid && c.likers.includes(uid)}
                      onLike={() => void toggleLike(c)}
                      onEdit={c.user_id === uid && !r.archived_at ? () => (setDraft(c.body), setEditing(true)) : undefined}
                      onDelete={session && (c.user_id === uid || staff) ? () => remove(c.id) : undefined}
                    />
                  ))}
                </CommentList>
                {comments.length >= 3 && <p className="-mt-1.5 mb-2.5 text-tiny text-muted">共 {comments.length} 則，左右滑動看更多</p>}
              </>
            ) : (
              <p className="mt-1 mb-2.5 text-note text-muted">{comments ? "還沒有人留言，分享你的 beta 吧。" : "讀取中…"}</p>
            )}
            {!r.archived_at &&
              (!session ? (
                <Button onClick={toLogin}>登入後留言</Button>
              ) : mine && !editing ? (
                <p className="my-1 text-tiny text-muted">每條路線只能留一則留言，可以按「編輯」修改，或刪除後再留。</p>
              ) : (
                <>
                  <CommentForm
                    value={draft}
                    onChange={setDraft}
                    onSubmit={mine ? () => void saveEdit(mine.id) : post}
                    submitLabel={mine ? "儲存" : "送出"}
                  />
                  {mine ? (
                    <LinkButton onClick={() => (setEditing(false), setDraft(""))}>取消編輯</LinkButton>
                  ) : (
                    <p className="mt-1.5 mb-0 text-tiny text-muted">
                      每條路線只能留一則，留言前請看<Link href="/rules" className="underline">留言與影片規範</Link>
                    </p>
                  )}
                </>
              ))}
          </>
        )}
      </div>
      <ProfileSheet userId={profile} gymId={gymId} onClose={() => setProfile(null)} />
    </>
  );
}
