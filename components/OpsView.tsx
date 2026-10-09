"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Label, TextField } from "@/components/ui/Form";
import { GrantGroup, GrantList, GrantRow } from "@/components/ui/Grant";
import { PickList } from "@/components/ui/PickList";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { canEditResets, canViewUsage } from "@/lib/auth";
import { getResetEditors, getUsageViewers, searchUsers, setResetEditor, setUsageViewer, type UserHit } from "@/lib/data";
import { GYMS } from "@/lib/gyms";

const LIVE = GYMS.filter((g) => g.live);
const gymName = (id: string) => GYMS.find((g) => g.id === id)?.name ?? "";

// 營運分頁：使用狀況、換線日（有權限的才顯示）；老闆在下面授權別人
export default function OpsView() {
  const { access } = useAuth();
  const router = useRouter();
  if (!access) return null;
  const usage = canViewUsage(access);
  // 資料庫還沒套用 step27 時（帳號資料沒有 can_edit_resets）先不顯示換線日
  const resets = access.can_edit_resets !== undefined && canEditResets(access);
  if (!usage && !resets)
    return (
      <Empty>
        營運給老闆和老闆授權的人使用。需要看使用狀況或輸入換線日，請找老闆授權給你的帳號（<b className="text-ink">{access.username}</b>）。
      </Empty>
    );
  const mine = (access.usage_gyms ?? []).map(gymName).filter(Boolean);
  return (
    <>
      {usage && <Button onClick={() => router.push("/ops/usage")}>📊 使用狀況</Button>}
      {resets && (
        <Button className="mt-2" onClick={() => router.push("/ops/resets")}>
          📅 換線日
        </Button>
      )}
      {!access.is_owner && (
        <Tip>
          老闆授權你{usage ? `看${mine.join("、")}的使用狀況` : ""}
          {usage && resets ? "、" : ""}
          {resets ? "輸入各館的換線日" : ""}。
        </Tip>
      )}
      {access.is_owner && <OpsGrants />}
    </>
  );
}

type Person = { id: string; username: string | null; nickname: string | null; resets: boolean; gyms: string[] };

// 老闆：授權別人看使用狀況（指定館）、輸入換線日（所有館）；點膠囊授權，再點一次取消
function OpsGrants() {
  const { access } = useAuth();
  const toast = useToast();
  // 資料庫還沒套用 step27／step28 時，帳號資料沒有對應的欄位：那一種權限先不顯示
  const hasResets = access?.can_edit_resets !== undefined;
  const hasUsage = access?.usage_gyms !== undefined;
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 這次打開頁面點過或搜尋到的人：權限都取消了也先留在畫面上，點錯可以馬上點回來
  const [kept, setKept] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    void Promise.all([hasResets ? getResetEditors() : [], hasUsage ? getUsageViewers() : []])
      .then(([editors, viewers]) => {
        if (!alive) return;
        const m = new Map<string, Person>();
        for (const e of editors) m.set(e.id, { id: e.id, username: e.username, nickname: e.nickname, resets: true, gyms: [] });
        for (const v of viewers)
          m.set(v.id, { ...(m.get(v.id) ?? { id: v.id, username: v.username, nickname: v.nickname, resets: false }), gyms: v.gym_ids });
        setPeople([...m.values()]);
        setError(null);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [hasResets, hasUsage, reload]);

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

  if (!hasResets && !hasUsage) return null;

  const keep = (p: Person) => setKept((k) => (k.some((x) => x.id === p.id) ? k : [...k, { ...p, resets: false, gyms: [] }]));
  // 名單：資料庫裡有權限的人＋這次點過的人（權限以資料庫為準）
  const shown = [...(people ?? []), ...kept.filter((k) => !people?.some((p) => p.id === k.id))];

  const toggle = async (p: Person, what: string, on: boolean) => {
    if (busy) return;
    const name = p.nickname ?? p.username ?? "";
    setBusy(true);
    keep(p);
    try {
      if (what === "resets") {
        await setResetEditor(p.id, on);
        toast(on ? `已授權 ${name} 輸入換線日` : `已取消 ${name} 的換線日權限`);
      } else {
        await setUsageViewer(p.id, what, on);
        toast(on ? `已授權 ${name} 看${gymName(what)}使用狀況` : `已取消 ${name} 看${gymName(what)}使用狀況`);
      }
      // 畫面馬上改成新的狀態（訊號差時名單還沒重新讀回來，馬上再點一次才會是「取消」而不是又授權一次）；之後再以資料庫為準
      setPeople((ps) => {
        const list = ps ?? [];
        const cur = list.find((x) => x.id === p.id) ?? { ...p, resets: false, gyms: [] };
        const gyms = cur.gyms.filter((g) => g !== what);
        const next = what === "resets" ? { ...cur, resets: on } : { ...cur, gyms: on ? [...gyms, what] : gyms };
        return list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? next : x)) : [...list, next];
      });
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <SectionTitle>授權</SectionTitle>
      {people == null ? (
        <Empty>{error ?? "讀取中…"}</Empty>
      ) : shown.length === 0 ? (
        <Empty>目前只有老闆可以看使用狀況、輸入換線日。</Empty>
      ) : (
        <GrantList>
          {shown.map((p) => (
            <GrantRow key={p.id} name={p.nickname ?? "（未填暱稱）"} username={p.username}>
              {hasUsage && (
                <GrantGroup label="📊 使用狀況（只看點選的館）">
                  {LIVE.map((g) => {
                    const on = p.gyms.includes(g.id);
                    return (
                      <Chip key={g.id} pressed={on} disabled={busy} onClick={() => void toggle(p, g.id, !on)}>
                        {g.name}
                      </Chip>
                    );
                  })}
                </GrantGroup>
              )}
              {hasResets && (
                <GrantGroup label="📅 換線日（所有館）">
                  <Chip pressed={p.resets} disabled={busy} onClick={() => void toggle(p, "resets", !p.resets)}>
                    可以輸入
                  </Chip>
                </GrantGroup>
              )}
            </GrantRow>
          ))}
        </GrantList>
      )}
      <SetBox>
        <Label htmlFor="osearch">新增：搜尋暱稱或帳號名稱</Label>
        <TextField
          id="osearch"
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
                tag: shown.some((p) => p.id === h.id) ? "已在名單上" : undefined,
              }))}
              onPick={(id) => {
                const h = hits.find((x) => x.id === id);
                if (h) keep({ id: h.id, username: h.username, nickname: h.nickname, resets: false, gyms: [] });
                setQuery("");
                setHits(null);
              }}
            />
          ))}
        <Tip>
          選到人之後，在上面名單點館名或「可以輸入」就授權，再點一次取消。被授權的人只會多一個「營運」分頁，不能管理路線和員工。
          {!hasUsage && "（使用狀況授權要先在 Supabase 執行 step28）"}
        </Tip>
      </SetBox>
    </>
  );
}
