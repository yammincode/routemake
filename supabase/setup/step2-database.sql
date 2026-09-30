-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);

-- >>>>>>>>>> 20261001000001_schema

-- =====================================================================
-- 原岩路線 PWA：資料表
-- 8 張表：gyms、zones、routes、ascents、comments、profiles、staff_roles、audit_log
-- 路線下架不刪除，只填 archived_at；每人每條路線只有一筆紀錄
-- =====================================================================

-- 台北時間的今天
create or replace function public.taipei_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Taipei')::date
$$;

-- ---------------------------------------------------------------------
-- 場館：六間店都先建好，只有明德館 is_live = true
-- ---------------------------------------------------------------------
create table public.gyms (
  id               text primary key check (id ~ '^[a-z0-9-]{2,20}$'),
  name             text not null check (char_length(btrim(name)) between 1 and 20),
  is_live          boolean not null default false,
  floorplan_path   text,                          -- 平面圖 SVG（Storage 路徑），從 CAD 匯出
  comments_enabled boolean not null default true, -- 全館留言開關
  sort             int not null default 0
);

-- ---------------------------------------------------------------------
-- 使用者（對應 auth.users）
-- 其他人只能讀 id、暱稱、頭像；手機號碼與 is_owner 只有本人（透過 my_access()）看得到
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  phone        text unique,                     -- 手機號碼（登入用，Supabase 格式如 886912345678）
  line_user_id text unique,                     -- 正式開放前加 LINE 登入後才會有值
  nickname     text check (nickname = btrim(nickname) and char_length(nickname) between 1 and 16),
  avatar_url   text,
  is_owner     boolean not null default false,  -- 老闆：所有場館的店長，本人不能修改
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 區域：A 區、比賽牆、B 區、C 區、D 區
-- ---------------------------------------------------------------------
create table public.zones (
  id            uuid primary key default gen_random_uuid(),
  gym_id        text not null references public.gyms (id),
  name          text not null check (char_length(btrim(name)) between 1 and 20),
  photo_path    text,                           -- Storage 路徑
  photo_width   int check (photo_width > 0),
  photo_height  int check (photo_height > 0),
  plan_shape    jsonb,                          -- 平面圖上的位置 {"polys":[[[x,y],…]],"label":[x,y]}，0–100（%）
  model_mesh    text,                           -- 第二階段：3D 模型裡對應的物件名稱
  next_reset_on date,                           -- 下次換線日
  code          text not null check (code ~ '^[A-Z][A-Z0-9]{0,2}$'), -- 'A'，路線編號 A-01 的字首，也是平面圖 SVG 的圖形 id
  route_seq     int not null default 0,         -- 已用到的路線流水號（換線後繼續往上加）
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  unique (gym_id, code)
);
create index zones_gym_idx on public.zones (gym_id, sort);

-- ---------------------------------------------------------------------
-- 路線
-- ---------------------------------------------------------------------
create table public.routes (
  id               uuid primary key default gen_random_uuid(),
  zone_id          uuid not null references public.zones (id),
  code             text not null,               -- 'A-07'，新增時自動產生，同區不重複
  grade            int not null check (grade between 0 and 10),
  hold_color       text not null check (hold_color in ('紅','橙','黃','綠','藍','紫','粉','黑','白')),
  style_tags       text[] not null default '{}'
                   check (style_tags <@ array['力量','指力','技巧','平衡','腳法','動態','協調','柔軟','耐力']),
  setter_note      text check (char_length(setter_note) <= 40), -- 評語，40 字內
  pin_x            numeric(6,3) not null check (pin_x between 0 and 100), -- 起步點位置（%）
  pin_y            numeric(6,3) not null check (pin_y between 0 and 100),
  comments_enabled boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  archived_at      timestamptz,                 -- 下架時間，null = 還在牆上
  unique (zone_id, code)
);
create index routes_zone_active_idx on public.routes (zone_id) where archived_at is null;
create index routes_created_idx on public.routes (created_at desc);

-- ---------------------------------------------------------------------
-- 顧客的紀錄：每人每條路線一筆
-- ---------------------------------------------------------------------
create table public.ascents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  route_id     uuid not null references public.routes (id),
  status       text not null check (status in ('flash','send','project')),
  climbed_on   date not null default public.taipei_today(), -- 顧客可補登過去日期
  feel         int check (feel in (1,2,3)),                  -- 輕鬆／剛好／吃力
  grade_feel   int check (grade_feel in (-1,0,1)),           -- 偏軟／剛好／偏硬
  private_note text check (char_length(private_note) <= 300), -- 私人心得，只有本人看得到
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, route_id),
  -- 嘗試中沒有「感覺」和「難度體感」
  check (status <> 'project' or (feel is null and grade_feel is null))
);
create index ascents_user_day_idx on public.ascents (user_id, climbed_on);

-- ---------------------------------------------------------------------
-- 公開留言（軟刪除）
-- ---------------------------------------------------------------------
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  route_id   uuid not null references public.routes (id),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 200),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);
create index comments_route_idx on public.comments (route_id, created_at) where deleted_at is null;

-- ---------------------------------------------------------------------
-- 員工角色：綁定場館；老闆用 profiles.is_owner
-- ---------------------------------------------------------------------
create table public.staff_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  gym_id     text not null references public.gyms (id),
  role       text not null check (role in ('setter','manager')),
  created_at timestamptz not null default now(),
  primary key (user_id, gym_id)
);

-- ---------------------------------------------------------------------
-- 操作紀錄：誰在什麼時候下架、整區換線、刪留言、指派員工
-- ---------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  gym_id     text references public.gyms (id),
  action     text not null,
  target_id  uuid,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_gym_idx on public.audit_log (gym_id, created_at desc);

insert into supabase_migrations.schema_migrations (version, name) values ('20261001000001', 'schema');

-- >>>>>>>>>> 20261001000002_helpers_triggers

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

insert into supabase_migrations.schema_migrations (version, name) values ('20261001000002', 'helpers_triggers');

-- >>>>>>>>>> 20261001000003_rls

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

insert into supabase_migrations.schema_migrations (version, name) values ('20261001000003', 'rls');

-- >>>>>>>>>> 20261001000004_functions

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

insert into supabase_migrations.schema_migrations (version, name) values ('20261001000004', 'functions');

-- >>>>>>>>>> 20261001000005_storage

-- =====================================================================
-- 照片 Storage：bucket zone-photos（公開讀）
-- 路徑規則：{場館 id}/zones/{檔名}（區域照片，員工可上傳）
--          {場館 id}/floorplan/{檔名}（平面圖 SVG，只有店長可上傳）
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zone-photos', 'zone-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 這個路徑能不能由目前登入者上傳／修改／刪除
create or replace function public.can_manage_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case (storage.foldername(p_name))[2]
           when 'zones'     then public.is_staff((storage.foldername(p_name))[1])
           when 'floorplan' then public.is_manager((storage.foldername(p_name))[1])
           else false
         end
$$;

create policy zone_photos_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'zone-photos');
create policy zone_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'zone-photos' and public.can_manage_photo(name));
create policy zone_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'zone-photos' and public.can_manage_photo(name))
  with check (bucket_id = 'zone-photos' and public.can_manage_photo(name));
create policy zone_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'zone-photos' and public.can_manage_photo(name));

insert into supabase_migrations.schema_migrations (version, name) values ('20261001000005', 'storage');

-- >>>>>>>>>> 20261001000006_seed

-- =====================================================================
-- 初始資料：六間店、明德館 5 個區域
-- 其他五間店先用暫用名稱，正式館名確認後再改
-- 平面圖位置是依換線公告圖描出的暫用多邊形（換算成 0–100%），正式版改用 CAD 匯出的 SVG
-- 可重複執行：已存在的資料不會被覆蓋
-- =====================================================================

insert into public.gyms (id, name, is_live, sort) values
  ('mingde', '明德館', true,  1),
  ('g2',     '第二館', false, 2),
  ('g3',     '第三館', false, 3),
  ('g4',     '第四館', false, 4),
  ('g5',     '第五館', false, 5),
  ('g6',     '第六館', false, 6)
on conflict (id) do nothing;

insert into public.zones (gym_id, code, name, sort, plan_shape) values
  ('mingde', 'A', 'A 區', 1, '{"polys":[[[72.57,23.33],[76.64,23.33],[76.64,59.73],[73.45,58.4],[72.39,50.67],[73.72,41.33],[72.39,32.27],[73.27,27.33]],[[61.68,2.4],[76.64,2.4],[76.64,23.33],[73.1,23.33],[72.92,10.0],[70.97,8.0],[65.49,8.67],[65.04,11.07],[61.68,11.07]]],"label":[67.43,32.27]}'::jsonb),
  ('mingde', 'W', '比賽牆', 2, '{"polys":[[[26.55,45.73],[61.5,45.73],[61.5,70.93],[58.23,70.93],[57.88,60.0],[56.19,53.33],[51.33,50.93],[44.25,51.47],[36.28,50.13],[30.09,51.47],[28.14,50.13]]],"label":[42.92,60.0]}'::jsonb),
  ('mingde', 'B', 'B 區', 3, '{"polys":[[[36.46,89.07],[38.5,90.67],[40.71,93.07],[52.21,93.07],[55.75,89.33],[57.52,82.67],[58.23,77.33],[61.5,76.4],[61.5,97.6],[36.46,97.6]]],"label":[48.85,84.27]}'::jsonb),
  ('mingde', 'C', 'C 區', 4, '{"polys":[[[19.47,84.0],[25.22,79.73],[29.2,82.67],[30.53,90.67],[29.65,96.27],[19.47,89.33]],[[15.04,50.67],[17.26,50.67],[18.58,53.33],[18.58,71.33],[17.88,73.33],[15.04,73.33]]],"label":[25.84,73.6]}'::jsonb),
  ('mingde', 'D', 'D 區', 5, '{"polys":[[[2.39,50.67],[4.6,50.67],[4.6,61.6],[5.31,61.6],[5.31,76.0],[7.08,80.0],[10.62,82.67],[10.62,84.8],[2.39,78.13]]],"label":[10.27,65.6]}'::jsonb)
on conflict (gym_id, code) do nothing;

insert into supabase_migrations.schema_migrations (version, name) values ('20261001000006', 'seed');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
