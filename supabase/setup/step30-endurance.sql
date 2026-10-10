-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261029000034_endurance

-- =====================================================================
-- 長耐力區域（第三種區域規則，跟抱石 V 級、上攀 YDS 並列）
-- - zones.grade_system 多 'endurance'：店長切換（跟原本一樣，區域沒有在牆上的路線時才能換）
-- - 路線：照順序標 2–50 個點（routes.holds，[{x, y, t}]，第 1 點 s、最後一點 t、中間 h，由資料庫依順序填）；
--   難度用 YDS（grade 100–119）；不用選顏色（hold_color 固定存「白」）；起步點（pin）＝第 1 點
--   已經有人記錄過的路線，點的位置和順序不能再改（大家記的「第幾點」才對得上）
-- - 紀錄：ascents.highpoint 最高爬到第幾點；Flash、完攀＝最後一點；嘗試中＝1 到倒數第 2 點（沒填算 0 分）
-- - 積分：嘗試中照比例＝完攀分數 × 最高點 ÷ 總點數（四捨五入）；Flash、完攀照舊
-- =====================================================================
-- 舊的等級制檢查（0017 建的，名稱是自動產生的）：依內容找出來刪，不靠名稱
do $do$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.zones'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%grade_system%' loop
    execute format('alter table public.zones drop constraint %I', c);
  end loop;
end $do$;
alter table public.zones add constraint zones_grade_system_check check (grade_system in ('v', 'yds', 'endurance'));

alter table public.ascents add column if not exists highpoint smallint check (highpoint between 1 and 50);

-- 路線難度要符合區域的等級制（長耐力跟上攀一樣用 YDS）
create or replace function public.routes_grade_system() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_sys text;
begin
  v_sys := (select grade_system from public.zones where id = new.zone_id);
  if v_sys = 'yds' and new.grade < 100 then
    raise exception '這個區域是上攀，難度要用 YDS（5.6–5.13d）' using errcode = '22023';
  elsif v_sys = 'endurance' and new.grade < 100 then
    raise exception '這個區域是長耐力，難度要用 YDS（5.6–5.13d）' using errcode = '22023';
  elsif v_sys = 'v' and new.grade >= 100 then
    raise exception '這個區域是抱石，難度要用 V0–V10' using errcode = '22023';
  end if;
  return new;
end $$;

-- 長耐力的點：2–50 個，每個都有 0–100 的 x、y（照片上的百分比位置）
create or replace function public.endurance_holds_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) between 2 and 50
     and not exists (
       select 1 from jsonb_array_elements(p) h
        where jsonb_typeof(h) <> 'object'
           or jsonb_typeof(h -> 'x') <> 'number' or jsonb_typeof(h -> 'y') <> 'number'
           or (h ->> 'x')::numeric not between 0 and 100 or (h ->> 'y')::numeric not between 0 and 100
     )
$$;

-- 這條路線有沒有人記錄過（紀錄只有本人看得到，所以用 security definer 查；只回答有或沒有）
create or replace function public.route_has_ascents(p_route uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ascents a where a.route_id = p_route)
$$;
revoke execute on function public.route_has_ascents(uuid) from public, anon;
grant execute on function public.route_has_ascents(uuid) to authenticated;

-- 路線規則（新增、修改都檢查）：Spray Wall 照舊；長耐力區要有照順序的點；其他區域不能有圈圈
create or replace function public.routes_spray_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_kind text;
  v_sys  text;
  v_first jsonb;
begin
  select kind, grade_system into v_kind, v_sys from public.zones where id = new.zone_id;
  if v_kind = 'spray' then
    if new.name is null or new.holds is null then
      raise exception 'Spray Wall 路線要有名稱和圈圈' using errcode = '22023';
    end if;
    if not public.holds_ok(new.holds) then
      raise exception '路線要有起攀（S）和完攀（T），圈圈最多 60 個' using errcode = '22023';
    end if;
    if not public.contact_free(new.name) or not public.contact_free(new.description) then
      raise exception '路線名稱和介紹不能放聯絡方式（網址、電話、LINE、IG 等）' using errcode = '22023';
    end if;
    new.name := btrim(new.name);
    new.description := nullif(btrim(new.description), '');
    -- 起步點標記放在第一個起攀圈
    v_first := (select h from jsonb_array_elements(new.holds) h where h ->> 't' = 's' limit 1);
    new.pin_x := (v_first ->> 'x')::numeric;
    new.pin_y := (v_first ->> 'y')::numeric;
  elsif v_sys = 'endurance' then
    if new.kind <> 'gym' then
      raise exception '長耐力區只能有岩館路線' using errcode = '22023';
    end if;
    if new.holds is null or not public.endurance_holds_ok(new.holds) then
      raise exception '長耐力路線要照順序標 2–50 個點' using errcode = '22023';
    end if;
    -- 依順序重新整理：只留 x、y（四捨五入到小數兩位），第 1 點 s、最後一點 t、中間 h
    new.holds := (
      select jsonb_agg(jsonb_build_object(
               'x', round((h ->> 'x')::numeric, 2),
               'y', round((h ->> 'y')::numeric, 2),
               't', case when i = 1 then 's' when i = jsonb_array_length(new.holds) then 't' else 'h' end) order by i)
        from jsonb_array_elements(new.holds) with ordinality as e(h, i));
    if tg_op = 'UPDATE' and new.holds is distinct from old.holds
       and public.route_has_ascents(new.id) then
      raise exception '已經有人記錄過這條路線，點的位置和順序不能再改（難度、說明可以改）' using errcode = '22023';
    end if;
    new.hold_color := '白';
    new.pin_x := (new.holds -> 0 ->> 'x')::numeric;
    new.pin_y := (new.holds -> 0 ->> 'y')::numeric;
  else
    if new.kind <> 'gym' or new.holds is not null then
      raise exception '一般區域只能有岩館路線' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind and not public.is_db_admin() then
    raise exception '不能修改路線類型' using errcode = '42501';
  end if;
  return new;
end $$;

-- 紀錄規則多檢查長耐力的「最高爬到第幾點」
create or replace function public.ascents_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_created  date;
  v_archived date;
  v_sys      text;
  v_n        int;
begin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.route_id is distinct from old.route_id) then
    raise exception '不能修改紀錄的使用者或路線' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not public.is_db_admin() then
    new.user_id := auth.uid();
    new.created_at := now();
  end if;
  new.updated_at := now();
  if new.status = 'project' then
    new.feel := null;
    new.grade_feel := null;
  end if;

  -- 長耐力路線：記錄最高爬到第幾點。Flash、完攀＝爬到最後一點；嘗試中是第 1 點到倒數第 2 點（沒填也可以，算 0 分）
  select z.grade_system, jsonb_array_length(r.holds) into v_sys, v_n
    from public.routes r join public.zones z on z.id = r.zone_id
   where r.id = new.route_id and r.kind = 'gym';
  if v_sys = 'endurance' and v_n is not null then
    if new.status in ('flash', 'send') then
      new.highpoint := v_n;
    elsif new.highpoint is not null and new.highpoint >= v_n then
      raise exception '爬到最後一點就是完攀，最高點要小於 %', v_n using errcode = '22023';
    end if;
  else
    new.highpoint := null;
  end if;

  select (r.created_at at time zone 'Asia/Taipei')::date, (r.archived_at at time zone 'Asia/Taipei')::date
    into v_created, v_archived
    from public.routes r where r.id = new.route_id;
  if new.climbed_on < v_created then
    raise exception '日期不能早於路線設定日' using errcode = '22008';
  end if;
  if new.climbed_on > public.taipei_today() then
    raise exception '日期不能晚於今天' using errcode = '22008';
  end if;
  if v_archived is not null and new.climbed_on > v_archived
     and (tg_op = 'INSERT' or new.climbed_on is distinct from old.climbed_on) then
    raise exception '日期不能晚於路線下架日' using errcode = '22008';
  end if;
  return new;
end $$;

-- 一筆紀錄的得分（長耐力版）：嘗試中照比例＝完攀分數 × 最高點 ÷ 總點數；其他情況跟原本的 ascent_points 一樣
create or replace function public.ascent_points(p_grade int, p_tags text[], p_status text, p_high int, p_total int) returns int
language sql stable set search_path = '' as $$
  select case
           when p_status = 'project' and p_high is not null and p_total > 0
             then round(public.route_points_raw(p_grade, p_tags) * p_high / p_total)::int
           else public.ascent_points(p_grade, p_tags, p_status)
         end
$$;

-- 自己的積分：長耐力沒爬完的也照比例算進去
create or replace function public.points_summary(p_year int, p_month int) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with mine as (
    select a.climbed_on, a.status, public.ascent_points(r.grade, r.style_tags, a.status, a.highpoint, jsonb_array_length(r.holds)) as pts
      from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
     where a.user_id = auth.uid()
  ),
  daily as (
    select climbed_on as day, sum(pts)::int as pts from mine group by climbed_on
  ),
  b as (
    select make_date(p_year, p_month, 1) as d0,
           (make_date(p_year, p_month, 1) + interval '1 month')::date as d1,
           (make_date(p_year, p_month, 1) - interval '1 month')::date as p0,
           public.taipei_today() as today
  ),
  -- 連續攀爬：從今天（今天沒爬就從昨天）往回數
  climb_days as (select distinct climbed_on as day from mine),
  streak_start as (
    select case when exists (select 1 from climb_days, b where day = b.today) then b.today else b.today - 1 end as s from b
  ),
  streak as (
    select count(*)::int as n from (
      select day, row_number() over (order by day desc) as rn from climb_days, streak_start where day <= streak_start.s
    ) x, streak_start
    where x.day = streak_start.s - (x.rn - 1)::int
  )
  select jsonb_build_object(
    'by_day',      coalesce((select jsonb_object_agg(extract(day from d.day)::int, d.pts) from daily d, b where d.day >= b.d0 and d.day < b.d1 and d.pts > 0), '{}'::jsonb),
    'month_total', coalesce((select sum(d.pts) from daily d, b where d.day >= b.d0 and d.day < b.d1), 0)::int,
    'prev_total',  coalesce((select sum(d.pts) from daily d, b where d.day >= b.p0 and d.day < b.d0), 0)::int,
    'today',       coalesce((select d.pts from daily d, b where d.day = b.today), 0),
    'avg7',        round(coalesce((select sum(d.pts) from daily d, b where d.day >= b.today - 7 and d.day < b.today), 0) / 7.0, 1),
    'best_day',    (select jsonb_build_object('day', d.day, 'points', d.pts) from daily d, b
                     where d.day >= b.d0 and d.day < b.d1 and d.pts > 0 order by d.pts desc, d.day desc limit 1),
    'streak',      (select n from streak),
    'total',       coalesce((select sum(pts) from mine), 0)::int
  )
$$;

-- 區域頁：自己的紀錄多帶最高爬到第幾點
create or replace function public.zone_view(p_zone uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with r as (
    select id, zone_id, code, grade, hold_color, style_tags, setter_note, pin_x, pin_y, comments_enabled,
           created_at, archived_at, kind, name, description, holds, created_by
      from public.routes
     where zone_id = p_zone and archived_at is null
  )
  select jsonb_build_object(
    'z', (select to_jsonb(z) from (
            select id, gym_id, code, name, photo_path, photo_width, photo_height,
                   public.zone_reset_on(id, next_reset_on) as next_reset_on, sort, grade_system, kind
              from public.zones where id = p_zone) z),
    'g', (select to_jsonb(g) from (
            select id, name, is_live, comments_enabled, sort
              from public.gyms where id = (select gym_id from public.zones where id = p_zone)) g),
    'rs', coalesce((select jsonb_agg(to_jsonb(r) order by r.grade, r.code) from r), '[]'::jsonb),
    'as', coalesce((select jsonb_object_agg(a.route_id, to_jsonb(a)) from (
            select a.id, a.route_id, a.status, a.climbed_on, a.feel, a.grade_feel, a.private_note, a.highpoint
              from public.ascents a join r on r.id = a.route_id
             where a.user_id = auth.uid()) a), '{}'::jsonb),
    'cs', coalesce((select jsonb_object_agg(c.route_id, c.n) from (
            select c.route_id, count(*)::int as n
              from public.comments c join r on r.id = c.route_id
             group by c.route_id) c), '{}'::jsonb)
  );
$$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261029000034', 'endurance');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
