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
