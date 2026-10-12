-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261105000041_rope_video_limit

-- =====================================================================
-- 上攀影片放寬：顧客回報上攀一趟要 2～4 分鐘，60 秒放不下
-- - 上攀（YDS）區：每支最長 3 分鐘（180 秒）、100 MB
-- - 抱石、長耐力、Spray Wall：維持 60 秒、50 MB
-- - 影片檔的 bucket 上限改成 100 MB（Supabase 專案的「上傳檔案大小上限」也要改成 100 MB 以上，見 supabase/README.md）
--   檔案上傳時還不知道是哪種區域的大小，所以檔案一律 100 MB 為上限；影片資料的長度、大小由下面依區域檢查
-- 舊版 App（v2.8 以前）照常可用：App 自己限制 60 秒、50 MB，比這裡嚴
-- =====================================================================

alter table public.route_videos drop constraint if exists route_videos_duration_s_check;
alter table public.route_videos add constraint route_videos_duration_s_check check (duration_s > 0 and duration_s <= 180);
alter table public.route_videos drop constraint if exists route_videos_size_bytes_check;
alter table public.route_videos add constraint route_videos_size_bytes_check check (size_bytes > 0 and size_bytes <= 104857600);

-- 依區域檢查長度、大小：上攀區 180 秒、100 MB；其他 60 秒、50 MB
create or replace function public.route_videos_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rope boolean;
begin
  v_rope := coalesce((select z.grade_system = 'yds'
                        from public.routes r join public.zones z on z.id = r.zone_id
                       where r.id = new.route_id), false);
  if not v_rope and (new.duration_s > 60 or new.size_bytes > 52428800) then
    raise exception '影片最長 60 秒、50 MB 以內（上攀區最長 3 分鐘、100 MB）' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists route_videos_limit on public.route_videos;
create trigger route_videos_limit before insert on public.route_videos
  for each row execute function public.route_videos_limit();

update storage.buckets set file_size_limit = 104857600 where id = 'route-videos';

insert into supabase_migrations.schema_migrations (version, name) values ('20261105000041', 'rope_video_limit');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
