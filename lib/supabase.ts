import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 瀏覽器用的 Supabase 連線；網址和 publishable key 放在 .env.local 與 Netlify 環境變數
let client: SupabaseClient | null = null;
// 登入資料存在手機的 localStorage 名稱（routemake-auth、routemake-auth-user…）；登出時用來清掉
export const AUTH_STORAGE_KEY = "routemake-auth";
// 手機裡存的登入（不會連網路、不會換新）：登出、判斷登入是不是過期了用
export function storedLogin(): { access_token?: string; expires_at?: number } | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
}
// 手機裡的登入已經過期（換新還沒成功）
export const loginExpired = () => (storedLogin()?.expires_at ?? 0) * 1000 <= Date.now();

// 是否已設定連線（Netlify 還沒加環境變數時，網站照常打開，只是不能登入）
export const supabaseConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("網站還沒設定資料庫連線（Netlify 環境變數），請管理員設定後重新部署");
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY },
  });
  return client;
}
