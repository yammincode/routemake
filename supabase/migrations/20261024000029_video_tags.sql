-- =====================================================================
-- 影片標籤（精簡版）：分享影片時可以選「身高」和「動作」，都是選填、只能選固定選項
-- - height_band：lt160（160 以下）／160s（160–169）／170s（170–179）／ge180（180 以上）
-- - move：dynamic（動態）／static（靜態）
-- 會公開顯示在影片上，讓身高相近的人篩選參考（分享畫面有寫明）
-- 權限不變：本人新增、本人或該館員工刪除；分享後不能修改（update 權限本來就收回）
-- =====================================================================
alter table public.route_videos
  add column if not exists height_band text check (height_band in ('lt160', '160s', '170s', 'ge180')),
  add column if not exists move text check (move in ('dynamic', 'static'));
