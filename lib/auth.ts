// 帳號名稱＋密碼登入：帳號轉成 {帳號}@users.routemake.local 給 Supabase Auth（不寄信、不發簡訊）

export const USERNAME_RULE = "4–20 個字，英文字母、數字或底線";
export const PASSWORD_MIN = 8;
const AUTH_DOMAIN = "users.routemake.local";

export const normalizeUsername = (u: string) => u.trim().toLowerCase();
export const isValidUsername = (u: string) => /^[a-z0-9_]{4,20}$/.test(normalizeUsername(u));
export const usernameToEmail = (u: string) => `${normalizeUsername(u)}@${AUTH_DOMAIN}`;

export type Role = "setter" | "manager";
export type Access = {
  id: string;
  username: string | null;
  nickname: string | null;
  avatar_url: string | null;
  is_owner: boolean;
  roles: { gym_id: string; role: Role }[];
};

export const isStaffOf = (a: Access | null, gym?: string) =>
  !!a && (a.is_owner || a.roles.some((r) => !gym || r.gym_id === gym));

// 角色名稱：setter＝定線長、manager＝店長；老闆管所有場館
export const ROLE_NAME: Record<Role, string> = { setter: "定線長", manager: "店長" };

export const roleLabel = (a: Access, gym: string) =>
  a.is_owner ? "老闆" : ROLE_NAME[a.roles.find((r) => r.gym_id === gym)?.role ?? "setter"];

export const isManagerOf = (a: Access | null, gym: string) =>
  !!a && (a.is_owner || a.roles.some((r) => r.gym_id === gym && r.role === "manager"));

// 可以管理的場館
export const staffGyms = (a: Access | null) => (a?.is_owner ? null : (a?.roles.map((r) => r.gym_id) ?? []));

// Supabase 錯誤訊息轉成中文；設定問題會附上錯誤代碼，方便管理員查
export function authErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string; status?: number; name?: string };
  const code = e?.code ?? "";
  const msg = (e?.message ?? "").toLowerCase();
  const tag = code ? `（${code}）` : e?.status ? `（${e.status}）` : "";
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "帳號或密碼錯誤";
  if (code === "user_already_exists" || msg.includes("already registered")) return "這個帳號名稱已經有人使用，請換一個";
  if (code === "weak_password" || msg.includes("password should")) return `密碼太簡單，至少 ${PASSWORD_MIN} 碼`;
  if (code === "email_not_confirmed") return `帳號還沒啟用：請管理員到 Supabase 關閉「Confirm email」${tag}`;
  // 寄確認信失敗或寄信次數用完：代表 Supabase 還開著「Confirm email」
  if (code === "over_email_send_rate_limit" || code === "email_address_invalid" || msg.includes("sending confirmation") || msg.includes("email rate limit"))
    return `註冊暫時無法完成：請管理員到 Supabase 關閉「Confirm email」${tag}`;
  if (code === "over_request_rate_limit" || e?.status === 429) return `嘗試太多次，請過幾分鐘再試${tag}`;
  if (code === "email_provider_disabled" || code === "signup_disabled") return `目前暫停註冊，請洽櫃檯${tag}`;
  if (e?.name === "AuthRetryableFetchError" || msg.includes("fetch") || msg.includes("network")) return "連不上網路，請確認網路後再試";
  return `發生錯誤，請稍後再試${tag}`;
}
