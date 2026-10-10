-- =====================================================================
-- 補 step27 舊版（2026/10/10 以前產生的檔案）少的修正
-- - 一次刪好幾區（重新分區）時，觸發時那幾區都已經刪掉了：把換線公告裡所有已經不存在的區一起拿掉
--   舊版只拿掉正在處理的那一區，剩下已刪掉的區會讓公告存檔檢查失敗，整個刪除被取消
-- - 新版 step27 已經是這樣；這份重新定義同一個函式，重複執行沒有影響
-- =====================================================================
create or replace function public.zones_drop_from_resets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.reset_events
     set zone_ids = array(select z from unnest(zone_ids) z where exists (select 1 from public.zones x where x.id = z))
   where old.id = any (zone_ids);
  return null;
end $$;
