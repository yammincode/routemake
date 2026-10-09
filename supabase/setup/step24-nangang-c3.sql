-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261023000028_nangang_c3

-- 南港館中間的長牆（原本整條是 C2）切成兩區：左半 C2、右半 C3（靠櫃台那一側）
-- 只新增 C3 這一筆區域；C2 沿用原本那筆（切之前 C2 沒有路線，不用搬）
-- 已經有 C3 就不會重複新增

insert into public.zones (gym_id, code, name, sort)
select 'g4', 'C3', 'C3 區', 8
 where not exists (select 1 from public.zones z where z.gym_id = 'g4' and z.code = 'C3');

insert into supabase_migrations.schema_migrations (version, name) values ('20261023000028', 'nangang_c3');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
