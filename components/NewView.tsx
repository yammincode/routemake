"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import ProfileSheet from "@/components/ProfileSheet";
import RouteSheet, { type RouteTab } from "@/components/RouteSheet";
import { LinkButton } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Card";
import { CommentItem, CommentList } from "@/components/ui/Comments";
import { RouteTag } from "@/components/ui/Route";
import { Tabs } from "@/components/ui/Tabs";
import { VideoList, VideoRow, VideoViewer, type VideoCard } from "@/components/ui/Video";
import {
  FEED_SIZE,
  getFeedComments,
  getFeedVideos,
  getMyAscents,
  getSprayExtras,
  likeComment,
  likeRoute,
  photoUrl,
  pickFeed,
  seqPhotoUrl,
  seqTotal,
  unlikeComment,
  unlikeRoute,
  videoUrl,
  type Ascent,
  type Feed,
  type FeedComment,
  type FeedPlace,
  type FeedVideo,
} from "@/lib/data";
import { ago, dayStartIso, videoWhen } from "@/lib/date";
import { feelTagText, videoTagText } from "@/lib/design";
import { herePath } from "@/lib/nav";

// New~：大家最新分享的影片、留言（所有開放的館）
// - 今天（台北時間）的隨機排、最多 10 筆；今天不到 10 筆用之前最新的補滿
// - 今天超過 10 筆時可以「↻ 換一批」：先換成還沒看過的，看完一輪才重複
// - 影片點了全螢幕播放，「看這條路線 ›」在這頁打開那條路線的卡片（停在影片分頁）；留言「看路線 ›」打開卡片停在留言分頁
type Kind = "video" | "comment";
type Picked<T> = { feed: Feed<T>; shown: T[]; seen: Set<string> };

// 「中和館・抱石 A 區・A-03」（Spray Wall 的路線有名字就寫名字）
const placeText = (p: FeedPlace) => `${p.gym.name}・${p.zone.name}・${p.route.name || p.route.code}`;
const place = (p: FeedPlace) => <RouteTag grade={p.route.grade}>{placeText(p)}</RouteTag>;
const Heading = ({ children }: { children: ReactNode }) => <h3 className="m-0 text-meta font-bold text-muted">{children}</h3>;

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

export default function NewView() {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [kind, setKind] = useState<Kind>("video");
  const [videos, setVideos] = useState<Picked<FeedVideo> | null>(null);
  const [comments, setComments] = useState<Picked<FeedComment> | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [open, setOpen] = useState<{ place: FeedPlace; tab: RouteTab } | null>(null);
  const [ascents, setAscents] = useState<Record<string, Ascent>>({});
  const [spray, setSpray] = useState<{ routeId: string; author: string | null; likers: string[] } | null>(null);
  const [profile, setProfile] = useState<{ userId: string; gymId: string } | null>(null);

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

  const toLogin = () => router.push(`/login?next=${encodeURIComponent(herePath())}`);

  // 打開路線卡片：自己的紀錄、Spray Wall 的出題者和讚另外讀
  const openRoute = (p: FeedPlace, tab: RouteTab) => {
    setPlaying(null);
    setOpen({ place: p, tab });
    const id = p.route.id;
    if (uid && !ascents[id]) void getMyAscents([id]).then((a) => setAscents((m) => ({ ...m, ...a }))).catch(() => {});
    setSpray(null);
    if (p.zone.kind === "spray") void getSprayExtras(p.route).then((x) => setSpray({ routeId: id, ...x })).catch(() => {});
  };

  const toggleRouteLike = async () => {
    if (!session || !spray) return toLogin();
    const had = spray.likers.includes(session.user.id);
    const flip = (on: boolean) => setSpray((s) => s && { ...s, likers: on ? [...s.likers, session.user.id] : s.likers.filter((u) => u !== session.user.id) });
    flip(!had);
    try {
      await (had ? unlikeRoute(spray.routeId) : likeRoute(spray.routeId));
    } catch {
      flip(had);
    }
  };

  const toggleLike = async (c: FeedComment) => {
    if (!session) return toLogin();
    const me = session.user.id;
    const had = c.likers.includes(me);
    const flip = (on: boolean) =>
      setComments(
        (p) =>
          p && {
            ...p,
            shown: p.shown.map((x) => (x.id === c.id ? { ...x, likers: on ? [...x.likers, me] : x.likers.filter((u) => u !== me) } : x)),
          }
      );
    flip(!had);
    try {
      await (had ? unlikeComment(c.id) : likeComment(c.id));
    } catch {
      flip(had);
    }
  };

  const since = dayStartIso();
  const cards: VideoCard[] = (videos?.shown ?? []).map((v) => ({
    key: v.id,
    src: videoUrl(v.path),
    name: v.nickname,
    ago: videoWhen(v.climbed_on, v.created_at),
    caption: v.caption,
    status: v.status,
    duration: v.duration_s,
    place: place(v),
    feel: feelTagText(v.feel_tags),
    tags: videoTagText(v.height_band, v.move),
    onName: () => (setPlaying(null), setProfile({ userId: v.user_id, gymId: v.gym.id })),
  }));

  // 今天的一段、之前補上的一段；今天超過 10 筆時才有「換一批」
  function sections<T extends { id: string; created_at: string }>(p: Picked<T> | null, unit: string, row: (x: T, i: number) => ReactNode, wrap: (rows: ReactNode) => ReactNode) {
    if (!p) return <Empty>{failed ? "讀不到，請確認網路後再試" : "讀取中…"}</Empty>;
    if (!p.shown.length) return <Empty>還沒有人分享，去館內路線分享第一{unit}吧</Empty>;
    const today = p.shown.filter((x) => x.created_at >= since);
    const older = p.shown.filter((x) => x.created_at < since);
    const more = p.feed.today.length > FEED_SIZE;
    return (
      <>
        {today.length > 0 && (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Heading>
                今天新{unit === "則" ? "留言" : "分享"}（{more ? `${p.feed.today.length} ${unit}裡隨機 ${FEED_SIZE} ${unit}` : `${today.length} ${unit}`}）
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

  const o = open?.place;
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
          (_, i) => <VideoRow key={cards[i].key} v={cards[i]} onClick={() => setPlaying(i)} />,
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
        index={playing}
        onIndex={setPlaying}
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
        ascent={o ? (ascents[o.route.id] ?? null) : null}
        initialTab={open?.tab}
        onClose={() => setOpen(null)}
        onSaved={(a) =>
          setAscents((m) => {
            if (!o) return m;
            const n = { ...m };
            if (a) n[o.route.id] = a;
            else delete n[o.route.id];
            return n;
          })
        }
        spray={
          o?.zone.kind === "spray"
            ? {
                photo: photoUrl(o.zone.photo_path),
                author: spray?.author ?? null,
                likes: spray?.likers.length ?? 0,
                liked: !!uid && !!spray?.likers.includes(uid),
                onLike: () => void toggleRouteLike(),
              }
            : undefined
        }
      />
      <ProfileSheet userId={profile?.userId ?? null} gymId={profile?.gymId ?? ""} onClose={() => setProfile(null)} />
    </>
  );
}
