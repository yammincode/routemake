-- =====================================================================
-- 路線回報（step47，10/16 使用者選 B）
-- - 客人回報牆上有、App 沒標到的路線（missing：在區域照片上點起步點、選顏色、可以猜難度）
--   或某條路線有問題（color 顏色不對／pin 位置標錯／gone 已經拆了）；補充說明選填
-- - 要登入；被停權的人不能回報；每人 24 小時最多 10 則；說明最多 100 字、不能放網址
-- - 那一館的員工（定線員、店長）和老闆看得到那一館還沒處理的回報（含回報的人的暱稱），處理後收起來
-- - 回報的人看得到自己送過的；回報內容不能改，只能由員工改處理狀態（都經過下面的函式，資料表不開放直接寫）
-- - 不放照片（不花 Storage 流量）：位置用區域照片上的百分比
-- 舊版 App 照常可用；還沒執行時新版 App 看不到回報入口，後台說明要套用 step47
-- =====================================================================

do $do$ begin
  execute 'create ' || $t$table public.route_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  zone_id         uuid not null references public.zones (id) on delete cascade,
  route_id        uuid references public.routes (id) on delete cascade,
  kind            text not null check (kind in ('missing', 'color', 'pin', 'gone')),
  hold_color      text check (hold_color is null or hold_color in ('紅','橙','黃','綠','藍','紫','粉','咖啡','黑','白','灰','蒂芬妮')),
  grade_guess     int check (grade_guess is null or grade_guess between -1 and 10 or grade_guess between 100 and 130),
  pin_x           real check (pin_x is null or pin_x between 0 and 100),
  pin_y           real check (pin_y is null or pin_y between 0 and 100),
  note            text check (note is null or char_length(note) <= 100),
  status          text not null default 'new' check (status in ('new', 'added', 'rejected', 'fixed', 'ok')),
  result_route_id uuid references public.routes (id) on delete set null,
  handled_by      uuid references public.profiles (id) on delete set null,
  handled_at      timestamptz,
  created_at      timestamptz not null default now(),
  check ((kind = 'missing') = (route_id is null)),
  check (kind not in ('missing', 'color') or hold_color is not null),
  check (kind not in ('missing', 'pin') or (pin_x is not null and pin_y is not null))
)$t$;
end $do$;
create index route_reports_zone_idx on public.route_reports (zone_id, status, created_at);
create index route_reports_user_idx on public.route_reports (user_id, created_at desc);
alter table public.route_reports enable row level security;

-- 看：自己送的、那一館的員工、老闆（寫入一律經過下面的函式）
create policy route_reports_read on public.route_reports for select to authenticated
  using (user_id = auth.uid() or public.is_staff(public.zone_gym(zone_id)));

-- ---------------------------------------------------------------------
-- 送出回報
-- ---------------------------------------------------------------------
create or replace function public.submit_route_report(
  p_zone uuid, p_route uuid, p_kind text, p_color text, p_grade int, p_x real, p_y real, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_zone uuid := p_zone;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception '要先登入才能回報' using errcode = '42501';
  end if;
  if public.i_am_suspended() then
    raise exception '帳號暫停中，暫時不能回報' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('missing', 'color', 'pin', 'gone') then
    raise exception '回報的種類不對' using errcode = '22023';
  end if;
  if p_kind = 'missing' then
    if p_route is not null then raise exception '回報沒標到的路線不用選路線' using errcode = '22023'; end if;
    if not exists (select 1 from public.zones z join public.gyms g on g.id = z.gym_id where z.id = p_zone and z.kind = 'wall' and g.is_live) then
      raise exception '這一區不能回報' using errcode = '22023';
    end if;
  else
    -- 路線有問題：岩館路線、還在牆上；區域用路線所在的那一區
    select r.zone_id into v_zone from public.routes r join public.zones z on z.id = r.zone_id join public.gyms g on g.id = z.gym_id
      where r.id = p_route and coalesce(r.kind, 'gym') = 'gym' and r.archived_at is null and g.is_live;
    if v_zone is null then raise exception '這條路線不能回報（可能已經下架）' using errcode = '22023'; end if;
  end if;
  if p_kind in ('missing', 'color') and p_color is null then
    raise exception '請選岩點顏色' using errcode = '22023';
  end if;
  if p_kind in ('missing', 'pin') and (p_x is null or p_y is null) then
    raise exception '請在照片上點出起步點' using errcode = '22023';
  end if;
  if v_note is not null and (char_length(v_note) > 100 or not public.link_free(v_note)) then
    raise exception '補充說明最多 100 字，不能放網址' using errcode = '22023';
  end if;
  if (select count(*) from public.route_reports r where r.user_id = v_uid and r.created_at > now() - interval '1 day') >= 10 then
    raise exception '今天已經回報 10 則了，明天再來，謝謝你！' using errcode = '54000';
  end if;
  insert into public.route_reports (user_id, zone_id, route_id, kind, hold_color, grade_guess, pin_x, pin_y, note)
  values (v_uid, v_zone, case when p_kind = 'missing' then null else p_route end, p_kind,
          case when p_kind in ('missing', 'color') then p_color end,
          case when p_kind = 'missing' then p_grade end,
          case when p_kind in ('missing', 'pin') then p_x end,
          case when p_kind in ('missing', 'pin') then p_y end,
          v_note)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_route_report(uuid, uuid, text, text, int, real, real, text) from public, anon;
grant execute on function public.submit_route_report(uuid, uuid, text, text, int, real, real, text) to authenticated;

-- ---------------------------------------------------------------------
-- 員工看還沒處理的回報（一間館；老闆可以 null＝全部館）：帶回報的人的暱稱、區域、路線
-- ---------------------------------------------------------------------
create or replace function public.route_reports_list(p_gym text) returns table (
  id uuid, zone_id uuid, zone_code text, zone_name text, gym_id text,
  route_id uuid, route_code text, route_color text, route_grade int, route_x real, route_y real,
  kind text, hold_color text, grade_guess int, pin_x real, pin_y real, note text,
  user_id uuid, nickname text, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_gym is null and not public.is_owner() or p_gym is not null and not public.is_staff(p_gym) then
    raise exception '只有這間館的員工看得到回報' using errcode = '42501';
  end if;
  return query
    select r.id, r.zone_id, z.code, z.name, z.gym_id,
           r.route_id, x.code, x.hold_color, x.grade, x.pin_x::real, x.pin_y::real,
           r.kind, r.hold_color, r.grade_guess, r.pin_x, r.pin_y, r.note,
           r.user_id, p.nickname, r.created_at
      from public.route_reports r
      join public.zones z on z.id = r.zone_id
      left join public.routes x on x.id = r.route_id
      left join public.profiles p on p.id = r.user_id
     where r.status = 'new' and (p_gym is null or z.gym_id = p_gym)
     order by z.sort, r.created_at;
end $$;
revoke execute on function public.route_reports_list(text) from public, anon;
grant execute on function public.route_reports_list(text) to authenticated;

-- ---------------------------------------------------------------------
-- 員工處理回報（同一則合起來的幾筆一起處理）：added 新增了這條／rejected 不是路線／fixed 改好了／ok 沒問題
-- p_route：新增或修改的那條路線（要在同一區）；只處理還沒處理的；寫操作紀錄
-- ---------------------------------------------------------------------
create or replace function public.handle_route_reports(p_ids uuid[], p_status text, p_route uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  if p_status is null or p_status not in ('added', 'rejected', 'fixed', 'ok') then
    raise exception '處理狀態不對' using errcode = '22023';
  end if;
  for r in select x.id, x.zone_id, x.kind, x.hold_color, z.gym_id, z.name as zone_name, coalesce(t.code, x0.code) as code
              from public.route_reports x join public.zones z on z.id = x.zone_id
              left join public.routes x0 on x0.id = x.route_id
              left join public.routes t on t.id = p_route
            where x.id = any(coalesce(p_ids, '{}')) and x.status = 'new' for update of x loop
    if not public.is_staff(r.gym_id) then
      raise exception '只有這間館的員工可以處理回報' using errcode = '42501';
    end if;
    if p_route is not null and not exists (select 1 from public.routes t where t.id = p_route and t.zone_id = r.zone_id) then
      raise exception '路線不在回報的那一區' using errcode = '22023';
    end if;
    update public.route_reports set status = p_status, result_route_id = p_route, handled_by = auth.uid(), handled_at = now() where id = r.id;
    perform public.write_audit(r.gym_id, 'report.handle', r.id, jsonb_build_object('kind', r.kind, 'status', p_status, 'route', p_route, 'zone', r.zone_name, 'code', r.code, 'color', r.hold_color));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.handle_route_reports(uuid[], text, uuid) from public, anon;
grant execute on function public.handle_route_reports(uuid[], text, uuid) to authenticated;
