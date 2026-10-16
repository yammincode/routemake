-- =====================================================================
-- 路線分析點路線跳到區域頁（step46）
-- - route_insights 的每條路線和熱門路線多回傳 zone_id（在哪一區），後台「路線分析」、使用狀況「路線」分頁點了跳到那一區、標出那一條
-- - 只換掉 route_insights（step45 的其他東西不動），權限照舊：老闆、被授權看那一館的人、那一館的員工
-- 舊版 App 照常可用（多一欄不影響）；還沒執行時新版 App 路線不能點（其他照常）
-- =====================================================================

-- 「路線」分頁（一次一間館）
create or replace function public.route_insights(p_gym text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.taipei_today();
  v_since date := (select since from public.usage_settings where id = 1);
  v_from30 date;
  v_from_ts timestamptz;
  v_resets jsonb := '[]'::jsonb;
begin
  if p_gym is null or not (public.can_view_usage(p_gym) or public.is_staff(p_gym)) then
    raise exception '只有這間館的員工和老闆授權的人看得到路線分析' using errcode = '42501';
  end if;
  v_from30 := greatest(v_today - 29, coalesce(v_since, '-infinity'::date));
  v_from_ts := (v_from30::timestamp at time zone 'Asia/Taipei');

  -- 換線前後：最近 60 天結束的換線公告，比較換線前 7 天和換線後 7 天那幾區的記錄數（換線後還不滿 7 天就算到今天）
  if to_regclass('public.reset_events') is not null then
    select coalesce(jsonb_agg(t order by t.ends_on desc), '[]'::jsonb) into v_resets from (
      select e.label, e.starts_on, e.ends_on,
             least(7, v_today - e.ends_on) as days_after,
             (select count(*) from public.ascents s join public.routes r on r.id = s.route_id
               where r.zone_id = any (e.zone_ids)
                 and (s.created_at at time zone 'Asia/Taipei')::date between e.starts_on - 7 and e.starts_on - 1) as before,
             (select count(*) from public.ascents s join public.routes r on r.id = s.route_id
               where r.zone_id = any (e.zone_ids)
                 and (s.created_at at time zone 'Asia/Taipei')::date between e.ends_on + 1 and e.ends_on + 7) as after
        from public.reset_events e
       where e.gym_id = p_gym and e.ends_on < v_today and e.ends_on >= v_today - 60
       order by e.ends_on desc limit 6
    ) t;
  end if;

  return (
    with wall as (  -- 牆上的岩館路線（Spray Wall、岩友路線不算）
      select r.id, r.code, r.grade, r.hold_color, r.name, r.created_at, z.id as zone_id, z.name as zone
        from public.routes r join public.zones z on z.id = r.zone_id
       where z.gym_id = p_gym and z.kind = 'wall' and r.kind = 'gym' and r.archived_at is null
    ), recent as (  -- 最近 30 天這間館的紀錄（含已經下架的路線）
      select s.user_id, s.status, r.id as route_id, r.grade, r.zone_id
        from public.ascents s join public.routes r on r.id = s.route_id join public.zones z on z.id = r.zone_id
       where z.gym_id = p_gym and z.kind = 'wall' and r.kind = 'gym' and s.created_at >= v_from_ts
    )
    select jsonb_build_object(
      'since', v_since,
      'routes', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', w.id, 'zone_id', w.zone_id, 'code', w.code, 'grade', w.grade, 'color', w.hold_color, 'name', w.name, 'zone', w.zone,
                 'days', v_today - (w.created_at at time zone 'Asia/Taipei')::date,
                 'tried', (select count(*) from public.ascents s where s.route_id = w.id),
                 'sent', (select count(*) from public.ascents s where s.route_id = w.id and s.status in ('flash', 'send')),
                 'flash', (select count(*) from public.ascents s where s.route_id = w.id and s.status = 'flash'),
                 'soft', (select count(*) from public.ascents s where s.route_id = w.id and s.grade_feel = -1),
                 'hard', (select count(*) from public.ascents s where s.route_id = w.id and s.grade_feel = 1)
               ) order by w.zone, w.code), '[]'::jsonb)
          from wall w
      ),
      'zones', (
        select coalesce(jsonb_agg(jsonb_build_object('name', z.name,
                 'records', (select count(*) from recent where recent.zone_id = z.id),
                 'users', (select count(distinct user_id) from recent where recent.zone_id = z.id),
                 'routes', (select count(*) from wall where wall.zone_id = z.id)) order by z.sort), '[]'::jsonb)
          from public.zones z where z.gym_id = p_gym and z.kind = 'wall'
      ),
      -- 難度供需：牆上幾條 vs 最近 30 天完攀幾條（抱石 VB–V2／V3–V5／V6+，上攀 5.9 以下／5.10／5.11+）
      'supply', (
        select jsonb_agg(jsonb_build_object('band', b.id,
                 'wall', (select count(*) from wall where wall.grade between b.lo and b.hi),
                 'sends', (select count(*) from recent where recent.status in ('flash', 'send') and recent.grade between b.lo and b.hi))
               order by b.ord)
          from (values (1, 'easy', -1, 2), (2, 'mid', 3, 5), (3, 'hard', 6, 10),
                       (4, 'rope_easy', 100, 103), (5, 'rope_mid', 104, 107), (6, 'rope_hard', 108, 119)) b(ord, id, lo, hi)
      ),
      'resets', v_resets,
      'top', (
        select coalesce(jsonb_agg(t order by t.n desc, t.code), '[]'::jsonb) from (
          select r.id, r.zone_id, r.code, r.grade, r.hold_color as color, r.name, z.name as zone, count(distinct s.user_id) as n
            from recent s join public.routes r on r.id = s.route_id join public.zones z on z.id = r.zone_id
           where s.status in ('flash', 'send')
           group by r.id, z.name
           order by n desc, r.code limit 5
        ) t
      )
    )
  );
end $$;
revoke execute on function public.route_insights(text) from public, anon;
grant execute on function public.route_insights(text) to authenticated;
