"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import ProfileSheet from "@/components/ProfileSheet";
import RouteVideos from "@/components/RouteVideos";
import { Button, LinkButton } from "@/components/ui/Button";
import { HighpointPicker, NumberMarks } from "@/components/ui/Endurance";
import { ClosedNotice, CommentForm, CommentItem, CommentList, PrivateHint } from "@/components/ui/Comments";
import { Label, Segmented, TextArea, TextField } from "@/components/ui/Form";
import { Grade, SetterNote, StatusPicker, Tags, Tape } from "@/components/ui/Route";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";
import { HoldMarks } from "@/components/ui/Spray";
import { useToast } from "@/components/ui/Toast";
import { WallPhoto } from "@/components/ui/Wall";
import { isStaffOf } from "@/lib/auth";
import {
  clearAscent,
  deleteComment,
  editComment,
  getComments,
  likeComment,
  postComment,
  saveAscent,
  seqTotal,
  unlikeComment,
  type Ascent,
  type Comment,
  type Route,
} from "@/lib/data";
import { ago, md, todayYmd, ymd } from "@/lib/date";
import { FEEL, GRADE_FEEL, STATUS_LABEL, type Status } from "@/lib/design";
import { herePath } from "@/lib/nav";
import { isNetworkError, queueAscent } from "@/lib/offline";
import { ascentPoints, routePoints } from "@/lib/scoring";
import { useScoring } from "@/lib/useScoring";

// 路線卡片（底部彈出）：上方路線資訊與一排「點一下就記錄」，下方分頁：紀錄（日期、感受、心得）、影片、留言
// photo：區域照片（長耐力路線在卡片上畫出全部的點）
export default function RouteSheet({
  route,
  photo,
  zoneName,
  gymId,
  gymCommentsOn,
  ascent,
  onClose,
  onSaved,
  spray,
}: {
  route: Route | null;
  photo?: string | null;
  zoneName: string;
  gymId: string;
  gymCommentsOn: boolean;
  ascent: Ascent | null;
  onClose: () => void;
  onSaved: (a: Ascent | null) => void;
  spray?: SprayExtras;
}) {
  return (
    <Sheet open={!!route} onClose={onClose}>
      {route && (
        <RouteBody
          key={route.id}
          route={route}
          photo={photo ?? null}
          zoneName={zoneName}
          gymId={gymId}
          gymCommentsOn={gymCommentsOn}
          ascent={ascent}
          onClose={onClose}
          onSaved={onSaved}
          spray={spray}
        />
      )}
    </Sheet>
  );
}

// Spray Wall 路線額外的內容：公版照片（顯示這條路線的圈圈）、出題者、讚、修改／刪除
export type SprayExtras = {
  photo: string | null;
  author: string | null;
  likes: number;
  liked: boolean;
  onLike: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  deleteLabel?: string; // 本人「刪除」、員工「下架」
};

function RouteBody({
  route: r,
  photo,
  zoneName,
  gymId,
  gymCommentsOn,
  ascent,
  onClose,
  onSaved,
  spray,
}: {
  route: Route;
  photo: string | null;
  zoneName: string;
  gymId: string;
  gymCommentsOn: boolean;
  ascent: Ascent | null;
  onClose: () => void;
  onSaved: (a: Ascent | null) => void;
  spray?: SprayExtras;
}) {
  const { session, access } = useAuth();
  const rules = useScoring();
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(ascent?.status ?? null);
  const [date, setDate] = useState(ascent?.climbed_on ?? todayYmd());
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
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"log" | "video" | "comment" | null>(null);
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

  const persist = async (a: Omit<Ascent, "id" | "route_id">, msg: string) => {
    if (!session) return;
    setBusy(true);
    try {
      await saveAscent(session.user.id, r.id, a);
      onSaved({ id: ascent?.id ?? "", route_id: r.id, ...a });
      toast(msg);
    } catch (e) {
      if (isNetworkError(e)) {
        queueAscent({ userId: session.user.id, routeId: r.id, ascent: a });
        onSaved({ id: ascent?.id ?? "", route_id: r.id, ...a });
        toast("目前沒有網路，連上後會自動送出");
      } else toast((e as Error).message);
    }
    setBusy(false);
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
  const pickHp = (v: number) => {
    setHp(v);
    if (hpTimer.current) clearTimeout(hpTimer.current);
    // 爬得比上次高：日期改成今天（分數算在進步那天）；自己改過日期就照改的
    const better = v > (opened.hp ?? 0) && date === opened.date;
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
    if (s === status && ascent) {
      setTab("log");
      setDetails(true);
      return;
    }
    // 上次記「嘗試中」、這次爬完：日期改成今天（不然分數會記到第一次嘗試那天）
    // 自己改過日期就照改的；已下架的路線不超過下架那天（資料庫會擋）
    const wasProject = opened.status === "project" && s !== "project";
    const day = wasProject && date === opened.date ? (todayYmd() > maxDate ? maxDate : todayYmd()) : date;
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
    await persist(current(s, day), msg);
  };

  const save = async () => {
    if (!status) return;
    await persist(current(status), "已儲存紀錄");
    setDetails(false);
  };

  // 清除紀錄要按兩次：心得會一起刪掉，不能復原
  const clear = async () => {
    if (!confirmClear) return setConfirmClear(true);
    setBusy(true);
    try {
      await clearAscent(r.id);
      onSaved(null);
      onClose();
      toast("已清除紀錄");
    } catch (e) {
      if (isNetworkError(e) && session) {
        queueAscent({ userId: session.user.id, routeId: r.id, ascent: null });
        onSaved(null);
        onClose();
        toast("目前沒有網路，連上後會自動清除");
      } else toast((e as Error).message);
    }
    setBusy(false);
  };

  const post = async () => {
    const body = draft.trim();
    if (!body) return toast("留言不能是空的");
    try {
      await postComment(r.id, body);
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
      {spray?.photo && r.holds && (
        <WallPhoto src={spray.photo} alt={`${r.name ?? "路線"}的圈圈`}>
          <HoldMarks holds={r.holds} />
        </WallPhoto>
      )}
      {total > 0 && photo && r.holds && (
        <WallPhoto src={photo} alt={`${r.code} 的 ${total} 個點`}>
          <NumberMarks holds={r.holds} reached={status === "project" ? hp : null} />
        </WallPhoto>
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
                {total > 0 && status === "project" && hp ? `（${hp}／${total} 點）` : ""}・{md(date || todayYmd())}
              </span>
              <button onClick={() => setDetails(!details)} className="px-1 py-1 text-note font-bold text-accent">
                {details ? "收起" : "＋ 加上心得與感受"}
              </button>
            </div>
            {details && (
              <>
                <Label htmlFor="ldate">日期</Label>
                <TextField id="ldate" type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} />
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
        <RouteVideos route={r} gymId={gymId} open={commentsOpen} active={shownTab === "video"} staff={staff} myStatus={ascent?.status ?? null} onLogin={toLogin} onCount={onVideoCount} onProfile={setProfile} />
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
