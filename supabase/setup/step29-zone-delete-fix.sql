-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261028000033_zone_delete_fix

-- =====================================================================
-- 補 step27 舊版（2026/10/10 以前產生的檔案）少的修正
-- - 一次刪好幾區（重新分區）時，觸發時那幾區都已經刪掉了：把換線公告裡所有已經不存在的區一起拿掉
--   舊版只拿掉正在處理的那一區，剩下已刪掉的區會讓公告存檔檢查失敗，整個刪除被取消
-- - 新版 step27 已經是這樣；這份重新定義同一個函式，重複執行沒有影響
-- =====================================================================
create or replace function public.zones_drop_from_resets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.reset_events
     set zone_ids = array(select z from unnest(zone_ids) z where exists (select 1 from public.zones x where x.id = z))
   where old.id = any (zone_ids);
  return null;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261028000033', 'zone_delete_fix');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
