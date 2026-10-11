-- =====================================================================
-- 影片：顧客回報
-- 1. 每人 24 小時最多分享 15 支（原本 10 支，太少）：上傳檔案、新增影片資料都改成 15
-- 2. 影片記下分享者在這條路線的攀爬日（route_videos.climbed_on）：
--    影片下面原本顯示上傳時間（「今天」），幾天前爬、今天才上傳的看起來像今天爬的；
--    攀爬紀錄只有本人讀得到，所以分享當下由資料庫從本人的紀錄帶入攀爬日和完成狀態（App 送的日期只當作「要顯示」，不採用）
--    只有新版 App 有送攀爬日和完成狀態時才帶入（新版分享表單會先告訴本人「你在這條的紀錄會一起顯示：10/09 Flash」）；
--    App 沒送完成狀態（表單寫「影片上不會顯示紀錄」）、舊版 App（v2.7 沒送攀爬日，表單沒說會公開日期）都不記攀爬日
-- 舊版 App（v2.7）照常可用：新增影片資料時不用送這個欄位，跟原本一樣
-- =====================================================================

alter table public.route_videos add column if not exists climbed_on date;

-- 可以上傳到這個路徑嗎：路徑是自己的、路線可以分享、24 小時內上傳不到 15 支
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
             and o.created_at > now() - interval '1 day') < 15;
end $$;

-- 新增影片資料：要先有本人上傳的檔案、24 小時最多 15 筆、說明不能放網址；
-- App 有送攀爬日和完成狀態時，從本人在這條路線的紀錄帶入攀爬日、完成狀態（沒有紀錄時不記攀爬日，完成狀態照 App 送的）
create or replace function public.route_videos_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_day    date;
begin
  if not public.is_db_admin() then
    new.user_id := auth.uid();
    new.created_at := now();
    if not exists (select 1 from storage.objects o
                    where o.bucket_id = 'route-videos' and o.name = new.path and o.owner = auth.uid()) then
      raise exception '找不到上傳的影片檔，請重新分享' using errcode = '22023';
    end if;
    if (select count(*) from public.route_videos v
         where v.user_id = auth.uid() and v.created_at > now() - interval '1 day') >= 15 then
      raise exception '每人 24 小時內最多分享 15 支影片，明天再來' using errcode = '54000';
    end if;
    if not public.link_free(new.caption) then
      raise exception '影片說明不能放網址' using errcode = '22023';
    end if;
    if new.status is not null and new.climbed_on is not null then
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
  return new;
end $$;
