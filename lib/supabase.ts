import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 瀏覽器用的 Supabase 連線；網址和 publishable key 放在 .env.local 與 Netlify 環境變數
let client: SupabaseClient | null = null;

// 是否已設定連線（Netlify 還沒加環境變數時，網站照常打開，只是不能登入）
export const supabaseConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "routemake-auth" },
  });
  return client;
}
