"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { Label, TextField } from "@/components/ui/Form";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { isValidUsername, normalizeUsername, ROLE_NAME } from "@/lib/auth";
import { assignStaff, getStaff, lookupUser, removeStaff, type Staff } from "@/lib/data";

// 員工管理（店長、老闆）：店長只能指派定線長；店長由老闆指派
export default function StaffPanel({ gymId, gymName }: { gymId: string; gymName: string }) {
  const { access } = useAuth();
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [username, setUsername] = useState("");
  const [found, setFound] = useState<{ username: string; nickname: string | null } | null>(null);
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

  const lookup = async () => {
    setFound(null);
    if (!isValidUsername(username)) return toast("帳號名稱格式不對");
    setBusy(true);
    try {
      const u = await lookupUser(username);
      setFound({ username: normalizeUsername(username), nickname: u.nickname });
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const assign = async (role: "setter" | "manager") => {
    if (!found) return;
    setBusy(true);
    try {
      await assignStaff(found.username, gymId, role);
      toast(`已指派 ${found.nickname ?? found.username} 為${ROLE_NAME[role]}`);
      setFound(null);
      setUsername("");
      load();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const remove = async (s: Staff) => {
    setBusy(true);
    try {
      await removeStaff(s.user_id, gymId);
      toast(`已移除 ${s.nickname ?? ""}`);
      load();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
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
          {staff.map((s) => (
            <div key={s.user_id} className="flex items-center justify-between bg-surface px-4 py-3">
              <span>
                {s.nickname ?? "（未填暱稱）"}
                <small className="ml-2 text-meta text-muted">{ROLE_NAME[s.role]}</small>
              </span>
              {(owner || s.role === "setter") && s.user_id !== access?.id && (
                <button className="text-meta text-warn" disabled={busy} onClick={() => remove(s)}>
                  移除
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <SetBox>
        <Label htmlFor="staffname">新增員工：輸入對方的帳號名稱</Label>
        <div className="flex gap-2">
          <TextField
            id="staffname"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setFound(null);
            }}
            placeholder="例如 climber88"
          />
          <button className="flex-none rounded-field bg-ink px-3.5 font-bold text-surface" disabled={busy} onClick={lookup}>
            查詢
          </button>
        </div>
        {found && (
          <>
            <p className="mt-3 mb-2 text-sub">
              暱稱：<b>{found.nickname ?? "（未填暱稱）"}</b>
              <br />
              <small className="text-meta text-muted">請當面確認是本人再指派</small>
            </p>
            <Button variant="primary" disabled={busy} onClick={() => assign("setter")}>
              指派為定線長
            </Button>
            {owner && (
              <Button disabled={busy} onClick={() => assign("manager")}>
                指派為店長
              </Button>
            )}
            <LinkButton onClick={() => setFound(null)}>取消</LinkButton>
          </>
        )}
        <Tip>{owner ? "店長和定線長都可以指派。" : "店長可以指派、移除定線長；店長由老闆指派。"}</Tip>
      </SetBox>
    </>
  );
}
