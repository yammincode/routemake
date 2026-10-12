"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import ProfileSheet from "@/components/ProfileSheet";
import RouteSheet, { type RouteTab } from "@/components/RouteSheet";
import { Button, LinkButton } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Card";
import { CommentItem, CommentList } from "@/components/ui/Comments";
import { RouteTag } from "@/components/ui/Route";
import { SheetSub } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { VideoList, VideoRow, VideoViewer, type VideoCard } from "@/components/ui/Video";
import {
  FEED_SIZE,
  getComments,
  getFeedComments,
  getFeedVideos,
  getMyAscents,
  getSprayExtras,
  getVideos,
  likeComment,
  likeRoute,
  photoUrl,
  pickFeed,
  seqPhotoUrl,
  seqTotal,
  unlikeComment,
  unlikeRoute,
  videoThumbUrl,
  videoUrl,
  type Ascent,
  type DbError,
  type Feed,
  type FeedComment,
  type FeedPlace,
  type FeedVideo,
} from "@/lib/data";
import { ago, dayStartIso, videoWhen } from "@/lib/date";
import { feelTagText, videoTagText } from "@/lib/design";
import { herePath } from "@/lib/nav";
import { overlayPending } from "@/lib/offline";
import { loginExpired } from "@/lib/supabase";

// New~：大家最新分享的影片、留言（所有開放的館）
// - 今天（台北時間）的隨機排、最多 10 筆；今天不到 10 筆用之前最新的補滿
// - 今天超過 10 筆時可以「↻ 換一批」：先換成還沒看過的，看完一輪才重複
// - 影片點了全螢幕播放，「看這條路線 ›」在這頁打開那條路線的卡片（停在影片分頁）；留言「看路線 ›」打開卡片停在留言分頁
// - 卡片馬上打開；自己的紀錄讀到之前先寫「讀取中…」，讀到才顯示記錄按鈕（不然再點一次狀態會蓋掉原本的心得和日期）
type Kind = "video" | "comment";
type Picked<T> = { feed: Feed<T>; shown: T[]; seen: Set<string> };
// Spray Wall 的出題者和讚（讀不到時 failed）
type SprayInfo = { routeId: string; author: string | null; likers: string[] } | { routeId: string; failed: true };

// 「中和館・抱石 A 區・A-03」（Spray Wall 的路線有名字就寫名字）
const placeText = (p: FeedPlace) => `${p.gym.name}・${p.zone.name}・${p.route.name || p.route.code}`;
const place = (p: FeedPlace) => <RouteTag grade={p.route.grade}>{placeText(p)}</RouteTag>;
const Heading = ({ children }: { children: ReactNode }) => <h3 className="m-0 text-meta font-bold text-muted">{children}</h3>;
const already = (e: unknown) => (e as DbError).code === "23505"; // 已經按過讚（別的分頁按的）

function start<T extends { id: string }>(feed: Feed<T>): Picked<T> {
  const shown = pickFeed(feed);
  return { feed, shown, seen: new Set(shown.map((x) => x.id)) };
}
// 換一批：今天的都看過一輪了就重新來
function next<T extends { id: string }>(p: Picked<T>): Picked<T> {
  const seen = p.feed.today.every((x) => p.seen.has(x.id)) ? new Set<string>() : p.seen;
  const shown = pickFeed(p.feed, seen);
  return { feed: p.feed, shown, seen: new Set([...seen, ...shown.map((x) => x.id)]) };
}
// 改列表裡的項目：今天、之前、正在顯示的三份一起改（換一批後才不會變回舊的）；f 回傳 null 就拿掉
function edit<T extends { id: string }>(p: Picked<T>, f: (x: T) => T | null): Picked<T> {
  const m = (xs: T[]) => xs.flatMap((x) => f(x) ?? []);
  return { ...p, feed: { today: m(p.feed.today), older: m(p.feed.older) }, shown: m(p.shown) };
}
// 關掉卡片後，用重讀的這條路線的留言或影片更新列表：改過的換新、刪掉的拿掉，順序和分段不變
function syncRoute<T extends FeedPlace & { id: string }, F extends { id: string }>(p: Picked<T>, routeId: string, fresh: F[], merge: (x: T, n: F) => T): Picked<T> {
  const byId = new Map(fresh.map((n) => [n.id, n]));
  return edit(p, (x) => {
    if (x.route.id !== routeId) return x;
    const n = byId.get(x.id);
    return n ? merge(x, n) : null;
  });
}

export default function NewView() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [kind, setKind] = useState<Kind>("video");
  const [videos, setVideos] = useState<Picked<FeedVideo> | null>(null);
  const [comments, setComments] = useState<Picked<FeedComment> | null>(null);
  const [failed, setFailed] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null); // 記影片 id，列表更新時不會跳到別支
  const [open, setOpen] = useState<{ place: FeedPlace; tab: RouteTab } | null>(null);
  // 自己的紀錄：讀過的路線記起來（null＝沒有紀錄），換帳號就重讀
  const [mine, setMine] = useState<{ uid: string; map: Record<string, Ascent | null> } | null>(null);
  const [readFailed, setReadFailed] = useState<string | null>(null); // 讀不到的那一次（帳號:路線:第幾次）
  const [readTry, setReadTry] = useState(0);
  const [spray, setSpray] = useState<SprayInfo | null>(null);
  const [sprayTry, setSprayTry] = useState(0);
  const [profile, setProfile] = useState<{ userId: string; gymId: string } | null>(null);
  const liking = useRef(new Set<string>()); // 正在送出讚的留言：重讀列表時保留手機上的讚
  const syncSeq = useRef<Record<string, number>>({}); // 每條路線最後一次重讀，舊的回來晚了不用
  const staleOpen = useRef<string | null>(null); // 打開時離線紀錄送出了：這條關掉後要重讀

  useEffect(() => {
    let live = true;
    Promise.all([getFeedVideos(), getFeedComments()])
      .then(([v, c]) => {
        if (!live) return;
        setVideos(start(v));
        setComments(start(c));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const o = open?.place ?? null;
  const routeId = o?.route.id ?? null;
  const known = !uid || (!!routeId && mine?.uid === uid && routeId in mine.map);
  const readKey = `${uid}:${routeId}:${readTry}`;

  // 打開卡片時讀自己在這條路線的紀錄（關掉、換路線、換帳號就不用舊的回覆）
  useEffect(() => {
    if (!routeId || !uid || known) return;
    let live = true;
    getMyAscents([routeId])
      .then((a) => {
        if (loginExpired()) throw new Error("登入過期"); // 登入過期又換新失敗時，讀到的是空的，不能當成沒有紀錄
        if (live) setMine((m) => ({ uid, map: { ...(m?.uid === uid ? m.map : {}), [routeId]: overlayPending(a, uid)[routeId] ?? null } }));
      })
      .catch(() => live && setReadFailed(readKey));
    return () => {
      live = false;
    };
  }, [routeId, uid, known, readKey]);

  // 離線的紀錄送出（或被退回）後，記住的紀錄可能不對了：下次打開再讀（正打開的那條等關掉）
  useEffect(() => {
    const reset = () => {
      staleOpen.current = routeId;
      setMine((m) => m && { ...m, map: routeId && routeId in m.map ? { [routeId]: m.map[routeId] } : {} });
    };
    window.addEventListener("routemake:synced", reset);
    return () => window.removeEventListener("routemake:synced", reset);
  }, [routeId]);

  // Spray Wall 的路線：出題者和讚另外讀
  const sprayRoute = o?.zone.kind === "spray" ? o.route : null;
  useEffect(() => {
    if (!sprayRoute) return;
    let live = true;
    const id = sprayRoute.id;
    getSprayExtras(sprayRoute)
      .then((x) => live && setSpray({ routeId: id, ...x }))
      .catch(() => live && setSpray({ routeId: id, failed: true }));
    return () => {
      live = false;
    };
  }, [sprayRoute, sprayTry]);

  const toLogin = () => router.push(`/login?next=${encodeURIComponent(herePath())}`);

  // 每次打開都重新開始：先寫讀取中（不顯示上次讀不到的訊息）；Spray Wall 的讚等讀到最新的才能按
  const openRoute = (p: FeedPlace, tab: RouteTab) => {
    setPlayingId(null);
    setReadFailed(null);
    setSpray(null);
    setOpen({ place: p, tab });
  };

  // 關掉卡片：重讀這條路線的留言和影片（卡片裡按的讚、改的留言、刪的影片）
  const closeRoute = () => {
    setOpen(null);
    if (!routeId) return;
    if (staleOpen.current === routeId) {
      staleOpen.current = null;
      setMine((m) => {
        if (!m) return m;
        const map = { ...m.map };
        delete map[routeId];
        return { ...m, map };
      });
    }
    const seq = (syncSeq.current[routeId] ?? 0) + 1;
    syncSeq.current[routeId] = seq;
    const latest = () => syncSeq.current[routeId] === seq;
    void getComments(routeId)
      .then((cs) => latest() && setComments((p) => p && syncRoute(p, routeId, cs, (x, n) => ({ ...x, ...n, likers: liking.current.has(x.id) ? x.likers : n.likers }))))
      .catch(() => {});
    void getVideos(routeId)
      .then((vs) => latest() && setVideos((p) => p && syncRoute(p, routeId, vs, (x, n) => ({ ...x, ...n }))))
      .catch(() => {});
  };

  const sp = o && spray?.routeId === o.route.id ? spray : null;
  const toggleRouteLike = async () => {
    if (!session) return toLogin();
    if (!sp) return toast("讀取中，請稍後再按");
    if ("failed" in sp) {
      setSpray(null);
      setSprayTry((t) => t + 1);
      return toast("讀不到讚數，請確認網路後再試");
    }
    const me = session.user.id;
    const id = sp.routeId;
    const had = sp.likers.includes(me);
    const flip = (on: boolean) =>
      setSpray((x) => (x && x.routeId === id && !("failed" in x) ? { ...x, likers: on ? [...x.likers.filter((u) => u !== me), me] : x.likers.filter((u) => u !== me) } : x));
    flip(!had);
    try {
      await (had ? unlikeRoute(id) : likeRoute(id));
    } catch (e) {
      if (already(e)) return;
      flip(had);
      toast((e as Error).message);
    }
  };

  const toggleLike = async (c: FeedComment) => {
    if (!session) return toLogin();
    const me = session.user.id;
    const had = c.likers.includes(me);
    const flip = (on: boolean) =>
      setComments((p) => p && edit(p, (x) => (x.id === c.id ? { ...x, likers: on ? [...x.likers.filter((u) => u !== me), me] : x.likers.filter((u) => u !== me) } : x)));
    flip(!had);
    liking.current.add(c.id);
    try {
      await (had ? unlikeComment(c.id) : likeComment(c.id));
    } catch (e) {
      if (!already(e)) {
        flip(had);
        toast((e as Error).message);
      }
    } finally {
      liking.current.delete(c.id);
    }
  };

  const since = dayStartIso();
  const cards: VideoCard[] = (videos?.shown ?? []).map((v) => ({
    key: v.id,
    src: videoUrl(v.path),
    thumb: v.thumb_path ? videoThumbUrl(v.thumb_path) : null,
    name: v.nickname,
    ago: videoWhen(v.climbed_on, v.created_at),
    caption: v.caption,
    status: v.status,
    duration: v.duration_s,
    place: place(v),
    feel: feelTagText(v.feel_tags),
    tags: videoTagText(v.height_band, v.move),
    onName: () => (setPlayingId(null), setProfile({ userId: v.user_id, gymId: v.gym.id })),
  }));
  const playing = playingId ? cards.findIndex((c) => c.key === playingId) : -1;

  // 今天的一段、之前補上的一段；今天超過 10 筆時才有「換一批」
  function sections<T extends { id: string; created_at: string }>(p: Picked<T> | null, unit: string, row: (x: T, i: number) => ReactNode, wrap: (rows: ReactNode) => ReactNode) {
    if (!p) return <Empty>{failed ? "讀不到，請確認網路後再試" : "讀取中…"}</Empty>;
    if (!p.shown.length) return <Empty>還沒有人分享，去館內路線分享第一{unit}吧</Empty>;
    const today = p.shown.filter((x) => x.created_at >= since);
    const older = p.shown.filter((x) => x.created_at < since);
    const more = p.feed.today.length > today.length; // 今天還有沒顯示的（在卡片裡刪掉一則後也一樣）
    return (
      <>
        {today.length > 0 && (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Heading>
                今天新{unit === "則" ? "留言" : "分享"}（{more ? `${p.feed.today.length} ${unit}裡隨機 ${today.length} ${unit}` : `${today.length} ${unit}`}）
              </Heading>
              {more && (
                <LinkButton onClick={() => (kind === "video" ? setVideos((x) => x && next(x)) : setComments((x) => x && next(x)))}>↻ 換一批</LinkButton>
              )}
            </div>
            {wrap(today.map((x) => row(x, p.shown.indexOf(x))))}
          </>
        )}
        {older.length > 0 && (
          <>
            <div className={`mb-2 ${today.length ? "mt-5" : ""}`}>
              <Heading>{today.length ? `今天不到 ${FEED_SIZE} ${unit}，補上最近的` : unit === "則" ? "最近的留言" : "最近分享的"}</Heading>
            </div>
            {wrap(older.map((x) => row(x, p.shown.indexOf(x))))}
          </>
        )}
      </>
    );
  }

  // 還沒讀到自己的紀錄：先寫讀取中；讀不到可以再試
  const pending =
    o && !known ? (
      <>
        <SheetSub>{placeText(o)}</SheetSub>
        {readFailed === readKey ? (
          <>
            <Empty>讀不到你在這條路線的紀錄，請確認網路後再試</Empty>
            <Button className="mt-3" onClick={() => setReadTry((t) => t + 1)}>
              再試一次
            </Button>
          </>
        ) : (
          <Empty>讀取中…</Empty>
        )}
      </>
    ) : undefined;

  return (
    <>
      <Tabs
        tabs={[
          { key: "video", label: "影片" },
          { key: "comment", label: "留言" },
        ]}
        value={kind}
        onChange={(k: Kind) => setKind(k)}
      />
      <div role="tabpanel" hidden={kind !== "video"}>
        {sections(
          videos,
          "支",
          (v, i) => <VideoRow key={v.id} v={cards[i]} onClick={() => setPlayingId(v.id)} />,
          (rows) => <VideoList>{rows}</VideoList>
        )}
      </div>
      <div role="tabpanel" hidden={kind !== "comment"}>
        {sections(
          comments,
          "則",
          (c) => (
            <CommentItem
              key={c.id}
              name={c.nickname}
              ago={ago(c.created_at)}
              body={c.body}
              edited={!!c.edited_at}
              clamp
              onName={() => setProfile({ userId: c.user_id, gymId: c.gym.id })}
              likes={c.likers.length}
              liked={!!uid && c.likers.includes(uid)}
              onLike={() => void toggleLike(c)}
              place={place(c)}
              onOpen={() => openRoute(c, "comment")}
            />
          ),
          (rows) => <CommentList>{rows}</CommentList>
        )}
      </div>

      <VideoViewer
        items={cards}
        index={playing < 0 ? null : playing}
        onIndex={(i) => setPlayingId(i == null ? null : (cards[i]?.key ?? null))}
        actions={(i) => (
          <button onClick={() => videos && openRoute(videos.shown[i], "video")} className="text-sub font-bold text-white">
            看這條路線 ›
          </button>
        )}
      />
      <RouteSheet
        route={o?.route ?? null}
        photo={o && seqTotal(o.route) ? seqPhotoUrl(o.route, o.zone.photo_path) : null}
        zoneName={o ? `${o.gym.name} ${o.zone.name}` : ""}
        gymId={o?.gym.id ?? ""}
        gymCommentsOn={o?.gym.comments_enabled ?? true}
        ascent={o && uid && mine?.uid === uid ? (mine.map[o.route.id] ?? null) : null}
        pending={pending}
        initialTab={open?.tab}
        onClose={closeRoute}
        onSaved={(a) => setMine((m) => (m && o && m.uid === uid ? { ...m, map: { ...m.map, [o.route.id]: a } } : m))}
        spray={
          o?.zone.kind === "spray"
            ? {
                photo: photoUrl(o.zone.photo_path),
                author: sp && !("failed" in sp) ? sp.author : null,
                likes: sp && !("failed" in sp) ? sp.likers.length : 0,
                liked: !!uid && !!sp && !("failed" in sp) && sp.likers.includes(uid),
                onLike: () => void toggleRouteLike(),
              }
            : undefined
        }
      />
      <ProfileSheet userId={profile?.userId ?? null} gymId={profile?.gymId ?? ""} onClose={() => setProfile(null)} />
    </>
  );
}
