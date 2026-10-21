"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { cardMeta, mascotIntro, topGrades } from "@/components/ProfileSheet";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Label, Rating, Segmented, TextArea, Toggle } from "@/components/ui/Form";
import { ClimberRoom } from "@/components/ui/Climber";
import { CharacterTop } from "@/components/ui/Mascot";
import { HexChart, ProfileCardView } from "@/components/ui/Profile";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import type { ClimbStats, Climber } from "@/lib/climber";
import {
  cardGyms,
  climberSupported,
  getClimbStats,
  getProfileCard,
  mascotSupported,
  saveMyCard,
  saveMyClimber,
  saveMyMascot,
  type ProfileCard,
} from "@/lib/data";
import { ABILITY_AXES, CLIMBING_YEARS } from "@/lib/design";
import { GYMS } from "@/lib/gyms";
import { rememberClimber, rememberMascot, useClimber, useMascot, useMascotMode, useTalk } from "@/lib/mascot-store";
import { DEFAULT_MASCOT, MASCOT_MODES, mascotInfo, type MascotPick } from "@/lib/mascots";

// 人物卡頁：上面是自己的人物卡（別人看到的樣子）；「👕 換裝」打開換裝室換攀岩角色和夥伴（使用者 10/21 選的 A 案）；
// 「編輯人物卡」改自我介紹、年資、常去的館、自評；預設不公開；能力值依完攀自動計算，另外可以自評 1–5
export default function MyCardEditor() {
  const { session, access } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [pub, setPub] = useState(false);
  const [bio, setBio] = useState("");
  const [years, setYears] = useState<string | null>(null);
  const [homes, setHomes] = useState<string[]>([]);
  const [self, setSelf] = useState<(number | null)[]>(ABILITY_AXES.map(() => null));
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const uid = session?.user.id;
  // 原岩夥伴、攀岩角色（step48）：在換裝室改，按「完成」才存；stats＝自己的攀岩數字（解鎖用）
  const mine = useMascot(uid, true);
  const myClimber = useClimber(uid);
  const [mode, setMode] = useMascotMode();
  const talk = useTalk();
  const [room, setRoom] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);
  const [stats, setStats] = useState<ClimbStats | null>(null);

  // 從「解鎖新款式」點過來（/card?edit=climber，已經在人物卡也一樣）：打開換裝室，網址換回 /card（重新整理、返回不會又打開）
  const editParam = useSearchParams().get("edit");
  useEffect(() => {
    if (editParam !== "climber") return;
    const t = setTimeout(() => {
      router.replace("/card");
      setRoom(true);
    }, 0);
    return () => clearTimeout(t);
  }, [editParam, router]);
  // 打開換裝室才讀攀岩數字（每次打開讀一次：剛記的完攀也算進去）
  useEffect(() => {
    if (!room || !uid) return;
    getClimbStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, [room, uid]);

  useEffect(() => {
    if (!uid) return;
    getProfileCard(uid)
      .then((c) => {
        setCard(c);
        setPub(c.public);
        setBio(c.bio ?? "");
        setYears(c.years ?? null);
        setHomes(cardGyms(c));
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
  const pick = mine ?? DEFAULT_MASCOT;
  const climber = myClimber ?? null;
  const pickPayload = (p: MascotPick) => ({ id: p.id, colors: mascotInfo(p.id).parts.map((_, i) => p.colors?.[i] ?? null), bg: p.bg ?? null });
  const multi = card.home_gyms != null;

  const save = async () => {
    if (self.some((v) => v != null) && !selfDone) return toast("自評要六項都選，或全部不選");
    setBusy(true);
    try {
      const kept = await saveMyCard({ public: pub, bio, years, home_gyms: homes, self_stats: selfDone });
      setHomes(kept);
      setCard({ ...card, public: pub, bio: bio.trim() || null, years, home_gym: kept[0] ?? null, ...(multi ? { home_gyms: kept } : {}), self_stats: selfDone });
      toast(pub ? "已儲存，人物卡已公開" : "已儲存，人物卡只有你看得到");
      setEditing(false);
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  // 換裝室按「完成」：角色、夥伴有改才存；一個存不進去另一個照樣存（還沒解鎖的款式資料庫會擋；還沒套用 step41／48 只說那一個存不了）
  const saveRoom = async (c: Climber | null, p: MascotPick) => {
    setRoomBusy(true);
    const failed: string[] = [];
    if (climberSupported() && myClimber !== undefined && JSON.stringify(c) !== JSON.stringify(myClimber)) {
      try {
        await saveMyClimber(c);
        rememberClimber(uid, c);
      } catch (e) {
        failed.push(`攀岩角色沒存到：${(e as Error).message}`);
      }
    }
    if (mine && JSON.stringify(pickPayload(p)) !== JSON.stringify(pickPayload(mine))) {
      try {
        await saveMyMascot(pickPayload(p));
        rememberMascot(uid, p);
      } catch (e) {
        failed.push(`夥伴沒存到：${(e as Error).message}`);
      }
    }
    setRoomBusy(false);
    if (failed.length) return toast(failed.join("；"));
    toast("已換好");
    setRoom(false);
  };

  const preview: ProfileCard = { ...card, years, home_gym: homes[0] ?? null, home_gyms: homes, bio: bio.trim() || null, self_stats: selfDone };
  // 常去的館可以複選：點一下選、再點一下取消，照場館順序排
  // 資料庫還沒套用 step31（人物卡沒有 home_gyms）時只能存一間：維持單選，免得畫面上選了兩間卻只存一間
  const toggleHome = (id: string) =>
    setHomes((hs) => (!multi ? (hs[0] === id ? [] : [id]) : GYMS.filter((g) => (g.id === id ? !hs.includes(id) : hs.includes(g.id))).map((g) => g.id)));

  const cardView = (
    <SetBox>
      <div className="pt-3">
        <ProfileCardView
          name={access?.nickname ?? "我"}
          top={<CharacterTop pick={pick} climber={climber} mode={mode} />}
          intro={mascotIntro(pick)}
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
      <Button variant="primary" className="mb-3" onClick={() => setRoom(true)}>
        👕 換裝（攀岩角色、夥伴）
      </Button>
      <ClimberRoom
        open={room}
        climber={climber}
        pick={pick}
        mode={mode}
        stats={stats}
        climberNote={
          !climberSupported()
            ? "資料庫還沒更新，暫時不能做攀岩角色（請老闆在 Supabase 執行 step48）。"
            : myClimber === undefined
              ? "讀取你的角色中…（要連上網路才能換角色）"
              : null
        }
        mascotOk={mascotSupported() && !!mine}
        busy={roomBusy}
        onClose={() => setRoom(false)}
        onSave={(c, p) => void saveRoom(c, p)}
      />
      <SetBox>
        <Toggle
          checked={talk.state !== "quiet"}
          onChange={(v) => talk.setQuiet(!v)}
          label="夥伴說話"
          hint={
            talk.state === "hush"
              ? "今天按了「閉嘴」，明天自動恢復"
              : "館首頁、區域頁、我的紀錄上面的泡泡、右下角的小夥伴、記錄完攀時跳出來（只有這支手機）"
          }
        />
        {talk.state === "hush" && (
          <Button className="mb-2" onClick={() => talk.setQuiet(false)}>
            讓夥伴現在說話
          </Button>
        )}
        <div className="py-3">
          夥伴風格
          <small className="mb-2 block text-meta text-muted">{MASCOT_MODES.find((m) => m.v === mode)?.hint}（只有這支手機看得到）</small>
          <Segmented small options={MASCOT_MODES} value={mode} onChange={setMode} />
        </div>
      </SetBox>
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
            <Label>{multi ? "常去的館（選填，可複選）" : "常去的館（選填）"}</Label>
            <ChipRow wrap>
              {GYMS.filter((g) => g.live).map((g) => (
                <Chip key={g.id} pressed={homes.includes(g.id)} onClick={() => toggleHome(g.id)}>
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
