"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LinkButton } from "@/components/ui/Button";
import { HexChart, ProfileCardView } from "@/components/ui/Profile";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { isManagerOf } from "@/lib/auth";
import { cardGyms, clearCardBio, getProfileCard, type ProfileCard } from "@/lib/data";
import { CLIMBING_YEARS, gradeLabel } from "@/lib/design";
import { GYMS } from "@/lib/gyms";

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

  useEffect(() => {
    getProfileCard(userId)
      .then(setCard)
      .catch((e) => setError((e as Error).message));
  }, [userId]);

  if (error) return <p className="text-note text-muted">{error}</p>;
  if (!card) return <p className="text-note text-muted">讀取中…</p>;
  const name = card.nickname ?? "攀岩者";

  if (!card.public && !card.self) {
    return <ProfileCardView name={name} meta="還沒有公開人物卡" />;
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
      meta={cardMeta(card) || (card.self && !card.public ? "人物卡目前只有你看得到" : undefined)}
      bio={card.bio}
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
    </ProfileCardView>
  );
}
