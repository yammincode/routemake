-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261114000051_usage_insights

-- =====================================================================
-- 使用狀況：更多數據分析（step45）
-- - app_opens.hours：當天幾點有打開 App（24 格，第 n 格＝n 點），record_open() 每次打開補上那一格
--   之前的打開紀錄沒有時間（0），「幾點最多人用」從套用這份以後才開始累積（記錄攀爬的時間以前就有）
-- - usage_insights(館)：給「人」「互動」分頁；權限跟 usage_stats 一樣（全部館只有老闆，指定館要老闆授權）
--   回頭率、新客人第一週、常客分群、程度分布、進步、幾點最多人用、每天留言影片按讚、熱門影片和留言、選了哪個夥伴
-- - route_insights(館)：給「路線」分頁；老闆、被授權看那一館使用狀況的人，加上那一館的員工（定線員、店長）
--   牆上每條路線試過／完攀／Flash／難度體感、各區熱度、換線前後比較、難度供需、熱門路線（路線帶 zone_id，點了跳到那一區）
-- - 只回傳總數和比例，不回傳客人的名字（熱門影片、留言照 App 裡本來就公開的暱稱顯示）
-- - 數字一樣不早於「統計起始日」（usage_settings.since）
-- 舊版 App 照常可用（record_open 參數不變）
-- =====================================================================

alter table public.app_opens add column if not exists hours int not null default 0;

-- 記錄今天有打開（同一天再呼叫只更新當時看的館，並補上現在幾點）
create or replace function public.record_open(p_gym text, p_spray boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_bit int := 1 << extract(hour from (now() at time zone 'Asia/Taipei'))::int;
begin
  if auth.uid() is null then return; end if;
  if p_gym is not null and not exists (select 1 from public.gyms where id = p_gym) then
    p_gym := null;
  end if;
  insert into public.app_opens (user_id, day, gym_id, spray, hours)
  values (auth.uid(), public.taipei_today(), p_gym, coalesce(p_spray, false), v_bit)
  on conflict (user_id, day) do update
    set gym_id = coalesce(excluded.gym_id, public.app_opens.gym_id),
        spray = case when excluded.gym_id is null then public.app_opens.spray else excluded.spray end,
        hours = public.app_opens.hours | v_bit;
end $$;
revoke execute on function public.record_open(text, boolean) from public, anon;
grant execute on function public.record_open(text, boolean) to authenticated;

-- 內部用：從某天起每個人每天的使用（打開 App、記錄攀爬、留言、分享影片），附上在哪間館
-- 跟 usage_stats 的「有使用」同一個定義；只給下面的分析函式用，App 不能直接呼叫
create or replace function public.usage_activity(p_from date)
returns table (user_id uuid, day date, gym_id text)
language sql stable security definer set search_path = '' as $$
  with f as (select (p_from::timestamp at time zone 'Asia/Taipei') as ts)
  select o.user_id, o.day, o.gym_id from public.app_opens o where o.day >= p_from
  union
  select a.user_id, (a.created_at at time zone 'Asia/Taipei')::date, z.gym_id
    from public.ascents a join public.routes r on r.id = a.route_id join public.zones z on z.id = r.zone_id, f
   where a.created_at >= f.ts
  union
  select c.user_id, (c.created_at at time zone 'Asia/Taipei')::date, z.gym_id
    from public.comments c join public.routes r on r.id = c.route_id join public.zones z on z.id = r.zone_id, f
   where c.created_at >= f.ts
  union
  select v.user_id, (v.created_at at time zone 'Asia/Taipei')::date, z.gym_id
    from public.route_videos v join public.routes r on r.id = v.route_id join public.zones z on z.id = r.zone_id, f
   where v.created_at >= f.ts
$$;
revoke execute on function public.usage_activity(date) from public, anon, authenticated;

-- 「人」「互動」分頁
create or replace function public.usage_insights(p_gym text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.taipei_today();
  v_since date := (select since from public.usage_settings where id = 1);
  v_floor date;
  v_from30 date;
  v_from14 date;
  v_out jsonb;
  v_likes jsonb := '{}'::jsonb;       -- 每天影片的讚（{日期: 數}），還沒套用 step42 時是空的
  v_top_video jsonb;
  v_mascots jsonb;
begin
  if p_gym is null and not public.is_owner() then
    raise exception '只有老闆可以看全部館的使用狀況' using errcode = '42501';
  end if;
  if p_gym is not null and not public.can_view_usage(p_gym) then
    raise exception '使用狀況要老闆授權才看得到' using errcode = '42501';
  end if;
  v_floor := coalesce(v_since, '-infinity'::date);
  v_from30 := greatest(v_today - 29, v_floor);
  v_from14 := greatest(v_today - 13, v_floor);

  -- 影片按讚（step42）：沒有這張表就不算
  if to_regclass('public.video_likes') is not null then
    select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) into v_likes from (
      select (l.created_at at time zone 'Asia/Taipei')::date as d, count(*) as n
        from public.video_likes l join public.route_videos v on v.id = l.video_id
        join public.routes r on r.id = v.route_id join public.zones z on z.id = r.zone_id
       where (l.created_at at time zone 'Asia/Taipei')::date >= v_from14 and (p_gym is null or z.gym_id = p_gym)
       group by 1
    ) t;
    select jsonb_build_object('caption', v.caption, 'nickname', p.nickname, 'zone', z.name, 'code', r.code,
             'grade', r.grade, 'color', r.hold_color, 'name', r.name, 'likes', count(l.user_id))
      into v_top_video
      from public.route_videos v join public.routes r on r.id = v.route_id join public.zones z on z.id = r.zone_id
      join public.profiles p on p.id = v.user_id
      join public.video_likes l on l.video_id = v.id
     where (v.created_at at time zone 'Asia/Taipei')::date >= v_from14 and (p_gym is null or z.gym_id = p_gym)
     group by v.id, p.nickname, z.name, r.id
     order by count(l.user_id) desc, v.created_at desc limit 1;
  end if;

  -- 原岩夥伴（step41）：沒有這一欄就不算；指定館時只算最近 30 天在那一館用過的人
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'mascot') then
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_mascots from (
      select coalesce(p.mascot ->> 'id', '') as k, count(*) as n
        from public.profiles p
       where p_gym is null
          or p.id in (select a.user_id from public.usage_activity(v_from30) a where a.gym_id = p_gym)
       group by 1
    ) t;
  end if;

  with act as (
    select a.user_id, a.day, a.gym_id from public.usage_activity(greatest(v_today - 37, v_floor)) a
  ), mine as (
    select distinct user_id, day from act where p_gym is null or gym_id = p_gym
  ), uw as (  -- 每個人最近 4 週各週有沒有用（0＝最近 7 天）；先彙總成一人一列，不逐筆查
    select user_id,
           bool_or(day > v_today - 7) as w0,
           bool_or(day between v_today - 13 and v_today - 7) as w1,
           bool_or(day between v_today - 20 and v_today - 14) as w2,
           bool_or(day between v_today - 27 and v_today - 21) as w3
      from mine where day > v_today - 28 group by user_id
  ), reg as (  -- 新客人：7～37 天前註冊（第一週已經過完）
    select p.id, (p.created_at at time zone 'Asia/Taipei')::date as r
      from public.profiles p
     where (p.created_at at time zone 'Asia/Taipei')::date between greatest(v_today - 37, v_floor) and v_today - 7
  ), nb as (  -- 第一週（註冊當天起 7 天）的使用：一次 join 彙總
    select n.id,
           bool_or(a.day = n.r + 1) as next_day,
           count(distinct a.day) >= 2 as two_days,
           bool_or(a.gym_id = p_gym) as at_gym
      from reg n join act a on a.user_id = n.id and a.day between n.r and n.r + 6
     group by n.id
  ), nbf as (  -- 指定館時只算第一週有在這間館用過的人；記第一條路線看 ascents（有 user_id 開頭的索引）
    select nb.id, nb.next_day, nb.two_days,
           exists (select 1 from public.ascents s join reg on reg.id = nb.id where s.user_id = nb.id
                    and (s.created_at at time zone 'Asia/Taipei')::date between reg.r and reg.r + 6) as first_route
      from nb where p_gym is null or nb.at_gym
  ), days30 as (
    select user_id, count(*) as n from mine where day >= v_from30 group by user_id
  ), vsends as (  -- 抱石（V 級）Flash／完攀，岩友路線不算
    select s.user_id, r.grade, s.climbed_on
      from public.ascents s join public.routes r on r.id = s.route_id join public.zones z on z.id = r.zone_id
     where s.status in ('flash', 'send') and r.grade between -1 and 10 and r.kind = 'gym' and z.kind = 'wall'
       and s.climbed_on >= v_floor and (p_gym is null or z.gym_id = p_gym)
  ), lvl as (
    select user_id, max(grade) filter (where climbed_on >= v_from30) as recent,
           max(grade) filter (where climbed_on < v_today - 29) as before
      from vsends group by user_id
  ), hr as (  -- 幾點有使用：打開 App（step45 之後才有；一天只記一間館，算在那天最後看的館）＋記錄攀爬的時間
    select o.user_id, o.day, h
      from public.app_opens o, generate_series(0, 23) h
     where o.day >= v_from30 and o.hours & (1 << h) <> 0 and (p_gym is null or o.gym_id = p_gym)
    union
    select s.user_id, (s.created_at at time zone 'Asia/Taipei')::date,
           extract(hour from (s.created_at at time zone 'Asia/Taipei'))::int
      from public.ascents s join public.routes r on r.id = s.route_id join public.zones z on z.id = r.zone_id
     where (s.created_at at time zone 'Asia/Taipei')::date >= v_from30 and (p_gym is null or z.gym_id = p_gym)
  ), hrs as (
    select h, count(distinct (user_id, day)) as n from hr group by h
  ), cm as (
    select c.id, c.body, c.user_id, c.route_id, c.created_at
      from public.comments c join public.routes r on r.id = c.route_id join public.zones z on z.id = r.zone_id
     where c.deleted_at is null and (c.created_at at time zone 'Asia/Taipei')::date >= v_from14
       and (p_gym is null or z.gym_id = p_gym)
  )
  select jsonb_build_object(
    'since', v_since,
    -- 回頭率：base＝那一週用過的人，back＝其中下一週也用過的；那一週早於統計起始日時是 null
    'retention', jsonb_build_object(
      'now', case when v_today - 13 >= v_floor then jsonb_build_object(
               'base', (select count(*) from uw where w1), 'back', (select count(*) from uw where w1 and w0)) end,
      'prev', case when v_today - 20 >= v_floor then jsonb_build_object(
               'base', (select count(*) from uw where w2), 'back', (select count(*) from uw where w2 and w1)) end,
      'cohort', case when v_today - 27 >= v_floor then jsonb_build_object(
               'base', (select count(*) from uw where w3),
               'kept', jsonb_build_array((select count(*) from uw where w3 and w2), (select count(*) from uw where w3 and w1),
                                         (select count(*) from uw where w3 and w0))) end
    ),
    'newbie', jsonb_build_object(
      'n', (select count(*) from nbf),
      'next_day', (select count(*) from nbf where next_day),
      'first_route', (select count(*) from nbf where first_route),
      'two_days', (select count(*) from nbf where two_days)
    ),
    'groups', jsonb_build_object(
      'regular', (select count(*) from days30 where n >= 8),
      'sometimes', (select count(*) from days30 where n between 2 and 7),
      'once', (select count(*) from days30 where n = 1)
    ),
    'levels', jsonb_build_object(
      'easy', (select count(*) from lvl where recent <= 2),
      'mid', (select count(*) from lvl where recent between 3 and 5),
      'hard', (select count(*) from lvl where recent >= 6)
    ),
    'progress', jsonb_build_object(
      'climbers', (select count(*) from lvl where recent is not null and before is not null),
      'improved', (select count(*) from lvl where recent > before)
    ),
    'hours', (select jsonb_agg(coalesce(hrs.n, 0) order by g) from generate_series(0, 23) g left join hrs on hrs.h = g),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', d::date,
               'comments', (select count(*) from cm where (cm.created_at at time zone 'Asia/Taipei')::date = d::date),
               'videos', (select count(*) from public.route_videos v join public.routes r on r.id = v.route_id
                           join public.zones z on z.id = r.zone_id
                          where (v.created_at at time zone 'Asia/Taipei')::date = d::date and (p_gym is null or z.gym_id = p_gym)),
               'likes', coalesce((v_likes ->> d::date::text)::int, 0)
                      + (select count(*) from public.comment_likes l join public.comments c on c.id = l.comment_id
                          join public.routes r on r.id = c.route_id join public.zones z on z.id = r.zone_id
                          where (l.created_at at time zone 'Asia/Taipei')::date = d::date and c.deleted_at is null
                            and (p_gym is null or z.gym_id = p_gym))
             ) order by d)
        from generate_series(v_today - 13, v_today, interval '1 day') d
       where d::date >= v_from14
    ),
    'top_video', v_top_video,
    'top_comment', (
      select jsonb_build_object('body', cm.body, 'nickname', p.nickname, 'zone', z.name, 'code', r.code,
               'grade', r.grade, 'color', r.hold_color, 'name', r.name, 'likes', count(l.user_id))
        from cm join public.comment_likes l on l.comment_id = cm.id
        join public.profiles p on p.id = cm.user_id
        join public.routes r on r.id = cm.route_id join public.zones z on z.id = r.zone_id
       group by cm.id, cm.body, cm.created_at, p.nickname, z.name, r.id
       order by count(l.user_id) desc, cm.created_at desc limit 1
    ),
    'mascots', v_mascots
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.usage_insights(text) from public, anon;
grant execute on function public.usage_insights(text) to authenticated;

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

insert into supabase_migrations.schema_migrations (version, name) values ('20261114000051', 'usage_insights');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
