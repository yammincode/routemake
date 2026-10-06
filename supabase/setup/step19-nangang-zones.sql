-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261018000023_nangang_zones

-- 南港館分區細分：A → A1／A2／A3，B → B1／B2，C → C1／C2（共 7 區）
-- 原本的 A、B、C 改成 A1、B1、C1（沿用同一筆區域，舊路線的紀錄都還在），照片清空，各區重新上傳
-- 牆上還有路線時不能切：請先在管理後台把南港 A、B、C 區「整區換線」（顧客的完攀紀錄和積分會保留）

do $do$
declare
  n int;
begin
  n := (select count(*) from public.routes r join public.zones z on z.id = r.zone_id
         where z.gym_id = 'g4' and z.code in ('A', 'B', 'C') and r.archived_at is null);
  if n > 0 then
    raise exception '南港 A／B／C 區牆上還有 % 條路線：請先在管理後台把這幾區「整區換線」，再執行這份設定', n;
  end if;
end $do$;

update public.zones
   set code = v.new_code, name = v.new_name, sort = v.sort,
       photo_path = null, photo_width = null, photo_height = null
  from (values ('A', 'A1', 'A1 區', 1), ('B', 'B1', 'B1 區', 4), ('C', 'C1', 'C1 區', 6)) as v(old_code, new_code, new_name, sort)
 where gym_id = 'g4' and code = v.old_code;

insert into public.zones (gym_id, code, name, sort)
select 'g4', v.code, v.name, v.sort
  from (values ('A1', 'A1 區', 1), ('A2', 'A2 區', 2), ('A3', 'A3 區', 3), ('B1', 'B1 區', 4),
               ('B2', 'B2 區', 5), ('C1', 'C1 區', 6), ('C2', 'C2 區', 7)) as v(code, name, sort)
 where not exists (select 1 from public.zones z where z.gym_id = 'g4' and z.code = v.code);

insert into supabase_migrations.schema_migrations (version, name) values ('20261018000023', 'nangang_zones');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
