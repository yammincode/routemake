"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { cardMeta, topGrades } from "@/components/ProfileSheet";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Label, Rating, TextArea, Toggle } from "@/components/ui/Form";
import { HexChart, ProfileCardView } from "@/components/ui/Profile";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { getProfileCard, saveMyCard, type ProfileCard } from "@/lib/data";
import { ABILITY_AXES, CLIMBING_YEARS } from "@/lib/design";
import { GYMS } from "@/lib/gyms";

// 人物卡頁：上面是自己的人物卡（別人看到的樣子），按「編輯人物卡」修改；預設不公開；能力值依完攀自動計算，另外可以自評 1–5
export default function MyCardEditor() {
  const { session, access } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [pub, setPub] = useState(false);
  const [bio, setBio] = useState("");
  const [years, setYears] = useState<string | null>(null);
  const [home, setHome] = useState<string | null>(null);
  const [self, setSelf] = useState<(number | null)[]>(ABILITY_AXES.map(() => null));
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    getProfileCard(uid)
      .then((c) => {
        setCard(c);
        setPub(c.public);
        setBio(c.bio ?? "");
        setYears(c.years ?? null);
        setHome(c.home_gym ?? null);
        setSelf(c.self_stats ?? ABILITY_AXES.map(() => null));
      })
      .catch(() => setCard(null));
  }, [uid]);

  if (!uid) {
    return (
      <>
        <p className="mt-0 mb-3 text-sub text-muted">登入後可以建立自己的人物卡：自我介紹、攀岩年資，還有依完攀路線自動算出來的六角形能力表。</p>
        <Button variant="primary" onClick={() => router.push("/login?next=/card")}>
          登入
        </Button>
      </>
    );
  }
  if (!card) return <p className="text-note text-muted">讀取中…</p>;
  const selfDone = self.every((v) => v != null) ? (self as number[]) : null;

  const save = async () => {
    if (self.some((v) => v != null) && !selfDone) return toast("自評要六項都選，或全部不選");
    setBusy(true);
    try {
      await saveMyCard({ public: pub, bio, years, home_gym: home, self_stats: selfDone });
      setCard({ ...card, public: pub, bio: bio.trim() || null, years, home_gym: home, self_stats: selfDone });
      toast(pub ? "已儲存，人物卡已公開" : "已儲存，人物卡只有你看得到");
      setEditing(false);
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const preview: ProfileCard = { ...card, years, home_gym: home, bio: bio.trim() || null, self_stats: selfDone };

  const cardView = (
    <SetBox>
      <div className="pt-3">
        <ProfileCardView
          name={access?.nickname ?? "我"}
          meta={cardMeta(preview) || undefined}
          bio={preview.bio}
          chart={<HexChart actual={card.ability} self={selfDone} />}
          stats={
            <>
              最高完攀 <b className="font-num text-ink">{topGrades(card)}</b>・本月完攀 <b className="font-num text-ink">{card.month_sends ?? 0}</b> 條
              {(card.ability_sends ?? 0) === 0 && <span className="block text-tiny">完攀有風格標籤的路線後，能力值就會出現</span>}
            </>
          }
        />
      </div>
    </SetBox>
  );

  return (
    <>
      <p className="mt-0 mb-3 text-note text-muted">
        {card.public ? "🌐 公開中：別人在留言、影片點你的名字會看到這張卡" : "🔒 目前只有你看得到，打開「公開人物卡」別人才看得到"}
      </p>
      {cardView}
      {!editing ? (
        <Button className="mt-3" onClick={() => setEditing(true)}>
          編輯人物卡
        </Button>
      ) : (
        <>
          <SectionTitle>編輯人物卡</SectionTitle>
          <SetBox>
            <Toggle checked={pub} onChange={setPub} label="公開人物卡" hint="關閉時，別人點你的名字只看得到暱稱" />
            <Label htmlFor="cbio">自我介紹（最多 60 字）</Label>
            <TextArea id="cbio" maxLength={60} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="例如：喜歡動態路線，正在練指力" />
            <p className="mt-1 mb-0 text-tiny text-muted">不能放聯絡方式（網址、電話、LINE、IG 等）。這不是交友功能，App 沒有私訊。</p>
            <Label>攀岩年資</Label>
            <ChipRow>
              {CLIMBING_YEARS.map((y) => (
                <Chip key={y.v} pressed={years === y.v} onClick={() => setYears(years === y.v ? null : y.v)}>
                  {y.t}
                </Chip>
              ))}
            </ChipRow>
            <Label>常去的館（選填）</Label>
            <ChipRow>
              {GYMS.filter((g) => g.live).map((g) => (
                <Chip key={g.id} pressed={home === g.id} onClick={() => setHome(home === g.id ? null : g.id)}>
                  {g.name}
                </Chip>
              ))}
            </ChipRow>
            <Label>自評能力（1–5 分，選填）</Label>
            {ABILITY_AXES.map((a, i) => (
              <Rating key={a} label={a} value={self[i]} onChange={(v) => setSelf((s) => s.map((x, j) => (j === i ? v : x)))} />
            ))}
            <Button variant="primary" className="mt-3" disabled={busy} onClick={save}>
              儲存人物卡
            </Button>
          </SetBox>
          <p className="mt-2 text-tiny text-muted">上面的人物卡會即時預覽。實心是依你的完攀路線自動算的，虛線是自評。</p>
        </>
      )}
      <p className="mt-3 text-tiny text-muted">
        人物卡規則請看<Link href="/rules" className="underline">留言與影片規範</Link>
      </p>
    </>
  );
}
