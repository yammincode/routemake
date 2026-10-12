-- =====================================================================
-- 影片縮圖（省流量：列表只放縮圖，按了播放才載入影片）
-- - route_videos.thumb_path：縮圖在 video-thumbs bucket 的路徑，跟影片同名、副檔名 .webp 或 .jpg
--   （影片 mingde/{路線}/{本人}/abc.mp4 → 縮圖 mingde/{路線}/{本人}/abc.webp）
-- - bucket video-thumbs（公開讀）：每張最大 1 MB，只收 webp、jpeg；路徑規則跟影片一樣 {場館}/{路線}/{上傳者}/{檔名}
--   跟影片分開放：影片的每天 15 支上限、空間用量、清理漏刪的檔案都不受影響
-- - 分享影片時 App 先傳影片、再傳縮圖、最後新增影片資料；縮圖不對（不同名、不是本人上傳的）就當作沒有縮圖，不擋分享
-- - 刪檔規則跟影片一樣（分享中的不能自己刪、員工可以刪、岩友路線下架後出題者可以清）；後台「清理漏刪的檔案」一起清縮圖
-- - 舊影片的縮圖由老闆在自己電腦跑 scripts/video-thumbs.mjs 補上（管理金鑰，直接寫 thumb_path）
-- 舊版 App 照常可用（不傳縮圖、不讀 thumb_path）
-- =====================================================================

alter table public.route_videos add column if not exists thumb_path text;
alter table public.route_videos drop constraint if exists route_videos_thumb_path_len;
alter table public.route_videos add constraint route_videos_thumb_path_len check (char_length(thumb_path) <= 200);
create index if not exists route_videos_thumb_idx on public.route_videos (thumb_path) where thumb_path is not null;

-- 這支影片的縮圖檔名對不對（影片路徑換成 .webp 或 .jpg）
create or replace function public.video_thumb_ok(p_video text, p_thumb text) returns boolean
language sql immutable set search_path = '' as $$
  select p_thumb in (regexp_replace(p_video, '\.[^./]+$', '') || '.webp',
                     regexp_replace(p_video, '\.[^./]+$', '') || '.jpg')
$$;

-- 新增影片資料時檢查縮圖：要跟影片同名、是本人上傳的檔案；不對就當作沒有縮圖（不擋分享）
create or replace function public.route_videos_thumb() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.thumb_path is not null and not public.is_db_admin() then
    if not public.video_thumb_ok(new.path, new.thumb_path)
       or not exists (select 1 from storage.objects o
                       where o.bucket_id = 'video-thumbs' and o.name = new.thumb_path and o.owner = auth.uid()) then
      new.thumb_path := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists route_videos_thumb on public.route_videos;
create trigger route_videos_thumb before insert on public.route_videos
  for each row execute function public.route_videos_thumb();

-- ---------------------------------------------------------------------
-- Storage：縮圖的 bucket 與權限
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-thumbs', 'video-thumbs', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 可以上傳這張縮圖嗎：路徑是自己的、路線可以分享、副檔名 .webp／.jpg、24 小時內不到 30 張
create or replace function public.can_upload_video_thumb(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_route uuid;
begin
  begin
    v_route := ((storage.foldername(p_name))[2])::uuid;
  exception when others then
    return false;
  end;
  return p_name ~ '\.(webp|jpg)$'
     and public.video_path_ok(v_route, p_name)
     and public.can_share_video(v_route)
     and (select count(*) from storage.objects o
           where o.bucket_id = 'video-thumbs' and o.owner = auth.uid()
             and o.created_at > now() - interval '1 day') < 30;
end $$;

-- 可以刪除這張縮圖嗎（跟影片檔一樣）
-- - 該館員工：可以
-- - 還在分享中（有影片資料用這張縮圖）：不行，要先用 delete_video 刪資料
-- - 自己上傳的：可以
-- - 岩友下架了自己出的路線：別人分享在這條路線的縮圖由出題者清掉
create or replace function public.can_delete_video_thumb(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_route uuid;
begin
  if auth.uid() is null then return false; end if;
  if public.is_staff((storage.foldername(p_name))[1]) then return true; end if;
  if exists (select 1 from public.route_videos v where v.thumb_path = p_name) then return false; end if;
  if (storage.foldername(p_name))[3] = auth.uid()::text then return true; end if;
  begin
    v_route := ((storage.foldername(p_name))[2])::uuid;
  exception when others then
    return false;
  end;
  return exists (select 1 from public.routes r
                  where r.id = v_route and r.kind = 'community' and r.archived_at is not null and r.created_by = auth.uid());
end $$;

-- 讀檔案清單：只有自己上傳的、或可以刪的；看縮圖用公開網址，不受影響
drop policy if exists video_thumbs_file_read on storage.objects;
create policy video_thumbs_file_read on storage.objects for select to authenticated
  using (bucket_id = 'video-thumbs'
         and ((storage.foldername(name))[3] = auth.uid()::text or public.can_delete_video_thumb(name)));
-- 上面的檢查函式（security definer，以 postgres 身分執行）要數檔案，確保讀得到
drop policy if exists video_thumbs_file_owner_read on storage.objects;
create policy video_thumbs_file_owner_read on storage.objects for select to postgres
  using (bucket_id = 'video-thumbs');
drop policy if exists video_thumbs_file_insert on storage.objects;
create policy video_thumbs_file_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'video-thumbs' and public.can_upload_video_thumb(name));
drop policy if exists video_thumbs_file_delete on storage.objects;
create policy video_thumbs_file_delete on storage.objects for delete to authenticated
  using (bucket_id = 'video-thumbs' and public.can_delete_video_thumb(name));

-- 後台「清理漏刪的檔案」：沒有影片資料用到的縮圖（上傳超過 1 小時才算，避免刪到正在分享的）
create or replace function public.orphan_video_thumb_paths(p_gym text) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when not public.is_staff(p_gym) then '{}'::text[] else coalesce(array_agg(o.name), '{}') end
    from storage.objects o
   where o.bucket_id = 'video-thumbs' and (storage.foldername(o.name))[1] = p_gym
     and o.created_at < now() - interval '1 hour'
     and not exists (select 1 from public.route_videos v where v.thumb_path = o.name)
$$;
revoke execute on function public.orphan_video_thumb_paths(text) from public, anon;
grant execute on function public.orphan_video_thumb_paths(text) to authenticated;
