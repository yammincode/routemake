"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { Label, TextField } from "@/components/ui/Form";
import { PickList } from "@/components/ui/PickList";
import { SetBox } from "@/components/ui/Stats";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { ROLE_NAME, type Role } from "@/lib/auth";
import { assignStaffUser, getStaff, removeStaff, searchUsers, type Staff, type UserHit } from "@/lib/data";

// 員工管理（店長、老闆）：用暱稱或帳號搜尋 → 點一下選人 → 選角色 → 指派；列表上可以直接改角色、移除
// 店長只能指派、移除定線長；店長由老闆指派
export default function StaffPanel({ gymId, gymName }: { gymId: string; gymName: string }) {
  const { access } = useAuth();
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[] | null>(null);
  const [picked, setPicked] = useState<UserHit | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null); // 移除要按兩次
  const [role, setRole] = useState<Role>("setter");
  const [busy, setBusy] = useState(false);
  const owner = !!access?.is_owner;

  const load = useCallback(() => {
    getStaff(gymId)
      .then(setStaff)
      .catch((e) => toast((e as Error).message));
  }, [gymId, toast]);

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
      searchUsers(q, gymId)
        .then((h) => alive && setHits(h))
        .catch((e) => alive && toast((e as Error).message));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, gymId, toast]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      load();
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    if (!picked) return;
    const r = owner ? role : "setter";
    const ok = await run(() => assignStaffUser(picked.id, gymId, r), `已指派 ${picked.nickname ?? picked.username} 為${gymName}${ROLE_NAME[r]}`);
    if (ok) {
      setPicked(null);
      setQuery("");
      setHits(null);
    }
  };

  return (
    <>
      <SectionTitle>{gymName}員工</SectionTitle>
      {staff == null ? (
        <Empty>讀取中…</Empty>
      ) : staff.length === 0 ? (
        <Empty>還沒有指派員工。</Empty>
      ) : (
        <div className="grid gap-px overflow-hidden rounded-tile bg-line shadow-card">
          {staff.map((s) => {
            const editable = (owner || s.role === "setter") && s.user_id !== access?.id;
            const other: Role = s.role === "setter" ? "manager" : "setter";
            return (
              <div key={s.user_id} className="flex items-center justify-between gap-2 bg-surface px-4 py-3">
                <span className="min-w-0">
                  {s.nickname ?? "（未填暱稱）"}
                  <small className="ml-2 text-meta text-muted">{ROLE_NAME[s.role]}</small>
                </span>
                {editable && (
                  <span className="flex flex-none gap-3">
                    {owner && (
                      <button
                        className="text-meta text-ink underline"
                        disabled={busy}
                        onClick={() => void run(() => assignStaffUser(s.user_id, gymId, other), `已把 ${s.nickname ?? ""} 改成${ROLE_NAME[other]}`)}
                      >
                        改成{ROLE_NAME[other]}
                      </button>
                    )}
                    <button
                      className={`text-meta text-warn ${confirmRemove === s.user_id ? "font-bold" : ""}`}
                      disabled={busy}
                      onClick={() =>
                        confirmRemove === s.user_id
                          ? void run(() => removeStaff(s.user_id, gymId), `已移除 ${s.nickname ?? ""}`).then(() => setConfirmRemove(null))
                          : setConfirmRemove(s.user_id)
                      }
                    >
                      {confirmRemove === s.user_id ? "確定移除？再按一次" : "移除"}
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <SetBox>
        <Label htmlFor="staffsearch">新增員工：搜尋暱稱或帳號名稱</Label>
        <TextField
          id="staffsearch"
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
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
                tag: h.role ? `已是${ROLE_NAME[h.role]}` : undefined,
              }))}
              value={picked?.id}
              onPick={(id) => setPicked(hits.find((h) => h.id === id) ?? null)}
            />
          ))}
        {picked && (
          <div className="mt-3">
            <p className="mt-0 mb-1 text-sub">
              要指派：<b>{picked.nickname ?? picked.username}</b>
              <small className="ml-2 text-meta text-muted">帳號 {picked.username}</small>
            </p>
            {owner && (
              <Tabs
                tabs={[
                  { key: "setter", label: "定線長" },
                  { key: "manager", label: "店長" },
                ]}
                value={role}
                onChange={setRole}
              />
            )}
            <Button variant="primary" disabled={busy} onClick={() => void assign()}>
              指派為{gymName}
              {ROLE_NAME[owner ? role : "setter"]}
            </Button>
            <LinkButton onClick={() => setPicked(null)}>取消</LinkButton>
            <small className="block text-meta text-muted">請當面確認是本人再指派</small>
          </div>
        )}
        <Tip>{owner ? "店長和定線長都可以指派；列表上可以直接改角色或移除。" : "店長可以指派、移除定線長；店長由老闆指派。"}</Tip>
      </SetBox>
    </>
  );
}
