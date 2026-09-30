-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);

-- >>>>>>>>>> 20261005000010_security_audit

-- =====================================================================
-- 安全加強與操作紀錄頁
-- 1. 留言頻率限制：同一個人 1 分鐘最多 5 則、24 小時最多 100 則
-- 2. audit_log.user_id 連到 profiles，後台操作紀錄頁可以顯示是誰做的（暱稱）
-- 3. 操作紀錄的內容補上看得懂的資訊（路線編號、區域名稱、員工暱稱與帳號、留言所屬路線）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 留言頻率限制
-- ---------------------------------------------------------------------
create or replace function public.comments_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() then
    new.user_id    := auth.uid();
    new.created_at := now();
    new.deleted_at := null;
    new.deleted_by := null;
    if public.recent_comment_count(interval '1 minute') >= 5 then
      raise exception '留言太頻繁，請稍後再試' using errcode = '54000';
    end if;
    if public.recent_comment_count(interval '1 day') >= 100 then
      raise exception '今天留言太多了，明天再來' using errcode = '54000';
    end if;
  end if;
  new.body := btrim(new.body);
  return new;
end $$;

-- 自己在這段時間內留了幾則（含已刪除，避免刪了再洗）
create or replace function public.recent_comment_count(p_within interval) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.comments
   where user_id = auth.uid() and created_at > now() - p_within
$$;
revoke execute on function public.recent_comment_count(interval) from public, anon;
grant execute on function public.recent_comment_count(interval) to authenticated;

create index if not exists comments_user_time_idx on public.comments (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. audit_log.user_id → profiles（資料庫管理者操作的紀錄 user_id 為 null）
-- ---------------------------------------------------------------------
alter table public.audit_log
  add constraint audit_log_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null not valid;

-- ---------------------------------------------------------------------
-- 3. 操作紀錄內容補充
-- ---------------------------------------------------------------------
-- 單條下架／恢復：加上區域名稱
create or replace function public.routes_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_zone text := (select name from public.zones where id = new.zone_id);
begin
  if coalesce(current_setting('app.bulk_archive', true), '') = 'on' then return null; end if;
  if old.archived_at is null and new.archived_at is not null then
    perform public.write_audit(public.zone_gym(new.zone_id), 'route.archive', new.id,
      jsonb_build_object('code', new.code, 'zone', v_zone, 'grade', new.grade, 'color', new.hold_color));
  elsif old.archived_at is not null and new.archived_at is null then
    perform public.write_audit(public.zone_gym(new.zone_id), 'route.unarchive', new.id,
      jsonb_build_object('code', new.code, 'zone', v_zone));
  end if;
  return null;
end $$;

-- 整區換線：加上區域名稱
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
    jsonb_build_object('count', cardinality(v_codes), 'codes', to_jsonb(v_codes),
                       'zone', (select name from public.zones where id = p_zone)));
  return cardinality(v_codes);
end $$;

-- 員工刪留言：加上路線編號與留言者暱稱
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
    perform public.write_audit(v_gym, 'comment.delete', p_comment, jsonb_build_object(
      'route_id', c.route_id, 'author', c.user_id, 'body', c.body,
      'code', (select code from public.routes where id = c.route_id),
      'author_nickname', (select nickname from public.profiles where id = c.user_id)));
  end if;
end $$;

-- 指派／移除員工：加上對方暱稱與帳號
create or replace function public.assign_staff(p_username text, p_gym text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_nick text;
  v_name text;
begin
  if p_role not in ('setter', 'manager') then
    raise exception '角色只能是 setter 或 manager' using errcode = '22023';
  end if;
  if not (public.is_owner() or (p_role = 'setter' and public.is_manager(p_gym))) then
    raise exception '沒有權限' using errcode = '42501';
  end if;

  select id, nickname, username into v_user, v_nick, v_name from public.profiles where username = lower(btrim(p_username));
  if v_user is null then
    raise exception '找不到這個帳號，請對方先註冊' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.staff_roles where user_id = v_user and gym_id = p_gym and role = 'manager')
     and not public.is_owner() then
    raise exception '店長的角色只有老闆能修改' using errcode = '42501';
  end if;

  insert into public.staff_roles (user_id, gym_id, role) values (v_user, p_gym, p_role)
  on conflict (user_id, gym_id) do update set role = excluded.role;
  perform public.write_audit(p_gym, 'staff.assign', v_user,
    jsonb_build_object('role', p_role, 'nickname', v_nick, 'username', v_name));
  return v_user;
end $$;

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
  perform public.write_audit(p_gym, 'staff.remove', p_user, jsonb_build_object('role', v_role,
    'nickname', (select nickname from public.profiles where id = p_user),
    'username', (select username from public.profiles where id = p_user)));
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261005000010', 'security_audit');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from pg_constraint where conname = 'audit_log_user_id_fkey') as 操作紀錄關聯,
       (select count(*) from pg_proc where proname = 'recent_comment_count') as 留言頻率限制;
