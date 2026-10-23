-- =====================================================================
-- 攀爬日放寬（step50，10/21 使用者選 B）
-- 客人回報「選了日期但沒辦法改」：攀爬日原本不能早於路線放上 App 那天，
-- 但定線員常常先把路線上牆、過幾天才放上 App，客人在中間爬的就記不到真正的日子
-- 改成可以早到路線放上 App 前 7 天；其他檢查（不能晚於今天、下架日）不變
-- 只改紀錄的檢查（ascents_before_write，從 0034 長耐力版複製，只改日期那一段）
-- =====================================================================

create or replace function public.ascents_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_created  date;
  v_archived date;
  v_n        int;
begin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.route_id is distinct from old.route_id) then
    raise exception '不能修改紀錄的使用者或路線' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not public.is_db_admin() then
    new.user_id := auth.uid();
    new.created_at := now();
  end if;
  new.updated_at := now();
  if new.status = 'project' then
    new.feel := null;
    new.grade_feel := null;
  end if;

  -- 長耐力路線：記錄最高爬到第幾點。Flash、完攀＝爬到最後一點；嘗試中是第 1 點到倒數第 2 點（沒填也可以，算 0 分）
  -- 看路線本身（岩館路線、沒有名稱、有照順序的點），不看區域現在的規則：區域換線後改回抱石／上攀，舊紀錄照樣保留最高點
  select case when jsonb_typeof(r.holds) = 'array' then jsonb_array_length(r.holds) end into v_n
    from public.routes r
   where r.id = new.route_id and r.kind = 'gym' and r.name is null;
  if v_n >= 2 then
    if new.status in ('flash', 'send') then
      new.highpoint := v_n;
    elsif new.highpoint is not null and new.highpoint >= v_n then
      -- 從 Flash／完攀改回嘗試中、沒有另外選最高點（留著原本的最後一點）：清掉，等顧客重新拉
      if tg_op = 'UPDATE' and old.status <> 'project' and new.highpoint = old.highpoint then
        new.highpoint := null;
      else
        raise exception '爬到最後一點就是完攀，最高點要小於 %', v_n using errcode = '22023';
      end if;
    end if;
  else
    new.highpoint := null;
  end if;

  select (r.created_at at time zone 'Asia/Taipei')::date, (r.archived_at at time zone 'Asia/Taipei')::date
    into v_created, v_archived
    from public.routes r where r.id = new.route_id;
  -- 可以早於路線放上 App 那天 7 天內（定線員常常先上牆、過幾天才放上 App，客人中間就爬了）
  if new.climbed_on < v_created - 7 then
    raise exception '日期不能早於路線放上 App 前 7 天' using errcode = '22008';
  end if;
  if new.climbed_on > public.taipei_today() then
    raise exception '日期不能晚於今天' using errcode = '22008';
  end if;
  if v_archived is not null and new.climbed_on > v_archived
     and (tg_op = 'INSERT' or new.climbed_on is distinct from old.climbed_on) then
    raise exception '日期不能晚於路線下架日' using errcode = '22008';
  end if;
  return new;
end $$;
