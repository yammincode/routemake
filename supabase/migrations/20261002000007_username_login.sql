-- =====================================================================
-- 登入改成「帳號名稱＋密碼」（不發簡訊、不寄信）
-- App 把帳號名稱轉成 {帳號}@users.routemake.local 存在 Supabase Auth（Confirm email 關閉）
-- profiles.username：4–20 字，英文小寫、數字、底線；不公開（其他人只看得到暱稱）
-- 手機號碼欄位保留但先不用
-- =====================================================================

alter table public.profiles
  add column username text unique check (username ~ '^[a-z0-9_]{4,20}$');

-- 帳號名稱：從 Auth 的 email 取出（只認本 App 的網域）
create or replace function public.username_from_email(p_email text) returns text
language sql immutable set search_path = '' as $$
  select case when lower(p_email) like '%@users.routemake.local'
              then lower(split_part(p_email, '@', 1)) end
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, username)
  values (new.id, nullif(new.phone, ''), public.username_from_email(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

-- 已經存在的帳號補上帳號名稱
update public.profiles p set username = public.username_from_email(u.email)
  from auth.users u where u.id = p.id and p.username is null and public.username_from_email(u.email) is not null;

-- 帳號名稱註冊後不能改
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_db_admin() then return new; end if;
  if new.id is distinct from old.id or new.phone is distinct from old.phone
     or new.username is distinct from old.username
     or new.line_user_id is distinct from old.line_user_id or new.is_owner is distinct from old.is_owner
     or new.created_at is distinct from old.created_at then
    raise exception '只能修改暱稱和頭像' using errcode = '42501';
  end if;
  return new;
end $$;

-- my_access() 加上帳號名稱
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'id', p.id,
    'username', p.username,
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
-- 指派員工改用帳號名稱
-- lookup_user(帳號)：店長或老闆查對方暱稱，指派前確認是本人
-- ---------------------------------------------------------------------
create or replace function public.lookup_user(p_username text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
begin
  if not (public.is_owner() or exists (
      select 1 from public.staff_roles s where s.user_id = auth.uid() and s.role = 'manager')) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  select id, nickname into r from public.profiles where username = lower(btrim(p_username));
  if r.id is null then
    raise exception '找不到這個帳號，請對方先註冊' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', r.id, 'nickname', r.nickname);
end $$;

drop function public.assign_staff(text, text, text);

create function public.assign_staff(p_username text, p_gym text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if p_role not in ('setter', 'manager') then
    raise exception '角色只能是 setter 或 manager' using errcode = '22023';
  end if;
  if not (public.is_owner() or (p_role = 'setter' and public.is_manager(p_gym))) then
    raise exception '沒有權限' using errcode = '42501';
  end if;

  select id into v_user from public.profiles where username = lower(btrim(p_username));
  if v_user is null then
    raise exception '找不到這個帳號，請對方先註冊' using errcode = 'P0002';
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

revoke execute on function public.assign_staff(text, text, text), public.lookup_user(text) from public, anon;
grant execute on function public.assign_staff(text, text, text), public.lookup_user(text) to authenticated;
