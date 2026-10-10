-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261027000032_ops_access

-- =====================================================================
-- 營運分頁：使用狀況改成老闆授權，而且只看老闆指定的館
-- - usage_viewers：誰可以看哪一館的使用狀況（同一個人可以有好幾館）
-- - 使用狀況只有老闆和被授權的人看得到；店長不再自動看得到自己的館（要老闆授權）
-- - 全部館、各館比較、重新開始統計仍然只有老闆
-- - 授權、取消只能用 set_usage_viewer（老闆），寫在那一館的操作紀錄
-- - my_access 多回傳 usage_gyms（被授權看的館），App 用來決定要不要顯示「營運」分頁和使用狀況
-- - 要先套用 step27（換線日），這份會一起回傳 can_edit_resets
-- - 順便補上 step27 舊版（2026/10/10 以前產生的檔案）少的修正：一次刪好幾區時，換線公告裡的區域一起拿掉
-- =====================================================================
-- 用 execute 建表：Supabase SQL Editor 看到建表指令會跳出「開啟 RLS」提示並改寫整份 SQL，會把後面的函式切壞。下面已經自己開啟 RLS。
do $do$ begin
  execute 'create ' || $t$table public.usage_viewers (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  gym_id     text not null references public.gyms (id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, gym_id)
)$t$;
end $do$;

-- 可以看這一館的使用狀況：老闆，或老闆授權看這一館的人
create or replace function public.can_view_usage(p_gym text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner()
      or exists (select 1 from public.usage_viewers v where v.user_id = auth.uid() and v.gym_id = p_gym)
$$;

-- 授權名單：老闆看得到全部，被授權的人看得到自己；新增、移除只能用 set_usage_viewer（老闆）
alter table public.usage_viewers enable row level security;
create policy usage_viewers_read on public.usage_viewers for select to authenticated
  using (public.is_owner() or user_id = auth.uid());
revoke insert, update, delete, truncate on public.usage_viewers from anon, authenticated;

create or replace function public.set_usage_viewer(p_user uuid, p_gym text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception '只有老闆可以設定使用狀況權限' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception '找不到這個帳號' using errcode = 'P0002';
  end if;
  -- 授權只能給已開放的館；取消不管館有沒有開放都可以（館之後關掉，舊的授權也取消得掉）
  if not exists (select 1 from public.gyms where id = p_gym and (is_live or not p_on)) then
    raise exception '找不到這間館' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.usage_viewers (user_id, gym_id, created_by) values (p_user, p_gym, auth.uid())
      on conflict (user_id, gym_id) do nothing;
  else
    delete from public.usage_viewers where user_id = p_user and gym_id = p_gym;
  end if;
  perform public.write_audit(p_gym, case when p_on then 'usage_viewer.grant' else 'usage_viewer.revoke' end, p_user,
    (select jsonb_build_object('nickname', nickname, 'username', username) from public.profiles where id = p_user));
end $$;
revoke execute on function public.set_usage_viewer(uuid, text, boolean) from public, anon;
grant execute on function public.set_usage_viewer(uuid, text, boolean) to authenticated;

-- 老闆看授權名單：每個人一列，含帳號名稱、暱稱、可以看的館
create or replace function public.usage_viewer_list()
returns table (id uuid, username text, nickname text, gym_ids text[])
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.nickname, array_agg(v.gym_id order by g.sort)
    from public.usage_viewers v
    join public.profiles p on p.id = v.user_id
    join public.gyms g on g.id = v.gym_id
   where public.is_owner()
   group by p.id, p.username, p.nickname
   order by min(v.created_at)
$$;
revoke execute on function public.usage_viewer_list() from public, anon;
grant execute on function public.usage_viewer_list() to authenticated;

-- 使用狀況：指定一館時，要是老闆或被授權看這一館的人（原本是這一館的店長）
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
  if p_gym is not null and not public.can_view_usage(p_gym) then
    raise exception '使用狀況要老闆授權才看得到' using errcode = '42501';
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

-- my_access 多回傳 usage_gyms（被授權看使用狀況的館，照館的順序）
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'phone', p.phone,
    'nickname', p.nickname,
    'avatar_url', p.avatar_url,
    'is_owner', p.is_owner,
    'can_edit_resets', p.is_owner or exists (select 1 from public.reset_editors e where e.user_id = p.id),
    'usage_gyms', coalesce((
      select jsonb_agg(v.gym_id order by g.sort)
        from public.usage_viewers v join public.gyms g on g.id = v.gym_id where v.user_id = p.id), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('gym_id', s.gym_id, 'role', s.role) order by s.gym_id)
        from public.staff_roles s where s.user_id = p.id), '[]'::jsonb)
  ) end
  from public.profiles p where p.id = auth.uid()
$$;

-- step27 舊版的修正：一次刪好幾區（重新分區）時，觸發時那幾區都已經刪掉了，把公告裡所有已經不存在的區一起拿掉
-- （新版 step27 已經是這樣；重複執行沒有影響）
create or replace function public.zones_drop_from_resets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.reset_events
     set zone_ids = array(select z from unnest(zone_ids) z where exists (select 1 from public.zones x where x.id = z))
   where old.id = any (zone_ids);
  return null;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261027000032', 'ops_access');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
