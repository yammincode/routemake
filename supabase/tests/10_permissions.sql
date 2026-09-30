-- =====================================================================
-- 權限與規則測試（本機執行：npm run test:db）
-- 模擬 7 種身分：未登入、顧客甲、顧客乙、沒填暱稱的顧客、明德館定線員、明德館店長、第二館定線員、老闆
-- =====================================================================
\set QUIET on
\o /dev/null
create schema tests;
create table tests.results (n serial, name text, ok boolean, detail text);
grant usage on schema tests to anon, authenticated;
grant insert, select on tests.results to anon, authenticated;
grant usage on sequence tests.results_n_seq to anon, authenticated;

create function tests.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '{"role":"anon"}' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, false)
$$;
create function tests.ok(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into tests.results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail)
$$;
-- 預期會被擋下（任何錯誤都算擋下）
create function tests.throws(p_name text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into tests.results (name, ok, detail) values (p_name, false, '沒有被擋下');
exception when others then
  insert into tests.results (name, ok, detail) values (p_name, true, sqlerrm);
end $$;
-- 預期會成功
create function tests.lives(p_name text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into tests.results (name, ok) values (p_name, true);
exception when others then
  insert into tests.results (name, ok, detail) values (p_name, false, sqlerrm);
end $$;
-- 執行並回傳影響筆數
create function tests.rows(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql; get diagnostics n = row_count; return n;
end $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------
-- 準備測試帳號（資料庫管理者身分）
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'climber_a@users.routemake.local'), -- 顧客甲
  ('00000000-0000-0000-0000-00000000000b', 'Climber_B@users.routemake.local'), -- 顧客乙（大寫也會轉小寫）
  ('00000000-0000-0000-0000-00000000000c', 'nonick@users.routemake.local'),    -- 沒填暱稱
  ('00000000-0000-0000-0000-0000000000a1', 'setter1@users.routemake.local'),   -- 明德館定線員
  ('00000000-0000-0000-0000-0000000000a2', 'manager1@users.routemake.local'),  -- 明德館店長
  ('00000000-0000-0000-0000-0000000000b1', 'setter2@users.routemake.local'),   -- 第二館定線員
  ('00000000-0000-0000-0000-0000000000ff', 'boss@users.routemake.local');      -- 老闆
update public.profiles set nickname = '甲' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set nickname = '乙' where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set nickname = '定線員' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set nickname = '店長' where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set nickname = '二館定線' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set nickname = '老闆', is_owner = true where id = '00000000-0000-0000-0000-0000000000ff';
insert into public.staff_roles (user_id, gym_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'mingde', 'setter'),
  ('00000000-0000-0000-0000-0000000000a2', 'mingde', 'manager'),
  ('00000000-0000-0000-0000-0000000000b1', 'g2', 'setter');
insert into public.zones (gym_id, code, name, sort) values ('g2', 'A', '二館 A 區', 1);

\set A   '''00000000-0000-0000-0000-00000000000a'''
\set B   '''00000000-0000-0000-0000-00000000000b'''
\set NN  '''00000000-0000-0000-0000-00000000000c'''
\set ST  '''00000000-0000-0000-0000-0000000000a1'''
\set MG  '''00000000-0000-0000-0000-0000000000a2'''
\set ST2 '''00000000-0000-0000-0000-0000000000b1'''
\set OW  '''00000000-0000-0000-0000-0000000000ff'''

create temp table ids (k text primary key, v uuid);
grant all on ids to anon, authenticated;
insert into ids select 'zoneA', id from public.zones where gym_id = 'mingde' and code = 'A';
insert into ids select 'zoneB', id from public.zones where gym_id = 'mingde' and code = 'B';
insert into ids select 'zoneG2', id from public.zones where gym_id = 'g2' and code = 'A';

select tests.ok('初始資料：六間店、明德館 5 區', (select count(*) from public.gyms) = 6
  and (select count(*) from public.zones where gym_id = 'mingde') = 5
  and (select count(*) from public.zones where gym_id = 'mingde' and plan_shape is not null) = 5);
select tests.ok('新使用者自動建立 profiles 並存帳號名稱（轉小寫）',
  (select username from public.profiles where id = :A) = 'climber_a'
  and (select username from public.profiles where id = :B) = 'climber_b');

-- ---------------------------------------------------------------------
-- 未登入的人
-- ---------------------------------------------------------------------
set role anon; select tests.login(null);
select tests.ok('未登入：可以看場館和區域', (select count(*) from public.gyms) = 6 and (select count(*) from public.zones) = 6);
select tests.ok('未登入：可以看暱稱', (select nickname from public.profiles where id = :A) = '甲');
select tests.throws('未登入：讀不到手機號碼', 'select phone from public.profiles');
select tests.throws('未登入：讀不到帳號名稱', 'select username from public.profiles');
select tests.throws('未登入：不能新增紀錄', format('insert into public.ascents (route_id, status) select id, ''send'' from public.routes limit 1'));
select tests.throws('未登入：不能整區換線', format('select public.archive_zone(%L)', (select v from ids where k = 'zoneA')));
reset role;

-- ---------------------------------------------------------------------
-- 路線：新增、編號、權限
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:ST);
select tests.lives('定線員：可以在自己館新增路線',
  format('insert into public.routes (zone_id, grade, hold_color, style_tags, setter_note, pin_x, pin_y) values (%L, 3, ''紅'', ''{技巧}'', ''最後一手要果斷'', 20.5, 40)', (select v from ids where k = 'zoneA')));
select tests.lives('定線員：第二條路線',
  format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 5, ''藍'', 50, 50)', (select v from ids where k = 'zoneA')));
select tests.ok('路線編號自動產生 A-01、A-02',
  (select array_agg(code order by code) from public.routes) = array['A-01', 'A-02']);
select tests.ok('路線建立者自動填入', (select bool_and(created_by = :ST) from public.routes));
select tests.throws('定線員：不能在別館新增路線',
  format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 1, ''紅'', 1, 1)', (select v from ids where k = 'zoneG2')));
select tests.throws('定線員：不能直接呼叫別館取號', format('select public.next_route_code(%L)', (select v from ids where k = 'zoneG2')));
select tests.throws('定線員：不能改路線編號', 'update public.routes set code = ''Z-99''');
select tests.throws('定線員：不能刪除路線（用下架）', 'delete from public.routes');
select tests.throws('難度超過 V10 會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 11, ''紅'', 1, 1)', (select v from ids where k = 'zoneA')));
select tests.throws('評語超過 40 字會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y, setter_note) values (%L, 1, ''紅'', 1, 1, repeat(''字'', 41))', (select v from ids where k = 'zoneA')));
select tests.throws('起步點超出照片範圍會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 1, ''紅'', 101, 1)', (select v from ids where k = 'zoneA')));
select tests.throws('不存在的風格標籤會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y, style_tags) values (%L, 1, ''紅'', 1, 1, ''{飛天}'')', (select v from ids where k = 'zoneA')));
-- 區域：定線員只能改照片和換線日
select tests.ok('定線員：可以改照片和換線日',
  tests.rows(format('update public.zones set photo_path = ''mingde/zones/a.jpg'', next_reset_on = current_date + 5 where id = %L', (select v from ids where k = 'zoneA'))) = 1);
select tests.throws('定線員：不能改區域名稱', format('update public.zones set name = ''亂改'' where id = %L', (select v from ids where k = 'zoneA')));
select tests.throws('定線員：不能新增區域', 'insert into public.zones (gym_id, code, name) values (''mingde'', ''E'', ''E 區'')');
select tests.ok('定線員：不能改場館設定（0 筆）', tests.rows('update public.gyms set comments_enabled = false where id = ''mingde''') = 0);
select tests.throws('定線員：不能指派員工', 'select public.assign_staff(''climber_b'', ''mingde'', ''setter'')');
select tests.throws('定線員：不能查帳號', 'select public.lookup_user(''climber_b'')');
reset role;

insert into ids select 'r1', id from public.routes where code = 'A-01';
insert into ids select 'r2', id from public.routes where code = 'A-02';

set role authenticated; select tests.login(:ST2);
select tests.ok('第二館定線員：改不了明德館的路線（0 筆）', tests.rows('update public.routes set grade = 9') = 0);
select tests.ok('第二館定線員：改不了明德館的區域（0 筆）', tests.rows('update public.zones set next_reset_on = null where gym_id = ''mingde''') = 0);
reset role;

set role authenticated; select tests.login(:A);
select tests.throws('顧客：不能新增路線', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 1, ''紅'', 1, 1)', (select v from ids where k = 'zoneA')));
select tests.ok('顧客：改不了路線（0 筆）', tests.rows('update public.routes set grade = 9') = 0);
select tests.throws('顧客：不能取路線編號', format('select public.next_route_code(%L)', (select v from ids where k = 'zoneA')));
reset role;

-- 店長
set role authenticated; select tests.login(:MG);
select tests.ok('店長：可以改區域名稱', tests.rows(format('update public.zones set name = ''A 區'' where id = %L', (select v from ids where k = 'zoneA'))) = 1);
select tests.lives('店長：可以新增區域', 'insert into public.zones (gym_id, code, name, sort) values (''mingde'', ''E'', ''E 區'', 9)');
select tests.ok('店長：可以刪除沒有路線的區域', tests.rows('delete from public.zones where gym_id = ''mingde'' and code = ''E''') = 1);
select tests.throws('店長：不能刪除有路線的區域', format('delete from public.zones where id = %L', (select v from ids where k = 'zoneA')));
select tests.throws('店長：不能改路線流水號', format('update public.zones set route_seq = 0 where id = %L', (select v from ids where k = 'zoneA')));
select tests.ok('店長：改不了別館區域（0 筆）', tests.rows(format('update public.zones set name = ''x'' where id = %L', (select v from ids where k = 'zoneG2'))) = 0);
reset role;

-- ---------------------------------------------------------------------
-- 紀錄與私人心得
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:A);
select tests.lives('顧客甲：記錄 Flash 並寫心得',
  format('insert into public.ascents (route_id, status, feel, grade_feel, private_note) values (%L, ''flash'', 1, 0, ''甲的秘密心得'')', (select v from ids where k = 'r1')));
select tests.lives('顧客甲：記錄嘗試中（感覺會自動清空）',
  format('insert into public.ascents (route_id, status, feel, user_id) values (%L, ''project'', 2, %L)', (select v from ids where k = 'r2'), :B));
select tests.ok('紀錄的使用者一律是本人（傳別人的 id 也沒用）',
  (select user_id from public.ascents where route_id = (select v from ids where k = 'r2')) = :A
  and (select feel from public.ascents where route_id = (select v from ids where k = 'r2')) is null);
select tests.throws('同一條路線不能記兩筆', format('insert into public.ascents (route_id, status) values (%L, ''send'')', (select v from ids where k = 'r1')));
select tests.throws('日期不能早於路線設定日', format('update public.ascents set climbed_on = current_date - 3 where route_id = %L', (select v from ids where k = 'r1')));
select tests.throws('日期不能晚於今天', format('update public.ascents set climbed_on = current_date + 3 where route_id = %L', (select v from ids where k = 'r1')));
select tests.throws('心得超過 300 字會被擋', format('update public.ascents set private_note = repeat(''字'', 301) where route_id = %L', (select v from ids where k = 'r1')));
select tests.ok('顧客甲：讀得到自己的心得', (select private_note from public.ascents where route_id = (select v from ids where k = 'r1')) = '甲的秘密心得');
select tests.ok('my_access() 讀得到自己的帳號名稱', (public.my_access() ->> 'username') = 'climber_a');
select tests.ok('顧客甲：可以改暱稱', tests.rows(format('update public.profiles set nickname = ''阿甲'' where id = %L', :A)) = 1);
select tests.throws('顧客甲：不能把自己設成老闆', format('update public.profiles set is_owner = true where id = %L', :A));
select tests.throws('顧客甲：不能改自己的手機號碼', format('update public.profiles set phone = ''1'' where id = %L', :A));
select tests.throws('顧客甲：不能改自己的帳號名稱', format('update public.profiles set username = ''hacker'' where id = %L', :A));
select tests.ok('顧客甲：改不了別人的暱稱（0 筆）', tests.rows(format('update public.profiles set nickname = ''x'' where id = %L', :B)) = 0);
reset role;

set role authenticated; select tests.login(:B);
select tests.ok('顧客乙：看不到顧客甲的紀錄和心得', (select count(*) from public.ascents) = 0);
select tests.ok('顧客乙：改不了顧客甲的紀錄（0 筆）', tests.rows('update public.ascents set private_note = ''駭'' ') = 0);
select tests.ok('顧客乙：刪不了顧客甲的紀錄（0 筆）', tests.rows('delete from public.ascents') = 0);
select tests.throws('顧客乙：讀不到手機號碼', 'select phone from public.profiles');
select tests.throws('顧客乙：讀不到別人的帳號名稱', 'select username from public.profiles');
select tests.ok('顧客乙：monthly_stats 只算自己（0 條）', (public.monthly_stats(extract(year from current_date)::int, extract(month from current_date)::int) ->> 'sends')::int = 0);
reset role;

set role authenticated; select tests.login(:ST);
select tests.ok('定線員：看不到顧客的紀錄和心得', (select count(*) from public.ascents) = 0);
reset role;
set role authenticated; select tests.login(:MG);
select tests.ok('店長：看不到顧客的紀錄和心得', (select count(*) from public.ascents) = 0);
reset role;
set role authenticated; select tests.login(:OW);
select tests.ok('老闆：看不到顧客的紀錄和心得', (select count(*) from public.ascents) = 0);
select tests.throws('老闆：也讀不到別人的手機號碼', 'select phone from public.profiles');
reset role;

-- ---------------------------------------------------------------------
-- 統計
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:A);
select tests.ok('monthly_stats：完攀 1、Flash 1、攀爬 1 天、最高 V3',
  (select s ->> 'sends' = '1' and s ->> 'flashes' = '1' and s ->> 'days' = '1' and s ->> 'top_grade' = '3' and s ->> 'total_sends' = '1'
     from public.monthly_stats(extract(year from current_date)::int, extract(month from current_date)::int) s),
  public.monthly_stats(extract(year from current_date)::int, extract(month from current_date)::int)::text);
select tests.ok('zone_progress：A 區 2 條、我完成 1 條（嘗試中不算）',
  (select route_count = 2 and done_count = 1 from public.zone_progress('mingde') where code = 'A'));
reset role;
set role anon; select tests.login(null);
select tests.ok('zone_progress：未登入時完成數為 0', (select route_count = 2 and done_count = 0 from public.zone_progress('mingde') where code = 'A'));
reset role;

-- ---------------------------------------------------------------------
-- 留言
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:A);
select tests.lives('顧客甲：可以留言', format('insert into public.comments (route_id, body) values (%L, ''  第三手好遠  '')', (select v from ids where k = 'r1')));
select tests.ok('留言前後空白會自動去掉', (select body from public.comments limit 1) = '第三手好遠');
select tests.throws('留言超過 200 字會被擋', format('insert into public.comments (route_id, body) values (%L, repeat(''字'', 201))', (select v from ids where k = 'r1')));
select tests.throws('空白留言會被擋', format('insert into public.comments (route_id, body) values (%L, ''   '')', (select v from ids where k = 'r1')));
select tests.throws('顧客甲：不能改留言內容', 'update public.comments set body = ''改'' ');
reset role;
set role authenticated; select tests.login(:NN);
select tests.throws('沒填暱稱：不能留言', format('insert into public.comments (route_id, body) values (%L, ''嗨'')', (select v from ids where k = 'r1')));
reset role;
set role authenticated; select tests.login(:B);
select tests.lives('顧客乙：可以留言', format('insert into public.comments (route_id, body) values (%L, ''腳踩對就很簡單'')', (select v from ids where k = 'r1')));
select tests.throws('顧客乙：不能刪顧客甲的留言', format('select public.delete_comment(%L)', (select id from public.comments where user_id = :A)));
reset role;
insert into ids select 'cA', id from public.comments where user_id = :A;
insert into ids select 'cB', id from public.comments where user_id = :B;

set role anon; select tests.login(null);
select tests.ok('未登入：看得到 2 則留言與暱稱',
  (select count(*) from public.comments c join public.profiles p on p.id = c.user_id) = 2);
reset role;

set role authenticated; select tests.login(:A);
select tests.lives('顧客甲：可以刪自己的留言', format('select public.delete_comment(%L)', (select v from ids where k = 'cA')));
select tests.ok('刪掉的留言看不到', (select count(*) from public.comments) = 1);
reset role;
set role authenticated; select tests.login(:ST);
select tests.lives('定線員：可以刪顧客的留言', format('select public.delete_comment(%L)', (select v from ids where k = 'cB')));
reset role;
select tests.ok('員工刪留言有寫操作紀錄', exists (select 1 from public.audit_log where action = 'comment.delete' and target_id = (select v from ids where k = 'cB') and user_id = :ST));
select tests.ok('本人刪自己的留言不寫操作紀錄', not exists (select 1 from public.audit_log where target_id = (select v from ids where k = 'cA')));

-- 留言開關
set role authenticated; select tests.login(:ST);
select tests.ok('定線員：可以關單條路線留言', tests.rows(format('update public.routes set comments_enabled = false where id = %L', (select v from ids where k = 'r2'))) = 1);
reset role;
set role authenticated; select tests.login(:A);
select tests.throws('路線留言關閉：不能留言', format('insert into public.comments (route_id, body) values (%L, ''嗨'')', (select v from ids where k = 'r2')));
reset role;
set role authenticated; select tests.login(:MG);
select tests.ok('店長：可以關全館留言', tests.rows('update public.gyms set comments_enabled = false where id = ''mingde''') = 1);
reset role;
set role authenticated; select tests.login(:A);
select tests.throws('全館留言關閉：不能留言', format('insert into public.comments (route_id, body) values (%L, ''嗨'')', (select v from ids where k = 'r1')));
reset role;
update public.gyms set comments_enabled = true where id = 'mingde';

-- ---------------------------------------------------------------------
-- 整區換線
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:A);
select tests.throws('顧客：不能整區換線', format('select public.archive_zone(%L)', (select v from ids where k = 'zoneA')));
reset role;
set role authenticated; select tests.login(:ST2);
select tests.throws('第二館定線員：不能換明德館的線', format('select public.archive_zone(%L)', (select v from ids where k = 'zoneA')));
reset role;
set role authenticated; select tests.login(:ST);
select tests.ok('定線員：整區換線，下架 2 條', public.archive_zone((select v from ids where k = 'zoneA')) = 2);
select tests.ok('換線後換線日清空', (select next_reset_on from public.zones where id = (select v from ids where k = 'zoneA')) is null);
select tests.lives('換線後新增路線', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 2, ''綠'', 30, 30)', (select v from ids where k = 'zoneA')));
select tests.ok('換線後編號繼續往上加（A-03）', exists (select 1 from public.routes where code = 'A-03' and archived_at is null));
reset role;
select tests.ok('整區換線寫一筆操作紀錄', (select count(*) from public.audit_log where action = 'zone.archive_all') = 1
  and not exists (select 1 from public.audit_log where action = 'route.archive'));

set role authenticated; select tests.login(:A);
select tests.ok('換線後顧客的紀錄和心得還在', (select count(*) from public.ascents) = 2
  and (select private_note from public.ascents where route_id = (select v from ids where k = 'r1')) = '甲的秘密心得');
select tests.ok('已下架路線：仍可修改自己的心得', tests.rows(format('update public.ascents set private_note = ''補寫'' where route_id = %L', (select v from ids where k = 'r1'))) = 1);
select tests.throws('已下架路線：不能留言', format('insert into public.comments (route_id, body) values (%L, ''嗨'')', (select v from ids where k = 'r1')));
select tests.ok('累計完攀包含已下架路線', (public.monthly_stats(extract(year from current_date)::int, extract(month from current_date)::int) ->> 'total_sends')::int = 1);
reset role;

-- 單條下架
set role authenticated; select tests.login(:ST);
select tests.ok('定線員：可以下架單條路線', tests.rows('update public.routes set archived_at = now() where code = ''A-03''') = 1);
reset role;
select tests.ok('單條下架寫操作紀錄', exists (select 1 from public.audit_log where action = 'route.archive' and detail ->> 'code' = 'A-03'));

-- ---------------------------------------------------------------------
-- 操作紀錄可見範圍
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:MG);
select tests.ok('店長：看得到自己館的操作紀錄', (select count(*) from public.audit_log) >= 3);
reset role;
set role authenticated; select tests.login(:ST);
select tests.ok('定線員：看不到操作紀錄', (select count(*) from public.audit_log) = 0);
reset role;
set role authenticated; select tests.login(:A);
select tests.ok('顧客：看不到操作紀錄', (select count(*) from public.audit_log) = 0);
select tests.throws('顧客：不能寫操作紀錄', 'insert into public.audit_log (action) values (''x'')');
select tests.throws('顧客：不能直接呼叫寫紀錄函式', 'select public.write_audit(''mingde'', ''x'', null, null)');
reset role;

-- ---------------------------------------------------------------------
-- 員工指派
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:A);
select tests.throws('顧客：不能查帳號', 'select public.lookup_user(''climber_b'')');
select tests.throws('顧客：不能把自己設成店長', format('insert into public.staff_roles (user_id, gym_id, role) values (%L, ''mingde'', ''manager'')', :A));
reset role;
set role authenticated; select tests.login(:MG);
select tests.ok('店長：指派前可以查對方暱稱', (public.lookup_user('Climber_B') ->> 'nickname') = '乙');
select tests.lives('店長：用帳號名稱指派定線員', 'select public.assign_staff(''climber_b'', ''mingde'', ''setter'')');
select tests.throws('店長：不能指派店長', 'select public.assign_staff(''climber_a'', ''mingde'', ''manager'')');
select tests.throws('店長：不能指派別館員工', 'select public.assign_staff(''climber_a'', ''g2'', ''setter'')');
select tests.throws('店長：不能移除自己（店長只有老闆能動）', format('select public.remove_staff(%L, ''mingde'')', :MG));
select tests.throws('找不到的帳號會提示', 'select public.assign_staff(''nobody_here'', ''mingde'', ''setter'')');
select tests.ok('店長：看得到自己館的員工', (select count(*) from public.staff_roles) = 3);
reset role;
set role authenticated; select tests.login(:B);
select tests.ok('被指派後：顧客乙成為定線員', (public.my_access() -> 'roles' -> 0 ->> 'role') = 'setter');
select tests.ok('定線員只看得到自己的角色', (select count(*) from public.staff_roles) = 1);
reset role;
set role authenticated; select tests.login(:OW);
select tests.lives('老闆：可以指派店長', 'select public.assign_staff(''climber_a'', ''g2'', ''manager'')');
select tests.lives('老闆：可以移除店長', format('select public.remove_staff(%L, ''g2'')', :A));
select tests.ok('老闆：可以在任何館新增路線', tests.rows(format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 1, ''白'', 1, 1)', (select v from ids where k = 'zoneG2'))) = 1);
reset role;

-- ---------------------------------------------------------------------
-- 照片 Storage
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:ST);
select tests.lives('定線員：可以上傳自己館的區域照片', 'insert into storage.objects (bucket_id, name) values (''zone-photos'', ''mingde/zones/a.jpg'')');
select tests.throws('定線員：不能上傳平面圖', 'insert into storage.objects (bucket_id, name) values (''zone-photos'', ''mingde/floorplan/plan.svg'')');
select tests.throws('定線員：不能上傳到別館', 'insert into storage.objects (bucket_id, name) values (''zone-photos'', ''g2/zones/a.jpg'')');
select tests.throws('定線員：不能上傳到其他資料夾', 'insert into storage.objects (bucket_id, name) values (''zone-photos'', ''mingde/a.jpg'')');
reset role;
set role authenticated; select tests.login(:MG);
select tests.lives('店長：可以上傳平面圖', 'insert into storage.objects (bucket_id, name) values (''zone-photos'', ''mingde/floorplan/plan.svg'')');
reset role;
set role authenticated; select tests.login(:A);
select tests.throws('顧客：不能上傳照片', 'insert into storage.objects (bucket_id, name) values (''zone-photos'', ''mingde/zones/b.jpg'')');
select tests.ok('顧客：刪不了照片（0 筆）', tests.rows('delete from storage.objects') = 0);
reset role;
set role anon; select tests.login(null);
select tests.ok('未登入：看得到照片', (select count(*) from storage.objects where bucket_id = 'zone-photos') = 2);
reset role;

-- ---------------------------------------------------------------------
-- 結果
-- ---------------------------------------------------------------------
\o
\set QUIET off
\pset footer off
select n as "#", case when ok then '通過' else '失敗' end as "結果", name as "項目",
       case when ok then '' else coalesce(detail, '') end as "說明"
  from tests.results order by n;
select count(*) filter (where ok) as "通過", count(*) filter (where not ok) as "失敗" from tests.results;
