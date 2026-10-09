-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261025000030_nangang_b3_d

-- 南港館重新分區（2026/10）：
-- 1F 左側牆分成 B1（上方牆＋左上角）／B2（左側牆中段）／B3（左下斜牆的左半，新增）；斜牆右下角併進 C1；C2／C3 不變
-- 2F 新增 D1（D 牆左半）／D2（右半）
-- 只新增區域，原本的區域和路線都不動。B1、B2 的範圍變了：請店長在管理後台把 B1、B2「整區換線」、重拍照片，再重新標路線
-- B3 排在 B2 後面（後面的區域順序往後挪一格）、D1／D2 排在最後；已經有的區域不會重複新增

do $do$
declare
  b2 int;
begin
  if not exists (select 1 from public.zones where gym_id = 'g4' and code = 'B3') then
    b2 := coalesce((select sort from public.zones where gym_id = 'g4' and code = 'B2'), 5);
    update public.zones set sort = sort + 1 where gym_id = 'g4' and kind = 'wall' and sort > b2;
    insert into public.zones (gym_id, code, name, sort) values ('g4', 'B3', 'B3 區', b2 + 1);
  end if;
end $do$;

insert into public.zones (gym_id, code, name, sort)
select 'g4', v.code, v.name, (select coalesce(max(sort), 0) from public.zones where gym_id = 'g4' and kind = 'wall') + v.n
  from (values ('D1', 'D1 區', 1), ('D2', 'D2 區', 2)) as v(code, name, n)
 where not exists (select 1 from public.zones z where z.gym_id = 'g4' and z.code = v.code);

insert into supabase_migrations.schema_migrations (version, name) values ('20261025000030', 'nangang_b3_d');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
