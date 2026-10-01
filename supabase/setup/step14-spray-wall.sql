-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261013000018_spray_wall

-- =====================================================================
-- Spray Wall：公版岩牆照片上用圈圈標記路線（起攀 S、路線點、完攀 T）
-- - 明德、南港各一面，掛在原本的館底下（員工權限沿用該館），但不出現在「館內路線」的平面圖與區域列表
--   zones.kind = 'spray'；明德原本的 Spray Wall 區域（S）改成 spray，南港新增 SW
-- - 路線分兩種 routes.kind：'gym' 岩館路線（只有該館員工能出）、'community' 岩友路線（登入且有暱稱就能出）
--   routes 新增 name（名稱）、description（介紹）、holds（圈圈：x、y 0–100，t = s 起攀／h 路線點／t 完攀，r 大小 1–3）
--   出題者沿用 routes.created_by
-- - 岩友路線：每人 24 小時最多出 5 條；名稱、介紹不能放聯絡方式；本人可以修改、刪除（下架）
-- - 岩友路線只記錄、不算積分與統計（難度是出題者自己填的）
-- - 換公版照片（岩點全部重裝）時，這面牆的路線全部下架
-- - route_likes：路線按讚（排序「最多讚」）；spray_list()：列表（篩選、排序、分頁、完攀人數、讚數）
-- =====================================================================
alter table public.zones add column if not exists kind text not null default 'wall' check (kind in ('wall', 'spray'));
update public.zones set kind = 'spray', name = 'Spray Wall' where gym_id = 'mingde' and code = 'S';
insert into public.zones (gym_id, code, name, sort, kind) values ('g4', 'SW', 'Spray Wall', 99, 'spray')
on conflict (gym_id, code) do update set kind = 'spray';

alter table public.routes
  add column if not exists kind text not null default 'gym' check (kind in ('gym', 'community')),
  add column if not exists name text check (name is null or char_length(btrim(name)) between 1 and 20),
  add column if not exists description text check (description is null or char_length(description) <= 200),
  add column if not exists holds jsonb;

-- 文字不能有聯絡方式（自我介紹、路線名稱、介紹共用）
create or replace function public.contact_free(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or p !~* '(https?://|www\.|\.(com|tw|net|org|io|me|cc|app)\y|line|instagram|\yig\y|facebook|\yfb\y|threads|wechat|telegram|@|[0-9０-９][0-9０-９ -]{6,}|加賴|加我|私訊|微信|電話)'
$$;

-- 圈圈格式：2–60 個，至少一個起攀、一個完攀
create or replace function public.holds_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) between 2 and 60
     and not exists (
       select 1 from jsonb_array_elements(p) h
        where jsonb_typeof(h) <> 'object'
           or (h ->> 't') is null or (h ->> 't') not in ('s', 'h', 't')
           or jsonb_typeof(h -> 'x') <> 'number' or jsonb_typeof(h -> 'y') <> 'number'
           or (h ->> 'x')::numeric not between 0 and 100 or (h ->> 'y')::numeric not between 0 and 100
           or coalesce((h ->> 'r')::int, 2) not between 1 and 3
     )
     and exists (select 1 from jsonb_array_elements(p) h where h ->> 't' = 's')
     and exists (select 1 from jsonb_array_elements(p) h where h ->> 't' = 't')
$$;

-- Spray Wall 路線規則（新增、修改都檢查）
create or replace function public.routes_spray_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_kind text := (select kind from public.zones where id = new.zone_id);
  v_first jsonb;
begin
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
create trigger routes_spray_check before insert or update on public.routes
  for each row execute function public.routes_spray_check();

-- 取號：Spray Wall 任何登入的人都可以（岩友出路線），其他區域只有員工
create or replace function public.next_route_code(p_zone uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_seq  int;
begin
  if auth.uid() is not null and not public.is_staff(public.zone_gym(p_zone))
     and not exists (select 1 from public.zones where id = p_zone and kind = 'spray') then
    raise exception '沒有權限在這個區域新增路線' using errcode = '42501';
  end if;
  perform set_config('app.internal', 'on', true);
  update public.zones set route_seq = route_seq + 1 where id = p_zone
  returning code, route_seq into v_code, v_seq;
  perform set_config('app.internal', 'off', true);
  if v_code is null then
    raise exception '找不到這個區域' using errcode = 'P0002';
  end if;
  return v_code || '-' || lpad(v_seq::text, 2, '0');
end $$;

-- 岩友路線：每人 24 小時最多 5 條
create or replace function public.routes_community_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'community' and not public.is_db_admin() then
    if (select count(*) from public.routes
         where created_by = auth.uid() and kind = 'community' and created_at > now() - interval '1 day') >= 5 then
      raise exception '每人 24 小時最多出 5 條岩友路線，明天再來' using errcode = '54000';
    end if;
  end if;
  return new;
end $$;
create trigger routes_community_limit before insert on public.routes
  for each row execute function public.routes_community_limit();

-- 岩友可以在 Spray Wall 出岩友路線；本人可以修改、刪除（下架）自己出的
create policy routes_insert_community on public.routes for insert to authenticated
  with check (
    kind = 'community'
    and exists (select 1 from public.zones z where z.id = zone_id and z.kind = 'spray')
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.nickname is not null)
  );
create policy routes_update_community on public.routes for update to authenticated
  using (kind = 'community' and created_by = auth.uid())
  with check (kind = 'community' and created_by = auth.uid());

create or replace function public.routes_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_zone text := (select name from public.zones where id = new.zone_id);
begin
  if coalesce(current_setting('app.bulk_archive', true), '') = 'on' then return null; end if;
  -- 岩友自己刪除自己出的路線不用記在操作紀錄
  if new.kind = 'community' and new.created_by = auth.uid() then return null; end if;
  if old.archived_at is null and new.archived_at is not null then
    perform public.write_audit(public.zone_gym(new.zone_id), 'route.archive', new.id,
      jsonb_build_object('code', new.code, 'zone', v_zone, 'grade', new.grade, 'color', new.hold_color));
  elsif old.archived_at is not null and new.archived_at is null then
    perform public.write_audit(public.zone_gym(new.zone_id), 'route.unarchive', new.id,
      jsonb_build_object('code', new.code, 'zone', v_zone));
  end if;
  return null;
end $$;

-- 換公版照片（岩點全部重裝）：這面牆的路線全部下架
create or replace function public.zones_spray_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if new.kind = 'spray' and old.photo_path is not null and new.photo_path is distinct from old.photo_path then
    perform set_config('app.bulk_archive', 'on', true);
    update public.routes set archived_at = now() where zone_id = new.id and archived_at is null;
    get diagnostics v_n = row_count;
    perform set_config('app.bulk_archive', 'off', true);
    if v_n > 0 then
      perform public.write_audit(new.gym_id, 'zone.archive_all', new.id, jsonb_build_object('count', v_n, 'zone', new.name));
    end if;
  end if;
  return null;
end $$;
create trigger zones_spray_photo after update of photo_path on public.zones
  for each row execute function public.zones_spray_photo();

-- 路線按讚
do $do$ begin
  execute 'create ' || $t$table public.route_likes (
  route_id   uuid not null references public.routes (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (route_id, user_id)
)$t$;
end $do$;
alter table public.route_likes enable row level security;
create policy route_likes_read on public.route_likes for select to anon, authenticated using (true);
create policy route_likes_insert on public.route_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.routes r where r.id = route_id and r.archived_at is null)
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.nickname is not null)
  );
create policy route_likes_delete on public.route_likes for delete to authenticated using (user_id = auth.uid());
revoke update, truncate on public.route_likes from anon, authenticated;
revoke insert, delete on public.route_likes from anon;

-- Spray Wall 路線列表：p_sort = new（最新）／sends（最多人完攀）／likes（最多讚）／mine（我出的）
create or replace function public.spray_list(p_zone uuid, p_kind text, p_grade int, p_sort text, p_offset int, p_limit int)
returns jsonb language sql stable security definer set search_path = '' as $$
  with base as (
    select r.id, r.code, r.name, r.grade, r.description, r.holds, r.kind, r.created_at, r.created_by,
           r.style_tags, r.comments_enabled,
           p.nickname as author,
           (select count(distinct a.user_id) from public.ascents a where a.route_id = r.id and a.status in ('flash', 'send'))::int as sends,
           (select count(*) from public.route_likes l where l.route_id = r.id)::int as likes,
           exists (select 1 from public.route_likes l where l.route_id = r.id and l.user_id = auth.uid()) as liked
      from public.routes r
      left join public.profiles p on p.id = r.created_by
     where r.zone_id = p_zone and r.archived_at is null and r.kind = p_kind
       and (p_grade is null or r.grade = p_grade)
       and (p_sort is distinct from 'mine' or r.created_by = auth.uid())
  )
  select coalesce(jsonb_agg(to_jsonb(b) - 'created_by' || jsonb_build_object('mine', b.created_by = auth.uid())
           order by case p_sort when 'sends' then b.sends when 'likes' then b.likes else 0 end desc, b.created_at desc), '[]'::jsonb)
    from (select * from base
           order by case p_sort when 'sends' then sends when 'likes' then likes else 0 end desc, created_at desc
           offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 50)) b
$$;
revoke execute on function public.spray_list(uuid, text, int, text, int, int) from public;
grant execute on function public.spray_list(uuid, text, int, text, int, int) to anon, authenticated;

create or replace function public.zone_progress(p_gym text)
returns table (
  zone_id uuid, code text, name text, sort int, photo_path text, next_reset_on date,
  route_count int, done_count int
)
language sql stable security invoker set search_path = '' as $$
  select z.id, z.code, z.name, z.sort, z.photo_path, z.next_reset_on,
         count(r.id)::int,
         count(a.id)::int
    from public.zones z
    left join public.routes r on r.zone_id = z.id and r.archived_at is null
    left join public.ascents a on a.route_id = r.id and a.user_id = auth.uid() and a.status in ('flash', 'send')
   where z.gym_id = p_gym and z.kind = 'wall'
   group by z.id
   order by z.sort, z.code
$$;

create or replace function public.points_summary(p_year int, p_month int) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with mine as (
    select a.climbed_on, a.status, public.ascent_points(r.grade, r.style_tags, a.status) as pts
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
      join public.routes r on r.id = a.route_id and r.kind = 'gym', bounds b
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
    'prev_sends', (select count(*) from public.ascents a join public.routes rk on rk.id = a.route_id and rk.kind = 'gym', bounds b
                    where a.user_id = auth.uid() and a.status in ('flash', 'send')
                      and a.climbed_on >= b.p0 and a.climbed_on < b.d0),
    'total_sends',(select count(*) from public.ascents a join public.routes rk on rk.id = a.route_id and rk.kind = 'gym'
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
  v_total := (select count(*) from public.ascents a join public.routes rk on rk.id = a.route_id and rk.kind = 'gym' where a.user_id = p_user and a.status in ('flash', 'send'));
  v_month := (select count(*) from public.ascents a join public.routes rk on rk.id = a.route_id and rk.kind = 'gym' where a.user_id = p_user and a.status in ('flash', 'send') and a.climbed_on >= v_month_start);
  v_top := (select max(r.grade) from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
             where a.user_id = p_user and a.status in ('flash', 'send') and r.grade < 100);
  v_top_yds := (select max(r.grade) from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
                 where a.user_id = p_user and a.status in ('flash', 'send') and r.grade >= 100);
  v_counted := (select count(*) from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
                 where a.user_id = p_user and a.status in ('flash', 'send') and cardinality(r.style_tags) > 0);
  v_ability := (
    with s as (
      select r.grade, r.style_tags from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
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

insert into supabase_migrations.schema_migrations (version, name) values ('20261013000018', 'spray_wall');

-- 完成：顯示結果
select g.name as 館, z.name as spray_wall, z.code as 代碼
  from public.zones z join public.gyms g on g.id = z.gym_id where z.kind = 'spray' order by g.sort;
