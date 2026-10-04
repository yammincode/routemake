"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { roleLabel } from "@/lib/auth";
import { GYMS } from "@/lib/gyms";

// 「我的紀錄」頁的帳號區塊：未登入顯示登入／註冊，已登入顯示暱稱、帳號、員工身分與登出
export default function AccountCard() {
  const { ready, session, access, signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();

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
        <Link href="/welcome?next=/me" className="text-note text-muted underline">
          改暱稱
        </Link>
      </div>
      {access && gymsWithRole.length > 0 && (
        <p className="mt-2 mb-0 text-meta text-muted">
          員工身分：
          {access.is_owner ? "老闆（所有場館）" : gymsWithRole.map((g) => `${g.name}${roleLabel(access, g.id)}`).join("、")}
        </p>
      )}
      <LinkButton
        onClick={async () => {
          await signOut();
          toast("已登出");
        }}
      >
        登出
      </LinkButton>
      {installLink}
    </SetBox>
  );
}
