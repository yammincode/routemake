-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261118000055_route_beta

-- =====================================================================
-- 官方 beta（step49，10/21 使用者選 B）：定線員示範這條路線原本設計的爬法
-- - 影片多一個「官方 beta」標記（route_videos.is_beta）；一條路線只有一支
-- - 只有那一館的員工（定線員、店長；老闆全部館）能放：岩館路線、還在牆上、開放的館；
--   路線或館的留言關掉時客人不能分享影片，官方 beta 照樣可以放（使用者 10/21 同意）
-- - 不算每人 24 小時 15 支；長度、大小照原本（上攀 3 分鐘 100 MB、其他 60 秒 50 MB）
-- - 再放一支：新的存好時，舊的那支資料自動刪掉（使用者選「直接刪掉」），檔案由 App 刪；寫操作紀錄
-- - 官方 beta 不顯示分享者的 Flash／完攀和攀爬日
-- 舊版 App 照常可用（新增影片不用送這個欄位，預設不是官方 beta）
-- =====================================================================

alter table public.route_videos add column if not exists is_beta boolean not null default false;
create unique index if not exists route_videos_one_beta on public.route_videos (route_id) where is_beta;

-- 這條路線現在能不能放官方 beta：那一館的員工、岩館路線、還在牆上、開放的館、有暱稱
create or replace function public.can_share_beta(p_route uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.routes r
      join public.zones z on z.id = r.zone_id
      join public.gyms g on g.id = z.gym_id
     where r.id = p_route and r.archived_at is null and coalesce(r.kind, 'gym') = 'gym' and g.is_live
       and public.is_staff(z.gym_id)
  )
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.nickname is not null)
$$;
revoke execute on function public.can_share_beta(uuid) from public, anon;
grant execute on function public.can_share_beta(uuid) to authenticated;

-- 上傳影片檔：客人照原本（可以分享、24 小時不到 15 支）；員工放官方 beta 不算 15 支（另外每天最多 60 個檔案，防止誤傳太多）
create or replace function public.can_upload_video(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_route uuid;
  v_count int;
begin
  begin
    v_route := ((storage.foldername(p_name))[2])::uuid;
  exception when others then
    return false;
  end;
  if not public.video_path_ok(v_route, p_name) then
    return false;
  end if;
  select count(*) into v_count from storage.objects o
   where o.bucket_id = 'route-videos' and o.owner = auth.uid() and o.created_at > now() - interval '1 day';
  return (public.can_share_video(v_route) and v_count < 15)
      or (public.can_share_beta(v_route) and v_count < 60);
end $$;

-- 縮圖：跟影片檔一樣
create or replace function public.can_upload_video_thumb(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_route uuid;
  v_count int;
begin
  begin
    v_route := ((storage.foldername(p_name))[2])::uuid;
  exception when others then
    return false;
  end;
  if not (p_name ~ '\.(webp|jpg)$' and public.video_path_ok(v_route, p_name)) then
    return false;
  end if;
  select count(*) into v_count from storage.objects o
   where o.bucket_id = 'video-thumbs' and o.owner = auth.uid() and o.created_at > now() - interval '1 day';
  return (public.can_share_video(v_route) and v_count < 30)
      or (public.can_share_beta(v_route) and v_count < 120);
end $$;

-- 新增影片資料：官方 beta 要能放（員工），一般影片照原本
drop policy if exists route_videos_insert on public.route_videos;
create policy route_videos_insert on public.route_videos for insert to authenticated
  with check (
    user_id = auth.uid() and public.video_path_ok(route_id, path)
    and (case when is_beta then public.can_share_beta(route_id) else public.can_share_video(route_id) end)
  );

-- 新增影片資料（同 0039，加上官方 beta）：官方 beta 不算 24 小時 15 支、不帶分享者的紀錄；
-- 同一條路線原本的官方 beta 先刪掉（換成這支）並寫操作紀錄
create or replace function public.route_videos_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_day    date;
  v_old    public.route_videos;
begin
  if not public.is_db_admin() then
    new.user_id := auth.uid();
    new.created_at := now();
    if not exists (select 1 from storage.objects o
                    where o.bucket_id = 'route-videos' and o.name = new.path and o.owner = auth.uid()) then
      raise exception '找不到上傳的影片檔，請重新分享' using errcode = '22023';
    end if;
    if not new.is_beta and (select count(*) from public.route_videos v
         where v.user_id = auth.uid() and not v.is_beta and v.created_at > now() - interval '1 day') >= 15 then
      raise exception '每人 24 小時內最多分享 15 支影片，明天再來' using errcode = '54000';
    end if;
    if not public.link_free(new.caption) then
      raise exception '影片說明不能放網址' using errcode = '22023';
    end if;
    if new.is_beta then
      new.status := null;
      new.climbed_on := null;
    elsif new.status is not null and new.climbed_on is not null then
      -- 只讀狀態和日期（不碰私人心得）
      select x.status, x.climbed_on into v_status, v_day
        from public.ascents x where x.user_id = auth.uid() and x.route_id = new.route_id;
      if found then
        new.status := v_status;
        new.climbed_on := v_day;
      else
        new.climbed_on := null;
      end if;
    else
      new.climbed_on := null;
    end if;
  end if;
  if new.is_beta then
    -- 同一條路線同時只有一支：先鎖住這條路線，兩個人同時放時一個一個來
    perform 1 from public.routes where id = new.route_id for update;
    select * into v_old from public.route_videos v where v.route_id = new.route_id and v.is_beta;
    if v_old.id is not null then
      delete from public.route_videos where id = v_old.id;
    end if;
    perform public.write_audit(public.route_gym(new.route_id), 'video.beta', new.id, jsonb_build_object(
      'code', (select code from public.routes where id = new.route_id),
      'replaced', v_old.id is not null,
      'old_author_nickname', (select nickname from public.profiles where id = v_old.user_id)));
  end if;
  return new;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261118000055', 'route_beta');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
