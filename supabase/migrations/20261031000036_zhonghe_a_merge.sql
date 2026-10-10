-- =====================================================================
-- 中和：A1、A2 合併回一個「A 區」（0025 細分的反過來）
-- - 沿用 A1 那一筆改成 A（代碼 A、名稱 A 區）：牆上的路線、照片、換線日、紀錄都照舊
--   之後新增的路線編號是 A-13 這樣；原本的 A1-01… 編號不變（牆上的標籤不用改）
-- - A2 的舊路線（已下架，含顧客的完攀紀錄和積分）搬到 A，換線公告裡的 A2 改成 A，再刪掉 A2
-- - A2 牆上還有路線時不能合併：請先在管理後台把 A2「整區換線」
-- - 已經合併過再執行一次不會出錯（找不到 A1、A2 就什麼都不做）
-- =====================================================================
do $do$
declare
  v_a  uuid := (select id from public.zones where gym_id = 'g3' and code = 'A1');
  v_a2 uuid := (select id from public.zones where gym_id = 'g3' and code = 'A2');
  n int;
begin
  if v_a2 is not null then
    if v_a is null then
      raise exception '中和找不到 A1 區，沒辦法把 A2 併進去';
    end if;
    n := (select count(*) from public.routes where zone_id = v_a2 and archived_at is null);
    if n > 0 then
      raise exception '中和 A2 牆上還有 % 條路線：請先在管理後台把 A2「整區換線」，再執行這份設定', n;
    end if;
    update public.routes set zone_id = v_a where zone_id = v_a2;
    update public.reset_events
       set zone_ids = array(select case when z = v_a2 then v_a else z end from unnest(zone_ids) z)
     where v_a2 = any (zone_ids);
    delete from public.zones where id = v_a2;
  end if;
  if v_a is not null then
    update public.zones
       set code = 'A', name = case when name = 'A1 區' then 'A 區' else name end, sort = 1
     where id = v_a;
  end if;
end $do$;
