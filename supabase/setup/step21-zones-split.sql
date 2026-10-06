-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261020000025_zones_split

-- 明德、新店、中和、萬華細分區域（照 10 月換線公告上畫的分區）
-- 原則同南港（0023）：原本的區域改成第 1 段（沿用同一筆，舊紀錄都在），照片清空；其他段新增，換線日沿用原本的
-- 明德：A → A1–A4；比賽牆 → W1（原 W3＋W4 合併）、W2、W3（原 W）、W4（原本算在 C 的柱子）；B → B1–B3；C → C1–C3；D → D1、D2
-- 新店：抱石 A → A1、A2；抱石 B → B1、B2；C → C1、C2
-- 中和：A → A1、A2；Auto-Belay → AB1（上方長牆）、AB2（左側斜牆）；新區域一樣用 YDS
-- 萬華：B → B1、B2；C → C1、C2；D → D1、D2，D 右段就是「教學區 Slab」（SL）
-- 牆上還有路線時不能切：請先在管理後台把這些區域「整區換線」（顧客的完攀紀錄和積分會保留）

do $do$
declare
  n int;
begin
  n := (select count(*) from public.routes r join public.zones z on z.id = r.zone_id
         where r.archived_at is null and (
               (z.gym_id = 'mingde' and z.code in ('A', 'W', 'W3', 'W4', 'B', 'C', 'D'))
            or (z.gym_id = 'g5' and z.code in ('A', 'B', 'C'))
            or (z.gym_id = 'g3' and z.code in ('A', 'AB'))
            or (z.gym_id = 'g2' and z.code in ('B', 'C', 'D'))));
  if n > 0 then
    raise exception '要細分的區域牆上還有 % 條路線：請先在管理後台把明德 A／比賽牆／B／C／D、新店 A／B／C、中和 A／Auto-Belay、萬華 B／C／D「整區換線」，再執行這份設定', n;
  end if;
end $do$;

-- 明德：比賽牆舊 W4 併進 W3（之後改名 W1）：舊路線紀錄搬過去，再刪掉舊 W4
update public.routes set zone_id = (select id from public.zones where gym_id = 'mingde' and code = 'W3')
 where zone_id = (select id from public.zones where gym_id = 'mingde' and code = 'W4')
   and exists (select 1 from public.zones where gym_id = 'mingde' and code = 'W3');
delete from public.zones where gym_id = 'mingde' and code = 'W4'
   and exists (select 1 from public.zones where gym_id = 'mingde' and code = 'W3');

-- 原本的區域改成第 1 段（順序要先改 W3 → W1，再改 W → W3）
update public.zones z
   set code = v.new_code, name = v.new_name, photo_path = null, photo_width = null, photo_height = null
  from (values
    ('mingde', 'A', 'A1', 'A1 區'), ('mingde', 'W3', 'W1', '比賽牆 1'), ('mingde', 'B', 'B1', 'B1 區'),
    ('mingde', 'C', 'C1', 'C1 區'), ('mingde', 'D', 'D1', 'D1 區'),
    ('g5', 'A', 'A1', '抱石 A1 區'), ('g5', 'B', 'B1', '抱石 B1 區'), ('g5', 'C', 'C1', 'C1 區'),
    ('g3', 'A', 'A1', 'A1 區'), ('g3', 'AB', 'AB1', 'Auto-Belay 1'),
    ('g2', 'B', 'B1', 'B1 區'), ('g2', 'C', 'C1', 'C1 區'), ('g2', 'D', 'D1', 'D1 區')
  ) as v(gym, old_code, new_code, new_name)
 where z.gym_id = v.gym and z.code = v.old_code;
update public.zones set code = 'W3', name = '比賽牆 3', photo_path = null, photo_width = null, photo_height = null
 where gym_id = 'mingde' and code = 'W';
update public.zones set name = '比賽牆 2' where gym_id = 'mingde' and code = 'W2';
update public.zones set name = '教學區 Slab' where gym_id = 'g2' and code = 'SL';

-- 新增其他段：換線日、等級制沿用同一區的第 1 段
insert into public.zones (gym_id, code, name, sort, next_reset_on, grade_system)
select v.gym, v.code, v.name, 0, p.next_reset_on, coalesce(p.grade_system, 'v')
  from (values
    ('mingde', 'A2', 'A2 區', 'A1'), ('mingde', 'A3', 'A3 區', 'A1'), ('mingde', 'A4', 'A4 區', 'A1'),
    ('mingde', 'W4', '比賽牆 4', 'W1'), ('mingde', 'B2', 'B2 區', 'B1'), ('mingde', 'B3', 'B3 區', 'B1'),
    ('mingde', 'C2', 'C2 區', 'C1'), ('mingde', 'C3', 'C3 區', 'C1'), ('mingde', 'D2', 'D2 區', 'D1'),
    ('g5', 'A2', '抱石 A2 區', 'A1'), ('g5', 'B2', '抱石 B2 區', 'B1'), ('g5', 'C2', 'C2 區', 'C1'),
    ('g3', 'A2', 'A2 區', 'A1'), ('g3', 'AB2', 'Auto-Belay 2', 'AB1'),
    ('g2', 'B2', 'B2 區', 'B1'), ('g2', 'C2', 'C2 區', 'C1'), ('g2', 'D2', 'D2 區', 'D1')
  ) as v(gym, code, name, parent)
  left join public.zones p on p.gym_id = v.gym and p.code = v.parent
 where not exists (select 1 from public.zones z where z.gym_id = v.gym and z.code = v.code);

-- 排序（自己在後台新增的區域排在後面）
update public.zones z set sort = o.n
  from (values
    ('mingde', 'A1', 1), ('mingde', 'A2', 2), ('mingde', 'A3', 3), ('mingde', 'A4', 4),
    ('mingde', 'W1', 5), ('mingde', 'W2', 6), ('mingde', 'W3', 7), ('mingde', 'W4', 8),
    ('mingde', 'B1', 9), ('mingde', 'B2', 10), ('mingde', 'B3', 11),
    ('mingde', 'C1', 12), ('mingde', 'C2', 13), ('mingde', 'C3', 14), ('mingde', 'D1', 15), ('mingde', 'D2', 16), ('mingde', 'S', 99),
    ('g5', 'A1', 1), ('g5', 'A2', 2), ('g5', 'B1', 3), ('g5', 'B2', 4), ('g5', 'C1', 5), ('g5', 'C2', 6), ('g5', 'D', 7), ('g5', 'E', 8),
    ('g3', 'A1', 1), ('g3', 'A2', 2), ('g3', 'AB1', 3), ('g3', 'AB2', 4), ('g3', 'B', 5), ('g3', 'C', 6), ('g3', 'D', 7), ('g3', 'SP', 8), ('g3', 'BO', 9),
    ('g2', 'A', 1), ('g2', 'B1', 2), ('g2', 'B2', 3), ('g2', 'C1', 4), ('g2', 'C2', 5), ('g2', 'D1', 6), ('g2', 'D2', 7), ('g2', 'SL', 8), ('g2', 'TR', 9)
  ) as o(gym, code, n)
 where z.gym_id = o.gym and z.code = o.code;

insert into supabase_migrations.schema_migrations (version, name) values ('20261020000025', 'zones_split');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
