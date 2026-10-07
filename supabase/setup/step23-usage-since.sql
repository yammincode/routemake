-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261022000027_usage_since

-- 使用狀況「統計起始日」：老闆按「從今天重新開始統計」後，所有數字只算這天以後（資料不刪）
-- - usage_settings：只有一列；只能透過 set_usage_since() 修改（只有老闆）
-- - usage_stats() 多回傳 since、上線後註冊 registered_since、測試期間註冊 registered_before

do $do$ begin
  execute 'create ' || $t$table public.usage_settings (
  id         int primary key default 1 check (id = 1),
  since      date,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
)$t$;
end $do$;
alter table public.usage_settings enable row level security;
revoke all on public.usage_settings from anon, authenticated;
insert into public.usage_settings (id, since) values (1, null) on conflict (id) do nothing;

create or replace function public.set_usage_since(p_day date default null) returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := coalesce(p_day, public.taipei_today());
begin
  if not public.is_owner() then
    raise exception '只有老闆可以重新開始統計' using errcode = '42501';
  end if;
  update public.usage_settings set since = v_day, updated_at = now(), updated_by = auth.uid() where id = 1;
  perform public.write_audit(null, 'usage.reset', null, jsonb_build_object('since', v_day));
  return v_day;
end $$;
revoke execute on function public.set_usage_since(date) from public, anon;
grant execute on function public.set_usage_since(date) to authenticated;

create or replace function public.usage_stats(p_gym text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.taipei_today();
  v_since date := (select since from public.usage_settings where id = 1);
  v_from  date;
  v_from_ts timestamptz;
begin
  if p_gym is null and not public.is_owner() then
    raise exception '只有老闆可以看全部館的使用狀況' using errcode = '42501';
  end if;
  if p_gym is not null and not public.is_manager(p_gym) then
    raise exception '只有店長可以看使用狀況' using errcode = '42501';
  end if;
  -- 最近 30 天，但不早於統計起始日
  v_from := greatest(v_today - 29, coalesce(v_since, v_today - 29));
  v_from_ts := (v_from::timestamp at time zone 'Asia/Taipei');

  return (
    with act as (  -- 每個人每天的使用（含在哪間館）
      select o.user_id, o.day, o.gym_id from public.app_opens o where o.day >= v_from
      union
      select a.user_id, (a.created_at at time zone 'Asia/Taipei')::date, z.gym_id
        from public.ascents a join public.routes r on r.id = a.route_id join public.zones z on z.id = r.zone_id
       where a.created_at >= v_from_ts
      union
      select c.user_id, (c.created_at at time zone 'Asia/Taipei')::date, z.gym_id
        from public.comments c join public.routes r on r.id = c.route_id join public.zones z on z.id = r.zone_id
       where c.created_at >= v_from_ts
      union
      select v.user_id, (v.created_at at time zone 'Asia/Taipei')::date, z.gym_id
        from public.route_videos v join public.routes r on r.id = v.route_id join public.zones z on z.id = r.zone_id
       where v.created_at >= v_from_ts
    ), mine as (
      select * from act where p_gym is null or gym_id = p_gym
    ), sends as (
      select a.user_id, a.route_id, (a.created_at at time zone 'Asia/Taipei')::date as day, z.gym_id, z.kind
        from public.ascents a join public.routes r on r.id = a.route_id join public.zones z on z.id = r.zone_id
       where a.status in ('flash', 'send') and a.created_at >= v_from_ts and (p_gym is null or z.gym_id = p_gym)
    ), since_ts as (
      select coalesce((v_since::timestamp at time zone 'Asia/Taipei'), '-infinity'::timestamptz) as t
    )
    select jsonb_build_object(
      'since',             v_since,
      'registered',        (select count(*) from public.profiles),
      'registered_since',  (select count(*) from public.profiles, since_ts where created_at >= since_ts.t),
      'registered_before', (select count(*) from public.profiles, since_ts where created_at < since_ts.t),
      'new7',        (select count(*) from public.profiles, since_ts where created_at >= greatest(now() - interval '7 days', since_ts.t)),
      'today',       (select count(distinct user_id) from mine where day = v_today),
      'week',        (select count(distinct user_id) from mine where day > v_today - 7),
      'month',       (select count(distinct user_id) from mine),
      'sends30',     (select count(*) from sends),
      'daily', (
        select jsonb_agg(jsonb_build_object('day', d::date, 'users',
                 (select count(distinct m.user_id) from mine m where m.day = d::date),
                 'sends', (select count(*) from sends s where s.day = d::date)) order by d)
          from generate_series(v_today - 29, v_today, interval '1 day') d
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

insert into supabase_migrations.schema_migrations (version, name) values ('20261022000027', 'usage_since');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
