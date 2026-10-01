-- =====================================================================
-- 上攀路線用 YDS 等級（5.6–5.13d）；抱石維持 V0–V10
-- - 每個區域設定等級制：zones.grade_system = 'v'（抱石）或 'yds'（上攀），店長可在後台切換（區域沒有路線時）
-- - routes.grade 用同一個數字欄位：V 級 0–10，YDS 100–119（100 = 5.6 … 119 = 5.13d），一看數字就知道是哪一種
-- - 分數：YDS 另一張分數表 scoring_rules.yds_points（20 個），老闆可調整
-- - 統計的「最高難度」抱石、上攀分開：top_grade（V）、top_yds（YDS）
-- - 中和館：抱石區以外改成 YDS（新店之後再改）
-- =====================================================================
alter table public.zones add column if not exists grade_system text not null default 'v' check (grade_system in ('v', 'yds'));
update public.zones set grade_system = 'yds' where gym_id = 'g3' and code <> 'BO';

alter table public.routes drop constraint if exists routes_grade_check;
alter table public.routes add constraint routes_grade_check check (grade between 0 and 10 or grade between 100 and 119);

-- 路線難度要符合區域的等級制
create or replace function public.routes_grade_system() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_sys text;
begin
  v_sys := (select grade_system from public.zones where id = new.zone_id);
  if v_sys = 'yds' and new.grade < 100 then
    raise exception '這個區域是上攀，難度要用 YDS（5.6–5.13d）' using errcode = '22023';
  elsif v_sys = 'v' and new.grade >= 100 then
    raise exception '這個區域是抱石，難度要用 V0–V10' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger routes_grade_system before insert or update of grade, zone_id on public.routes
  for each row execute function public.routes_grade_system();

-- 切換區域等級制：只有店長，而且區域沒有在牆上的路線
create or replace function public.zones_grade_system_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.grade_system is distinct from old.grade_system then
    if not public.is_db_admin() and not public.is_manager(old.gym_id) then
      raise exception '只有店長可以切換等級制' using errcode = '42501';
    end if;
    if exists (select 1 from public.routes where zone_id = old.id and archived_at is null) then
      raise exception '這區還有路線，整區換線後才能切換等級制' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger zones_grade_system_guard before update of grade_system on public.zones
  for each row execute function public.zones_grade_system_guard();

-- YDS 分數表：5.6, 5.7, 5.8, 5.9, 5.10a–d, 5.11a–d, 5.12a–d, 5.13a–d（約略對應 V 級分數）
alter table public.scoring_rules add column if not exists yds_points int[] not null
  default '{4,5,6,8,10,11,13,15,17,20,25,30,35,40,48,55,70,80,90,110}'
  check (array_length(yds_points, 1) = 20 and 0 <= all (yds_points) and 1000 >= all (yds_points));

create or replace function public.route_points_raw(p_grade int, p_tags text[]) returns numeric
language sql stable set search_path = '' as $$
  select (case when p_grade >= 100 then r.yds_points[p_grade - 99] else r.grade_points[p_grade + 1] end)
         * (1 + least(r.max_style_bonus,
           coalesce((select sum((r.style_bonus ->> t)::numeric) from unnest(p_tags) t), 0)) / 100.0)
    from public.scoring_rules r where r.id = 1
$$;

create or replace function public.monthly_stats(p_year int, p_month int) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select make_date(p_year, p_month, 1) as d0,
           (make_date(p_year, p_month, 1) + interval '1 month')::date as d1,
           (make_date(p_year, p_month, 1) - interval '1 month')::date as p0
  ),
  sends as (
    select a.climbed_on, a.status, r.grade
      from public.ascents a
      join public.routes r on r.id = a.route_id, bounds b
     where a.user_id = auth.uid()
       and a.status in ('flash', 'send')
       and a.climbed_on >= b.d0 and a.climbed_on < b.d1
  )
  select jsonb_build_object(
    'sends',      (select count(*) from sends),
    'flashes',    (select count(*) from sends where status = 'flash'),
    'days',       (select count(distinct climbed_on) from sends),
    'top_grade',  (select max(grade) from sends where grade < 100),
    'top_yds',    (select max(grade) from sends where grade >= 100),
    'by_grade',   coalesce((select jsonb_object_agg(grade, n) from
                    (select grade, count(*) n from sends group by grade) g), '{}'::jsonb),
    'by_day',     coalesce((select jsonb_object_agg(extract(day from climbed_on)::int, n) from
                    (select climbed_on, count(*) n from sends group by climbed_on) d), '{}'::jsonb),
    'prev_sends', (select count(*) from public.ascents a, bounds b
                    where a.user_id = auth.uid() and a.status in ('flash', 'send')
                      and a.climbed_on >= b.p0 and a.climbed_on < b.d0),
    'total_sends',(select count(*) from public.ascents a
                    where a.user_id = auth.uid() and a.status in ('flash', 'send'))
  )
$$;

create or replace function public.profile_card(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
  v_self boolean;
  v_ability int[];
  v_counted int;
  v_month int;
  v_total int;
  v_top int;
  v_top_yds int;
  v_month_start date;
begin
  p := (select x from public.profiles x where x.id = p_user);
  if p.id is null then
    raise exception '找不到這個人' using errcode = 'P0002';
  end if;
  v_self := coalesce(p_user = auth.uid(), false);  -- 未登入時 auth.uid() 是 null，要當成「不是本人」
  if not p.card_public and not v_self then
    return jsonb_build_object('nickname', p.nickname, 'public', false, 'self', false);
  end if;

  v_month_start := date_trunc('month', public.taipei_today())::date;
  v_total := (select count(*) from public.ascents a where a.user_id = p_user and a.status in ('flash', 'send'));
  v_month := (select count(*) from public.ascents a where a.user_id = p_user and a.status in ('flash', 'send') and a.climbed_on >= v_month_start);
  v_top := (select max(r.grade) from public.ascents a join public.routes r on r.id = a.route_id
             where a.user_id = p_user and a.status in ('flash', 'send') and r.grade < 100);
  v_top_yds := (select max(r.grade) from public.ascents a join public.routes r on r.id = a.route_id
                 where a.user_id = p_user and a.status in ('flash', 'send') and r.grade >= 100);
  v_counted := (select count(*) from public.ascents a join public.routes r on r.id = a.route_id
                 where a.user_id = p_user and a.status in ('flash', 'send') and cardinality(r.style_tags) > 0);
  v_ability := (
    with s as (
      select r.grade, r.style_tags from public.ascents a join public.routes r on r.id = a.route_id
       where a.user_id = p_user and a.status in ('flash', 'send')
    ), ax(k, tags) as (
      values (1, '{力量}'::text[]), (2, '{指力}'), (3, '{動態,協調}'), (4, '{耐力}'), (5, '{技巧,腳法,平衡}'), (6, '{柔軟}')
    ), pts as (
      select ax.k, coalesce(sum(public.route_points(s.grade, '{}')) filter (where s.style_tags && ax.tags), 0)::numeric as v
        from ax left join s on true group by ax.k
    )
    select array_agg(case when m.mx > 0 then round(100 * pts.v / m.mx)::int else 0 end order by pts.k)
      from pts, (select max(v) as mx from pts) m
  );

  return jsonb_build_object(
    'nickname', p.nickname, 'public', p.card_public, 'self', v_self,
    'bio', p.bio, 'years', p.climbing_years, 'home_gym', p.home_gym, 'self_stats', p.self_stats,
    'ability', v_ability, 'ability_sends', v_counted,
    'total_sends', v_total, 'month_sends', v_month, 'top_grade', v_top, 'top_yds', v_top_yds
  );
end $$;
