-- =====================================================================
-- 本機測試用：模擬 Supabase 內建的角色、auth 與 storage（正式 Supabase 已經有，不要在正式環境執行）
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
create schema if not exists storage;
grant usage on schema public, auth, storage to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  email text unique,
  encrypted_password text,
  banned_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- 登入中的手機（Supabase 刪掉這裡的資料就等於登出）
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now()
);

-- Supabase 把 pgcrypto 裝在 extensions schema
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- 與 Supabase 相同：從 JWT claims 取出使用者 id
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;

create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),       -- Supabase Storage 會填入上傳者
  metadata jsonb,                      -- Supabase Storage 會填入 size、mimetype
  created_at timestamptz default now()
);
-- 同一個 bucket 裡檔名不能重複（跟真的 Supabase 一樣，覆蓋要用 upsert＝更新）
create unique index if not exists objects_bucketid_name on storage.objects (bucket_id, name);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;

create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- Supabase 預設：public 裡的表和函式都授權給 anon、authenticated、service_role
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
