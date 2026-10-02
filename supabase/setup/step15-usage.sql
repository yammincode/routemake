-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261014000019_usage

-- =====================================================================
-- 使用狀況：記錄「今天有打開 App」，後台看活躍人數、使用率、各館比較、熱門路線
-- - app_opens：每人每天一筆（登入的人才記），附上當時看的館（Spray Wall 記成所在的館＋spray）
--   不記錄看了哪些頁面或路線；只能透過 record_open() 寫入，沒有人能直接讀這張表
-- - usage_stats()：老闆看全部或指定館；店長只能看自己的館；定線員、顧客不能看
-- - 「有使用」＝當天有打開 App，或有記錄攀爬、留言、分享影片
-- =====================================================================
do $do$ begin
  execute 'create ' || $t$table public.app_opens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null default public.taipei_today(),
  gym_id  text references public.gyms (id) on delete set null,
  spray   boolean not null default false,
  primary key (user_id, day)
)$t$;
end $do$;
create index app_opens_day_idx on public.app_opens (day, gym_id);
alter table public.app_opens enable row level security;
revoke all on public.app_opens from anon, authenticated;

-- 記錄今天有打開（同一天再呼叫只更新當時看的館）
create or replace function public.record_open(p_gym text, p_spray boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  if p_gym is not null and not exists (select 1 from public.gyms where id = p_gym) then
    p_gym := null;
  end if;
  insert into public.app_opens (user_id, day, gym_id, spray)
  values (auth.uid(), public.taipei_today(), p_gym, coalesce(p_spray, false))
  on conflict (user_id, day) do update
    set gym_id = coalesce(excluded.gym_id, public.app_opens.gym_id),
        spray = case when excluded.gym_id is null then public.app_opens.spray else excluded.spray end;
end $$;
revoke execute on function public.record_open(text, boolean) from public, anon;
grant execute on function public.record_open(text, boolean) to authenticated;

-- 使用狀況（p_gym = null 表示全部館，只有老闆可以）
create or replace function public.usage_stats(p_gym text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.taipei_today();
  v_from date := public.taipei_today() - 29;
begin
  if p_gym is null and not public.is_owner() then
    raise exception '只有老闆可以看全部館的使用狀況' using errcode = '42501';
  end if;
  if p_gym is not null and not public.is_manager(p_gym) then
    raise exception '只有店長可以看使用狀況' using errcode = '42501';
  end if;

  return (
    with act as (  -- 最近 30 天每個人每天的使用（含在哪間館）
      select o.user_id, o.day, o.gym_id from public.app_opens o where o.day >= v_from
      union
      select a.user_id, (a.created_at at time zone 'Asia/Taipei')::date, z.gym_id
        from public.ascents a join public.routes r on r.id = a.route_id join public.zones z on z.id = r.zone_id
       where a.created_at >= v_from
      union
      select c.user_id, (c.created_at at time zone 'Asia/Taipei')::date, z.gym_id
        from public.comments c join public.routes r on r.id = c.route_id join public.zones z on z.id = r.zone_id
       where c.created_at >= v_from
      union
      select v.user_id, (v.created_at at time zone 'Asia/Taipei')::date, z.gym_id
        from public.route_videos v join public.routes r on r.id = v.route_id join public.zones z on z.id = r.zone_id
       where v.created_at >= v_from
    ), mine as (
      select * from act where p_gym is null or gym_id = p_gym
    ), sends as (  -- 最近 30 天的完攀（含在哪面牆）
      select a.user_id, a.route_id, (a.created_at at time zone 'Asia/Taipei')::date as day, z.gym_id, z.kind
        from public.ascents a join public.routes r on r.id = a.route_id join public.zones z on z.id = r.zone_id
       where a.status in ('flash', 'send') and a.created_at >= v_from and (p_gym is null or z.gym_id = p_gym)
    )
    select jsonb_build_object(
      'registered',  (select count(*) from public.profiles),
      'new7',        (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
      'today',       (select count(distinct user_id) from mine where day = v_today),
      'week',        (select count(distinct user_id) from mine where day > v_today - 7),
      'month',       (select count(distinct user_id) from mine),
      'sends30',     (select count(*) from sends),
      'daily', (
        select jsonb_agg(jsonb_build_object('day', d::date, 'users',
                 (select count(distinct m.user_id) from mine m where m.day = d::date),
                 'sends', (select count(*) from sends s where s.day = d::date)) order by d)
          from generate_series(v_from, v_today, interval '1 day') d
      ),
      'gyms', case when p_gym is null then (
        select coalesce(jsonb_agg(jsonb_build_object('gym', g.id, 'name', g.name,
                 'users', (select count(distinct a.user_id) from act a where a.gym_id = g.id),
                 'sends', (select count(*) from sends s where s.gym_id = g.id)) order by g.sort), '[]'::jsonb)
          from public.gyms g where g.is_live
      ) end,
      'top_routes', (
        select coalesce(jsonb_agg(t order by t.n desc, t.code), '[]'::jsonb) from (
          select r.id, r.code, r.grade, r.hold_color as color, r.name, z.name as zone, z.kind, count(distinct s.user_id) as n
            from sends s join public.routes r on r.id = s.route_id join public.zones z on z.id = r.zone_id
           group by r.id, z.name, z.kind
           order by n desc, r.code limit 5
        ) t
      )
    )
  );
end $$;
revoke execute on function public.usage_stats(text) from public, anon;
grant execute on function public.usage_stats(text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261014000019', 'usage');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from pg_proc where proname in ('record_open', 'usage_stats')) as 使用狀況函式;
