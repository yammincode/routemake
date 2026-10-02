-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261015000020_hold_colors

-- 岩點顏色新增：灰、蒂芬妮（Tiffany mint）
alter table public.routes drop constraint routes_hold_color_check;
alter table public.routes add constraint routes_hold_color_check
  check (hold_color in ('紅','橙','黃','綠','藍','紫','粉','黑','白','灰','蒂芬妮'));

insert into supabase_migrations.schema_migrations (version, name) values ('20261015000020', 'hold_colors');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
