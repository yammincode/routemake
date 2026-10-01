-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);

-- >>>>>>>>>> 20261008000013_gym_zones

-- =====================================================================
-- 萬華、中和、南港、新店開放；依 10 月換線公告建立各館區域、填入換線日
-- - 明德館：比賽牆分成四段（W、W2、W3、W4），新增 Spray Wall（S）
--   之前在後台自己新增的「比賽牆02」，如果代碼不是 W2，會改成 W2（沿用原本的照片與路線）
-- - 換線日填「拆點」那天
-- =====================================================================
update public.gyms set is_live = true where id in ('g2', 'g3', 'g4', 'g5');

-- 明德館：比賽牆02 改用代碼 W2
update public.zones z set code = 'W2'
 where z.gym_id = 'mingde' and z.name = '比賽牆02' and z.code <> 'W2'
   and not exists (select 1 from public.zones x where x.gym_id = 'mingde' and x.code = 'W2');

update public.zones set name = '比賽牆 1' where gym_id = 'mingde' and code = 'W' and name = '比賽牆';
update public.zones set name = '比賽牆 2' where gym_id = 'mingde' and code = 'W2' and name = '比賽牆02';

insert into public.zones (gym_id, code, name, sort) values
  ('mingde', 'W2', '比賽牆 2', 3),
  ('mingde', 'W3', '比賽牆 3', 4),
  ('mingde', 'W4', '比賽牆 4', 5),
  ('mingde', 'S', 'Spray Wall', 9),
  -- 萬華館
  ('g2', 'A', 'A 區', 1),
  ('g2', 'B', 'B 區', 2),
  ('g2', 'C', 'C 區', 3),
  ('g2', 'D', 'D 區', 4),
  ('g2', 'TR', '訓練區', 5),
  ('g2', 'SL', '教學區 Slab', 6),
  -- 中和館
  ('g3', 'A', 'A 區', 1),
  ('g3', 'AB', 'Auto-Belay', 2),
  ('g3', 'B', 'B 區', 3),
  ('g3', 'C', 'C 區', 4),
  ('g3', 'D', 'D 區', 5),
  ('g3', 'SP', '速度牆', 6),
  ('g3', 'BO', '抱石區', 7),
  -- 南港館
  ('g4', 'A', 'A 區', 1),
  ('g4', 'B', 'B 區', 2),
  ('g4', 'C', 'C 區', 3),
  -- 新店館
  ('g5', 'A', '抱石 A 區', 1),
  ('g5', 'B', '抱石 B 區', 2),
  ('g5', 'C', 'C 區', 3),
  ('g5', 'D', 'D 區', 4),
  ('g5', 'E', '上攀 E 區', 5)
on conflict (gym_id, code) do nothing;

-- 明德館排序：A、比賽牆 1–4、B、C、D、Spray Wall，其他自己新增的排在後面
update public.zones z set sort = o.n
  from (values ('A', 1), ('W', 2), ('W2', 3), ('W3', 4), ('W4', 5), ('B', 6), ('C', 7), ('D', 8), ('S', 9)) as o(code, n)
 where z.gym_id = 'mingde' and z.code = o.code;
update public.zones set sort = sort + 100 where gym_id = 'mingde' and code not in ('A', 'W', 'W2', 'W3', 'W4', 'B', 'C', 'D', 'S');

-- 10 月換線日（拆點日）
update public.zones z set next_reset_on = d.day::date
  from (values
    ('mingde', 'A', '2026-09-30'), ('mingde', 'W', '2026-10-06'), ('mingde', 'W2', '2026-10-06'),
    ('mingde', 'W3', '2026-10-06'), ('mingde', 'W4', '2026-10-06'), ('mingde', 'D', '2026-10-11'),
    ('mingde', 'B', '2026-10-14'), ('mingde', 'C', '2026-10-21'), ('mingde', 'S', '2026-10-28'),
    ('g2', 'C', '2026-10-11'), ('g2', 'SL', '2026-10-20'), ('g2', 'D', '2026-10-26'),
    ('g3', 'AB', '2026-10-04'),
    ('g4', 'B', '2026-10-04'), ('g4', 'C', '2026-10-18'),
    ('g5', 'A', '2026-10-11'), ('g5', 'E', '2026-10-18'), ('g5', 'B', '2026-10-26')
  ) as d(gym, code, day)
 where z.gym_id = d.gym and z.code = d.code;

insert into supabase_migrations.schema_migrations (version, name) values ('20261008000013', 'gym_zones');

-- 完成：顯示結果（每館的區域與下次換線日）
select g.name as 場館, g.is_live as 開放,
       string_agg(z.name || coalesce('（' || to_char(z.next_reset_on, 'MM/DD') || '）', ''), '、' order by z.sort) as 區域與換線日
  from public.gyms g left join public.zones z on z.gym_id = g.id
 group by g.id, g.name, g.is_live, g.sort
 order by g.sort;
