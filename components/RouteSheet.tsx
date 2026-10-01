"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import RouteVideos from "@/components/RouteVideos";
import { Button, LinkButton } from "@/components/ui/Button";
import { ClosedNotice, CommentForm, CommentItem, CommentList, PrivateHint } from "@/components/ui/Comments";
import { Label, Segmented, TextArea, TextField } from "@/components/ui/Form";
import { Grade, SetterNote, StatusPicker, Tags, Tape } from "@/components/ui/Route";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { isStaffOf } from "@/lib/auth";
import { clearAscent, deleteComment, getComments, likeComment, postComment, saveAscent, unlikeComment, type Ascent, type Comment, type Route } from "@/lib/data";
import { ago, md, todayYmd, ymd } from "@/lib/date";
import { FEEL, GRADE_FEEL, STATUS_LABEL, type Status } from "@/lib/design";
import { isNetworkError, queueAscent } from "@/lib/offline";
import { ascentPoints, routePoints } from "@/lib/scoring";
import { useScoring } from "@/lib/useScoring";

// 路線卡片（底部彈出）：上方路線資訊與一排「點一下就記錄」，下方分頁：紀錄（日期、感受、心得）、影片、留言
export default function RouteSheet({
  route,
  zoneName,
  gymId,
  gymCommentsOn,
  ascent,
  onClose,
  onSaved,
}: {
  route: Route | null;
  zoneName: string;
  gymId: string;
  gymCommentsOn: boolean;
  ascent: Ascent | null;
  onClose: () => void;
  onSaved: (a: Ascent | null) => void;
}) {
  return (
    <Sheet open={!!route} onClose={onClose}>
      {route && (
        <RouteBody
          key={route.id}
          route={route}
          zoneName={zoneName}
          gymId={gymId}
          gymCommentsOn={gymCommentsOn}
          ascent={ascent}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Sheet>
  );
}

function RouteBody({
  route: r,
  zoneName,
  gymId,
  gymCommentsOn,
  ascent,
  onClose,
  onSaved,
}: {
  route: Route;
  zoneName: string;
  gymId: string;
  gymCommentsOn: boolean;
  ascent: Ascent | null;
  onClose: () => void;
  onSaved: (a: Ascent | null) => void;
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
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"log" | "video" | "comment" | null>(null);
  const [details, setDetails] = useState(!!(ascent && (ascent.feel != null || ascent.grade_feel != null || ascent.private_note)));
  const [videoCount, setVideoCount] = useState<number | null>(null);
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
  const current = (s: Status) => ({
    status: s,
    climbed_on: date || todayYmd(),
    feel: s === "project" ? null : feel,
    grade_feel: s === "project" ? null : gfeel,
    private_note: note.trim() || null,
  });

  // 點 Flash／完攀／嘗試中：直接記錄；點已選的狀態就打開細節
  const quick = async (s: Status) => {
    if (!session) return toLogin();
    if (s === status && ascent) {
      setTab("log");
      setDetails(true);
      return;
    }
    setStatus(s);
    const pts = rules ? ascentPoints(r.grade, r.style_tags, s, rules) : 0;
    await persist(current(s), s === "flash" ? `Flash！漂亮 +${pts} 分` : s === "send" ? `完攀 +${pts} 分` : "已記錄：嘗試中");
  };

  const save = async () => {
    if (!status) return;
    await persist(current(status), "已儲存紀錄");
    setDetails(false);
  };

  const clear = async () => {
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

  const remove = async (id: string) => {
    try {
      await deleteComment(id);
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

  const toLogin = () => router.push(`/login?next=${encodeURIComponent(location.pathname)}`);

  const shownTab = tab ?? (videoCount ? "video" : comments?.length ? "comment" : "log");

  return (
    <>
      <SheetTitle>
        <Tape color={r.hold_color} className="h-[34px]" />
        <Grade grade={r.grade} className="text-num-sheet" />
        {r.hold_color}色
      </SheetTitle>
      <SheetSub>
        {zoneName} {r.code}・{ago(r.created_at)}設定{r.archived_at ? "・已下架" : ""}
        {rules && (
          <>
            {"・"}完攀 <b className="font-num text-[16px] text-ink">{routePoints(r.grade, r.style_tags, rules)}</b> 分・Flash{" "}
            <b className="font-num text-[16px] text-ink">{ascentPoints(r.grade, r.style_tags, "flash", rules)}</b> 分
          </>
        )}
      </SheetSub>
      <Tags tags={r.style_tags} />
      {r.setter_note && <SetterNote>{r.setter_note}</SetterNote>}

      <div className="mt-3">
        <StatusPicker compact value={session ? status : null} onChange={(s) => void quick(s)} />
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
                已記錄 <b className="text-ink">{STATUS_LABEL[status]}</b>・{md(date || todayYmd())}
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
              <LinkButton disabled={busy} onClick={clear}>
                清除紀錄
              </LinkButton>
            )}
          </>
        )}
      </div>

      <div role="tabpanel" hidden={shownTab !== "video"}>
        <RouteVideos route={r} gymId={gymId} open={commentsOpen} staff={staff} myStatus={ascent?.status ?? null} onLogin={toLogin} onCount={onVideoCount} />
      </div>

      <div role="tabpanel" hidden={shownTab !== "comment"}>
        {!commentsOpen ? (
          <ClosedNotice>這條路線的留言已關閉</ClosedNotice>
        ) : (
          <>
            {comments && comments.length > 0 ? (
              <CommentList>
                {comments.map((c) => (
                  <CommentItem
                    key={c.id}
                    name={c.nickname}
                    ago={ago(c.created_at)}
                    body={c.body}
                    likes={c.likers.length}
                    liked={!!session && c.likers.includes(session.user.id)}
                    onLike={() => void toggleLike(c)}
                    onDelete={session && (c.user_id === session.user.id || staff) ? () => remove(c.id) : undefined}
                  />
                ))}
              </CommentList>
            ) : (
              <p className="mt-1 mb-2.5 text-note text-muted">{comments ? "還沒有人留言，分享你的 beta 吧。" : "讀取中…"}</p>
            )}
            {!r.archived_at &&
              (session ? (
                <>
                  <CommentForm value={draft} onChange={setDraft} onSubmit={post} />
                  <p className="mt-1.5 mb-0 text-tiny text-muted">
                    留言前請看<Link href="/rules" className="underline">留言與影片規範</Link>
                  </p>
                </>
              ) : (
                <Button onClick={toLogin}>登入後留言</Button>
              ))}
          </>
        )}
      </div>
    </>
  );
}
