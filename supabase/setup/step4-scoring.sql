-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);

-- >>>>>>>>>> 20261003000008_scoring

-- =====================================================================
-- 路線分數與每日積分
-- 路線分數 = 難度分數 ×（1 + 風格加成，最多 max_style_bonus%）
-- 紀錄得分 = 路線分數 × Flash 倍數（完攀 ×1、嘗試中 0），四捨五入；每條路線只算一次，算在 climbed_on 那天
-- 規則只有一組（全部場館共用），所有人可讀，只有老闆能改；改了之後所有人的分數自動重算
-- =====================================================================

create table public.scoring_rules (
  id               int primary key default 1 check (id = 1),
  grade_points     int[] not null check (array_length(grade_points, 1) = 11 and 0 <= all (grade_points) and 1000 >= all (grade_points)),
  style_bonus      jsonb not null,                -- {"力量": 10, …}，單位 %
  max_style_bonus  int not null default 30 check (max_style_bonus between 0 and 200),
  flash_multiplier numeric(4, 2) not null default 1.2 check (flash_multiplier between 1 and 3),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id) on delete set null
);

-- 風格加成：只能用 9 種風格、每項 0–100%
create or replace function public.valid_style_bonus(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
        where e.key <> all (array['力量','指力','技巧','平衡','腳法','動態','協調','柔軟','耐力'])
           or jsonb_typeof(e.value) <> 'number'
           or (e.value)::numeric not between 0 and 100
     )
$$;
alter table public.scoring_rules add constraint scoring_rules_style_bonus_check check (public.valid_style_bonus(style_bonus));

insert into public.scoring_rules (grade_points, style_bonus, max_style_bonus, flash_multiplier) values (
  array[10, 15, 20, 30, 40, 55, 70, 90, 110, 135, 160],
  '{"力量":10,"指力":10,"動態":15,"耐力":10,"協調":10,"技巧":5,"平衡":5,"腳法":5,"柔軟":5}',
  30, 1.2
) on conflict (id) do nothing;

alter table public.scoring_rules enable row level security;
create policy scoring_rules_read on public.scoring_rules for select to anon, authenticated using (true);
create policy scoring_rules_update on public.scoring_rules for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
revoke insert, delete, truncate on public.scoring_rules from anon, authenticated;
revoke update on public.scoring_rules from anon;

-- 修改時記錄是誰改的，並寫操作紀錄
create or replace function public.scoring_rules_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  perform public.write_audit(null, 'scoring.update', null, jsonb_build_object(
    'grade_points', new.grade_points, 'style_bonus', new.style_bonus,
    'max_style_bonus', new.max_style_bonus, 'flash_multiplier', new.flash_multiplier));
  return new;
end $$;
create trigger scoring_rules_before_update before update on public.scoring_rules
  for each row execute function public.scoring_rules_before_update();

-- ---------------------------------------------------------------------
-- 分數計算
-- ---------------------------------------------------------------------
-- 路線分數（未四捨五入）
create or replace function public.route_points_raw(p_grade int, p_tags text[]) returns numeric
language sql stable set search_path = '' as $$
  select r.grade_points[p_grade + 1] * (1 + least(r.max_style_bonus,
           coalesce((select sum((r.style_bonus ->> t)::numeric) from unnest(p_tags) t), 0)) / 100.0)
    from public.scoring_rules r where r.id = 1
$$;

-- 路線分數（顯示用，四捨五入）
create or replace function public.route_points(p_grade int, p_tags text[]) returns int
language sql stable set search_path = '' as $$
  select round(public.route_points_raw(p_grade, p_tags))::int
$$;

-- 一筆紀錄的得分
create or replace function public.ascent_points(p_grade int, p_tags text[], p_status text) returns int
language sql stable set search_path = '' as $$
  select case p_status
           when 'flash' then round(public.route_points_raw(p_grade, p_tags)
                                   * (select flash_multiplier from public.scoring_rules where id = 1))::int
           when 'send'  then public.route_points(p_grade, p_tags)
           else 0
         end
$$;

-- ---------------------------------------------------------------------
-- points_summary(年, 月)：目前登入者自己的積分
-- 本月每天得分、本月總分、上個月總分、今天得分、最近 7 天（不含今天）平均、最高分的一天、
-- 連續攀爬天數（到今天或昨天為止，有任何紀錄就算）、累計總分
-- ---------------------------------------------------------------------
create or replace function public.points_summary(p_year int, p_month int) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with mine as (
    select a.climbed_on, a.status, public.ascent_points(r.grade, r.style_tags, a.status) as pts
      from public.ascents a join public.routes r on r.id = a.route_id
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

revoke execute on function public.points_summary(int, int) from public, anon;
grant execute on function public.points_summary(int, int) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261003000008', 'scoring');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select grade_points::text from public.scoring_rules) as 難度分數,
       (select flash_multiplier from public.scoring_rules) as flash倍數,
       public.route_points(4, '{動態,指力}') as 範例_V4動態指力;
