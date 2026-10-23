"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { isStaff, PASSWORD_MIN, roleLabel } from "@/lib/auth";
import { deleteMyAccount, NO_ACCOUNTS } from "@/lib/data";
import { Label, TextField } from "@/components/ui/Form";
import { GYMS } from "@/lib/gyms";
import { usePendingCount } from "@/lib/offline";

// 「我的紀錄」頁的帳號區塊：未登入顯示登入／註冊，已登入顯示暱稱、帳號、員工身分與登出
export default function AccountCard() {
  const { ready, session, access, signOut, changePassword } = useAuth();
  const router = useRouter();
  const toast = useToast();
  // 還有離線時記的紀錄沒送出：登出會刪掉，先提醒、再按一次才登出
  const pending = usePendingCount(session?.user.id);
  const [confirmOut, setConfirmOut] = useState(false);
  const [panel, setPanel] = useState<"password" | "delete" | null>(null);
  // 登入後收成一行（10/23 使用者決定）：暱稱、帳號＋「帳號設定」，點了才打開改密碼、改暱稱、登出、刪除帳號
  const [expand, setExpand] = useState(false);

  if (!ready) return null;
  const installLink = (
    <LinkButton onClick={() => window.dispatchEvent(new Event("routemake:install"))}>怎麼加到主畫面？</LinkButton>
  );

  if (!session) {
    return (
      <SetBox>
        <p className="mt-3 mb-3 text-sub text-muted">登入後就能記錄 Flash、完攀，寫只有自己看得到的心得。</p>
        <Button variant="primary" onClick={() => router.push("/login?next=/me")}>
          登入
        </Button>
        <Button onClick={() => router.push("/login?mode=signup&next=/me")}>註冊帳號</Button>
        {installLink}
      </SetBox>
    );
  }

  const gymsWithRole = access ? GYMS.filter((g) => access.is_owner || access.roles.some((r) => r.gym_id === g.id)) : [];

  return (
    <SetBox>
      <div className="flex items-center justify-between pt-3">
        <span>
          <b className="block text-section">{access?.nickname ?? "…"}</b>
          <small className="text-meta text-muted">
            帳號 <b data-username>{access?.username ?? ""}</b>
            {access?.username && (
              <button
                className="ml-2 text-accent underline"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(access.username ?? "")
                    .then(() => toast("已複製帳號名稱，可以傳給店長"))
                    .catch(() => toast(`帳號名稱：${access.username}`))
                }
              >
                複製
              </button>
            )}
          </small>
        </span>
        <button aria-expanded={expand} onClick={() => setExpand(!expand)} className="flex-none px-1 py-2 text-note font-bold text-accent">
          帳號設定 {expand ? "⌃" : "⌄"}
        </button>
      </div>
      {expand && (
        <>
          {access && gymsWithRole.length > 0 && (
            <p className="mt-2 mb-0 text-meta text-muted">
              員工身分：
              {access.is_owner ? "老闆（所有場館）" : gymsWithRole.map((g) => `${g.name}${roleLabel(access, g.id)}`).join("、")}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button aria-pressed={panel === "password"} className="rounded-field border border-line py-2.5 text-note aria-pressed:border-accent aria-pressed:bg-blush aria-pressed:font-bold aria-pressed:text-accent" onClick={() => setPanel(panel === "password" ? null : "password")}>
              改密碼
            </button>
            <Link href="/welcome?next=/me" className="rounded-field border border-line py-2.5 text-center text-note">
              改暱稱
            </Link>
          </div>
          {panel === "password" && (
            <PasswordBox
              onSave={async (o, n) => {
                const err = await changePassword(o, n);
                if (!err) {
                  toast("已改好密碼，其他手機要用新密碼重新登入");
                  setPanel(null);
                }
                return err;
              }}
            />
          )}
          <LinkButton
            className={confirmOut && pending > 0 ? "font-bold text-warn" : ""}
            onClick={async () => {
              if (pending > 0 && !confirmOut) return setConfirmOut(true);
              setConfirmOut(false);
              await signOut();
              toast("已登出");
            }}
          >
            {confirmOut && pending > 0 ? `還有 ${pending} 筆紀錄沒送出，登出會刪掉，再按一次` : "登出"}
          </LinkButton>
          {installLink}
          {access && !isStaff(access) && (
            <div className="mt-1 border-t border-line pt-1">
              {panel === "delete" ? (
                <DeleteMeBox
                  onCancel={() => setPanel(null)}
                  onDeleted={async () => {
                    await signOut();
                    toast("帳號已刪除");
                    router.replace("/me");
                  }}
                />
              ) : (
                <LinkButton className="text-warn underline" onClick={() => setPanel("delete")}>
                  刪除我的帳號
                </LinkButton>
              )}
            </div>
          )}
        </>
      )}
    </SetBox>
  );
}

// 改密碼：輸入現在的密碼和新密碼
function PasswordBox({ onSave }: { onSave: (oldPassword: string, newPassword: string) => Promise<string | null> }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2 rounded-tile bg-sunk p-3">
      <Label htmlFor="pw-old">現在的密碼</Label>
      <TextField id="pw-old" type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
      <Label htmlFor="pw-new">新密碼（至少 {PASSWORD_MIN} 碼）</Label>
      <TextField id="pw-new" type="text" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      {error && (
        <p role="alert" className="mt-2 mb-0 text-note font-bold text-warn">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        className="mt-3"
        disabled={busy || !oldPw || newPw.length < PASSWORD_MIN}
        onClick={async () => {
          setBusy(true);
          setError(await onSave(oldPw, newPw));
          setBusy(false);
        }}
      >
        {busy ? "請稍候…" : "儲存新密碼"}
      </Button>
      <small className="mt-1 block text-tiny text-muted">忘記現在的密碼？登出後在登入頁按「忘記密碼？」，到櫃檯拿重設碼。</small>
    </div>
  );
}

// 刪除我的帳號：列出會刪掉什麼、輸入密碼確認
function DeleteMeBox({ onCancel, onDeleted }: { onCancel: () => void; onDeleted: () => Promise<void> }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div data-delete-me className="mt-2 rounded-tile bg-blush p-3">
      <b className="block text-sub text-warn">刪除帳號後不能復原</b>
      <p className="mt-1 mb-0 text-meta">會一起刪掉：所有完攀紀錄和積分、私人心得、訓練日誌、留言、影片、人物卡、按的讚。你出的 Spray Wall 路線會留著，但不顯示是誰出的。</p>
      <Label htmlFor="del-pw">輸入密碼確認</Label>
      <TextField id="del-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      {error && (
        <p role="alert" className="mt-2 mb-0 text-note font-bold text-warn">
          {error}
        </p>
      )}
      <Button
        variant="danger"
        className="mt-3"
        disabled={busy || !pw}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            if (!(await deleteMyAccount(pw))) setError("密碼不對");
            else await onDeleted();
          } catch (e) {
            const m = (e as Error).message;
            setError(m === NO_ACCOUNTS ? "目前還不能自己刪除帳號，請洽櫃檯" : m);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "刪除中…" : "永久刪除我的帳號"}
      </Button>
      <LinkButton onClick={onCancel}>取消</LinkButton>
    </div>
  );
}
