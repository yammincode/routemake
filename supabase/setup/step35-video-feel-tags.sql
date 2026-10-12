-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261104000040_video_feel_tags

-- =====================================================================
-- 影片型態標籤：分享影片時選「你爬起來覺得？」（選填、最多 2 個），配上自己的心得（說明欄）
-- - route_videos.feel_tags：power（💪 力量感）／fingers（🤏 手指超痛）／hard（🧠 超難爬）／
--   risky（🧘 risky）／footwork（🦶 精準腳法）／flexible（🤸 柔軟大師）
-- - 只收固定選項、最多 2 個；重複的自動去掉；會公開顯示在影片上（跟身高、動作一樣）
-- - 權限不變：本人新增、本人或該館員工刪除；分享後不能修改（update 權限本來就收回）
-- 舊版 App（v2.7）照常可用：新增影片資料時不用送這個欄位（預設空的）
-- =====================================================================

alter table public.route_videos
  add column if not exists feel_tags text[] not null default '{}'
    constraint route_videos_feel_tags_check
    check (feel_tags <@ array['power', 'fingers', 'hard', 'risky', 'footwork', 'flexible']::text[]
           and cardinality(feel_tags) <= 2);

-- 重複的標籤去掉（保留先選的順序）；沒送或送 null 當作沒選
create or replace function public.route_videos_dedupe_feel() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.feel_tags := coalesce(array(
    select t from unnest(new.feel_tags) with ordinality as u(t, i) group by t order by min(i)), '{}');
  return new;
end $$;
drop trigger if exists route_videos_dedupe_feel on public.route_videos;
create trigger route_videos_dedupe_feel before insert on public.route_videos
  for each row execute function public.route_videos_dedupe_feel();

insert into supabase_migrations.schema_migrations (version, name) values ('20261104000040', 'video_feel_tags');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
