-- =====================================================================
-- 路線列顯示影片數（跟留言數一樣，有才顯示）：區域頁一次讀資料（zone_view）時多帶每條路線的影片數 vs
-- 其他照 0034：自己的紀錄帶最高爬到第幾點、留言數 cs
-- 舊版 App 照常可用（不讀 vs）；新版在還沒執行時只顯示留言數
-- =====================================================================
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
            select id, gym_id, code, name, photo_path, photo_width, photo_height,
                   public.zone_reset_on(id, next_reset_on) as next_reset_on, sort, grade_system, kind
              from public.zones where id = p_zone) z),
    'g', (select to_jsonb(g) from (
            select id, name, is_live, comments_enabled, sort
              from public.gyms where id = (select gym_id from public.zones where id = p_zone)) g),
    'rs', coalesce((select jsonb_agg(to_jsonb(r) order by r.grade, r.code) from r), '[]'::jsonb),
    'as', coalesce((select jsonb_object_agg(a.route_id, to_jsonb(a)) from (
            select a.id, a.route_id, a.status, a.climbed_on, a.feel, a.grade_feel, a.private_note, a.highpoint
              from public.ascents a join r on r.id = a.route_id
             where a.user_id = auth.uid()) a), '{}'::jsonb),
    'cs', coalesce((select jsonb_object_agg(c.route_id, c.n) from (
            select c.route_id, count(*)::int as n
              from public.comments c join r on r.id = c.route_id
             group by c.route_id) c), '{}'::jsonb),
    'vs', coalesce((select jsonb_object_agg(v.route_id, v.n) from (
            select v.route_id, count(*)::int as n
              from public.route_videos v join r on r.id = v.route_id
             group by v.route_id) v), '{}'::jsonb)
  );
$$;
