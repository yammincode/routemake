-- 岩點顏色新增：灰、蒂芬妮（Tiffany mint）
alter table public.routes drop constraint routes_hold_color_check;
alter table public.routes add constraint routes_hold_color_check
  check (hold_color in ('紅','橙','黃','綠','藍','紫','粉','黑','白','灰','蒂芬妮'));
