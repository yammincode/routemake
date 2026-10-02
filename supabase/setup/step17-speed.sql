-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261016000021_speed

-- 加快速度：
-- 1. zone_view()：區域頁需要的資料（區域、場館、路線、自己的紀錄、留言數）一次拿齊，
--    原本要排隊問資料庫 3 次。security invoker：照樣套用每張表的 RLS（紀錄只拿得到自己的）
-- 2. 紀錄表加上「依路線」的索引：算幾人完攀、各區進度不用整張表翻一遍

create index if not exists ascents_route_idx on public.ascents (route_id, status);

create or replace function public.zone_view(p_zone uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with r as (
    select id, zone_id, code, grade, hold_color, style_tags, setter_note, pin_x, pin_y, comments_enabled,
           created_at, archived_at, kind, name, description, holds, created_by
      from public.routes
     where zone_id = p_zone and archived_at is null
  )
  select jsonb_build_object(
    'z', (select to_jsonb(z) from (
            select id, gym_id, code, name, photo_path, photo_width, photo_height, next_reset_on, sort, grade_system, kind
              from public.zones where id = p_zone) z),
    'g', (select to_jsonb(g) from (
            select id, name, is_live, comments_enabled, sort
              from public.gyms where id = (select gym_id from public.zones where id = p_zone)) g),
    'rs', coalesce((select jsonb_agg(to_jsonb(r) order by r.grade, r.code) from r), '[]'::jsonb),
    'as', coalesce((select jsonb_object_agg(a.route_id, to_jsonb(a)) from (
            select a.id, a.route_id, a.status, a.climbed_on, a.feel, a.grade_feel, a.private_note
              from public.ascents a join r on r.id = a.route_id
             where a.user_id = auth.uid()) a), '{}'::jsonb),
    'cs', coalesce((select jsonb_object_agg(c.route_id, c.n) from (
            select c.route_id, count(*)::int as n
              from public.comments c join r on r.id = c.route_id
             group by c.route_id) c), '{}'::jsonb)
  );
$$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261016000021', 'speed');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
