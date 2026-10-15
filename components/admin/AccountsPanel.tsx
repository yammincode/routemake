"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import SuspendBox from "@/components/admin/SuspendBox";
import { AccountSummary, ResetCodeBox, SuspendedLine, ToggleButton } from "@/components/ui/Account";
import { Button, LinkButton } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { Label, TextField } from "@/components/ui/Form";
import { UserAvatar } from "@/components/ui/Mascot";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { isManagerOf } from "@/lib/auth";
import {
  cancelResetCode,
  deleteComment,
  deleteUser,
  getAccountComments,
  getSuspendedAccounts,
  issueResetCode,
  NO_ACCOUNTS,
  searchAccounts,
  type AccountComment,
  type AccountInfo,
  type ResetCode,
} from "@/lib/data";
import { ago, md } from "@/lib/date";

type Mode = "comments" | "suspend" | "reset" | "delete";
const taipeiDay = (ts: string) => md(new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }));

// 帳號管理（所有員工）：用帳號或暱稱找人 → 看留言、停權（店長、老闆）、產生重設密碼的重設碼、刪帳號（老闆）
// 下面列出停權中的人
export default function AccountsPanel({ gymId }: { gymId: string }) {
  const { access } = useAuth();
  const toast = useToast();
  const manager = isManagerOf(access, gymId);
  const owner = !!access?.is_owner;
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AccountInfo[] | null>(null);
  const [suspended, setSuspended] = useState<AccountInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; mode: Mode } | null>(null);

  const loadSuspended = useCallback(() => {
    getSuspendedAccounts(gymId)
      .then((r) => (setSuspended(r), setError(null)))
      .catch((e) => setError((e as Error).message));
  }, [gymId]);
  useEffect(() => {
    void Promise.resolve().then(loadSuspended);
  }, [loadSuspended]);

  // 只用最新一次搜尋的結果（慢的舊結果晚回來不蓋掉）
  const latest = useRef("");
  const search = useCallback(
    (q: string) => {
      latest.current = q;
      return searchAccounts(q, gymId)
        .then((h) => latest.current === q && setHits(h))
        .catch((e) => latest.current === q && toast((e as Error).message));
    },
    [gymId, toast]
  );
  // 邊打邊搜（停 0.3 秒才查）；英數至少 2 個字、中文 1 個字
  useEffect(() => {
    const q = query.trim();
    if (!q || (q.length < 2 && /^[ -~]*$/.test(q))) {
      latest.current = "";
      queueMicrotask(() => setHits(null));
      return;
    }
    const t = setTimeout(() => void search(q), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  // 停權、解除、刪除後：搜尋結果和停權中名單一起更新
  const refresh = () => {
    loadSuspended();
    if (query.trim()) void search(query.trim());
  };

  // 資料庫還沒套用 step43：整塊只顯示說明
  if (error === NO_ACCOUNTS) {
    return (
      <>
        <SectionTitle>帳號管理</SectionTitle>
        <Empty>{error}</Empty>
      </>
    );
  }

  const row = (a: AccountInfo, inList: boolean) => {
    // 同一個人可能同時在搜尋結果和停權中名單：分開記哪一列打開
    const key = `${inList ? "list" : "hit"}:${a.id}`;
    const mode = open?.id === key ? open.mode : null;
    const toggle = (m: Mode) => setOpen(mode === m ? null : { id: key, mode: m });
    const canReset = (!a.staff || owner) && a.id !== access?.id;
    const canDelete = owner && !a.staff;
    return (
      <div key={key} className="mt-2.5" data-account={a.username}>
        <AccountSummary
          avatar={<UserAvatar userId={a.id} size={40} />}
          nickname={a.nickname ?? "（未填暱稱）"}
          username={a.username}
          meta={`註冊 ${taipeiDay(a.created_at)}・紀錄 ${a.ascents}・留言 ${a.comments}・影片 ${a.videos}${a.staff ? "・員工" : ""}`}
          recent={inList ? undefined : a.recent}
          suspension={a.suspension && !(manager && mode === "suspend") ? <SuspendedLine {...a.suspension} /> : undefined}
        >
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <ToggleButton on={mode === "comments"} onClick={() => toggle("comments")}>
              看留言
            </ToggleButton>
            {manager && !a.staff && (
              <ToggleButton on={mode === "suspend"} warn onClick={() => toggle("suspend")}>
                {a.suspension ? "停權中…" : "停權…"}
              </ToggleButton>
            )}
            {canReset && !inList && (
              <ToggleButton on={mode === "reset"} onClick={() => toggle("reset")}>
                重設密碼
              </ToggleButton>
            )}
            {canDelete && !inList && (
              <ToggleButton on={mode === "delete"} warn onClick={() => toggle("delete")}>
                刪帳號…
              </ToggleButton>
            )}
          </div>
          {mode === "comments" && <CommentsOf info={a} gymId={gymId} onChange={refresh} />}
          {mode === "suspend" && <SuspendBox key={a.suspension?.at ?? "none"} info={a} gymId={gymId} onDone={refresh} />}
          {mode === "reset" && <ResetBox info={a} gymId={gymId} />}
          {mode === "delete" && <DeleteBox info={a} onDone={() => (setOpen(null), refresh())} />}
        </AccountSummary>
      </div>
    );
  };

  return (
    <>
      <SectionTitle>帳號管理</SectionTitle>
      <SetBox>
        <Label htmlFor="accsearch">用帳號或暱稱找人</Label>
        <TextField
          id="accsearch"
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例如 小安 或 climber88"
        />
        {hits != null && (hits.length === 0 ? <p className="mt-2 mb-0 text-meta text-muted">找不到這個人</p> : hits.map((a) => row(a, false)))}
        <Tip>
          {owner
            ? "停權、重設密碼、刪帳號都會記在操作紀錄。員工的帳號要先移除員工身分才能停權、刪除。"
            : manager
              ? "店長可以停權 3、7、30 天，永久停權和刪帳號請找老闆。重設密碼前請先跟本人核對。"
              : "重設密碼前請先跟本人核對暱稱和最近爬的路線；停權請找店長。"}
        </Tip>
      </SetBox>
      <SetBox>
        <b className="mt-3 block text-sub">停權中（{suspended?.length ?? "…"}）</b>
        {error ? (
          <>
            <p className="mt-2 mb-0 text-meta text-muted">{error}</p>
            <LinkButton onClick={loadSuspended}>重新讀取</LinkButton>
          </>
        ) : suspended == null ? (
          <p className="mt-2 mb-0 text-meta text-muted">讀取中…</p>
        ) : suspended.length === 0 ? (
          <p className="mt-2 mb-0 text-meta text-muted">目前沒有停權中的帳號。</p>
        ) : (
          suspended.map((a) => row(a, true))
        )}
      </SetBox>
    </>
  );
}

// 某人的留言：這館的員工可以刪（按兩次）
function CommentsOf({ info, gymId, onChange }: { info: AccountInfo; gymId: string; onChange: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<AccountComment[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    getAccountComments(info.id, gymId)
      .then(setList)
      .catch((e) => toast((e as Error).message));
  }, [info.id, gymId, toast]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  if (!list) return <p className="mt-2 mb-0 text-meta text-muted">讀取中…</p>;
  if (list.length === 0) return <p className="mt-2 mb-0 text-meta text-muted">沒有留言。</p>;
  return (
    <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
      {list.map((c) => (
        <li key={c.id} className="rounded-field bg-sunk px-3 py-2">
          <small className="block text-tiny text-muted">
            {c.gym} {c.zone} {c.code}・{ago(c.created_at)}
          </small>
          <span className="block text-note break-words">{c.body}</span>
          {c.deletable && (
            <button
              className={`-mx-1 mt-0.5 px-1 py-2 text-meta text-warn ${confirm === c.id ? "font-bold" : ""}`}
              disabled={busy}
              onClick={async () => {
                if (confirm !== c.id) return setConfirm(c.id);
                setBusy(true);
                try {
                  await deleteComment(c.id);
                  toast("已刪除留言");
                  setConfirm(null);
                  load();
                  onChange();
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirm === c.id ? "確定刪除？再按一次" : "刪除"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// 產生重設碼：大字顯示、倒數 15 分鐘、可以作廢
function ResetBox({ info, gymId }: { info: AccountInfo; gymId: string }) {
  const toast = useToast();
  const [code, setCode] = useState<ResetCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const leftMs = code ? new Date(code.expires_at).getTime() - now : 0;
  const expired = !!code && leftMs <= 0;
  useEffect(() => {
    if (!code || expired) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code, expired]);
  const left = `${Math.floor(Math.max(0, leftMs) / 60000)}:${String(Math.floor((Math.max(0, leftMs) % 60000) / 1000)).padStart(2, "0")} 內有效`;

  const make = async () => {
    setBusy(true);
    try {
      setCode(await issueResetCode(info.id, gymId));
      setNow(Date.now());
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!code || expired) {
    return (
      <div className="mt-2.5">
        {expired && <p className="mt-0 mb-2 text-meta text-muted">重設碼已過期，要再產生一組。</p>}
        <Button variant="primary" disabled={busy} onClick={() => void make()}>
          產生重設碼
        </Button>
        <small className="mt-1 block text-center text-tiny text-muted">員工看不到密碼；每次產生都會記在操作紀錄。收起來就看不到這組碼，要再產生一組（舊的自動作廢）</small>
      </div>
    );
  }
  return (
    <>
      <ResetCodeBox code={code.code} left={left} username={code.username} />
      <Button
        className="mt-2"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await cancelResetCode(info.id, gymId);
            setCode(null);
            toast("已作廢這組重設碼");
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        作廢這組碼
      </Button>
    </>
  );
}

// 刪帳號（老闆）：輸入對方暱稱確認，刪了不能復原
function DeleteBox({ info, onDone }: { info: AccountInfo; onDone: () => void }) {
  const toast = useToast();
  const name = info.nickname ?? info.username;
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 rounded-tile bg-blush p-3">
      <b className="block text-sub text-warn">刪除帳號後不能復原</b>
      <p className="mt-1 mb-0 text-meta">會一起刪掉他的紀錄、留言、影片、人物卡、按的讚；他出的 Spray Wall 岩友路線會留著，不顯示出題人。</p>
      <Label htmlFor={`del-${info.id}`}>輸入「{name}」確認</Label>
      <TextField id={`del-${info.id}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" autoCorrect="off" />
      <Button
        variant="danger"
        className="mt-3"
        disabled={busy || typed.trim() !== name}
        onClick={async () => {
          setBusy(true);
          try {
            await deleteUser(info.id);
            toast(`已刪除帳號 ${name}`);
            onDone();
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        永久刪除這個帳號
      </Button>
      <LinkButton onClick={onDone}>取消</LinkButton>
    </div>
  );
}
