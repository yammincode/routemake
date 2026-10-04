-- 指派員工更直覺：
-- 1. search_users(關鍵字, 館)：店長、老闆用暱稱或帳號名稱搜尋（英數至少 2 個字、中文 1 個字，最多 5 位），
--    同時回傳對方在這間館的角色；顧客、定線長不能用
-- 2. assign_staff_user(對方 id, 館, 角色)：從搜尋結果或員工列表直接指派、改角色，不用再打帳號名稱
--    原本的 assign_staff(帳號名稱, …) 保留，改成轉呼叫這個

create or replace function public.search_users(p_query text, p_gym text)
returns table (id uuid, username text, nickname text, role text)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
  pat text;
begin
  if not (public.is_owner() or exists (
      select 1 from public.staff_roles s where s.user_id = auth.uid() and s.role = 'manager')) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  -- 英數至少 2 個字；中文暱稱 1 個字就可以搜
  if q = '' or (char_length(q) < 2 and q ~ '^[ -~]*$') then
    return;
  end if;
  -- 關鍵字裡的 % _ \ 當一般字元
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, p.username, p.nickname, s.role
      from public.profiles p
      left join public.staff_roles s on s.user_id = p.id and s.gym_id = p_gym
     where p.username like pat or lower(coalesce(p.nickname, '')) like pat
     order by (p.username = q or lower(coalesce(p.nickname, '')) = q) desc,
              (p.username like q || '%' or lower(coalesce(p.nickname, '')) like q || '%') desc,
              p.nickname nulls last, p.username
     limit 5;
end $$;
revoke execute on function public.search_users(text, text) from public, anon;
grant execute on function public.search_users(text, text) to authenticated;

create or replace function public.assign_staff_user(p_user uuid, p_gym text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_nick text;
  v_name text;
begin
  if p_role not in ('setter', 'manager') then
    raise exception '角色只能是 setter 或 manager' using errcode = '22023';
  end if;
  if not (public.is_owner() or (p_role = 'setter' and public.is_manager(p_gym))) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception '找不到這個帳號，請對方先註冊' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.staff_roles where user_id = p_user and gym_id = p_gym and role = 'manager')
     and not public.is_owner() then
    raise exception '店長的角色只有老闆能修改' using errcode = '42501';
  end if;

  v_nick := (select nickname from public.profiles where id = p_user);
  v_name := (select username from public.profiles where id = p_user);
  insert into public.staff_roles (user_id, gym_id, role) values (p_user, p_gym, p_role)
  on conflict (user_id, gym_id) do update set role = excluded.role;
  perform public.write_audit(p_gym, 'staff.assign', p_user,
    jsonb_build_object('role', p_role, 'nickname', v_nick, 'username', v_name));
  return p_user;
end $$;
revoke execute on function public.assign_staff_user(uuid, text, text) from public, anon;
grant execute on function public.assign_staff_user(uuid, text, text) to authenticated;

create or replace function public.assign_staff(p_username text, p_gym text, p_role text) returns uuid
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
  v_user := (select id from public.profiles where username = lower(btrim(p_username)));
  if v_user is null then
    raise exception '找不到這個帳號，請對方先註冊' using errcode = 'P0002';
  end if;
  return public.assign_staff_user(v_user, p_gym, p_role);
end $$;
