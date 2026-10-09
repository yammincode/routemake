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
-- 二館的 A 區由 migration 0013 建立

\set A   '''00000000-0000-0000-0000-00000000000a'''
\set B   '''00000000-0000-0000-0000-00000000000b'''
\set NN  '''00000000-0000-0000-0000-00000000000c'''
\set ST  '''00000000-0000-0000-0000-0000000000a1'''
\set MG  '''00000000-0000-0000-0000-0000000000a2'''
\set ST2 '''00000000-0000-0000-0000-0000000000b1'''
\set OW  '''00000000-0000-0000-0000-0000000000ff'''

create temp table ids (k text primary key, v uuid);
grant all on ids to anon, authenticated;
insert into ids select 'zoneA', id from public.zones where gym_id = 'mingde' and code = 'A1';
insert into ids select 'zoneB', id from public.zones where gym_id = 'mingde' and code = 'B1';
insert into ids select 'zoneG2', id from public.zones where gym_id = 'g2' and code = 'A';

select tests.ok('初始資料：六間店、明德館 17 區（細分＋Spray Wall）', (select count(*) from public.gyms) = 6
  and (select count(*) from public.zones where gym_id = 'mingde') = 17
  and (select count(*) from public.zones where gym_id = 'mingde' and plan_shape is not null) = 5);
select tests.ok('開放館：明德、萬華、中和、南港、新店（中壢還沒）',
  (select array_agg(id order by id) from public.gyms where is_live) = '{g2,g3,g4,g5,mingde}');
select tests.ok('各館區域數：萬華 9、中和 9、南港 8（＋Spray Wall）、新店 8',
  (select array_agg(n order by gym_id) from (select gym_id, count(*) n from public.zones where gym_id <> 'mingde' group by gym_id) x) = '{9,9,9,8}');
select tests.ok('明德館區域順序：A1–A4、比賽牆 1–4、B1–B3、C1–C3、D1–D2、Spray Wall',
  (select string_agg(name, '、' order by sort) from public.zones where gym_id = 'mingde') = 'A1 區、A2 區、A3 區、A4 區、比賽牆 1、比賽牆 2、比賽牆 3、比賽牆 4、B1 區、B2 區、B3 區、C1 區、C2 區、C3 區、D1 區、D2 區、Spray Wall');
select tests.ok('換線日：比賽牆四段都是 10/6、新店上攀 E 區 10/18',
  (select bool_and(next_reset_on = '2026-10-06') from public.zones where gym_id = 'mingde' and code like 'W%')
  and (select next_reset_on from public.zones where gym_id = 'g5' and code = 'E') = '2026-10-18');
select tests.ok('新使用者自動建立 profiles 並存帳號名稱（轉小寫）',
  (select username from public.profiles where id = :A) = 'climber_a'
  and (select username from public.profiles where id = :B) = 'climber_b');

-- ---------------------------------------------------------------------
-- 未登入的人
-- ---------------------------------------------------------------------
set role anon; select tests.login(null);
select tests.ok('未登入：可以看場館和區域', (select count(*) from public.gyms) = 6 and (select count(*) from public.zones) = 52);
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
select tests.ok('路線編號自動產生 A1-01、A1-02',
  (select array_agg(code order by code) from public.routes) = array['A1-01', 'A1-02']);
select tests.ok('路線建立者自動填入', (select bool_and(created_by = :ST) from public.routes));
-- 訊號差重按：App 先產生路線 id，同一個 id 第二次新增會被擋，不會多一條（測完整段復原，不影響後面的路線數）
do $$
declare
  v_id uuid := gen_random_uuid();
  v_zone uuid := (select v from ids where k = 'zoneA');
  v_ok boolean := false;
begin
  begin
    insert into public.routes (id, zone_id, grade, hold_color, pin_x, pin_y) values (v_id, v_zone, 2, '黃', 10, 10);
    begin
      insert into public.routes (id, zone_id, grade, hold_color, pin_x, pin_y) values (v_id, v_zone, 2, '黃', 10, 10);
    exception when unique_violation then
      v_ok := true;
    end;
    v_ok := v_ok and (select count(*) from public.routes where id = v_id) = 1;
    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then v_ok := false; end if;
  end;
  perform tests.ok('定線員：App 產生的路線 id 重送會被擋（訊號差重按不會多一條）', v_ok);
end $$;
select tests.throws('定線員：不能在別館新增路線',
  format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 1, ''紅'', 1, 1)', (select v from ids where k = 'zoneG2')));
select tests.throws('定線員：不能直接呼叫別館取號', format('select public.next_route_code(%L)', (select v from ids where k = 'zoneG2')));
select tests.throws('定線員：不能改路線編號', 'update public.routes set code = ''Z-99''');
select tests.throws('定線員：不能刪除路線（用下架）', 'delete from public.routes');
select tests.throws('難度低於 VB 會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, -2, ''紅'', 1, 1)', (select v from ids where k = 'zoneA')));
select tests.ok('VB 是合法難度（grade = -1）', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'routes_grade_check') like '%-1%');
select tests.ok('VB 預設 5 分、比 V0 的 10 分低', public.route_points(-1, '{}') = 5 and public.route_points(0, '{}') = 10);
select tests.throws('難度超過 V10 會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 11, ''紅'', 1, 1)', (select v from ids where k = 'zoneA')));
select tests.throws('評語超過 40 字會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y, setter_note) values (%L, 1, ''紅'', 1, 1, repeat(''字'', 41))', (select v from ids where k = 'zoneA')));
select tests.throws('起步點超出照片範圍會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 1, ''紅'', 101, 1)', (select v from ids where k = 'zoneA')));
select tests.throws('不存在的風格標籤會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y, style_tags) values (%L, 1, ''紅'', 1, 1, ''{飛天}'')', (select v from ids where k = 'zoneA')));
select tests.throws('不存在的岩點顏色會被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 1, ''金'', 1, 1)', (select v from ids where k = 'zoneA')));
select tests.ok('岩點顏色可以選灰、蒂芬妮',
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'routes_hold_color_check') like '%灰%蒂芬妮%');
-- 區域：定線員只能改照片和換線日
select tests.ok('定線員：可以改照片和換線日',
  tests.rows(format('update public.zones set photo_path = ''mingde/zones/a.jpg'', next_reset_on = public.taipei_today() + 5 where id = %L', (select v from ids where k = 'zoneA'))) = 1);
select tests.throws('定線員：不能改區域名稱', format('update public.zones set name = ''亂改'' where id = %L', (select v from ids where k = 'zoneA')));
select tests.throws('定線員：不能新增區域', 'insert into public.zones (gym_id, code, name) values (''mingde'', ''E'', ''E 區'')');
select tests.ok('定線員：不能改場館設定（0 筆）', tests.rows('update public.gyms set comments_enabled = false where id = ''mingde''') = 0);
select tests.throws('定線員：不能指派員工', 'select public.assign_staff(''climber_b'', ''mingde'', ''setter'')');
select tests.throws('定線員：不能查帳號', 'select public.lookup_user(''climber_b'')');
reset role;

insert into ids select 'r1', id from public.routes where code = 'A1-01';
insert into ids select 'r2', id from public.routes where code = 'A1-02';

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
select tests.throws('日期不能早於路線設定日', format('update public.ascents set climbed_on = public.taipei_today() - 3 where route_id = %L', (select v from ids where k = 'r1')));
select tests.throws('日期不能晚於今天', format('update public.ascents set climbed_on = public.taipei_today() + 3 where route_id = %L', (select v from ids where k = 'r1')));
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
select tests.ok('顧客乙：monthly_stats 只算自己（0 條）', (public.monthly_stats(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int) ->> 'sends')::int = 0);
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
     from public.monthly_stats(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int) s),
  public.monthly_stats(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int)::text);
select tests.ok('zone_progress：A 區 2 條、我完成 1 條（嘗試中不算）',
  (select route_count = 2 and done_count = 1 from public.zone_progress('mingde') where code = 'A1'));
reset role;
set role anon; select tests.login(null);
select tests.ok('zone_progress：未登入時完成數為 0', (select route_count = 2 and done_count = 0 from public.zone_progress('mingde') where code = 'A1'));
reset role;
set role authenticated; select tests.login(:A);
select tests.ok('zone_view：一次拿到區域、場館、2 條路線、自己全部的紀錄',
  (select v -> 'z' ->> 'code' = 'A1' and v -> 'g' ->> 'id' = 'mingde' and jsonb_array_length(v -> 'rs') = 2
          and (select count(*) from jsonb_object_keys(v -> 'as')) = (select count(*) from public.ascents a join public.routes r on r.id = a.route_id where r.zone_id = (select v from ids where k = 'zoneA') and r.archived_at is null)
          and (select count(*) from jsonb_object_keys(v -> 'as')) > 0
     from public.zone_view((select v from ids where k = 'zoneA')) v));
select tests.ok('zone_view：路線依難度排序', (select (v -> 'rs' -> 0 ->> 'grade')::int <= (v -> 'rs' -> 1 ->> 'grade')::int from public.zone_view((select v from ids where k = 'zoneA')) v));
reset role;
set role authenticated; select tests.login(:B);
select tests.ok('zone_view：顧客乙拿不到別人的紀錄和心得', (select v -> 'as' = '{}'::jsonb and jsonb_array_length(v -> 'rs') = 2 from public.zone_view((select v from ids where k = 'zoneA')) v));
reset role;
set role anon; select tests.login(null);
select tests.ok('zone_view：未登入沒有紀錄', (select v -> 'as' = '{}'::jsonb and jsonb_array_length(v -> 'rs') = 2 from public.zone_view((select v from ids where k = 'zoneA')) v));
select tests.ok('zone_view：不存在的區域回傳空的', (select v -> 'z' = 'null'::jsonb or v ->> 'z' is null from public.zone_view(gen_random_uuid()) v));
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
select tests.ok('zone_view：留言數和實際留言一樣（2 則）',
  (select (v -> 'cs' ->> (select v::text from ids where k = 'r1'))::int = 2 from public.zone_view((select v from ids where k = 'zoneA')) v));
reset role;

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
select tests.ok('換線後編號繼續往上加（A1-03）', exists (select 1 from public.routes where code = 'A1-03' and archived_at is null));
reset role;
select tests.ok('整區換線寫一筆操作紀錄', (select count(*) from public.audit_log where action = 'zone.archive_all') = 1
  and not exists (select 1 from public.audit_log where action = 'route.archive'));

set role authenticated; select tests.login(:A);
select tests.ok('換線後顧客的紀錄和心得還在', (select count(*) from public.ascents) = 2
  and (select private_note from public.ascents where route_id = (select v from ids where k = 'r1')) = '甲的秘密心得');
select tests.ok('已下架路線：仍可修改自己的心得', tests.rows(format('update public.ascents set private_note = ''補寫'' where route_id = %L', (select v from ids where k = 'r1'))) = 1);
select tests.throws('已下架路線：不能留言', format('insert into public.comments (route_id, body) values (%L, ''嗨'')', (select v from ids where k = 'r1')));
select tests.ok('累計完攀包含已下架路線', (public.monthly_stats(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int) ->> 'total_sends')::int = 1);
reset role;

-- 單條下架
set role authenticated; select tests.login(:ST);
select tests.ok('定線員：可以下架單條路線', tests.rows('update public.routes set archived_at = now() where code = ''A1-03''') = 1);
reset role;
select tests.ok('單條下架寫操作紀錄', exists (select 1 from public.audit_log where action = 'route.archive' and detail ->> 'code' = 'A1-03'));

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

select tests.ok('明德細分：A1–A4、W1–W4、B1–B3、C1–C3、D1–D2',
  (select array_agg(code order by sort) from public.zones where gym_id = 'mingde' and kind = 'wall')
    = array['A1','A2','A3','A4','W1','W2','W3','W4','B1','B2','B3','C1','C2','C3','D1','D2']);
select tests.ok('新店細分：A1、A2、B1、B2、C1、C2、D、E', (select array_agg(code order by sort) from public.zones where gym_id = 'g5') = array['A1','A2','B1','B2','C1','C2','D','E']);
select tests.ok('中和細分：A1、A2、AB1、AB2，新區域沿用 YDS', (select array_agg(code order by sort) from public.zones where gym_id = 'g3') = array['A1','A2','AB1','AB2','B','C','D','SP','BO']
  and (select bool_and(grade_system = 'yds') from public.zones where gym_id = 'g3' and code in ('A2', 'AB2')));
select tests.ok('萬華細分：B1、B2、C1、C2、D1、D2，D 右段是教學區 Slab', (select array_agg(code order by sort) from public.zones where gym_id = 'g2') = array['A','B1','B2','C1','C2','D1','D2','SL','TR']
  and (select name from public.zones where gym_id = 'g2' and code = 'SL') = '教學區 Slab');
select tests.ok('新分段沿用原本的換線日（明德 A2 是 9/30、比賽牆 4 是 10/6）',
  (select next_reset_on from public.zones where gym_id = 'mingde' and code = 'A2') = '2026-09-30'
  and (select next_reset_on from public.zones where gym_id = 'mingde' and code = 'W4') = '2026-10-06');
select tests.ok('南港館細分成 8 區（A1–C3，中間長牆左半 C2、右半 C3），沒有舊的 A／B／C',
  (select array_agg(code order by sort) from public.zones where gym_id = 'g4' and kind = 'wall') = array['A1','A2','A3','B1','B2','C1','C2','C3']);

-- ---------------------------------------------------------------------
-- 員工指派
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:A);
select tests.throws('顧客：不能查帳號', 'select public.lookup_user(''climber_b'')');
select tests.throws('顧客：不能搜尋會員', 'select * from public.search_users(''climb'', ''mingde'')');
select tests.throws('顧客：不能用 id 指派員工', format('select public.assign_staff_user(%L, ''mingde'', ''setter'')', :A));
select tests.throws('顧客：不能把自己設成店長', format('insert into public.staff_roles (user_id, gym_id, role) values (%L, ''mingde'', ''manager'')', :A));
reset role;
set role authenticated; select tests.login(:MG);
select tests.ok('店長：指派前可以查對方暱稱', (public.lookup_user('Climber_B') ->> 'nickname') = '乙');
select tests.ok('店長：用暱稱搜尋得到人', (select count(*) from public.search_users('乙', 'mingde') where username = 'climber_b') = 1);
select tests.ok('店長：用部分帳號搜尋（不分大小寫）', (select count(*) from public.search_users('CLIMBER_', 'mingde')) >= 2);
select tests.ok('店長：搜尋最多 5 位', (select count(*) from public.search_users('e', 'mingde')) = 0 and (select count(*) from public.search_users('%%', 'mingde')) = 0);
select tests.ok('店長：搜尋結果附上在這間館的角色', (select role from public.search_users('climber_b', 'mingde') where username = 'climber_b') is null);
select tests.lives('店長：用帳號名稱指派定線員', 'select public.assign_staff(''climber_b'', ''mingde'', ''setter'')');
select tests.throws('店長：不能指派店長', 'select public.assign_staff(''climber_a'', ''mingde'', ''manager'')');
select tests.throws('店長：不能指派別館員工', 'select public.assign_staff(''climber_a'', ''g2'', ''setter'')');
select tests.throws('店長：不能移除自己（店長只有老闆能動）', format('select public.remove_staff(%L, ''mingde'')', :MG));
select tests.throws('找不到的帳號會提示', 'select public.assign_staff(''nobody_here'', ''mingde'', ''setter'')');
select tests.throws('店長：不能用 id 指派店長', format('select public.assign_staff_user(%L, ''mingde'', ''manager'')', :A));
select tests.throws('店長：不能用 id 改掉自己的店長角色', format('select public.assign_staff_user(%L, ''mingde'', ''setter'')', :MG));
select tests.ok('店長：搜尋結果顯示已是定線長', (select role from public.search_users('climber_b', 'mingde') where username = 'climber_b') = 'setter');
select tests.ok('店長：看得到自己館的員工', (select count(*) from public.staff_roles) = 3);
reset role;
set role authenticated; select tests.login(:B);
select tests.ok('被指派後：顧客乙成為定線員', (public.my_access() -> 'roles' -> 0 ->> 'role') = 'setter');
select tests.ok('定線員只看得到自己的角色', (select count(*) from public.staff_roles) = 1);
reset role;
set role authenticated; select tests.login(:OW);
select tests.lives('老闆：可以指派店長', 'select public.assign_staff(''climber_a'', ''g2'', ''manager'')');
select tests.lives('老闆：用 id 把店長改成定線長', format('select public.assign_staff_user(%L, ''g2'', ''setter'')', :A));
select tests.ok('老闆：改角色後只有一筆', (select count(*) = 1 and min(role) = 'setter' from public.staff_roles where user_id = :A and gym_id = 'g2'));
select tests.lives('老闆：再改回店長', format('select public.assign_staff_user(%L, ''g2'', ''manager'')', :A));
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
-- 路線分數與積分
-- ---------------------------------------------------------------------
select tests.ok('分數：V4 無風格 = 40', public.route_points(4, '{}') = 40);
select tests.ok('分數：V4 動態＋指力 = 50', public.route_points(4, '{動態,指力}') = 50);
select tests.ok('分數：風格加成最多 30%（V4 四種風格 = 52）', public.route_points(4, '{動態,指力,力量,耐力}') = 52);
select tests.ok('得分：Flash ×1.2（V4 動態＋指力 = 60）', public.ascent_points(4, '{動態,指力}', 'flash') = 60);
select tests.ok('得分：嘗試中 0 分', public.ascent_points(7, '{}', 'project') = 0);

-- 顧客乙：準備幾筆不同日期的紀錄（管理者身分直接寫入，不受日期規則限制）
insert into public.routes (zone_id, code, grade, hold_color, style_tags, pin_x, pin_y, created_at)
select (select v from ids where k = 'zoneB'), 'B-9' || g, g, '紅', t, 1, 1, now() - interval '60 days'
  from (values (2, '{}'::text[]), (4, '{動態,指力}'::text[]), (6, '{}'::text[])) v(g, t);
insert into public.ascents (user_id, route_id, status, climbed_on)
select :B, r.id, s, d from (values
  ('B-92', 'send',  public.taipei_today()),
  ('B-94', 'flash', public.taipei_today() - 1),
  ('B-96', 'send',  public.taipei_today() - 40)
) v(code, s, d) join public.routes r on r.code = v.code;

set role authenticated; select tests.login(:B);
select tests.ok('積分：今天 20 分、累計 150 分、連續 2 天',
  (select s ->> 'today' = '20' and s ->> 'total' = '150' and s ->> 'streak' = '2'
     from public.points_summary(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int) s),
  public.points_summary(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int)::text);
select tests.ok('積分：最近 7 天平均（不含今天）= 60 / 7 ≈ 8.6',
  (public.points_summary(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int) ->> 'avg7')::numeric = 8.6);
select tests.ok('顧客：改不了計分規則（0 筆）', tests.rows('update public.scoring_rules set flash_multiplier = 3') = 0);
select tests.ok('顧客：改計分規則沒有效果', (select flash_multiplier from public.scoring_rules) = 1.2);
reset role;
set role authenticated; select tests.login(:A);
select tests.ok('顧客甲：積分只算自己', (public.points_summary(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int) ->> 'total')::int
  = (select coalesce(sum(public.ascent_points(r.grade, r.style_tags, a.status)), 0) from public.ascents a join public.routes r on r.id = a.route_id));
reset role;
set role authenticated; select tests.login(:MG);
select tests.ok('店長：不能改計分規則（0 筆）', tests.rows('update public.scoring_rules set flash_multiplier = 2') = 0);
reset role;
set role authenticated; select tests.login(:OW);
select tests.ok('老闆：可以改計分規則', tests.rows('update public.scoring_rules set flash_multiplier = 1.5, grade_points[5] = 50') = 1);
select tests.throws('計分規則：不能用不存在的風格', $q$update public.scoring_rules set style_bonus = '{"飛天":10}'$q$);
select tests.throws('計分規則：難度分數要 11 個', $q$update public.scoring_rules set grade_points = '{1,2,3}'$q$);
reset role;
set role authenticated; select tests.login(:B);
select tests.ok('改規則後分數自動重算（V4 Flash = 50×1.25×1.5 ≈ 94）', public.ascent_points(4, '{動態,指力}', 'flash') = 94);
reset role;
select tests.ok('改計分規則有寫操作紀錄', exists (select 1 from public.audit_log where action = 'scoring.update' and user_id = :OW));
set role anon; select tests.login(null);
select tests.ok('未登入：看得到計分規則', (select count(*) from public.scoring_rules) = 1);
select tests.throws('未登入：不能查積分', 'select public.points_summary(2026, 1)');
reset role;

-- ---------------------------------------------------------------------
-- 安全加強與操作紀錄
-- ---------------------------------------------------------------------
update public.gyms set comments_enabled = true;
insert into public.routes (zone_id, code, grade, hold_color, pin_x, pin_y, created_at)
values ((select v from ids where k = 'zoneB'), 'B-80', 1, '綠', 1, 1, now() - interval '1 day');
-- 每條路線只能留一則，所以頻率限制用 6 條不同的路線測
insert into public.routes (zone_id, code, grade, hold_color, pin_x, pin_y, created_at)
select (select v from ids where k = 'zoneB'), 'B-8' || i, 1, '綠', 1, 1, now() - interval '1 day' from generate_series(1, 5) i;
set role authenticated; select tests.login(:NN);
update public.profiles set nickname = '洗版' where id = :NN;
select tests.lives('留言：1 分鐘內 5 則可以', $q$do $$ begin for i in 0..4 loop insert into public.comments (route_id, body) select id, '第' || i || '則' from public.routes where code = 'B-8' || i; end loop; end $$$q$);
select tests.throws('留言：1 分鐘內第 6 則被擋', $q$insert into public.comments (route_id, body) select id, '第六則' from public.routes where code = 'B-85'$q$);
reset role;
select tests.ok('操作紀錄：指派員工記下暱稱與帳號', exists (select 1 from public.audit_log where action = 'staff.assign' and detail ->> 'username' = 'climber_b' and detail ? 'nickname'));
select tests.ok('操作紀錄：整區換線記下區域名稱', exists (select 1 from public.audit_log where action = 'zone.archive_all' and detail ->> 'zone' = 'A 區'));
set role authenticated; select tests.login(:MG);
select tests.ok('操作紀錄：店長可以連同暱稱一起讀（profiles 關聯）',
  (select count(*) from public.audit_log a left join public.profiles p on p.id = a.user_id where a.gym_id = 'mingde') >= 1);
reset role;

-- ---------------------------------------------------------------------
-- 顧客分享影片（顧客乙前面已被指派為明德館員工，這裡用「洗版」當第二位顧客）
-- ---------------------------------------------------------------------
select tests.login(null);
insert into public.routes (zone_id, code, grade, hold_color, pin_x, pin_y)
values ((select v from ids where k = 'zoneB'), 'B-70', 3, '藍', 1, 1),
       ((select v from ids where k = 'zoneB'), 'B-71', 3, '藍', 1, 1);
insert into ids select 'v70', id from public.routes where code = 'B-70';
insert into ids select 'v71', id from public.routes where code = 'B-71';
create temp table vp (k text primary key, v text);
grant all on vp to anon, authenticated;
insert into vp select 'a1', format('mingde/%s/%s/a1.mp4', (select v from ids where k = 'v70'), :A);
insert into vp select 'a2', format('mingde/%s/%s/a2.mp4', (select v from ids where k = 'v70'), :A);
insert into vp select 'b1', format('mingde/%s/%s/b1.mp4', (select v from ids where k = 'v71'), :NN);

set role authenticated; select tests.login(:A);
select tests.lives('影片：顧客可以上傳到自己的資料夾', format('insert into storage.objects (bucket_id, name, metadata) values (''route-videos'', %L, ''{"size":1000}'')', (select v from vp where k = 'a1')));
select tests.lives('影片：顧客可以新增影片資料', format('insert into public.route_videos (route_id, path, caption, status, duration_s, size_bytes) values (%L, %L, ''第一次完攀'', ''send'', 12.5, 1000)', (select v from ids where k = 'v70'), (select v from vp where k = 'a1')));
select tests.ok('影片：上傳者自動設為本人', (select user_id from public.route_videos where path = (select v from vp where k = 'a1')) = :A);
select tests.throws('影片：不能上傳到別人的資料夾', format('insert into storage.objects (bucket_id, name) values (''route-videos'', ''mingde/%s/%s/x.mp4'')', (select v from ids where k = 'v70'), :B));
select tests.throws('影片：路徑的場館要對', format('insert into storage.objects (bucket_id, name) values (''route-videos'', ''g2/%s/%s/x.mp4'')', (select v from ids where k = 'v70'), :A));
select tests.throws('影片：路徑不能少一層', format('insert into storage.objects (bucket_id, name) values (''route-videos'', ''mingde/%s/x.mp4'')', (select v from ids where k = 'v70')));
select tests.throws('影片：路徑不是路線 id 被擋', format('insert into storage.objects (bucket_id, name) values (''route-videos'', ''mingde/abc/%s/x.mp4'')', :A));
select tests.throws('影片：資料路徑要是自己的', format('insert into public.route_videos (route_id, path) values (%L, ''mingde/%s/%s/y.mp4'')', (select v from ids where k = 'v70'), (select v from ids where k = 'v70'), :B));
select tests.throws('影片：資料路徑和路線要相符', format('insert into public.route_videos (route_id, path) values (%L, %L)', (select v from ids where k = 'v71'), (select v from vp where k = 'a2')));
select tests.throws('影片：超過 60 秒被擋', format('insert into public.route_videos (route_id, path, duration_s) values (%L, %L, 61)', (select v from ids where k = 'v70'), (select v from vp where k = 'a2')));
select tests.throws('影片：說明超過 40 字被擋', format('insert into public.route_videos (route_id, path, caption) values (%L, %L, repeat(''字'', 41))', (select v from ids where k = 'v70'), (select v from vp where k = 'a2')));
select tests.throws('影片：顧客改不了影片資料', 'update public.route_videos set caption = ''改''');
select tests.throws('影片：顧客不能直接刪影片資料（要用 delete_video）', 'delete from public.route_videos');
reset role;
select tests.ok('影片：改資料真的沒有效果', (select caption from public.route_videos where path = (select v from vp where k = 'a1')) = '第一次完攀');

select tests.login(null);
update public.profiles set nickname = null where id = :NN;
set role authenticated; select tests.login(:NN);
select tests.throws('影片：沒有暱稱不能上傳', format('insert into storage.objects (bucket_id, name) values (''route-videos'', ''mingde/%s/%s/n.mp4'')', (select v from ids where k = 'v70'), :NN));
reset role;
select tests.login(null);
update public.profiles set nickname = '洗版' where id = :NN;
update public.routes set comments_enabled = false where code = 'B-71';
set role authenticated; select tests.login(:NN);
select tests.throws('影片：路線關閉留言時不能上傳', format('insert into storage.objects (bucket_id, name) values (''route-videos'', %L)', (select v from vp where k = 'b1')));
reset role;
select tests.login(null);
update public.routes set comments_enabled = true where code = 'B-71';
set role authenticated; select tests.login(:NN);
select tests.lives('影片：另一位顧客上傳到另一條路線', format('insert into storage.objects (bucket_id, name, metadata) values (''route-videos'', %L, ''{"size":2000}'')', (select v from vp where k = 'b1')));
select tests.lives('影片：另一位顧客新增影片資料', format('insert into public.route_videos (route_id, path, status) values (%L, %L, ''project'')', (select v from ids where k = 'v71'), (select v from vp where k = 'b1')));
select tests.throws('影片：不能刪別人的影片', format('select public.delete_video(%L)', (select id from public.route_videos where path = (select v from vp where k = 'a1'))));
select tests.ok('影片：不能刪別人的影片檔（0 筆）', tests.rows(format('delete from storage.objects where name = %L', (select v from vp where k = 'a1'))) = 0);
reset role;

set role anon; select tests.login(null);
select tests.ok('影片：未登入看得到影片清單', (select count(*) from public.route_videos) = 2);
select tests.throws('影片：未登入不能上傳', format('insert into storage.objects (bucket_id, name) values (''route-videos'', %L)', (select v from vp where k = 'a2')));
select tests.throws('影片：未登入不能刪除', format('select public.delete_video(%L)', (select id from public.route_videos limit 1)));
reset role;

-- 每人 24 小時最多 10 支：先放 9 支，第 10 支可以，第 11 支被擋
insert into storage.objects (bucket_id, name, owner)
select 'route-videos', format('mingde/%s/%s/old%s.mp4', (select v from ids where k = 'v70'), :A, i), :A from generate_series(1, 8) i;
set role authenticated; select tests.login(:A);
select tests.lives('影片：24 小時內第 10 支可以', format('insert into storage.objects (bucket_id, name) values (''route-videos'', %L)', (select v from vp where k = 'a2')));
select tests.throws('影片：24 小時內第 11 支被擋', format('insert into storage.objects (bucket_id, name) values (''route-videos'', ''mingde/%s/%s/a3.mp4'')', (select v from ids where k = 'v70'), :A));
reset role;
delete from storage.objects where name like '%/old%.mp4' or name = (select v from vp where k = 'a2');

set role authenticated; select tests.login(:ST2);
select tests.throws('影片：別館員工不能刪', format('select public.delete_video(%L)', (select id from public.route_videos where path = (select v from vp where k = 'a1'))));
select tests.ok('影片：別館員工看不到用量', public.video_usage('mingde') is null);
select tests.ok('影片：別館員工拿不到下架影片路徑', cardinality(public.video_paths_for_routes(array[(select v from ids where k = 'v70')])) = 0);
reset role;
set role authenticated; select tests.login(:ST);
select tests.ok('影片：員工看得到用量（2 支、3000 bytes）', public.video_usage('mingde') = '{"count": 2, "bytes": 3000}'::jsonb, public.video_usage('mingde')::text);
select tests.ok('影片：員工拿得到下架影片路徑', public.video_paths_for_routes(array[(select v from ids where k = 'v70')]) = array[(select v from vp where k = 'a1')]);
select tests.ok('影片：員工刪除影片回傳檔案路徑', public.delete_video((select id from public.route_videos where path = (select v from vp where k = 'b1'))) = (select v from vp where k = 'b1'));
select tests.ok('影片：員工可以刪別人的影片檔', tests.rows(format('delete from storage.objects where name = %L', (select v from vp where k = 'b1'))) = 1);
reset role;
select tests.ok('影片：員工刪影片有寫操作紀錄', exists (select 1 from public.audit_log where action = 'video.delete' and user_id = :ST and detail ->> 'author_nickname' = '洗版' and detail ->> 'code' = 'B-71'));

set role authenticated; select tests.login(:A);
select tests.ok('影片：顧客看不到用量', public.video_usage('mingde') is null);
select tests.ok('影片：顧客拿不到下架影片路徑', cardinality(public.video_paths_for_routes(array[(select v from ids where k = 'v70')])) = 0);
reset role;

-- 漏刪的檔案：超過 1 小時、沒有對應資料
insert into storage.objects (bucket_id, name, owner, created_at) values
  ('route-videos', format('mingde/%s/%s/lost.mp4', (select v from ids where k = 'v70'), :A), :A, now() - interval '2 hours'),
  ('route-videos', format('mingde/%s/%s/new.mp4', (select v from ids where k = 'v70'), :A), :A, now());
set role authenticated; select tests.login(:MG);
select tests.ok('影片：找得到漏刪的檔案（不含剛上傳的）', public.orphan_video_paths('mingde') = array[format('mingde/%s/%s/lost.mp4', (select v from ids where k = 'v70'), :A)], public.orphan_video_paths('mingde')::text);
reset role;
set role authenticated; select tests.login(:A);
select tests.ok('影片：顧客拿不到漏刪清單', cardinality(public.orphan_video_paths('mingde')) = 0);
reset role;

set role authenticated; select tests.login(:ST);
select tests.lives('影片：員工下架路線', format('update public.routes set archived_at = now() where id = %L', (select v from ids where k = 'v70')));
reset role;
select tests.ok('影片：路線下架後影片資料自動刪除', not exists (select 1 from public.route_videos where route_id = (select v from ids where k = 'v70')));
set role authenticated; select tests.login(:A);
select tests.throws('影片：已下架的路線不能上傳', format('insert into storage.objects (bucket_id, name) values (''route-videos'', ''mingde/%s/%s/late.mp4'')', (select v from ids where k = 'v70'), :A));
reset role;

-- 本人刪除自己的影片（不寫操作紀錄）
select tests.login(null);
insert into public.routes (zone_id, code, grade, hold_color, pin_x, pin_y)
values ((select v from ids where k = 'zoneB'), 'B-72', 3, '藍', 1, 1);
set role authenticated; select tests.login(:A);
select tests.lives('影片：顧客分享第二支', format('insert into public.route_videos (route_id, path) select id, format(''mingde/%%s/%%s/z.mp4'', id, %L) from public.routes where code = ''B-72''', :A));
select tests.ok('影片：顧客可以刪自己的影片', public.delete_video((select id from public.route_videos where path like '%/z.mp4')) like '%/z.mp4');
reset role;
select tests.ok('影片：本人刪除不寫操作紀錄', (select count(*) from public.audit_log where action = 'video.delete') = 1);

-- ---------------------------------------------------------------------
-- 區域排序
-- ---------------------------------------------------------------------
create temp table zo (k text primary key, v uuid[]);
grant all on zo to anon, authenticated;
insert into zo select 'rev', array_agg(id order by sort desc, code desc) from public.zones where gym_id = 'mingde';
insert into zo select 'cur', array_agg(id order by sort, code) from public.zones where gym_id = 'mingde';
set role authenticated; select tests.login(:ST);
select tests.throws('區域排序：定線員不能調整', format('select public.reorder_zones(''mingde'', %L)', (select v from zo where k = 'rev')));
reset role;
set role authenticated; select tests.login(:A);
select tests.throws('區域排序：顧客不能調整', format('select public.reorder_zones(''mingde'', %L)', (select v from zo where k = 'rev')));
reset role;
set role authenticated; select tests.login(:ST2);
select tests.throws('區域排序：別館定線員不能調整', format('select public.reorder_zones(''mingde'', %L)', (select v from zo where k = 'rev')));
reset role;
set role authenticated; select tests.login(:MG);
select tests.throws('區域排序：少一區被擋', format('select public.reorder_zones(''mingde'', %L)', (select v[2:] from zo where k = 'rev')));
select tests.throws('區域排序：重複的區被擋', format('select public.reorder_zones(''mingde'', %L)', (select v[1:cardinality(v) - 1] || v[1] from zo where k = 'rev')));
select tests.throws('區域排序：混入別館的區被擋', format('select public.reorder_zones(''mingde'', %L)',
  (select v[1:cardinality(v) - 1] || (select id from public.zones where gym_id = 'g2' limit 1) from zo where k = 'rev')));
select tests.throws('區域排序：店長不能調整別館', format('select public.reorder_zones(''g2'', %L)', (select array_agg(id) from public.zones where gym_id = 'g2')));
select tests.lives('區域排序：店長可以調整', format('select public.reorder_zones(''mingde'', %L)', (select v from zo where k = 'rev')));
reset role;
select tests.ok('區域排序：順序已更新', (select array_agg(id order by sort, code) from public.zones where gym_id = 'mingde') = (select v from zo where k = 'rev'));
select tests.ok('區域排序：有寫操作紀錄', exists (select 1 from public.audit_log where action = 'zone.reorder' and user_id = :MG and jsonb_array_length(detail -> 'zones') = cardinality((select v from zo where k = 'rev'))));
set role authenticated; select tests.login(:OW);
select tests.lives('區域排序：老闆可以調整任何館', format('select public.reorder_zones(''g2'', %L)', (select array_agg(id) from public.zones where gym_id = 'g2')));
select tests.lives('區域排序：老闆改回原本順序', format('select public.reorder_zones(''mingde'', %L)', (select v from zo where k = 'cur')));
reset role;

-- ---------------------------------------------------------------------
-- 留言按讚
-- ---------------------------------------------------------------------
select tests.login(null);
insert into ids select 'likeC', id from public.comments where deleted_at is null order by created_at limit 1;
set role authenticated; select tests.login(:A);
select tests.lives('按讚：顧客可以按讚', format('insert into public.comment_likes (comment_id) values (%L)', (select v from ids where k = 'likeC')));
select tests.throws('按讚：同一則不能按兩次', format('insert into public.comment_likes (comment_id) values (%L)', (select v from ids where k = 'likeC')));
select tests.throws('按讚：不能幫別人按', format('insert into public.comment_likes (comment_id, user_id) values (%L, %L)', (select v from ids where k = 'likeC'), :MG));
select tests.throws('按讚：不能改', 'update public.comment_likes set created_at = now()');
reset role;
set role authenticated; select tests.login(:MG);
select tests.lives('按讚：另一個人也可以按', format('insert into public.comment_likes (comment_id) values (%L)', (select v from ids where k = 'likeC')));
select tests.ok('按讚：不能收回別人的讚（0 筆）', tests.rows(format('delete from public.comment_likes where user_id = %L', :A)) = 0);
reset role;
select tests.login(null);
update public.profiles set nickname = null where id = :NN;
set role authenticated; select tests.login(:NN);
select tests.throws('按讚：沒有暱稱不能按', format('insert into public.comment_likes (comment_id) values (%L)', (select v from ids where k = 'likeC')));
reset role;
select tests.login(null);
update public.profiles set nickname = '洗版' where id = :NN;
set role anon; select tests.login(null);
select tests.ok('按讚：未登入看得到讚數', (select count(*) from public.comment_likes where comment_id = (select v from ids where k = 'likeC')) = 2);
select tests.throws('按讚：未登入不能按', format('insert into public.comment_likes (comment_id) values (%L)', (select v from ids where k = 'likeC')));
reset role;
set role authenticated; select tests.login(:A);
select tests.ok('按讚：可以收回自己的讚', tests.rows('delete from public.comment_likes') = 1);
reset role;
select tests.login(null);
update public.comments set deleted_at = now() where id = (select v from ids where k = 'likeC');
set role authenticated; select tests.login(:A);
select tests.throws('按讚：已刪除的留言不能按', format('insert into public.comment_likes (comment_id) values (%L)', (select v from ids where k = 'likeC')));
reset role;

-- ---------------------------------------------------------------------
-- 每人每條路線一則留言、編輯留言
-- ---------------------------------------------------------------------
select tests.login(null);
insert into public.routes (zone_id, code, grade, hold_color, pin_x, pin_y)
values ((select v from ids where k = 'zoneB'), 'B-60', 2, '白', 1, 1);
insert into ids select 'oneR', id from public.routes where code = 'B-60';
set role authenticated; select tests.login(:A);
select tests.lives('一則留言：第一則可以', format('insert into public.comments (route_id, body) values (%L, ''第一次留言'')', (select v from ids where k = 'oneR')));
select tests.throws('一則留言：同一條路線第二則被擋', format('insert into public.comments (route_id, body) values (%L, ''第二則'')', (select v from ids where k = 'oneR')));
select tests.lives('編輯：可以改自己的留言', format('select public.edit_comment(%L, ''  改過的內容  '')', (select id from public.comments where route_id = (select v from ids where k = 'oneR') and deleted_at is null)));
reset role;
select tests.ok('編輯：內容已更新、記下編輯時間', (select body = '改過的內容' and edited_at is not null from public.comments where route_id = (select v from ids where k = 'oneR') and deleted_at is null));
set role authenticated; select tests.login(:A);
select tests.throws('編輯：空白不行', format('select public.edit_comment(%L, ''   '')', (select id from public.comments where route_id = (select v from ids where k = 'oneR') and deleted_at is null)));
select tests.throws('編輯：超過 200 字不行', format('select public.edit_comment(%L, repeat(''字'', 201))', (select id from public.comments where route_id = (select v from ids where k = 'oneR') and deleted_at is null)));
reset role;
set role authenticated; select tests.login(:MG);
select tests.throws('編輯：店長也不能改別人的留言', format('select public.edit_comment(%L, ''改'')', (select id from public.comments where route_id = (select v from ids where k = 'oneR') and deleted_at is null)));
reset role;
set role anon; select tests.login(null);
select tests.throws('編輯：未登入不能改', format('select public.edit_comment(%L, ''改'')', (select id from public.comments where route_id = (select v from ids where k = 'oneR') and deleted_at is null)));
reset role;
set role authenticated; select tests.login(:A);
select tests.lives('一則留言：刪除後可以再留', format('select public.delete_comment(%L)', (select id from public.comments where route_id = (select v from ids where k = 'oneR') and deleted_at is null)));
select tests.lives('一則留言：刪除後再留一則', format('insert into public.comments (route_id, body) values (%L, ''重新留言'')', (select v from ids where k = 'oneR')));
reset role;
set role authenticated; select tests.login(:B);
select tests.lives('一則留言：別人也可以留', format('insert into public.comments (route_id, body) values (%L, ''我也來'')', (select v from ids where k = 'oneR')));
reset role;
select tests.login(null);
update public.routes set comments_enabled = false where code = 'B-60';
set role authenticated; select tests.login(:A);
select tests.throws('編輯：路線關閉留言後不能改', format('select public.edit_comment(%L, ''改'')', (select id from public.comments where route_id = (select v from ids where k = 'oneR') and user_id = :A and deleted_at is null)));
reset role;

-- ---------------------------------------------------------------------
-- 人物卡
-- ---------------------------------------------------------------------
set role anon; select tests.login(null);
select tests.ok('人物卡：預設不公開，別人只看得到暱稱', public.profile_card(:B) = '{"nickname": "乙", "public": false, "self": false}'::jsonb, public.profile_card(:B)::text);
select tests.throws('人物卡：不能直接讀自我介紹欄位', 'select bio from public.profiles');
reset role;
set role authenticated; select tests.login(:B);
select tests.ok('人物卡：本人看得到自己的（未公開）', (public.profile_card(:B) ->> 'self')::boolean and public.profile_card(:B) ? 'ability');
select tests.throws('人物卡：不能直接改欄位', 'update public.profiles set bio = ''嗨'' where id = auth.uid()');
select tests.throws('人物卡：自我介紹不能放網址', $q$select public.save_my_card(true, '來看 https://x.co', null, null, null)$q$);
select tests.throws('人物卡：自我介紹不能放電話', $q$select public.save_my_card(true, '打給我 0912 345 678', null, null, null)$q$);
select tests.throws('人物卡：自我介紹不能放 IG', $q$select public.save_my_card(true, 'IG 找我', null, null, null)$q$);
select tests.throws('人物卡：自我介紹不能放 LINE', $q$select public.save_my_card(true, '加 line 聊', null, null, null)$q$);
select tests.throws('人物卡：自我介紹不能超過 60 字', $q$select public.save_my_card(true, repeat('字', 61), null, null, null)$q$);
select tests.throws('人物卡：自評要 6 項 1–5', $q$select public.save_my_card(true, '嗨', null, null, '{1,2,3}')$q$);
select tests.throws('人物卡：自評不能超過 5', $q$select public.save_my_card(true, '嗨', null, null, '{1,2,3,4,5,6}')$q$);
select tests.throws('人物卡：年資只能選固定選項', $q$select public.save_my_card(true, '嗨', '10年', null, null)$q$);
select tests.lives('人物卡：可以儲存並公開', $q$select public.save_my_card(true, '  喜歡動態路線  ', '1-3', 'mingde', '{3,4,5,2,3,1}')$q$);
reset role;
set role anon; select tests.login(null);
select tests.ok('人物卡：公開後未登入也看得到', (select c ->> 'bio' = '喜歡動態路線' and c ->> 'years' = '1-3' and c ->> 'home_gym' = 'mingde'
  and c -> 'self_stats' = '[3,4,5,2,3,1]' and not (c ->> 'self')::boolean from public.profile_card(:B) c));
select tests.ok('人物卡：不會回傳私人心得或攀爬時間', (select not (c::text ilike '%note%' or c ? 'climbed_on' or c ? 'last_climb') from public.profile_card(:B) c));
select tests.ok('人物卡：能力值 6 項、最高 100', (select jsonb_array_length(c -> 'ability') = 6 and (select max(x::int) from jsonb_array_elements_text(c -> 'ability') x) = 100 from public.profile_card(:B) c), public.profile_card(:B)::text);
select tests.ok('人物卡：能力值依完攀風格（B-94 動態＋指力 → 動態、指力最高）',
  (select (c -> 'ability' ->> 1)::int = 100 and (c -> 'ability' ->> 2)::int = 100 and (c -> 'ability' ->> 0)::int = 0 from public.profile_card(:B) c), public.profile_card(:B)::text);
select tests.ok('人物卡：最高完攀與總數', (select (c ->> 'top_grade')::int >= 4 and (c ->> 'total_sends')::int >= 3 from public.profile_card(:B) c));
reset role;
set role authenticated; select tests.login(:B);
select tests.lives('人物卡：可以關閉', $q$select public.save_my_card(false, '喜歡動態路線', '1-3', 'mingde', null)$q$);
reset role;
set role authenticated; select tests.login(:A);
select tests.ok('人物卡：關閉後別人又只看得到暱稱', not (public.profile_card(:B) ->> 'public')::boolean and not public.profile_card(:B) ? 'bio');
select tests.throws('人物卡：顧客不能清除別人的自我介紹', format('select public.clear_card_bio(%L, ''mingde'')', :B));
reset role;
set role authenticated; select tests.login(:ST);
select tests.throws('人物卡：定線員不能清除自我介紹', format('select public.clear_card_bio(%L, ''mingde'')', :B));
reset role;
set role authenticated; select tests.login(:MG);
select tests.lives('人物卡：店長可以清除自我介紹', format('select public.clear_card_bio(%L, ''mingde'')', :B));
reset role;
select tests.ok('人物卡：清除後自我介紹是空的、有操作紀錄',
  (select bio is null from public.profiles where id = :B)
  and exists (select 1 from public.audit_log where action = 'card.clear' and detail ->> 'bio' = '喜歡動態路線'));

-- ---------------------------------------------------------------------
-- YDS 等級（上攀）
-- ---------------------------------------------------------------------
select tests.ok('YDS：中和抱石區以外都是 YDS，抱石區是 V',
  (select bool_and(case when code = 'BO' then grade_system = 'v' else grade_system = 'yds' end) from public.zones where gym_id = 'g3'));
select tests.ok('YDS：新店還是 V', (select bool_and(grade_system = 'v') from public.zones where gym_id = 'g5'));
select tests.ok('YDS 分數：5.10a = 10、5.12a = 35', public.route_points(104, '{}') = 10 and public.route_points(112, '{}') = 35);
select tests.ok('V 級分數不變：V4 = 50（前面改過計分規則）', public.route_points(4, '{}') = 50, public.route_points(4, '{}')::text);
set role authenticated; select tests.login(:OW);
select tests.lives('YDS：上攀區可以新增 5.11a', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 108, ''紅'', 1, 1)', (select id from public.zones where gym_id = 'g3' and code = 'A1')));
select tests.throws('YDS：上攀區不能用 V 級', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 4, ''紅'', 1, 1)', (select id from public.zones where gym_id = 'g3' and code = 'A1')));
select tests.throws('YDS：抱石區不能用 YDS', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 108, ''紅'', 1, 1)', (select id from public.zones where gym_id = 'g3' and code = 'BO')));
select tests.throws('YDS：超過 5.13d 被擋', format('insert into public.routes (zone_id, grade, hold_color, pin_x, pin_y) values (%L, 120, ''紅'', 1, 1)', (select id from public.zones where gym_id = 'g3' and code = 'A1')));
select tests.throws('YDS：區域還有路線不能切換等級制', $q$update public.zones set grade_system = 'v' where gym_id = 'g3' and code = 'A1'$q$);
select tests.ok('YDS：沒有路線的區域可以切換', tests.rows($q$update public.zones set grade_system = 'yds' where gym_id = 'g3' and code = 'BO'$q$) = 1);
select tests.ok('YDS：切回來', tests.rows($q$update public.zones set grade_system = 'v' where gym_id = 'g3' and code = 'BO'$q$) = 1);
reset role;
select tests.login(null);
insert into public.staff_roles (user_id, gym_id, role) values (:ST2, 'g3', 'setter') on conflict do nothing;
set role authenticated; select tests.login(:ST2);
select tests.throws('YDS：定線員不能切換等級制', $q$update public.zones set grade_system = 'yds' where gym_id = 'g3' and code = 'BO'$q$);
reset role;
select tests.login(null);
insert into public.ascents (user_id, route_id, status, climbed_on)
select :A, id, 'send', public.taipei_today() from public.routes where grade = 108 limit 1;
set role authenticated; select tests.login(:A);
select tests.ok('YDS：月統計最高難度抱石、上攀分開',
  (select (s ->> 'top_yds')::int = 108 and coalesce((s ->> 'top_grade')::int, 0) < 100
     from public.monthly_stats(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int) s),
  public.monthly_stats(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int)::text);
select tests.ok('YDS：人物卡最高難度抱石、上攀分開', (public.profile_card(:A) ->> 'top_yds')::int = 108);
reset role;

-- ---------------------------------------------------------------------
-- Spray Wall
-- ---------------------------------------------------------------------
select tests.login(null);
insert into ids select 'sw', id from public.zones where gym_id = 'mingde' and code = 'S';
create temp table hs (k text primary key, v text);
grant all on hs to anon, authenticated;
insert into hs values ('ok', '[{"x":10,"y":80,"t":"s","r":2},{"x":30,"y":50,"t":"h"},{"x":50,"y":10,"t":"t","r":3}]'),
                      ('noTop', '[{"x":10,"y":80,"t":"s"},{"x":30,"y":50,"t":"h"}]'),
                      ('bad', '[{"x":10,"y":180,"t":"s"},{"x":50,"y":10,"t":"t"}]');
select tests.ok('Spray：明德 S 區、南港 SW 是 Spray Wall', (select count(*) from public.zones where kind = 'spray') = 2);
select tests.ok('Spray：不出現在區域進度（平面圖）', not exists (select 1 from public.zone_progress('mingde') where code = 'S'));
set role authenticated; select tests.login(:A);
select tests.lives('Spray：岩友可以出路線', format($q$insert into public.routes (zone_id, kind, name, description, grade, hold_color, pin_x, pin_y, holds) values (%L, 'community', ' 下雨天的指力 ', '起步雙手 S', 4, '白', 0, 0, %L)$q$, (select v from ids where k = 'sw'), (select v from hs where k = 'ok')));
reset role;
select tests.ok('Spray：出題者是本人、起步點在第一個 S、名稱去頭尾空白',
  (select created_by = :A and pin_x = 10 and pin_y = 80 and name = '下雨天的指力' from public.routes where name like '%下雨天%'));
insert into ids select 'cr', id from public.routes where name = '下雨天的指力';
set role authenticated; select tests.login(:A);
select tests.throws('Spray：岩友不能出岩館路線', format($q$insert into public.routes (zone_id, kind, name, grade, hold_color, pin_x, pin_y, holds) values (%L, 'gym', '偷出', 4, '白', 0, 0, %L)$q$, (select v from ids where k = 'sw'), (select v from hs where k = 'ok')));
select tests.throws('Spray：沒有完攀 T 不行', format($q$insert into public.routes (zone_id, kind, name, grade, hold_color, pin_x, pin_y, holds) values (%L, 'community', '少了T', 4, '白', 0, 0, %L)$q$, (select v from ids where k = 'sw'), (select v from hs where k = 'noTop')));
select tests.throws('Spray：圈圈座標超出範圍不行', format($q$insert into public.routes (zone_id, kind, name, grade, hold_color, pin_x, pin_y, holds) values (%L, 'community', '超出', 4, '白', 0, 0, %L)$q$, (select v from ids where k = 'sw'), (select v from hs where k = 'bad')));
select tests.throws('Spray：名稱不能放聯絡方式', format($q$insert into public.routes (zone_id, kind, name, grade, hold_color, pin_x, pin_y, holds) values (%L, 'community', '加我IG', 4, '白', 0, 0, %L)$q$, (select v from ids where k = 'sw'), (select v from hs where k = 'ok')));
select tests.throws('Spray：一般區域不能出岩友路線', format($q$insert into public.routes (zone_id, kind, name, grade, hold_color, pin_x, pin_y, holds) values (%L, 'community', '一般', 4, '白', 0, 0, %L)$q$, (select v from ids where k = 'zoneA'), (select v from hs where k = 'ok')));
select tests.lives('Spray：本人可以修改自己的路線', format($q$update public.routes set name = '改名了', grade = 5 where id = %L$q$, (select v from ids where k = 'cr')));
select tests.throws('Spray：不能把岩友路線改成岩館路線', format($q$update public.routes set kind = 'gym' where id = %L$q$, (select v from ids where k = 'cr')));
select tests.lives('Spray：可以按讚', format('insert into public.route_likes (route_id) values (%L)', (select v from ids where k = 'cr')));
select tests.ok('Spray：列表有出題者、讚數、我按過、我出的',
  (select e ->> 'author' = (select nickname from public.profiles where id = :A) and (e ->> 'likes')::int = 1 and (e ->> 'liked')::boolean and (e ->> 'mine')::boolean and not e ? 'created_by'
     from jsonb_array_elements(public.spray_list((select v from ids where k = 'sw'), 'community', null, 'new', 0, 20)) e where e ->> 'name' = '改名了'),
  public.spray_list((select v from ids where k = 'sw'), 'community', null, 'new', 0, 20)::text);
reset role;
set role authenticated; select tests.login(:NN);
select tests.ok('Spray：別人不能改我的路線（0 筆）', tests.rows(format($q$update public.routes set name = '亂改' where id = %L$q$, (select v from ids where k = 'cr'))) = 0);
select tests.ok('Spray：列表篩選難度、我出的', jsonb_array_length(public.spray_list((select v from ids where k = 'sw'), 'community', 4, 'new', 0, 20)) = 0
  and jsonb_array_length(public.spray_list((select v from ids where k = 'sw'), 'community', null, 'mine', 0, 20)) = 0);
reset role;
-- 每人 24 小時最多 5 條（已出 1 條，再 4 條可以，第 6 條被擋）
set role authenticated; select tests.login(:A);
select tests.lives('Spray：24 小時內第 2–5 條可以', format($q$do $$ begin for i in 2..5 loop insert into public.routes (zone_id, kind, name, grade, hold_color, pin_x, pin_y, holds) values (%L, 'community', '路線' || i, 3, '白', 0, 0, %L); end loop; end $$$q$, (select v from ids where k = 'sw'), (select v from hs where k = 'ok')));
select tests.throws('Spray：第 6 條被擋', format($q$insert into public.routes (zone_id, kind, name, grade, hold_color, pin_x, pin_y, holds) values (%L, 'community', '第六條', 3, '白', 0, 0, %L)$q$, (select v from ids where k = 'sw'), (select v from hs where k = 'ok')));
select tests.lives('Spray：本人可以刪除（下架）自己的路線', format($q$update public.routes set archived_at = now() where name = '路線5'$q$));
reset role;
select tests.ok('Spray：本人刪除自己的路線不寫操作紀錄', not exists (select 1 from public.audit_log where action = 'route.archive' and detail ->> 'code' = (select code from public.routes where name = '路線5')));
set role authenticated; select tests.login(:ST);
select tests.lives('Spray：員工可以出岩館路線', format($q$insert into public.routes (zone_id, kind, name, grade, hold_color, pin_x, pin_y, holds) values (%L, 'gym', '教練的路線', 6, '白', 0, 0, %L)$q$, (select v from ids where k = 'sw'), (select v from hs where k = 'ok')));
select tests.lives('Spray：員工可以下架岩友路線', format($q$update public.routes set archived_at = now() where id = %L$q$, (select v from ids where k = 'cr')));
reset role;
select tests.ok('Spray：員工下架岩友路線有操作紀錄', exists (select 1 from public.audit_log where action = 'route.archive' and target_id = (select v from ids where k = 'cr')));
-- 積分：岩友路線不算，岩館路線算
select tests.login(null);
insert into public.ascents (user_id, route_id, status, climbed_on)
select :NN, id, 'send', public.taipei_today() from public.routes where name in ('路線2', '教練的路線');
set role authenticated; select tests.login(:NN);
select tests.ok('Spray：岩友路線不算積分，岩館路線算',
  (public.points_summary(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int) ->> 'today')::int
   = public.route_points(6, '{}'),
  public.points_summary(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int)::text);
select tests.ok('Spray：月統計不算岩友路線', (public.monthly_stats(extract(year from public.taipei_today())::int, extract(month from public.taipei_today())::int) ->> 'top_grade')::int = 6);
reset role;
-- 換公版照片：路線全部下架
select tests.login(null);
update public.zones set photo_path = 'mingde/zones/sw-old.jpg' where code = 'S' and gym_id = 'mingde';
set role authenticated; select tests.login(:ST);
select tests.lives('Spray：員工換公版照片', $q$update public.zones set photo_path = 'mingde/zones/sw-new.jpg' where gym_id = 'mingde' and code = 'S'$q$);
reset role;
select tests.ok('Spray：換照片後路線全部下架', not exists (select 1 from public.routes r join public.zones z on z.id = r.zone_id where z.gym_id = 'mingde' and z.code = 'S' and r.archived_at is null));

-- ---------------------------------------------------------------------
-- 使用狀況
-- ---------------------------------------------------------------------
set role authenticated; select tests.login(:A);
select tests.lives('使用狀況：記錄今天有打開', $q$select public.record_open('mingde')$q$);
select tests.lives('使用狀況：同一天再打開不會出錯', $q$select public.record_open('g2')$q$);
select tests.throws('使用狀況：不能直接讀打開紀錄', 'select * from public.app_opens');
select tests.throws('使用狀況：顧客不能看', $q$select public.usage_stats('mingde')$q$);
reset role;
select tests.ok('使用狀況：每人每天只有一筆、記最後看的館', (select count(*) = 1 and max(gym_id) = 'g2' from public.app_opens where user_id = :A));
set role anon; select tests.login(null);
select tests.throws('使用狀況：未登入不能記錄', $q$select public.record_open('mingde')$q$);
reset role;
set role authenticated; select tests.login(:B);
select tests.lives('使用狀況：亂填館名也不會出錯（記成空的）', $q$select public.record_open('nope')$q$);
reset role;
set role authenticated; select tests.login(:ST);
select tests.throws('使用狀況：定線員不能看', $q$select public.usage_stats('mingde')$q$);
reset role;
set role authenticated; select tests.login(:MG);
select tests.ok('使用狀況：店長看得到自己的館',
  (select (u ->> 'month')::int >= 1 and jsonb_array_length(u -> 'daily') = 30 and u -> 'gyms' = 'null'::jsonb from public.usage_stats('mingde') u),
  public.usage_stats('mingde')::text);
select tests.throws('使用狀況：店長不能看別館', $q$select public.usage_stats('g2')$q$);
select tests.throws('使用狀況：店長不能看全部館', $q$select public.usage_stats(null)$q$);
reset role;
set role authenticated; select tests.login(:OW);
select tests.ok('使用狀況：老闆看得到全部館（有各館比較、註冊人數）',
  (select (u ->> 'registered')::int = (select count(*) from public.profiles) and jsonb_array_length(u -> 'gyms') = 5
          and (u ->> 'today')::int >= 2 from public.usage_stats(null) u),
  public.usage_stats(null)::text);
select tests.ok('使用狀況：萬華今天有 1 人打開', (select (g ->> 'users')::int >= 1 from jsonb_array_elements(public.usage_stats(null) -> 'gyms') g where g ->> 'gym' = 'g2'));
reset role;
set role authenticated; select tests.login(:MG);
select tests.throws('統計起始日：店長不能重新開始統計', $q$select public.set_usage_since(null)$q$);
select tests.throws('統計起始日：不能直接改設定', $q$update public.usage_settings set since = '2000-01-01'$q$);
reset role;
set role authenticated; select tests.login(:OW);
select tests.ok('統計起始日：一開始沒有設定、註冊都算在上線後', (select u ->> 'since' is null and (u ->> 'registered_before')::int = 0 from public.usage_stats(null) u));
select tests.ok('統計起始日：老闆按「從今天重新開始」回傳今天', public.set_usage_since(null) = public.taipei_today());
select tests.lives('統計起始日：設成明天（模擬剛重置）', $q$select public.set_usage_since(public.taipei_today() + 1)$q$);
select tests.ok('統計起始日：之前的使用、完攀都不算，註冊算在測試期間',
  (select (u ->> 'today')::int = 0 and (u ->> 'month')::int = 0 and (u ->> 'sends30')::int = 0
          and (u ->> 'registered_since')::int = 0 and (u ->> 'registered_before')::int = (select count(*) from public.profiles)
          and jsonb_array_length(u -> 'daily') = 30
     from public.usage_stats(null) u), public.usage_stats(null)::text);
select tests.ok('統計起始日：寫操作紀錄', exists (select 1 from public.audit_log where action = 'usage.reset'));
select tests.lives('統計起始日：改回很久以前', $q$select public.set_usage_since('2000-01-01')$q$);
select tests.ok('統計起始日：改回來後今天的使用又算進去', (select (u ->> 'today')::int >= 2 from public.usage_stats(null) u));
reset role;

-- ---------------------------------------------------------------------
-- 意見回饋
-- ---------------------------------------------------------------------
set role anon; select tests.login(null);
select tests.throws('未登入：不能送回饋', $q$insert into public.feedback (kind, body) values ('idea', '想要夜間模式')$q$);
reset role;
set role authenticated; select tests.login(:A);
select tests.lives('顧客甲：可以送回饋', $q$insert into public.feedback (kind, body, contact, gym_id, app_version, device) values ('idea', '  想要夜間模式  ', ' line: abc ', 'mingde', '1.1', 'iPhone')$q$);
select tests.ok('回饋：內容去頭尾空白、狀態從未讀開始、本人是送出者',
  (select body = '想要夜間模式' and contact = 'line: abc' and status = 'new' and user_id = :A from public.feedback));
select tests.lives('回饋：寫別人的 id 也會變成自己', format($q$insert into public.feedback (user_id, kind, body) values (%L, 'bug', '冒用')$q$, :B));
select tests.ok('回饋：冒用的那則仍記在本人名下', (select user_id = :A from public.feedback where body = '冒用'));
select tests.throws('回饋：內容不能空白', $q$insert into public.feedback (kind, body) values ('bug', '   ')$q$);
select tests.throws('回饋：內容最多 1000 字', $q$insert into public.feedback (kind, body) values ('bug', repeat('字', 1001))$q$);
select tests.throws('回饋：類型只能是建議／問題／其他', $q$insert into public.feedback (kind, body) values ('spam', 'x')$q$);
select tests.lives('回饋：第 3–5 則', $q$insert into public.feedback (kind, body) select 'bug', '第' || g || '則' from generate_series(3, 5) g$q$);
select tests.throws('回饋：24 小時最多 5 則', $q$insert into public.feedback (kind, body) values ('other', '第六則')$q$);
select tests.ok('回饋：本人看得到自己送的 5 則', (select count(*) from public.feedback) = 5);
select tests.ok('回饋：本人不能改狀態', tests.rows($q$update public.feedback set status = 'done'$q$) = 0);
select tests.ok('回饋：本人不能刪除', tests.rows($q$delete from public.feedback$q$) = 0 and (select count(*) from public.feedback) = 5);
select tests.throws('回饋：顧客不能看全部回饋', $q$select * from public.feedback_list(null)$q$);
reset role;
set role authenticated; select tests.login(:B);
select tests.ok('顧客乙：看不到別人的回饋', (select count(*) from public.feedback) = 0);
reset role;
set role authenticated; select tests.login(:MG);
select tests.ok('店長：看不到回饋', (select count(*) from public.feedback) = 0);
select tests.throws('店長：不能用 feedback_list', $q$select * from public.feedback_list(null)$q$);
reset role;
set role authenticated; select tests.login(:OW);
select tests.ok('老闆：看得到全部回饋，附暱稱和帳號',
  (select count(*) = 5 and bool_and(nickname = '阿甲' and username = 'climber_a') from public.feedback_list(null)));
select tests.ok('老闆：可以把回饋標成處理中', tests.rows($q$update public.feedback set status = 'doing' where body = '想要夜間模式'$q$) = 1);
select tests.ok('老闆：依狀態篩選', (select count(*) from public.feedback_list('doing')) = 1 and (select count(*) from public.feedback_list('new')) = 4);
select tests.throws('老闆：不能改回饋內容', $q$update public.feedback set body = '改掉' where body = '想要夜間模式'$q$);
reset role;

select tests.ok('每張資料表都有開 RLS', not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  (select string_agg(tablename, ', ') from pg_tables where schemaname = 'public' and not rowsecurity));

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
