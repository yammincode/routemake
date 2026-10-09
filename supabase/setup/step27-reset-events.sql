-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261026000031_reset_events

-- =====================================================================
-- 換線公告（各館每月換線日）
-- - reset_events：哪間館、公告上的名稱（例如「A 區」）、包含哪些區域、開始日（拆線）、結束日（定線，當天晚上起新路線）
-- - 大家都看得到（沒登入也可以）；只有老闆和老闆授權的人（reset_editors）能新增、修改、刪除，都寫操作紀錄
-- - 存檔時自動更新那些區域的「下次換線日」（zones.next_reset_on）：那一區今天以後開始的公告裡最早的開始日
--   刪掉或改掉公告時，如果區域的換線日正是舊公告的日期、又沒有別的公告，就清空
-- - 整區換線後不再一律清空換線日，改接這一區之後的下一筆公告
-- - 畫面讀的換線日（zone_progress、zone_view）改用 zone_reset_on()：有公告照公告，沒有就用員工設的日期，已經過了的不算
--   （換線結束後沒人按整區換線，也不會一直顯示「換線日已過」）
-- - 區域被刪掉時，從公告裡拿掉那一區
-- =====================================================================
-- 用 execute 建表：Supabase SQL Editor 看到建表指令會跳出「開啟 RLS」提示並改寫整份 SQL，會把後面的函式切壞。下面已經自己開啟 RLS。
do $do$ begin
  execute 'create ' || $t$table public.reset_editors (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now()
)$t$;
  execute 'create ' || $t$table public.reset_events (
  id         uuid primary key default gen_random_uuid(),
  gym_id     text not null references public.gyms (id),
  label      text not null check (char_length(label) between 1 and 20),
  zone_ids   uuid[] not null default '{}',
  starts_on  date not null,
  ends_on    date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 6)
)$t$;
end $do$;
create index reset_events_month_idx on public.reset_events (starts_on, gym_id);

-- 可以輸入換線日：老闆，或老闆授權的人
create or replace function public.can_edit_resets() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists (select 1 from public.reset_editors e where e.user_id = auth.uid())
$$;

-- 台北今天
create or replace function public.taipei_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Taipei')::date
$$;

-- 重新算這些區域的下次換線日：今天以後開始的公告裡最早的開始日（已經開始換的不算）；
-- 沒有公告時，換線日正是 p_old（剛刪掉或改掉的公告日期）就清空，其他保留（員工手動設定的）
create or replace function public.sync_zone_resets(p_zones uuid[], p_old date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(cardinality(p_zones), 0) = 0 then return; end if;
  perform set_config('app.internal', 'on', true);
  update public.zones z
     set next_reset_on = coalesce(
           (select min(e.starts_on) from public.reset_events e
             where z.id = any (e.zone_ids) and e.starts_on >= public.taipei_today()),
           case when z.next_reset_on = p_old then null else z.next_reset_on end)
   where z.id = any (p_zones);
  perform set_config('app.internal', 'off', true);
end $$;
revoke execute on function public.sync_zone_resets(uuid[], date) from public, anon, authenticated;

-- 存檔前：名稱去頭尾空白、區域不重複而且要是這間館的；建立者、時間由資料庫填
create or replace function public.reset_events_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.label := btrim(new.label);
  new.zone_ids := coalesce((select array_agg(distinct z) from unnest(new.zone_ids) z), '{}');
  if exists (select 1 from unnest(new.zone_ids) z
              where not exists (select 1 from public.zones x where x.id = z and x.gym_id = new.gym_id)) then
    raise exception '換線的區域要是這間館的' using errcode = '22023';
  end if;
  if not public.is_db_admin() then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
      new.created_at := now();
    else
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger reset_events_before before insert or update on public.reset_events
  for each row execute function public.reset_events_before();

-- 存檔後：同步區域的換線日、寫操作紀錄
create or replace function public.reset_events_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.reset_events;
begin
  if tg_op = 'DELETE' then
    r := old;
    perform public.sync_zone_resets(old.zone_ids, old.starts_on);
  elsif tg_op = 'UPDATE' then
    r := new;
    perform public.sync_zone_resets(old.zone_ids, old.starts_on);
    perform public.sync_zone_resets(new.zone_ids, null);
  else
    r := new;
    perform public.sync_zone_resets(new.zone_ids, null);
  end if;
  perform public.write_audit(r.gym_id,
    case tg_op when 'INSERT' then 'reset.add' when 'UPDATE' then 'reset.update' else 'reset.delete' end, r.id,
    jsonb_build_object('label', r.label, 'starts_on', r.starts_on, 'ends_on', r.ends_on));
  return null;
end $$;
create trigger reset_events_after after insert or update or delete on public.reset_events
  for each row execute function public.reset_events_after();

alter table public.reset_events enable row level security;
create policy reset_events_read on public.reset_events for select to anon, authenticated using (true);
create policy reset_events_insert on public.reset_events for insert to authenticated with check (public.can_edit_resets());
create policy reset_events_update on public.reset_events for update to authenticated
  using (public.can_edit_resets()) with check (public.can_edit_resets());
create policy reset_events_delete on public.reset_events for delete to authenticated using (public.can_edit_resets());
revoke insert, update, delete, truncate on public.reset_events from anon;
revoke truncate on public.reset_events from authenticated;

-- 授權名單：老闆看得到全部，被授權的人看得到自己；新增、移除只能用 set_reset_editor（老闆）
alter table public.reset_editors enable row level security;
create policy reset_editors_read on public.reset_editors for select to authenticated
  using (public.is_owner() or user_id = auth.uid());
revoke insert, update, delete, truncate on public.reset_editors from anon, authenticated;

create or replace function public.set_reset_editor(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception '只有老闆可以設定換線日權限' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception '找不到這個帳號' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.reset_editors (user_id, created_by) values (p_user, auth.uid()) on conflict (user_id) do nothing;
  else
    delete from public.reset_editors where user_id = p_user;
  end if;
  perform public.write_audit(null, case when p_on then 'reset_editor.grant' else 'reset_editor.revoke' end, p_user,
    (select jsonb_build_object('nickname', nickname, 'username', username) from public.profiles where id = p_user));
end $$;
revoke execute on function public.set_reset_editor(uuid, boolean) from public, anon;
grant execute on function public.set_reset_editor(uuid, boolean) to authenticated;

-- 老闆看授權名單（含帳號名稱與暱稱）
create or replace function public.reset_editor_list()
returns table (id uuid, username text, nickname text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.nickname
    from public.reset_editors e join public.profiles p on p.id = e.user_id
   where public.is_owner()
   order by e.created_at
$$;
revoke execute on function public.reset_editor_list() from public, anon;
grant execute on function public.reset_editor_list() to authenticated;

-- 選館頁、行事曆用：一段日期內的公告，順便標出是不是只有 Spray Wall（選館頁放在 Spray Wall 那一列）
create or replace function public.reset_calendar(p_from date, p_to date)
returns table (id uuid, gym_id text, label text, zone_ids uuid[], starts_on date, ends_on date, spray boolean)
language sql stable set search_path = '' as $$
  select e.id, e.gym_id, e.label, e.zone_ids, e.starts_on, e.ends_on,
         exists (select 1 from public.zones z where z.id = any (e.zone_ids) and z.kind = 'spray')
         and not exists (select 1 from public.zones z where z.id = any (e.zone_ids) and z.kind <> 'spray')
    from public.reset_events e
   where e.ends_on >= p_from and e.starts_on <= p_to
   order by e.starts_on, e.gym_id, e.label
$$;
grant execute on function public.reset_calendar(date, date) to anon, authenticated;

-- 整區換線：換線日改接這一區之後的下一筆公告（沒有就清空）
create or replace function public.archive_zone(p_zone uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_gym   text := public.zone_gym(p_zone);
  v_codes text[];
begin
  if v_gym is null then
    raise exception '找不到這個區域' using errcode = 'P0002';
  end if;
  if not public.is_staff(v_gym) then
    raise exception '沒有權限' using errcode = '42501';
  end if;

  perform set_config('app.bulk_archive', 'on', true);
  -- 不用 select … into：Supabase SQL Editor 會把它當成建新表，自動插入 enable RLS 而把函式弄壞
  v_codes := (select coalesce(array_agg(code order by code), '{}') from public.routes
               where zone_id = p_zone and archived_at is null);
  update public.routes set archived_at = now()
   where zone_id = p_zone and archived_at is null;
  perform set_config('app.bulk_archive', 'off', true);

  perform set_config('app.internal', 'on', true);
  update public.zones
     set next_reset_on = (select min(e.starts_on) from public.reset_events e
                           where p_zone = any (e.zone_ids) and e.starts_on > public.taipei_today())
   where id = p_zone;
  perform set_config('app.internal', 'off', true);

  perform public.write_audit(v_gym, 'zone.archive_all', p_zone,
    jsonb_build_object('count', cardinality(v_codes), 'codes', to_jsonb(v_codes),
                       'zone', (select name from public.zones where id = p_zone)));
  return cardinality(v_codes);
end $$;

-- my_access 多回傳 can_edit_resets（App 決定要不要顯示「換線日」管理頁）
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
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('gym_id', s.gym_id, 'role', s.role) order by s.gym_id)
        from public.staff_roles s where s.user_id = p.id), '[]'::jsonb)
  ) end
  from public.profiles p where p.id = auth.uid()
$$;

-- 畫面上的下次換線日：今天以後開始的公告裡最早的開始日；沒有公告就用員工設的日期（已經過了就不算）
create or replace function public.zone_reset_on(p_zone uuid, p_manual date) returns date
language sql stable set search_path = '' as $$
  select coalesce(
    (select min(e.starts_on) from public.reset_events e
      where p_zone = any (e.zone_ids) and e.starts_on >= public.taipei_today()),
    case when p_manual >= public.taipei_today() then p_manual end)
$$;

create or replace function public.zone_progress(p_gym text)
returns table (
  zone_id uuid, code text, name text, sort int, photo_path text, next_reset_on date,
  route_count int, done_count int
)
language sql stable security invoker set search_path = '' as $$
  select z.id, z.code, z.name, z.sort, z.photo_path, public.zone_reset_on(z.id, z.next_reset_on),
         count(r.id)::int,
         count(a.id)::int
    from public.zones z
    left join public.routes r on r.zone_id = z.id and r.archived_at is null
    left join public.ascents a on a.route_id = r.id and a.user_id = auth.uid() and a.status in ('flash', 'send')
   where z.gym_id = p_gym and z.kind = 'wall'
   group by z.id
   order by z.sort, z.code
$$;

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
            select a.id, a.route_id, a.status, a.climbed_on, a.feel, a.grade_feel, a.private_note
              from public.ascents a join r on r.id = a.route_id
             where a.user_id = auth.uid()) a), '{}'::jsonb),
    'cs', coalesce((select jsonb_object_agg(c.route_id, c.n) from (
            select c.route_id, count(*)::int as n
              from public.comments c join r on r.id = c.route_id
             group by c.route_id) c), '{}'::jsonb)
  );
$$;

-- 區域被刪掉：從公告裡拿掉那一區（公告才改得動，Spray Wall 判斷也不會錯）
-- 一次刪好幾區（重新分區）時，觸發時那幾區都已經刪掉了：把公告裡所有已經不存在的區一起拿掉
create or replace function public.zones_drop_from_resets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.reset_events
     set zone_ids = array(select z from unnest(zone_ids) z where exists (select 1 from public.zones x where x.id = z))
   where old.id = any (zone_ids);
  return null;
end $$;
-- 刪掉之後才改公告（改公告會同步區域的換線日，不能碰到正在刪的那一筆）
create trigger zones_drop_from_resets after delete on public.zones
  for each row execute function public.zones_drop_from_resets();

insert into supabase_migrations.schema_migrations (version, name) values ('20261026000031', 'reset_events');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
