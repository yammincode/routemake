-- =====================================================================
-- 訓練日誌（step51，10/23 使用者確認）
-- - 每天的紀錄（climb_days）：每次記錄（ascents 新增、修改）資料庫自己留當天一筆（哪條路線、狀態、試了幾次），
--   同一條路線試了好幾天，每一天都看得到；積分、大滿貫照舊用 ascents 算（不重複算分）
--   上線時先把現在每一條紀錄放進去（放在最後記的那天）
-- - 試了幾次（ascents.tries，1–99，可以不填）：指的是 climbed_on 那一天；嘗試中、完攀都可以記
-- - 日誌（training_days）：一人一天一篇，感覺 1–5、爬多久、練什麼、一句話（100 字、不能放網址）；
--   預設只有本人看得到；打開「公開到人物卡」而且人物卡公開時，別人看得到那天的日誌和路線（私人心得照舊不公開）
--   公開的不能放聯絡方式（跟人物卡自我介紹一樣）、停權中不能公開；不收身體狀況
-- - 訓練設定（training_settings）：本週目標（每週幾天，預設 2）、我的紀錄的主頁（預設這週）；只有本人讀寫
-- - points_summary 多回傳這週積分、這週哪幾天有爬、連續週數（每週至少爬 1 天）
-- - my_projects：嘗試中的路線、來了幾天、試了幾次、換線日；my_milestones：第一次完攀、新的最高難度
-- 舊版 App 照常可用（新增紀錄不用送 tries）
-- =====================================================================

alter table public.ascents add column if not exists tries smallint check (tries is null or tries between 1 and 99);

do $do$ begin
  execute 'create ' || $t$table public.climb_days (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  route_id   uuid not null references public.routes (id) on delete cascade,
  day        date not null,
  status     text not null check (status in ('flash', 'send', 'project')),
  tries      smallint check (tries is null or tries between 1 and 99),
  highpoint  int,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, route_id)
)$t$;
  execute 'create ' || $t$table public.training_days (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day        date not null,
  feel       smallint check (feel is null or feel between 1 and 5),
  hours      smallint check (hours is null or hours between 1 and 3),
  kinds      text[] not null default '{}' check (kinds <@ array['boulder', 'rope', 'board', 'core', 'stretch', 'play']),
  note       text check (note is null or char_length(note) <= 100),
  is_public  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
)$t$;
  execute 'create ' || $t$table public.training_settings (
  user_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  week_goal  smallint not null default 2 check (week_goal between 1 and 7),
  home_tab   text not null default 'week' check (home_tab in ('week', 'log', 'month', 'all')),
  updated_at timestamptz not null default now()
)$t$;
end $do$;
create index climb_days_route_idx on public.climb_days (user_id, route_id);
alter table public.climb_days enable row level security;
alter table public.training_days enable row level security;
alter table public.training_settings enable row level security;

-- 那天的日誌有沒有公開（本人打開「公開到人物卡」而且人物卡公開）
create or replace function public.training_day_public(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.training_days t join public.profiles p on p.id = t.user_id
                  where t.user_id = p_user and t.day = p_day and t.is_public and p.card_public)
$$;
revoke execute on function public.training_day_public(uuid, date) from public;
grant execute on function public.training_day_public(uuid, date) to anon, authenticated;

-- 每天的紀錄：本人、公開的那幾天；只由下面的觸發器寫（不開放直接寫）
create policy climb_days_read on public.climb_days for select to anon, authenticated
  using (user_id = (select auth.uid()) or public.training_day_public(user_id, day));
revoke insert, update, delete, truncate on public.climb_days from anon, authenticated;

-- 日誌：本人讀寫；公開的大家看得到
create policy training_days_read on public.training_days for select to anon, authenticated
  using (user_id = (select auth.uid()) or public.training_day_public(user_id, day));
create policy training_days_insert on public.training_days for insert to authenticated with check (user_id = auth.uid());
create policy training_days_update on public.training_days for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy training_days_delete on public.training_days for delete to authenticated using (user_id = auth.uid());
revoke all on public.training_days from anon;
grant select on public.training_days to anon;
revoke truncate on public.training_days from authenticated;

-- 訓練設定：只有本人
create policy training_settings_own on public.training_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.training_settings from anon;
revoke truncate on public.training_settings from authenticated;

create or replace function public.training_days_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.day is distinct from old.day) then
    raise exception '不能修改日誌的使用者或日期' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not public.is_db_admin() then
    new.user_id := auth.uid();
  end if;
  new.note := nullif(btrim(new.note), '');
  new.kinds := array(select distinct k from unnest(new.kinds) k order by k);
  if not public.link_free(new.note) then
    raise exception '日誌不能放網址' using errcode = '22023';
  end if;
  if new.is_public and not public.contact_free(new.note) then
    raise exception '公開的日誌不能放聯絡方式（網址、LINE、IG、電話…）' using errcode = '22023';
  end if;
  if new.is_public and public.is_suspended(new.user_id) then
    raise exception '停權中不能公開日誌' using errcode = '42501';
  end if;
  if new.day > public.taipei_today() then
    raise exception '日期不能晚於今天' using errcode = '22008';
  end if;
  if new.day < date '2020-01-01' then
    raise exception '日期太早了' using errcode = '22008';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger training_days_before_write before insert or update on public.training_days
  for each row execute function public.training_days_before_write();

create or replace function public.training_settings_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and not public.is_db_admin() then
    new.user_id := auth.uid();
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception '不能修改設定的使用者' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger training_settings_before_write before insert or update on public.training_settings
  for each row execute function public.training_settings_before_write();

-- 試了幾次是 climbed_on 那天的：換到新的一天時由 App 清掉（App 每次都送 tries）；
-- 資料庫不自己清：離線排隊只留最後一筆，「換到今天＋按了 3 次」送出時跟前一天的 3 次分不出來，會把今天的洗掉
-- （舊版 App 不送 tries，嘗試中改記到新的一天時會沿用上一次的次數；App 更新後就沒有這個情況）

-- 每天的紀錄跟著 ascents 寫
-- - 嘗試中的路線過了幾天再來、改記到更晚的一天：之前那天留著（那天真的試過）
-- - 其他改日期（記錯日子，包括同一天裡選錯又改）：搬到新的日期；清除紀錄：那天的拿掉（之前試過的那幾天留著）
create or replace function public.ascents_climb_days() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and new.climbed_on <> old.climbed_on
         and not (old.status = 'project' and new.climbed_on > old.climbed_on
                  and (old.updated_at at time zone 'Asia/Taipei')::date < public.taipei_today())) then
    delete from public.climb_days where user_id = old.user_id and route_id = old.route_id and day = old.climbed_on;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  -- 改日期改回已經有紀錄的那天（例如選錯日子又改回來）、這次沒有次數：留著那天原本的次數
  insert into public.climb_days (user_id, route_id, day, status, tries, highpoint)
  values (new.user_id, new.route_id, new.climbed_on, new.status, new.tries, new.highpoint)
  on conflict (user_id, day, route_id) do update
    set status = excluded.status,
        tries = case when tg_op = 'UPDATE' and new.climbed_on <> old.climbed_on then coalesce(excluded.tries, public.climb_days.tries) else excluded.tries end,
        highpoint = excluded.highpoint, updated_at = now();
  return new;
end $$;
create trigger ascents_climb_days after insert or update or delete on public.ascents
  for each row execute function public.ascents_climb_days();

-- 現在的紀錄先放進去（放在最後記的那天）
insert into public.climb_days (user_id, route_id, day, status, highpoint)
select user_id, route_id, climbed_on, status, highpoint from public.ascents
on conflict do nothing;

-- 積分（同 0034，多回傳 week、week_days、week_streak）：攀爬的日子也算每天的紀錄（同一條路線之前試過的那幾天）
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
           public.taipei_today() as today,
           date_trunc('week', public.taipei_today())::date as w0
  ),
  cdays as (
    select climbed_on as day from mine
    union
    select d.day from public.climb_days d join public.routes r on r.id = d.route_id and r.kind = 'gym' where d.user_id = auth.uid()
  ),
  -- 連續攀爬：從今天（今天沒爬就從昨天）往回數
  streak_start as (
    select case when exists (select 1 from cdays, b where day = b.today) then b.today else b.today - 1 end as s from b
  ),
  streak as (
    select count(*)::int as n from (
      select day, row_number() over (order by day desc) as rn from cdays, streak_start where day <= streak_start.s
    ) x, streak_start
    where x.day = streak_start.s - (x.rn - 1)::int
  ),
  -- 連續週數（週一到週日）：從這週（這週還沒爬就從上週）往回數，每週至少爬 1 天
  weeks as (select distinct date_trunc('week', day)::date as w from cdays),
  wstart as (
    select case when exists (select 1 from weeks, b where w = b.w0) then b.w0 else b.w0 - 7 end as s from b
  ),
  wstreak as (
    select count(*)::int as n from (
      select w, row_number() over (order by w desc) as rn from weeks, wstart where w <= wstart.s
    ) x, wstart
    where x.w = wstart.s - 7 * (x.rn - 1)::int
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
    'total',       coalesce((select sum(pts) from mine), 0)::int,
    'week',        coalesce((select sum(d.pts) from daily d, b where d.day >= b.w0 and d.day < b.w0 + 7), 0)::int,
    'week_days',   coalesce((select jsonb_agg(extract(isodow from c.day)::int order by c.day) from cdays c, b where c.day >= b.w0 and c.day < b.w0 + 7), '[]'::jsonb),
    'week_streak', (select n from wstreak)
  )
$$;

-- 我的專案：嘗試中、還在牆上的路線；來了幾天、試了幾次（有記的才加）、換線日（換線公告或區域的換線日）
create or replace function public.my_projects() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.reset_on nulls last, x.last_day desc), '[]'::jsonb) from (
    select a.route_id, a.climbed_on as last_day, a.highpoint,
           r.grade, r.hold_color, r.code, r.name, r.kind,
           case when r.kind = 'gym' and r.name is null and jsonb_typeof(r.holds) = 'array' and jsonb_array_length(r.holds) >= 2
                then jsonb_array_length(r.holds) end as holds_n,
           z.id as zone_id, z.name as zone_name, z.gym_id,
           public.zone_reset_on(z.id, z.next_reset_on) as reset_on,
           (select count(*) from public.climb_days d where d.user_id = a.user_id and d.route_id = a.route_id)::int as days,
           (select sum(d.tries) from public.climb_days d where d.user_id = a.user_id and d.route_id = a.route_id)::int as tries
      from public.ascents a
      join public.routes r on r.id = a.route_id
      join public.zones z on z.id = r.zone_id
     where a.user_id = auth.uid() and a.status = 'project' and r.archived_at is null
  ) x
$$;
revoke execute on function public.my_projects() from public, anon;
grant execute on function public.my_projects() to authenticated;

-- 里程碑：第一次完攀、新的最高難度（抱石、上攀分開；岩館路線）
create or replace function public.my_milestones() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with s as (
    select a.climbed_on as day, r.grade, r.grade >= 100 as rope
      from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
     where a.user_id = auth.uid() and a.status in ('flash', 'send')
  ),
  d as (select day, rope, max(grade) as g from s group by day, rope),
  m as (
    select day, rope, g, max(g) over (partition by rope order by day rows between unbounded preceding and 1 preceding) as prev from d
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'grade', g, 'first', prev is null) order by day desc, g desc), '[]'::jsonb)
    from m where prev is null or g > prev
$$;
revoke execute on function public.my_milestones() from public, anon;
grant execute on function public.my_milestones() to authenticated;

-- 區域頁（同 0044）：自己的紀錄多帶試了幾次（路線卡片顯示、修改紀錄時不會把次數洗掉）
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
            select a.id, a.route_id, a.status, a.climbed_on, a.feel, a.grade_feel, a.private_note, a.highpoint, a.tries
              from public.ascents a join r on r.id = a.route_id
             where a.user_id = auth.uid()) a), '{}'::jsonb),
    'cs', coalesce((select jsonb_object_agg(c.route_id, c.n) from (
            select c.route_id, count(*)::int as n
              from public.comments c join r on r.id = c.route_id
             group by c.route_id) c), '{}'::jsonb),
    'vs', coalesce((select jsonb_object_agg(v.route_id, v.n) from (
            select v.route_id, count(*)::int as n
              from public.route_videos v join r on r.id = v.route_id
             group by v.route_id) v), '{}'::jsonb)
  );
$$;

-- 店長、老闆：把不當的公開日誌改回不公開（跟清除自我介紹一樣；日誌本身留著，本人還看得到）；寫操作紀錄
create or replace function public.hide_training_day(p_user uuid, p_day date, p_gym text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_note text;
begin
  if not public.is_manager(p_gym) then
    raise exception '只有店長可以隱藏日誌' using errcode = '42501';
  end if;
  -- 只能隱藏別人現在看得到的（人物卡也公開）：不能藉此從操作紀錄讀到沒公開的日誌
  if not public.training_day_public(p_user, p_day) then
    raise exception '這篇日誌沒有公開' using errcode = '22023';
  end if;
  update public.training_days set is_public = false
   where user_id = p_user and day = p_day and is_public
  returning note into v_note;
  if not found then
    raise exception '這篇日誌沒有公開' using errcode = '22023';
  end if;
  perform public.write_audit(p_gym, 'diary.hide', p_user, jsonb_build_object(
    'nickname', (select nickname from public.profiles where id = p_user), 'day', p_day, 'note', v_note));
end $$;
revoke execute on function public.hide_training_day(uuid, date, text) from public, anon;
grant execute on function public.hide_training_day(uuid, date, text) to authenticated;
