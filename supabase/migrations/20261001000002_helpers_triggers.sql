-- =====================================================================
-- 權限判斷函式與資料表觸發器
-- 權限函式用 security definer，讓 RLS 規則可以查 staff_roles／profiles 而不會互相卡住
-- =====================================================================

-- ---------------------------------------------------------------------
-- 權限判斷
-- ---------------------------------------------------------------------
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_owner from public.profiles p where p.id = auth.uid()), false)
$$;

-- 在這間館是員工（定線員或店長），老闆一律算
create or replace function public.is_staff(p_gym text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner()
      or exists (select 1 from public.staff_roles s where s.user_id = auth.uid() and s.gym_id = p_gym)
$$;

-- 在這間館是店長，老闆一律算
create or replace function public.is_manager(p_gym text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner()
      or exists (select 1 from public.staff_roles s where s.user_id = auth.uid() and s.gym_id = p_gym and s.role = 'manager')
$$;

create or replace function public.zone_gym(p_zone uuid) returns text
language sql stable security definer set search_path = '' as $$
  select z.gym_id from public.zones z where z.id = p_zone
$$;

create or replace function public.route_gym(p_route uuid) returns text
language sql stable security definer set search_path = '' as $$
  select z.gym_id from public.routes r join public.zones z on z.id = r.zone_id where r.id = p_route
$$;

-- 資料庫管理者（SQL Editor、migration）不受觸發器限制
create or replace function public.is_db_admin() returns boolean
language sql stable set search_path = '' as $$
  select auth.uid() is null and current_user in ('postgres', 'supabase_admin', 'service_role')
$$;

-- 寫入操作紀錄（只給觸發器與函式內部使用）
create or replace function public.write_audit(p_gym text, p_action text, p_target uuid, p_detail jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (user_id, gym_id, action, target_id, detail)
  values (auth.uid(), p_gym, p_action, p_target, p_detail)
$$;
revoke execute on function public.write_audit(text, text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 新使用者：自動建立 profiles，手機號碼跟著 auth.users 同步
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone) values (new.id, nullif(new.phone, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_phone_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set phone = nullif(new.phone, '') where id = new.id;
  return new;
end $$;

create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row when (old.phone is distinct from new.phone)
  execute function public.handle_user_phone_change();

-- ---------------------------------------------------------------------
-- profiles：本人只能改暱稱和頭像（欄位權限另外在 RLS 檔設定，這裡是第二道防線）
-- ---------------------------------------------------------------------
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_db_admin() then return new; end if;
  if new.id is distinct from old.id or new.phone is distinct from old.phone
     or new.line_user_id is distinct from old.line_user_id or new.is_owner is distinct from old.is_owner
     or new.created_at is distinct from old.created_at then
    raise exception '只能修改暱稱和頭像' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- zones：定線員只能改照片和換線日；名稱、代碼、排序、平面圖位置只有店長能改
-- ---------------------------------------------------------------------
create or replace function public.zones_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_db_admin() or current_setting('app.internal', true) = 'on' then return new; end if;
  if new.gym_id is distinct from old.gym_id or new.route_seq is distinct from old.route_seq
     or new.created_at is distinct from old.created_at then
    raise exception '不能修改場館或路線流水號' using errcode = '42501';
  end if;
  if not public.is_manager(old.gym_id) and (
       new.name is distinct from old.name or new.code is distinct from old.code
       or new.sort is distinct from old.sort or new.plan_shape is distinct from old.plan_shape
       or new.model_mesh is distinct from old.model_mesh) then
    raise exception '只有店長可以修改區域名稱、代碼、排序和平面圖位置' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger zones_guard before update on public.zones
  for each row execute function public.zones_guard();

-- 新增區域時流水號從 0 開始
create or replace function public.zones_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() then new.route_seq := 0; end if;
  return new;
end $$;

create trigger zones_before_insert before insert on public.zones
  for each row execute function public.zones_before_insert();

-- ---------------------------------------------------------------------
-- routes：新增時自動產生編號（A-01…），換線後繼續往上加
-- ---------------------------------------------------------------------
create or replace function public.next_route_code(p_zone uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_seq  int;
begin
  -- 只有該館員工（或資料庫管理者）能取號
  if auth.uid() is not null and not public.is_staff(public.zone_gym(p_zone)) then
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
revoke execute on function public.next_route_code(uuid) from public, anon;
grant execute on function public.next_route_code(uuid) to authenticated;

create or replace function public.routes_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() then
    new.created_by  := auth.uid();
    new.created_at  := now();
    new.archived_at := null;
  end if;
  if new.code is null or not public.is_db_admin() then
    new.code := public.next_route_code(new.zone_id);
  end if;
  return new;
end $$;

create trigger routes_before_insert before insert on public.routes
  for each row execute function public.routes_before_insert();

-- 編號、區域、建立者、建立時間不能改
create or replace function public.routes_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() and (
       new.zone_id is distinct from old.zone_id or new.code is distinct from old.code
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at) then
    raise exception '不能修改路線編號、區域、建立者或建立時間' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger routes_before_update before update on public.routes
  for each row execute function public.routes_before_update();

-- 單條下架／恢復時寫操作紀錄（整區換線由 archive_zone() 只寫一筆）
create or replace function public.routes_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.bulk_archive', true), '') = 'on' then return null; end if;
  if old.archived_at is null and new.archived_at is not null then
    perform public.write_audit(public.zone_gym(new.zone_id), 'route.archive', new.id, jsonb_build_object('code', new.code));
  elsif old.archived_at is not null and new.archived_at is null then
    perform public.write_audit(public.zone_gym(new.zone_id), 'route.unarchive', new.id, jsonb_build_object('code', new.code));
  end if;
  return null;
end $$;

create trigger routes_after_update after update of archived_at on public.routes
  for each row execute function public.routes_after_update();

-- ---------------------------------------------------------------------
-- ascents：日期要在路線設定日之後、今天（或下架日）之前；使用者與路線不能改
-- ---------------------------------------------------------------------
create or replace function public.ascents_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_created  date;
  v_archived date;
begin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.route_id is distinct from old.route_id) then
    raise exception '不能修改紀錄的使用者或路線' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not public.is_db_admin() then
    new.user_id := auth.uid();
    new.created_at := now();
  end if;
  new.updated_at := now();
  if new.status = 'project' then
    new.feel := null;
    new.grade_feel := null;
  end if;

  select (r.created_at at time zone 'Asia/Taipei')::date, (r.archived_at at time zone 'Asia/Taipei')::date
    into v_created, v_archived
    from public.routes r where r.id = new.route_id;
  if new.climbed_on < v_created then
    raise exception '日期不能早於路線設定日' using errcode = '22008';
  end if;
  if new.climbed_on > public.taipei_today() then
    raise exception '日期不能晚於今天' using errcode = '22008';
  end if;
  if v_archived is not null and new.climbed_on > v_archived
     and (tg_op = 'INSERT' or new.climbed_on is distinct from old.climbed_on) then
    raise exception '日期不能晚於路線下架日' using errcode = '22008';
  end if;
  return new;
end $$;

create trigger ascents_before_write before insert or update on public.ascents
  for each row execute function public.ascents_before_write();

-- ---------------------------------------------------------------------
-- comments：只能新增，內容不能改；刪除一律透過 delete_comment()
-- ---------------------------------------------------------------------
create or replace function public.comments_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() then
    new.user_id    := auth.uid();
    new.created_at := now();
    new.deleted_at := null;
    new.deleted_by := null;
  end if;
  new.body := btrim(new.body);
  return new;
end $$;

create trigger comments_before_insert before insert on public.comments
  for each row execute function public.comments_before_insert();
