-- =====================================================================
-- 新店：抱石 A 區拆回 A1、A2（0042 合併的反過來）
-- - A 那一筆改回 A1（代碼 A1、名稱「抱石 A1 區」）：照片、換線日、紀錄都照舊；之後新增的路線編號接著往下（A1-xx）
--   合併後新增的 A-01… 編號不變（牆上的標籤不用改）
-- - 新增 A2（「抱石 A2 區」），區域順序排在 A1 後面（後面的區往後挪一格）；沒有照片，請在管理後台上傳
-- - 合併時搬到 A 的 A2 舊路線（編號 A2-xx，都已下架）搬回 A2，顧客的紀錄、積分跟著路線
--   A2 的流水號接在舊的最大號後面（例如舊的到 A2-12，新的從 A2-13 開始，不會撞號）
-- - 換線公告：還沒結束的（今天以後）有 A 的，A1、A2 都排上；已經過去的照舊（只寫 A1）
-- - A 牆上還有路線時不能拆（不知道哪條在 A1、哪條在 A2）：請先在管理後台把 A「整區換線」
-- - 已經拆過再執行一次不會出錯（找不到 A 就什麼都不做）
-- =====================================================================
do $do$
declare
  v_a    uuid := (select id from public.zones where gym_id = 'g5' and code = 'A');
  v_a2   uuid;
  v_sort int;
  n      int;
begin
  if v_a is null then
    return;
  end if;
  if exists (select 1 from public.zones where gym_id = 'g5' and code in ('A1', 'A2')) then
    raise exception '新店已經有 A1 或 A2 區，沒辦法把 A 區拆開';
  end if;
  n := (select count(*) from public.routes where zone_id = v_a and archived_at is null);
  if n > 0 then
    raise exception '新店 A 區牆上還有 % 條路線：請先在管理後台把 A 區「整區換線」，再執行這份設定', n;
  end if;

  v_sort := (select sort from public.zones where id = v_a);
  update public.zones set sort = sort + 1 where gym_id = 'g5' and sort > v_sort;
  update public.zones
     set code = 'A1', name = case when name = '抱石 A 區' then '抱石 A1 區' else name end
   where id = v_a;
  insert into public.zones (gym_id, code, name, sort, grade_system, kind, next_reset_on, route_seq)
  select 'g5', 'A2', '抱石 A2 區', v_sort + 1, z.grade_system, z.kind, z.next_reset_on,
         coalesce((select max(substring(r.code from '^A2-([0-9]+)$')::int) from public.routes r
                    where r.zone_id = v_a and r.code ~ '^A2-[0-9]+$'), 0)
    from public.zones z
   where z.id = v_a
  returning id into v_a2;

  update public.routes set zone_id = v_a2 where zone_id = v_a and code ~ '^A2-[0-9]+$';
  update public.reset_events
     set zone_ids = zone_ids || v_a2
   where v_a = any (zone_ids)
     and not (v_a2 = any (zone_ids))
     and ends_on >= public.taipei_today();
end $do$;
