"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Label, TextField } from "@/components/ui/Form";
import { ResetDateRow } from "@/components/ui/Resets";
import { PickList } from "@/components/ui/PickList";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { MonthSwitcher, SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { canEditResets } from "@/lib/auth";
import {
  deleteResetEvent,
  getResetCalendar,
  getResetEditors,
  getZones,
  saveResetEvent,
  searchUsers,
  setResetEditor,
  type ResetInput,
  type UserHit,
  type Zone,
} from "@/lib/data";
import { todayYmd } from "@/lib/date";
import { GYMS, lastLiveGym } from "@/lib/gyms";
import { addDays, dayDiff, suggestLabel, type ResetEvent } from "@/lib/resets";

const LIVE = GYMS.filter((g) => g.live);
const monthRange = (ym: string) => {
  const from = `${ym}-01`;
  return { from, to: addDays(addDays(from, 31).slice(0, 7) + "-01", -1) };
};
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

type Draft = ResetInput & { id?: string; touched: boolean };

// 換線日（老闆和老闆授權的人）：照 LINE 公告每個月輸入一次
// 存檔後選館頁、行事曆、各區卡片的換線日都會跟著更新（資料庫自動填好那幾區的「下次換線日」）
export default function ResetAdmin() {
  const { ready, session, access } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [month, setMonth] = useState(() => todayYmd().slice(0, 7));
  const [gymId, setGymId] = useState(() => lastLiveGym().id);
  const [events, setEvents] = useState<ResetEvent[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = canEditResets(access);

  // 換月份時先清掉上個月的；比較慢回來的舊月份資料不要蓋掉現在這個月
  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((n) => n + 1), []);
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    const { from, to } = monthRange(month);
    void Promise.resolve().then(() => {
      setEvents(null);
      getResetCalendar(from, to)
        .then((d) => alive && setEvents(d))
        .catch((e) => alive && toast((e as Error).message));
    });
    return () => {
      alive = false;
    };
  }, [allowed, month, reload, toast]);
  useEffect(() => {
    if (!allowed) return;
    getZones(gymId)
      .then(setZones)
      .catch((e) => toast((e as Error).message));
  }, [allowed, gymId, toast]);

  if (!ready) return <Empty>讀取中…</Empty>;
  if (!session)
    return (
      <>
        <Empty>換線日由老闆統一輸入，請先登入。</Empty>
        <div className="mt-3">
          <Button variant="primary" onClick={() => router.push("/login?next=/admin/resets")}>
            登入
          </Button>
        </div>
      </>
    );
  if (!access) return <Empty>讀取中…</Empty>;
  if (!allowed) return <Empty>換線日由老闆統一輸入。需要輸入權限，請找老闆在這一頁授權給你的帳號（{access.username}）。</Empty>;

  const gymName = GYMS.find((g) => g.id === gymId)?.name ?? "";
  const mine = (events ?? []).filter((e) => e.gym_id === gymId);
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name;
  const startNew = () =>
    setDraft({ gym_id: gymId, label: "", zone_ids: [], starts_on: todayYmd(), ends_on: addDays(todayYmd(), 1), touched: false });
  const toggleZone = (id: string) =>
    setDraft((d) => {
      if (!d) return d;
      const ids = d.zone_ids.includes(id) ? d.zone_ids.filter((x) => x !== id) : [...d.zone_ids, id];
      const names = zones.filter((z) => ids.includes(z.id)).map((z) => z.name);
      return { ...d, zone_ids: ids, label: d.touched ? d.label : suggestLabel(names) };
    });

  const problem = !draft
    ? null
    : !draft.zone_ids.length
      ? "請選換線的區域"
      : !draft.label.trim()
        ? "請填名稱"
        : draft.ends_on < draft.starts_on
          ? "定線日不能早於拆線日"
          : dayDiff(draft.starts_on, draft.ends_on) > 6
            ? "一次換線最多 7 天"
            : null;

  const save = async () => {
    if (!draft || problem) return;
    setBusy(true);
    try {
      const { id, touched: _t, ...input } = draft;
      void _t;
      await saveResetEvent({ ...input, label: input.label.trim() }, id);
      toast(id ? "已修改換線日" : "已新增換線日");
      setDraft(null);
      if (input.starts_on.slice(0, 7) !== month) setMonth(input.starts_on.slice(0, 7));
      else load();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const remove = async (e: ResetEvent) => {
    if (confirmDel !== e.id) return setConfirmDel(e.id);
    setBusy(true);
    try {
      await deleteResetEvent(e.id);
      toast(`已刪除 ${e.label} 的換線日`);
      setConfirmDel(null);
      load();
    } catch (err) {
      toast((err as Error).message);
    }
    setBusy(false);
  };

  const [y, m] = month.split("-").map(Number);
  return (
    <>
      <ChipRow>
        {LIVE.map((g) => (
          <Chip key={g.id} pressed={g.id === gymId} onClick={() => (setGymId(g.id), setConfirmDel(null))}>
            {g.name}
          </Chip>
        ))}
      </ChipRow>
      <MonthSwitcher year={y} month={m} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
      {events == null ? (
        <Empty>讀取中…</Empty>
      ) : mine.length === 0 ? (
        <Empty>
          {gymName} {m} 月還沒有換線日。
        </Empty>
      ) : (
        <div className="grid gap-px overflow-hidden rounded-tile bg-line shadow-card">
          {mine.map((e) => (
            <ResetDateRow
              key={e.id}
              e={e}
              sub={e.zone_ids.map(zoneName).filter(Boolean).join("、") || "（沒有選區域）"}
              aside={
                <span className="flex flex-none flex-col items-end gap-1.5">
                  <button
                    className="text-meta text-ink underline"
                    disabled={busy}
                    onClick={() => setDraft({ id: e.id, gym_id: e.gym_id, label: e.label, zone_ids: e.zone_ids, starts_on: e.starts_on, ends_on: e.ends_on, touched: true })}
                  >
                    修改
                  </button>
                  <button className={`text-meta text-warn ${confirmDel === e.id ? "font-bold" : ""}`} disabled={busy} onClick={() => void remove(e)}>
                    {confirmDel === e.id ? "確定刪除？再按一次" : "刪除"}
                  </button>
                </span>
              }
            />
          ))}
        </div>
      )}
      <Button variant="primary" className="mt-3" onClick={startNew}>
        ＋ 新增{gymName}換線日
      </Button>
      <Tip>照 LINE 換線公告輸入。存檔後選館頁、換線行事曆、館首頁各區的換線日都會一起更新。</Tip>

      {access.is_owner && <ResetEditors />}

      <Sheet open={!!draft} onClose={() => setDraft(null)}>
        {draft && (
          <>
            <SheetTitle>{draft.id ? "修改換線日" : "新增換線日"}</SheetTitle>
            <SheetSub>{gymName}</SheetSub>
            <Label>哪幾區（可以複選）</Label>
            <div className="flex flex-wrap gap-2">
              {zones.map((z) => (
                <Chip key={z.id} pressed={draft.zone_ids.includes(z.id)} onClick={() => toggleZone(z.id)}>
                  {z.name}
                </Chip>
              ))}
            </div>
            <Label htmlFor="rlabel">名稱（選館頁和行事曆上顯示）</Label>
            <TextField id="rlabel" maxLength={20} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value, touched: true })} placeholder="例如 A 區" />
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label htmlFor="rstart">拆線日</Label>
                <TextField
                  id="rstart"
                  type="date"
                  value={draft.starts_on}
                  onChange={(e) =>
                    e.target.value &&
                    setDraft({ ...draft, starts_on: e.target.value, ends_on: draft.ends_on < e.target.value ? addDays(e.target.value, 1) : draft.ends_on })
                  }
                />
              </div>
              <div>
                <Label htmlFor="rend">定線日</Label>
                <TextField id="rend" type="date" value={draft.ends_on} onChange={(e) => e.target.value && setDraft({ ...draft, ends_on: e.target.value })} />
              </div>
            </div>
            <p className="mt-1.5 mb-0 text-tiny text-muted">定線日當天晚上起新路線；一天就換好的，兩個日期填同一天</p>
            {problem && <p className="mt-2 mb-0 text-meta text-warn">{problem}</p>}
            <Button variant="primary" className="mt-3.5" disabled={busy || !!problem} onClick={() => void save()}>
              {busy ? "儲存中…" : "儲存"}
            </Button>
            <LinkButton onClick={() => setDraft(null)}>取消</LinkButton>
          </>
        )}
      </Sheet>
    </>
  );
}

// 老闆：授權別人輸入換線日（例如負責發公告的同事）
function ResetEditors() {
  const toast = useToast();
  const [list, setList] = useState<{ id: string; username: string | null; nickname: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getResetEditors()
      .then((l) => (setList(l), setError(null)))
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // 邊打邊搜（停 0.3 秒才查）；英數至少 2 個字、中文 1 個字
  useEffect(() => {
    const q = query.trim();
    if (!q || (q.length < 2 && /^[ -~]*$/.test(q))) {
      queueMicrotask(() => setHits(null));
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      searchUsers(q, LIVE[0].id)
        .then((h) => alive && setHits(h))
        .catch((e) => alive && toast((e as Error).message));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, toast]);

  const set = async (id: string, on: boolean, name: string) => {
    if (!on && confirm !== id) return setConfirm(id);
    setBusy(true);
    try {
      await setResetEditor(id, on);
      toast(on ? `已授權 ${name} 輸入換線日` : `已取消 ${name} 的換線日權限`);
      setConfirm(null);
      setQuery("");
      setHits(null);
      load();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <SectionTitle>可以輸入換線日的人</SectionTitle>
      {list == null ? (
        <Empty>{error ?? "讀取中…"}</Empty>
      ) : list.length === 0 ? (
        <Empty>目前只有老闆可以輸入。</Empty>
      ) : (
        <div className="grid gap-px overflow-hidden rounded-tile bg-line shadow-card">
          {list.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 bg-surface px-4 py-3">
              <span className="min-w-0">
                {p.nickname ?? "（未填暱稱）"}
                <small className="ml-2 text-meta text-muted">帳號 {p.username}</small>
              </span>
              <button
                className={`flex-none text-meta text-warn ${confirm === p.id ? "font-bold" : ""}`}
                disabled={busy}
                onClick={() => void set(p.id, false, p.nickname ?? p.username ?? "")}
              >
                {confirm === p.id ? "確定取消？再按一次" : "取消權限"}
              </button>
            </div>
          ))}
        </div>
      )}
      <SetBox>
        <Label htmlFor="rsearch">授權：搜尋暱稱或帳號名稱</Label>
        <TextField
          id="rsearch"
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例如 小安 或 climber88"
        />
        {hits != null &&
          (hits.length === 0 ? (
            <p className="mt-2 mb-0 text-meta text-muted">找不到，請對方先註冊並填好暱稱</p>
          ) : (
            <PickList
              items={hits.map((h) => ({
                id: h.id,
                title: h.nickname ?? "（未填暱稱）",
                sub: `帳號 ${h.username}`,
                tag: list?.some((p) => p.id === h.id) ? "已授權" : undefined,
              }))}
              onPick={(id) => {
                const h = hits.find((x) => x.id === id);
                if (h && !list?.some((p) => p.id === id)) void set(id, true, h.nickname ?? h.username ?? "");
              }}
            />
          ))}
        <Tip>點一下就授權。被授權的人可以輸入所有館的換線日，但不能管理路線和員工。</Tip>
      </SetBox>
    </>
  );
}
