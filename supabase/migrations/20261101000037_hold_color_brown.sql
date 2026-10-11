-- 岩點顏色新增：咖啡（色號 #7B4B2A，排在粉和黑中間；畫面上的色號在 lib/design.ts）
-- 先執行這份再更新正式版：舊版 App 選不到咖啡，不受影響；新版選咖啡存路線要這份才存得進去
alter table public.routes drop constraint routes_hold_color_check;
alter table public.routes add constraint routes_hold_color_check
  check (hold_color in ('紅','橙','黃','綠','藍','紫','粉','咖啡','黑','白','灰','蒂芬妮'));
