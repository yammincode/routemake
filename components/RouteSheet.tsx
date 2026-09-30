"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { ClosedNotice, CommentForm, CommentItem, CommentList, PrivateHint } from "@/components/ui/Comments";
import { Label, Segmented, TextArea, TextField } from "@/components/ui/Form";
import { Grade, SetterNote, StatusPicker, Tags, Tape } from "@/components/ui/Route";
import Sheet, { SheetSection, SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { isStaffOf } from "@/lib/auth";
import { clearAscent, deleteComment, getComments, postComment, saveAscent, type Ascent, type Comment, type Route } from "@/lib/data";
import { ago, todayYmd, ymd } from "@/lib/date";
import { FEEL, GRADE_FEEL, type Status } from "@/lib/design";
import { isNetworkError, queueAscent } from "@/lib/offline";

// 路線卡片（底部彈出）：路線資訊、我的紀錄與心得、公開留言
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

  const save = async () => {
    if (!session || !status) return;
    setBusy(true);
    const a = {
      status,
      climbed_on: date || todayYmd(),
      feel: status === "project" ? null : feel,
      grade_feel: status === "project" ? null : gfeel,
      private_note: note.trim() || null,
    };
    try {
      await saveAscent(session.user.id, r.id, a);
      onSaved({ id: ascent?.id ?? "", route_id: r.id, ...a });
      onClose();
      toast(status === "flash" ? "Flash！漂亮" : "已儲存紀錄");
    } catch (e) {
      if (isNetworkError(e)) {
        queueAscent({ userId: session.user.id, routeId: r.id, ascent: a });
        onSaved({ id: ascent?.id ?? "", route_id: r.id, ...a });
        onClose();
        toast("目前沒有網路，連上後會自動送出");
      } else toast((e as Error).message);
    }
    setBusy(false);
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

  const toLogin = () => router.push(`/login?next=${encodeURIComponent(location.pathname)}`);

  return (
    <>
      <SheetTitle>
        <Tape color={r.hold_color} className="h-[34px]" />
        <Grade grade={r.grade} className="text-num-sheet" />
        {r.hold_color}色
      </SheetTitle>
      <SheetSub>
        {zoneName} {r.code}，{ago(r.created_at)}設定{r.archived_at ? "，已下架" : ""}
      </SheetSub>
      <Tags tags={r.style_tags} />
      {r.setter_note && <SetterNote>{r.setter_note}</SetterNote>}

      <SheetSection title="我的紀錄">
        {!session ? (
          <Button variant="primary" onClick={toLogin}>
            登入後記錄這條路線
          </Button>
        ) : (
          <>
            <StatusPicker value={status} onChange={setStatus} />
            {status && (
              <>
                <Label htmlFor="ldate">日期</Label>
                <TextField id="ldate" type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} />
                {status !== "project" && (
                  <>
                    <Label>爬起來的感覺</Label>
                    <Segmented options={FEEL} value={feel} onChange={setFeel} />
                    <Label>難度體感</Label>
                    <Segmented options={GRADE_FEEL} value={gfeel} onChange={setGfeel} />
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
                <Button variant="primary" className="mt-3.5" disabled={busy} onClick={save}>
                  儲存紀錄
                </Button>
                {ascent && (
                  <LinkButton disabled={busy} onClick={clear}>
                    清除紀錄
                  </LinkButton>
                )}
              </>
            )}
          </>
        )}
      </SheetSection>

      <SheetSection title="留言" aside={commentsOpen && comments ? `${comments.length} 則` : undefined}>
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
                    onDelete={session && (c.user_id === session.user.id || staff) ? () => remove(c.id) : undefined}
                  />
                ))}
              </CommentList>
            ) : (
              <p className="mt-1 mb-2.5 text-note text-muted">{comments ? "還沒有人留言，分享你的 beta 吧。" : "讀取中…"}</p>
            )}
            {!r.archived_at &&
              (session ? (
                <CommentForm value={draft} onChange={setDraft} onSubmit={post} />
              ) : (
                <Button onClick={toLogin}>登入後留言</Button>
              ))}
          </>
        )}
      </SheetSection>
    </>
  );
}
