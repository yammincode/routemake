-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);

-- >>>>>>>>>> 20261004000009_gym_names

-- =====================================================================
-- 六間店的正式名稱（依各館 Logo）；id 是系統內部代號，不改
-- =====================================================================
update public.gyms set name = '明德館', sort = 1 where id = 'mingde';
update public.gyms set name = '萬華館', sort = 2 where id = 'g2';
update public.gyms set name = '中和館', sort = 3 where id = 'g3';
update public.gyms set name = '南港館', sort = 4 where id = 'g4';
update public.gyms set name = '新店館', sort = 5 where id = 'g5';
update public.gyms set name = '中壢館', sort = 6 where id = 'g6';

insert into supabase_migrations.schema_migrations (version, name) values ('20261004000009', 'gym_names');

-- 完成：顯示結果
select '設定完成' as 結果, string_agg(name, '、' order by sort) as 場館 from public.gyms;
