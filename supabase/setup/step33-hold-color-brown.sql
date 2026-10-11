-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261101000037_hold_color_brown

-- 岩點顏色新增：咖啡（色號 #7B4B2A，排在粉和黑中間；畫面上的色號在 lib/design.ts）
-- 先執行這份再更新正式版：舊版 App 選不到咖啡，不受影響；新版選咖啡存路線要這份才存得進去
alter table public.routes drop constraint routes_hold_color_check;
alter table public.routes add constraint routes_hold_color_check
  check (hold_color in ('紅','橙','黃','綠','藍','紫','粉','咖啡','黑','白','灰','蒂芬妮'));

insert into supabase_migrations.schema_migrations (version, name) values ('20261101000037', 'hold_color_brown');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
