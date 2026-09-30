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
