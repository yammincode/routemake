-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);

-- >>>>>>>>>> 20261006000011_route_videos

-- =====================================================================
-- 顧客分享影片（直接上傳到 Storage）
-- - bucket route-videos（公開讀）：路徑 {場館}/{路線 id}/{上傳者 id}/{檔名}
--   每支最大 50 MB；只收 mp4、mov、webm；每人 24 小時最多 10 支
-- - route_videos：影片資料；路線下架（含整區換線）時一併刪除
--   （Storage 的檔案由 App 呼叫 Storage API 刪除；漏刪的用 orphan_video_paths() 找出來清理）
-- - 刪除：本人可刪自己的；該館員工可刪任何影片（寫操作紀錄）
-- - 路線或場館留言關閉、路線已下架時不能分享
-- =====================================================================

create table public.route_videos (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.routes (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  path        text not null unique,                       -- Storage 路徑
  caption     text check (char_length(caption) <= 40),    -- 一句說明
  status      text check (status in ('flash', 'send', 'project')), -- 分享時的完成狀態
  duration_s  numeric(5, 1) check (duration_s > 0 and duration_s <= 60),
  size_bytes  bigint check (size_bytes > 0 and size_bytes <= 52428800),
  created_at  timestamptz not null default now()
);
create index route_videos_route_idx on public.route_videos (route_id, created_at desc);
create index route_videos_user_idx on public.route_videos (user_id, created_at desc);

-- 這條路線現在能不能分享影片（路線在牆上、路線與場館留言開啟、有暱稱）
create or replace function public.can_share_video(p_route uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.routes r
      join public.zones z on z.id = r.zone_id
      join public.gyms g on g.id = z.gym_id
     where r.id = p_route and r.archived_at is null and r.comments_enabled and g.comments_enabled
  )
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.nickname is not null)
$$;

-- 影片路徑應該長這樣：{場館}/{路線}/{本人}/…
create or replace function public.video_path_ok(p_route uuid, p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_path))[1] = public.route_gym(p_route)
     and (storage.foldername(p_path))[2] = p_route::text
     and (storage.foldername(p_path))[3] = auth.uid()::text
     and array_length(storage.foldername(p_path), 1) = 3
$$;

create or replace function public.route_videos_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() then
    new.user_id := auth.uid();
    new.created_at := now();
  end if;
  return new;
end $$;
create trigger route_videos_before_insert before insert on public.route_videos
  for each row execute function public.route_videos_before_insert();

alter table public.route_videos enable row level security;
create policy route_videos_read on public.route_videos for select to anon, authenticated using (true);
create policy route_videos_insert on public.route_videos for insert to authenticated
  with check (user_id = auth.uid() and public.can_share_video(route_id) and public.video_path_ok(route_id, path));
revoke update, delete, truncate on public.route_videos from anon, authenticated;
revoke insert on public.route_videos from anon;

-- ---------------------------------------------------------------------
-- 刪除影片：本人或該館員工；回傳 Storage 路徑讓 App 刪檔
-- ---------------------------------------------------------------------
create or replace function public.delete_video(p_video uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.route_videos;
  v_gym text;
begin
  select * into v from public.route_videos where id = p_video;
  if v.id is null then
    raise exception '找不到這支影片' using errcode = 'P0002';
  end if;
  v_gym := public.route_gym(v.route_id);
  if v.user_id is distinct from auth.uid() and not public.is_staff(v_gym) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  delete from public.route_videos where id = p_video;
  if v.user_id is distinct from auth.uid() then
    perform public.write_audit(v_gym, 'video.delete', p_video, jsonb_build_object(
      'code', (select code from public.routes where id = v.route_id),
      'author_nickname', (select nickname from public.profiles where id = v.user_id),
      'caption', v.caption));
  end if;
  return v.path;
end $$;
revoke execute on function public.delete_video(uuid) from public, anon;
grant execute on function public.delete_video(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 路線下架時刪掉影片資料（含整區換線）
-- ---------------------------------------------------------------------
create or replace function public.routes_archive_videos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    delete from public.route_videos where route_id = new.id;
  end if;
  return null;
end $$;
create trigger routes_archive_videos after update of archived_at on public.routes
  for each row execute function public.routes_archive_videos();

-- 下架前先取得要刪的影片檔路徑（員工用）
create or replace function public.video_paths_for_routes(p_routes uuid[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(v.path), '{}')
    from public.route_videos v
   where v.route_id = any (p_routes) and public.is_staff(public.route_gym(v.route_id))
$$;
revoke execute on function public.video_paths_for_routes(uuid[]) from public, anon;
grant execute on function public.video_paths_for_routes(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Storage：bucket 與權限
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('route-videos', 'route-videos', true, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 可以上傳到這個路徑嗎：路徑是自己的、路線可以分享、24 小時內上傳不到 10 支
create or replace function public.can_upload_video(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_route uuid;
begin
  begin
    v_route := ((storage.foldername(p_name))[2])::uuid;
  exception when others then
    return false;
  end;
  return public.video_path_ok(v_route, p_name)
     and public.can_share_video(v_route)
     and (select count(*) from storage.objects o
           where o.bucket_id = 'route-videos' and o.owner = auth.uid()
             and o.created_at > now() - interval '1 day') < 10;
end $$;

-- 可以刪除這個檔案嗎：自己上傳的，或該館員工
create or replace function public.can_delete_video_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_name))[3] = auth.uid()::text
      or public.is_staff((storage.foldername(p_name))[1])
$$;

create policy route_videos_file_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'route-videos');
-- 上面的檢查函式（security definer，以 postgres 身分執行）要數檔案、算用量，確保讀得到
create policy route_videos_file_owner_read on storage.objects for select to postgres
  using (bucket_id = 'route-videos');
create policy route_videos_file_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'route-videos' and public.can_upload_video(name));
create policy route_videos_file_delete on storage.objects for delete to authenticated
  using (bucket_id = 'route-videos' and public.can_delete_video_file(name));

-- ---------------------------------------------------------------------
-- 後台：空間使用量、清理沒有對應資料的檔案
-- ---------------------------------------------------------------------
create or replace function public.video_usage(p_gym text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_staff(p_gym) then null else jsonb_build_object(
    'count', count(*),
    'bytes', coalesce(sum((o.metadata ->> 'size')::bigint), 0)
  ) end
  from storage.objects o
  where o.bucket_id = 'route-videos' and (storage.foldername(o.name))[1] = p_gym
$$;

-- 找出沒有對應影片資料的檔案（例如下架時沒刪成功），上傳超過 1 小時才算，避免刪到正在上傳的
create or replace function public.orphan_video_paths(p_gym text) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when not public.is_staff(p_gym) then '{}'::text[] else coalesce(array_agg(o.name), '{}') end
    from storage.objects o
   where o.bucket_id = 'route-videos' and (storage.foldername(o.name))[1] = p_gym
     and o.created_at < now() - interval '1 hour'
     and not exists (select 1 from public.route_videos v where v.path = o.name)
$$;

revoke execute on function public.video_usage(text), public.orphan_video_paths(text) from public, anon;
grant execute on function public.video_usage(text), public.orphan_video_paths(text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261006000011', 'route_videos');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from storage.buckets where id = 'route-videos') as 影片空間,
       (select count(*) from pg_policies where tablename = 'route_videos') as 影片權限規則,
       (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'route_videos_file_%') as 影片檔案權限規則;
