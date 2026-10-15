"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LinkButton } from "@/components/ui/Button";
import { CharacterTop } from "@/components/ui/Mascot";
import { HexChart, ProfileCardView } from "@/components/ui/Profile";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { isManagerOf } from "@/lib/auth";
import SuspendBox from "@/components/admin/SuspendBox";
import { cardGyms, clearCardBio, getAccountInfo, getProfileCard, NO_ACCOUNTS, type AccountInfo, type ProfileCard } from "@/lib/data";
import { md } from "@/lib/date";
import { ABILITY_AXES, CLIMBING_YEARS, gradeLabel } from "@/lib/design";
import { GYMS } from "@/lib/gyms";
import { useMascot, useTroll } from "@/lib/mascot-store";
import { mascotInfo, type MascotPick } from "@/lib/mascots";

// 最高完攀：抱石、上攀都有就一起列
export const topGrades = (c: ProfileCard) =>
  [c.top_grade, c.top_yds].filter((g): g is number => g != null).map(gradeLabel).join("・") || "–";

// 一行基本資料：年資・常去的館（好幾間照場館順序，例如「常去萬華館、中和館」）
export function cardMeta(c: ProfileCard) {
  const gyms = GYMS.filter((g) => cardGyms(c).includes(g.id)).map((g) => g.name);
  const parts = [
    CLIMBING_YEARS.find((y) => y.v === c.years)?.t && `攀岩 ${CLIMBING_YEARS.find((y) => y.v === c.years)!.t}`,
    gyms.length > 0 && `常去${gyms.join("、")}`,
  ].filter(Boolean);
  return parts.join("・");
}

// 夥伴簡介一行：「夥伴：高山猛牛（耐力）— 毛很厚…」
export const mascotIntro = (pick: MascotPick) => {
  const m = mascotInfo(pick.id);
  return `夥伴：${m.name}（${ABILITY_AXES[m.ability]}）— ${m.intro}`;
};

// 人物卡（從留言、影片點名字打開）：只有本人公開才看得到內容；沒有私訊、追蹤等聯絡功能
export default function ProfileSheet({ userId, gymId, onClose }: { userId: string | null; gymId: string; onClose: () => void }) {
  return (
    <Sheet open={!!userId} onClose={onClose}>
      {userId && <ProfileBody key={userId} userId={userId} gymId={gymId} />}
    </Sheet>
  );
}

function ProfileBody({ userId, gymId }: { userId: string; gymId: string }) {
  const { access } = useAuth();
  const toast = useToast();
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const pick = useMascot(userId);
  const [troll] = useTroll();

  useEffect(() => {
    getProfileCard(userId)
      .then(setCard)
      .catch((e) => setError((e as Error).message));
  }, [userId]);

  if (error) return <p className="text-note text-muted">{error}</p>;
  if (!card) return <p className="text-note text-muted">讀取中…</p>;
  const name = card.nickname ?? "攀岩者";

  // 角色卡上半段：夥伴（所有人都看得到，跟留言旁的頭像一樣）；還在讀先空著
  const top = <CharacterTop pick={pick} troll={troll} />;
  // 店長、老闆：人物卡下面可以停權（1A 案）；沒公開人物卡也一樣
  const staffBox = !card.self && isManagerOf(access, gymId) ? <StaffBox userId={userId} gymId={gymId} /> : null;
  if (!card.public && !card.self) {
    return (
      <ProfileCardView name={name} meta="還沒有公開人物卡" top={top}>
        {staffBox}
      </ProfileCardView>
    );
  }

  const clear = async () => {
    if (!confirm) return setConfirm(true);
    try {
      await clearCardBio(userId, gymId);
      setCard({ ...card, bio: null });
      toast("已清除自我介紹");
    } catch (e) {
      toast((e as Error).message);
    }
    setConfirm(false);
  };

  return (
    <ProfileCardView
      name={name}
      top={top}
      meta={cardMeta(card) || (card.self && !card.public ? "人物卡目前只有你看得到" : undefined)}
      bio={card.bio}
      intro={pick && mascotIntro(pick)}
      chart={<HexChart actual={card.ability} self={card.self_stats} />}
      stats={
        <>
          最高完攀 <b className="font-num text-ink">{topGrades(card)}</b>・本月完攀{" "}
          <b className="font-num text-ink">{card.month_sends ?? 0}</b> 條
          {(card.ability_sends ?? 0) === 0 && <span className="block text-tiny">完攀有風格標籤的路線後，能力值就會出現</span>}
        </>
      }
    >
      {!card.self && card.bio && isManagerOf(access, gymId) && (
        <LinkButton onClick={() => void clear()} className="text-warn">
          {confirm ? "確定清除這段自我介紹？再按一次" : "清除不當的自我介紹（店長）"}
        </LinkButton>
      )}
      {staffBox}
    </ProfileCardView>
  );
}

// 員工看別人的人物卡：留言、影片數、註冊日，和停權（資料庫還沒套用 step43 時不顯示）
function StaffBox({ userId, gymId }: { userId: string; gymId: string }) {
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    getAccountInfo(userId, gymId)
      .then(setInfo)
      .catch((e) => setError((e as Error).message));
  }, [userId, gymId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  if (error) return error === NO_ACCOUNTS ? null : <p className="mt-3 mb-0 text-meta text-muted">{error}</p>;
  if (!info) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="m-0 text-meta text-muted">
        留言 {info.comments} 則（這館 {info.comments_here}）・影片 {info.videos} 支・註冊 {md(new Date(info.created_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }))}
      </p>
      <SuspendBox key={info.suspension?.at ?? "none"} info={info} gymId={gymId} onDone={load} />
    </div>
  );
}
