-- =====================================================================
-- 給 App 呼叫的函式（Supabase RPC）
-- =====================================================================

-- ---------------------------------------------------------------------
-- my_access()：目前登入者自己的資料與權限（包含自己的手機號碼）
-- ---------------------------------------------------------------------
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'id', p.id,
    'phone', p.phone,
    'nickname', p.nickname,
    'avatar_url', p.avatar_url,
    'is_owner', p.is_owner,
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('gym_id', s.gym_id, 'role', s.role) order by s.gym_id)
        from public.staff_roles s where s.user_id = p.id), '[]'::jsonb)
  ) end
  from public.profiles p where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- monthly_stats(年, 月)：只算目前登入者自己的紀錄（Flash＋完攀）
-- 回傳：完攀數、Flash 數、攀爬天數、最高難度、各難度數量、每天完攀數、上個月完攀數、累計完攀
-- ---------------------------------------------------------------------
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
    'top_grade',  (select max(grade) from sends),
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

-- ---------------------------------------------------------------------
-- zone_progress(場館)：每區目前牆上路線數與目前登入者的完成數（未登入時完成數為 0）
-- ---------------------------------------------------------------------
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
   where z.gym_id = p_gym
   group by z.id
   order by z.sort, z.code
$$;

-- ---------------------------------------------------------------------
-- archive_zone(區域)：整區換線。下架該區所有路線、清空換線日、寫操作紀錄
-- 顧客的紀錄和心得都保留。回傳下架條數
-- ---------------------------------------------------------------------
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
  with done as (
    update public.routes set archived_at = now()
     where zone_id = p_zone and archived_at is null
    returning code
  )
  select coalesce(array_agg(code order by code), '{}') into v_codes from done;
  perform set_config('app.bulk_archive', 'off', true);

  perform set_config('app.internal', 'on', true);
  update public.zones set next_reset_on = null where id = p_zone;
  perform set_config('app.internal', 'off', true);

  perform public.write_audit(v_gym, 'zone.archive_all', p_zone,
    jsonb_build_object('count', cardinality(v_codes), 'codes', to_jsonb(v_codes)));
  return cardinality(v_codes);
end $$;

-- ---------------------------------------------------------------------
-- delete_comment(留言)：軟刪除。本人可刪自己的；該館員工可刪任何留言（寫操作紀錄）
-- ---------------------------------------------------------------------
create or replace function public.delete_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c     public.comments;
  v_gym text;
begin
  select * into c from public.comments where id = p_comment and deleted_at is null;
  if c.id is null then
    raise exception '找不到這則留言' using errcode = 'P0002';
  end if;
  v_gym := public.route_gym(c.route_id);
  if c.user_id is distinct from auth.uid() and not public.is_staff(v_gym) then
    raise exception '沒有權限' using errcode = '42501';
  end if;

  update public.comments set deleted_at = now(), deleted_by = auth.uid() where id = p_comment;

  if c.user_id is distinct from auth.uid() then
    perform public.write_audit(v_gym, 'comment.delete', p_comment,
      jsonb_build_object('route_id', c.route_id, 'author', c.user_id, 'body', c.body));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- assign_staff(手機, 場館, 角色)：用手機號碼指派員工（對方要先登入過一次）
-- 店長只能指派定線員；店長只有老闆能指派
-- ---------------------------------------------------------------------
create or replace function public.assign_staff(p_phone text, p_gym text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := regexp_replace(p_phone, '\D', '', 'g');
  v_user  uuid;
begin
  if p_role not in ('setter', 'manager') then
    raise exception '角色只能是 setter 或 manager' using errcode = '22023';
  end if;
  if not (public.is_owner() or (p_role = 'setter' and public.is_manager(p_gym))) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  -- 09xxxxxxxx → 8869xxxxxxxx
  if v_phone ~ '^09\d{8}$' then v_phone := '886' || substr(v_phone, 2); end if;

  select id into v_user from public.profiles where phone = v_phone;
  if v_user is null then
    raise exception '找不到這個手機號碼，請對方先登入一次' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.staff_roles where user_id = v_user and gym_id = p_gym and role = 'manager')
     and not public.is_owner() then
    raise exception '店長的角色只有老闆能修改' using errcode = '42501';
  end if;

  insert into public.staff_roles (user_id, gym_id, role) values (v_user, p_gym, p_role)
  on conflict (user_id, gym_id) do update set role = excluded.role;
  perform public.write_audit(p_gym, 'staff.assign', v_user, jsonb_build_object('role', p_role));
  return v_user;
end $$;

-- remove_staff(使用者, 場館)：移除員工角色
create or replace function public.remove_staff(p_user uuid, p_gym text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
begin
  select role into v_role from public.staff_roles where user_id = p_user and gym_id = p_gym;
  if v_role is null then return; end if;
  if not (public.is_owner() or (v_role = 'setter' and public.is_manager(p_gym))) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  delete from public.staff_roles where user_id = p_user and gym_id = p_gym;
  perform public.write_audit(p_gym, 'staff.remove', p_user, jsonb_build_object('role', v_role));
end $$;

-- 未登入的人只能呼叫唯讀函式
revoke execute on function public.archive_zone(uuid), public.delete_comment(uuid),
  public.assign_staff(text, text, text), public.remove_staff(uuid, text) from public, anon;
grant execute on function public.archive_zone(uuid), public.delete_comment(uuid),
  public.assign_staff(text, text, text), public.remove_staff(uuid, text) to authenticated;
