-- =====================================================================
-- Row Level Security：權限一律在資料庫擋
-- =====================================================================

alter table public.gyms        enable row level security;
alter table public.zones       enable row level security;
alter table public.routes      enable row level security;
alter table public.ascents     enable row level security;
alter table public.comments    enable row level security;
alter table public.profiles    enable row level security;
alter table public.staff_roles enable row level security;
alter table public.audit_log   enable row level security;

-- ---------------------------------------------------------------------
-- gyms：所有人可讀；店長可改（例如全館留言開關、平面圖）；新增只有老闆；不開放刪除
-- ---------------------------------------------------------------------
create policy gyms_read on public.gyms for select to anon, authenticated using (true);
create policy gyms_insert on public.gyms for insert to authenticated with check (public.is_owner());
create policy gyms_update on public.gyms for update to authenticated
  using (public.is_manager(id)) with check (public.is_manager(id));

-- ---------------------------------------------------------------------
-- zones：所有人可讀；員工可改（定線員只能改照片和換線日，見 zones_guard）；新增、刪除只有店長
-- 有路線（含已下架）的區域不能刪（外鍵擋）
-- ---------------------------------------------------------------------
create policy zones_read on public.zones for select to anon, authenticated using (true);
create policy zones_insert on public.zones for insert to authenticated with check (public.is_manager(gym_id));
create policy zones_update on public.zones for update to authenticated
  using (public.is_staff(gym_id)) with check (public.is_staff(gym_id));
create policy zones_delete on public.zones for delete to authenticated using (public.is_manager(gym_id));

-- ---------------------------------------------------------------------
-- routes：所有人可讀；該館員工可新增、修改、下架；不開放刪除
-- ---------------------------------------------------------------------
create policy routes_read on public.routes for select to anon, authenticated using (true);
create policy routes_insert on public.routes for insert to authenticated
  with check (public.is_staff(public.zone_gym(zone_id)));
create policy routes_update on public.routes for update to authenticated
  using (public.is_staff(public.zone_gym(zone_id))) with check (public.is_staff(public.zone_gym(zone_id)));

-- ---------------------------------------------------------------------
-- ascents：只有本人能讀寫（包含私人心得），員工和老闆也不行
-- ---------------------------------------------------------------------
create policy ascents_own_read on public.ascents for select to authenticated using (user_id = auth.uid());
create policy ascents_own_insert on public.ascents for insert to authenticated with check (user_id = auth.uid());
create policy ascents_own_update on public.ascents for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ascents_own_delete on public.ascents for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- comments：所有人可讀未刪除的留言；登入且填過暱稱才能留言；
-- 路線已下架、路線或場館留言關閉時拒絕。刪除一律用 delete_comment()
-- ---------------------------------------------------------------------
create or replace function public.can_comment(p_route uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.routes r
      join public.zones z on z.id = r.zone_id
      join public.gyms g on g.id = z.gym_id
     where r.id = p_route
       and r.archived_at is null
       and r.comments_enabled
       and g.comments_enabled
  )
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.nickname is not null)
$$;

create policy comments_read on public.comments for select to anon, authenticated using (deleted_at is null);
create policy comments_insert on public.comments for insert to authenticated
  with check (user_id = auth.uid() and public.can_comment(route_id));

-- ---------------------------------------------------------------------
-- profiles：所有人只能讀 id、暱稱、頭像（欄位權限）；本人可改暱稱、頭像
-- 手機號碼、LINE、is_owner 其他人讀不到；本人用 my_access() 讀
-- ---------------------------------------------------------------------
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select (id, nickname, avatar_url, created_at) on public.profiles to anon, authenticated;
grant update (nickname, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- staff_roles：本人看得到自己的角色；店長看得到自己館的員工
-- 店長只能指派、移除定線員；店長只有老闆能指派
-- ---------------------------------------------------------------------
create policy staff_roles_read on public.staff_roles for select to authenticated
  using (user_id = auth.uid() or public.is_manager(gym_id));
create policy staff_roles_insert on public.staff_roles for insert to authenticated
  with check (public.is_owner() or (role = 'setter' and public.is_manager(gym_id)));
create policy staff_roles_update on public.staff_roles for update to authenticated
  using (public.is_owner() or (role = 'setter' and public.is_manager(gym_id)))
  with check (public.is_owner() or (role = 'setter' and public.is_manager(gym_id)));
create policy staff_roles_delete on public.staff_roles for delete to authenticated
  using (public.is_owner() or (role = 'setter' and public.is_manager(gym_id)));

-- ---------------------------------------------------------------------
-- audit_log：只有該館店長（和老闆）看得到；只能由觸發器和函式寫入
-- ---------------------------------------------------------------------
create policy audit_log_read on public.audit_log for select to authenticated
  using (public.is_manager(gym_id) or (gym_id is null and public.is_owner()));
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

-- 未登入的人只能讀
revoke insert, update, delete, truncate on
  public.gyms, public.zones, public.routes, public.ascents, public.comments, public.staff_roles
  from anon;
-- 留言不開放直接修改或刪除（軟刪除用 delete_comment()）
revoke update, delete, truncate on public.comments from authenticated;
-- 路線不開放刪除（用 archived_at 下架）
revoke delete, truncate on public.routes, public.gyms from authenticated;
