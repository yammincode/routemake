-- =====================================================================
-- 帳號管理：停權、刪帳號、櫃檯重設密碼（step43）
-- - 停權：店長停自己館遇到的人（3／7／30 天），永久只有老闆；不能停員工、老闆
--   停權中可以看路線、記錄自己的完攀；不能留言、改留言、分享影片、上傳檔案、按讚、
--   出 Spray Wall 路線、改暱稱和人物卡、選夥伴、送意見回饋（在資料庫擋，馬上生效）
-- - 刪帳號：老闆刪別人、本人輸入密碼刪自己；員工、老闆不能被刪（先移除員工身分）
-- - 重設密碼：員工產生 6 位數重設碼（15 分鐘、只能用一次、打錯 5 次作廢），
--   客人在登入頁用帳號＋重設碼設新密碼；員工看不到密碼
-- 舊版 App 照常可用（新欄位都不公開，新函式舊版不會呼叫）
-- =====================================================================

-- 停權欄位：不開放讀寫（column 權限沒有給 anon、authenticated），只能透過下面的函式
alter table public.profiles
  add column if not exists suspended_until  timestamptz,
  add column if not exists suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 60),
  add column if not exists suspended_by     uuid references public.profiles (id) on delete set null,
  add column if not exists suspended_at     timestamptz;

create or replace function public.is_suspended(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.suspended_until > now() from public.profiles p where p.id = p_user), false)
$$;
revoke execute on function public.is_suspended(uuid) from public, anon, authenticated;

-- 自己是不是停權中（RLS、觸發器用；只能問自己，不能問別人）
create or replace function public.i_am_suspended() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.is_suspended(auth.uid())
$$;
revoke execute on function public.i_am_suspended() from public, anon;
grant execute on function public.i_am_suspended() to authenticated;

-- 員工（任何一館的定線員、店長）或老闆
create or replace function public.is_any_staff(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_owner from public.profiles p where p.id = p_user), false)
      or exists (select 1 from public.staff_roles s where s.user_id = p_user)
$$;
revoke execute on function public.is_any_staff(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 擋住停權中的人：觸發器（直接寫入和 security definer 函式都會經過）
-- 名稱用 a0_ 開頭：同一張表的觸發器照名稱順序執行，讓停權的提示先出現
-- ---------------------------------------------------------------------
create or replace function public.block_suspended() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_db_admin() or current_setting('app.internal', true) = 'on' then return new; end if;
  if public.i_am_suspended() then
    raise exception '帳號暫停中，暫時不能留言、分享或按讚' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists a0_block_suspended on public.comments;
create trigger a0_block_suspended before insert on public.comments
  for each row execute function public.block_suspended();
drop trigger if exists a0_block_suspended_edit on public.comments;
create trigger a0_block_suspended_edit before update on public.comments
  for each row when (new.body is distinct from old.body) execute function public.block_suspended();
drop trigger if exists a0_block_suspended on public.comment_likes;
create trigger a0_block_suspended before insert on public.comment_likes
  for each row execute function public.block_suspended();
drop trigger if exists a0_block_suspended on public.video_likes;
create trigger a0_block_suspended before insert on public.video_likes
  for each row execute function public.block_suspended();
drop trigger if exists a0_block_suspended on public.route_likes;
create trigger a0_block_suspended before insert on public.route_likes
  for each row execute function public.block_suspended();
drop trigger if exists a0_block_suspended on public.route_videos;
create trigger a0_block_suspended before insert on public.route_videos
  for each row execute function public.block_suspended();
drop trigger if exists a0_block_suspended on public.feedback;
create trigger a0_block_suspended before insert on public.feedback
  for each row execute function public.block_suspended();
-- 岩友路線：不能出新的、不能改（自己下架可以）
drop trigger if exists a0_block_suspended on public.routes;
create trigger a0_block_suspended before insert on public.routes
  for each row when (new.kind = 'community') execute function public.block_suspended();
drop trigger if exists a0_block_suspended_edit on public.routes;
create trigger a0_block_suspended_edit before update on public.routes
  for each row when (new.kind = 'community' and new.archived_at is not distinct from old.archived_at)
  execute function public.block_suspended();

-- 本人改暱稱、人物卡、夥伴（關掉公開可以）
create or replace function public.profiles_block_suspended() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_db_admin() or auth.uid() is distinct from new.id then return new; end if;
  -- 用 jsonb 比對：還沒套用 step41（沒有 mascot 欄位）也能用
  if public.i_am_suspended() and (
       exists (select 1 from unnest(array['nickname', 'avatar_url', 'bio', 'climbing_years', 'home_gym',
                                          'home_gyms', 'self_stats', 'mascot']) k
                where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k))
       or (new.card_public and not old.card_public)) then
    raise exception '帳號暫停中，暫時不能修改暱稱和人物卡' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profiles_block_suspended on public.profiles;
create trigger profiles_block_suspended before update on public.profiles
  for each row execute function public.profiles_block_suspended();

-- Storage：停權中不能上傳任何檔案（restrictive：跟其他上傳規則同時成立才行）
drop policy if exists objects_insert_not_suspended on storage.objects;
create policy objects_insert_not_suspended on storage.objects as restrictive for insert to authenticated
  with check (not public.i_am_suspended());

-- ---------------------------------------------------------------------
-- 我的帳號狀態：登入時跟 my_access() 一起讀（停權中才有 suspension）
-- ---------------------------------------------------------------------
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'phone', p.phone,
    'nickname', p.nickname,
    'avatar_url', p.avatar_url,
    'is_owner', p.is_owner,
    'can_edit_resets', p.is_owner or exists (select 1 from public.reset_editors e where e.user_id = p.id),
    'usage_gyms', coalesce((
      select jsonb_agg(v.gym_id order by g.sort)
        from public.usage_viewers v join public.gyms g on g.id = v.gym_id where v.user_id = p.id), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('gym_id', s.gym_id, 'role', s.role) order by s.gym_id)
        from public.staff_roles s where s.user_id = p.id), '[]'::jsonb),
    'suspension', case when p.suspended_until > now() then jsonb_build_object(
      'until', case when p.suspended_until = 'infinity' then null else p.suspended_until end,
      'reason', p.suspended_reason) end
  ) end
  from public.profiles p where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 停權、解除
-- p_days：3、7、30；null＝永久（只有老闆）
-- ---------------------------------------------------------------------
create or replace function public.suspend_user(p_user uuid, p_gym text, p_days int, p_reason text, p_delete_comments boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_until  timestamptz;
  v_old    timestamptz;
  v_n      int := 0;
begin
  if p_gym is null or not public.is_manager(p_gym) then
    raise exception '只有店長、老闆可以停權' using errcode = '42501';
  end if;
  if p_days is null and not public.is_owner() then
    raise exception '永久停權只有老闆可以設定' using errcode = '42501';
  end if;
  if p_days is not null and p_days not in (3, 7, 30) then
    raise exception '停權天數只能是 3、7、30 天' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 1 and 60 then
    raise exception '請寫停權原因（60 字以內）' using errcode = '22023';
  end if;
  if p_user = auth.uid() then
    raise exception '不能停權自己' using errcode = '42501';
  end if;
  select suspended_until into v_old from public.profiles where id = p_user for update;
  if not found then
    raise exception '找不到這個帳號' using errcode = 'P0002';
  end if;
  if public.is_any_staff(p_user) then
    raise exception '員工和老闆不能停權，請先移除員工身分' using errcode = '42501';
  end if;
  v_until := case when p_days is null then 'infinity'::timestamptz else now() + make_interval(days => p_days) end;
  -- 店長不能把別人（例如老闆）設的較長停權改短
  if not public.is_owner() and v_old > v_until then
    raise exception '他已經停權到更晚的時間，要改請找老闆' using errcode = '42501';
  end if;

  update public.profiles
     set suspended_until = v_until, suspended_reason = v_reason, suspended_by = auth.uid(), suspended_at = now()
   where id = p_user;

  -- 刪留言：店長只刪自己館的（跟 delete_comment 一樣），老闆刪全部
  if p_delete_comments then
    update public.comments set deleted_at = now(), deleted_by = auth.uid()
     where user_id = p_user and deleted_at is null
       and (public.is_owner() or public.route_gym(route_id) = p_gym);
    get diagnostics v_n = row_count;
  end if;

  perform public.write_audit(p_gym, 'user.suspend', p_user, jsonb_build_object(
    'days', p_days, 'reason', v_reason, 'comments_deleted', v_n,
    'nickname', (select nickname from public.profiles where id = p_user),
    'username', (select username from public.profiles where id = p_user)));
  return jsonb_build_object('until', case when p_days is null then null else v_until end, 'comments_deleted', v_n);
end $$;
revoke execute on function public.suspend_user(uuid, text, int, text, boolean) from public, anon;
grant execute on function public.suspend_user(uuid, text, int, text, boolean) to authenticated;

create or replace function public.unsuspend_user(p_user uuid, p_gym text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
begin
  if p_gym is null or not public.is_manager(p_gym) then
    raise exception '只有店長、老闆可以解除停權' using errcode = '42501';
  end if;
  select suspended_until into v_until from public.profiles where id = p_user for update;
  if v_until is null or v_until <= now() then
    return;
  end if;
  if v_until = 'infinity' and not public.is_owner() then
    raise exception '永久停權只有老闆可以解除' using errcode = '42501';
  end if;
  -- 店長只能解除自己停的（別人停的請找停權的人或老闆）
  if not public.is_owner() and (select suspended_by from public.profiles where id = p_user) is distinct from auth.uid() then
    raise exception '只能解除自己停的權，別人停的請找他或老闆' using errcode = '42501';
  end if;
  update public.profiles
     set suspended_until = null, suspended_reason = null, suspended_by = null, suspended_at = null
   where id = p_user;
  perform public.write_audit(p_gym, 'user.unsuspend', p_user, jsonb_build_object(
    'nickname', (select nickname from public.profiles where id = p_user),
    'username', (select username from public.profiles where id = p_user)));
end $$;
revoke execute on function public.unsuspend_user(uuid, text) from public, anon;
grant execute on function public.unsuspend_user(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 帳號管理：員工搜尋（附核對身分用的資料）、停權中名單、某人的留言
-- ---------------------------------------------------------------------
-- p_gym：搜尋的館（comments_here＝這館的留言數，店長停權時只刪得到這些）
create or replace function public.account_row(p_user uuid, p_gym text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'nickname', p.nickname,
    'created_at', p.created_at,
    'staff', p.is_owner or exists (select 1 from public.staff_roles s where s.user_id = p.id),
    'ascents', (select count(*) from public.ascents a where a.user_id = p.id),
    'comments', (select count(*) from public.comments c where c.user_id = p.id and c.deleted_at is null),
    'comments_here', (select count(*) from public.comments c where c.user_id = p.id and c.deleted_at is null
                        and public.route_gym(c.route_id) = p_gym),
    'videos', (select count(*) from public.route_videos v where v.user_id = p.id),
    'recent', coalesce((
      select jsonb_agg(x order by x.at desc) from (
        select g.name as gym, z.name as zone, r.code, r.hold_color as color, r.grade, a.climbed_on, a.updated_at as at
          from public.ascents a join public.routes r on r.id = a.route_id
          join public.zones z on z.id = r.zone_id join public.gyms g on g.id = z.gym_id
         where a.user_id = p.id and a.status in ('flash', 'send')
         order by a.updated_at desc limit 3) x), '[]'::jsonb),
    'suspension', case when p.suspended_until > now() then jsonb_build_object(
      'until', case when p.suspended_until = 'infinity' then null else p.suspended_until end,
      'reason', p.suspended_reason, 'at', p.suspended_at, 'mine', p.suspended_by = auth.uid(),
      'by', (select b.nickname from public.profiles b where b.id = p.suspended_by)) end)
  from public.profiles p where p.id = p_user
$$;
revoke execute on function public.account_row(uuid, text) from public, anon, authenticated;

create or replace function public.search_accounts(p_query text, p_gym text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
  pat text;
begin
  if p_gym is null or not public.is_staff(p_gym) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  if q = '' or (char_length(q) < 2 and q ~ '^[ -~]*$') then
    return '[]'::jsonb;
  end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(public.account_row(t.id, p_gym) order by t.ord)
      from (select p.id, row_number() over (
                     order by (p.username = q or lower(coalesce(p.nickname, '')) = q) desc,
                              (p.username like q || '%' or lower(coalesce(p.nickname, '')) like q || '%') desc,
                              p.nickname nulls last, p.username) as ord
              from public.profiles p
             where p.username like pat or lower(coalesce(p.nickname, '')) like pat
             order by ord limit 5) t), '[]'::jsonb);
end $$;
revoke execute on function public.search_accounts(text, text) from public, anon;
grant execute on function public.search_accounts(text, text) to authenticated;

create or replace function public.account_info(p_user uuid, p_gym text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_gym is null or not public.is_staff(p_gym) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  return public.account_row(p_user, p_gym);
end $$;
revoke execute on function public.account_info(uuid, text) from public, anon;
grant execute on function public.account_info(uuid, text) to authenticated;

create or replace function public.suspended_accounts(p_gym text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_gym is null or not public.is_staff(p_gym) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.account_row(p.id, p_gym) order by p.suspended_at desc)
      from public.profiles p where p.suspended_until > now()), '[]'::jsonb);
end $$;
revoke execute on function public.suspended_accounts(text) from public, anon;
grant execute on function public.suspended_accounts(text) to authenticated;

-- 某人最近的留言（員工看，最多 30 則；deletable：這館的員工可以刪）
create or replace function public.account_comments(p_user uuid, p_gym text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_gym is null or not public.is_staff(p_gym) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select c.id, c.body, c.created_at, g.name as gym, z.name as zone, r.code,
             public.is_staff(z.gym_id) as deletable
        from public.comments c join public.routes r on r.id = c.route_id
        join public.zones z on z.id = r.zone_id join public.gyms g on g.id = z.gym_id
       where c.user_id = p_user and c.deleted_at is null
       order by c.created_at desc limit 30) x), '[]'::jsonb);
end $$;
revoke execute on function public.account_comments(uuid, text) from public, anon;
grant execute on function public.account_comments(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 刪帳號
-- 影片檔：老闆用 delete_user_videos()、本人用 delete_my_videos() 先刪影片資料、拿到檔名，App 從 Storage 刪掉後再刪帳號
-- （中途失敗的話，後台「影片 → 清理漏刪的檔案」照樣補得回來）
-- ---------------------------------------------------------------------
-- 刪帳號時，他出的岩友路線要把出題人改成空的（on delete set null），
-- 但路線的觸發器只允許資料庫管理者改出題人：這次交易剩下的部分用管理者身分（auth.uid() 變成空的）執行
-- 只能在 security definer 函式裡、權限檢查都做完之後呼叫
create or replace function public.drop_jwt_for_cascade() returns void
language sql set search_path = '' as $$
  select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)
$$;
revoke execute on function public.drop_jwt_for_cascade() from public, anon, authenticated;

-- 老闆刪別人第一步：檢查可以刪之後，先刪他的影片資料，回傳檔名讓 App 從 Storage 刪（員工可以刪任何人的影片檔）
create or replace function public.delete_user_videos(p_user uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
begin
  if not public.is_owner() then
    raise exception '只有老闆可以刪除別人的帳號' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception '找不到這個帳號' using errcode = 'P0002';
  end if;
  if public.is_any_staff(p_user) then
    raise exception '員工和老闆不能刪除，請先移除員工身分' using errcode = '42501';
  end if;
  with d as (delete from public.route_videos where user_id = p_user returning path)
  select coalesce(array_agg(path), '{}') into v_paths from d;
  return v_paths;
end $$;
revoke execute on function public.delete_user_videos(uuid) from public, anon;
grant execute on function public.delete_user_videos(uuid) to authenticated;

-- 密碼對不對（本人，刪帳號用）
create or replace function public.my_password_ok(p_password text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select coalesce(p_password, '') <> '' and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
                     from auth.users u where u.id = auth.uid()), false)
$$;
revoke execute on function public.my_password_ok(text) from public, anon, authenticated;

-- 本人刪帳號第一步：密碼對的話先刪掉自己的影片資料，回傳檔名讓 App 從 Storage 刪
-- （影片資料還在時，本人不能刪那個檔案）；密碼錯回傳 null
create or replace function public.delete_my_videos(p_password text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = '42501';
  end if;
  if public.is_any_staff(auth.uid()) then
    raise exception '員工帳號不能自己刪除，請先請老闆移除員工身分' using errcode = '42501';
  end if;
  if not public.my_password_ok(p_password) then
    return null;
  end if;
  with d as (delete from public.route_videos where user_id = auth.uid() returning path)
  select coalesce(array_agg(path), '{}') into v_paths from d;
  return v_paths;
end $$;
revoke execute on function public.delete_my_videos(text) from public, anon;
grant execute on function public.delete_my_videos(text) to authenticated;

create or replace function public.delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  if not public.is_owner() then
    raise exception '只有老闆可以刪除別人的帳號' using errcode = '42501';
  end if;
  p := (select x from public.profiles x where x.id = p_user);
  if p.id is null then
    raise exception '找不到這個帳號' using errcode = 'P0002';
  end if;
  if public.is_any_staff(p_user) then
    raise exception '員工和老闆不能刪除，請先移除員工身分' using errcode = '42501';
  end if;
  perform public.write_audit(null, 'user.delete', p_user,
    jsonb_build_object('username', p.username, 'nickname', p.nickname));
  perform public.drop_jwt_for_cascade();
  delete from auth.users where id = p_user;
end $$;
revoke execute on function public.delete_user(uuid) from public, anon;
grant execute on function public.delete_user(uuid) to authenticated;

-- 本人刪除自己的帳號（要輸入密碼）；密碼錯回傳 false
create or replace function public.delete_my_account(p_password text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = '42501';
  end if;
  if public.is_any_staff(auth.uid()) then
    raise exception '員工帳號不能自己刪除，請先請老闆移除員工身分' using errcode = '42501';
  end if;
  if not public.my_password_ok(p_password) then
    return false;
  end if;
  v_me := auth.uid();
  perform public.drop_jwt_for_cascade();
  delete from auth.users where id = v_me;
  return true;
end $$;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- ---------------------------------------------------------------------
-- 櫃檯重設密碼
-- password_resets：每人最多一組有效的重設碼（只存加密後的碼），沒有人能直接讀寫
-- ---------------------------------------------------------------------
do $do$ begin
  execute 'create ' || $t$table if not exists public.password_resets (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  code_hash  text not null,
  expires_at timestamptz not null,
  tries      int not null default 0,
  gym_id     text references public.gyms (id) on delete set null,   -- 在哪一館產生（用掉時操作紀錄記在這館）
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
)$t$;
end $do$;
alter table public.password_resets enable row level security;
revoke all on public.password_resets from anon, authenticated;

-- 員工產生重設碼：回傳 6 位數字（只顯示這一次）；同一人的舊碼作廢
-- 員工、老闆的帳號只有老闆能幫忙重設（避免員工接管別的員工或老闆的帳號）
create or replace function public.issue_reset_code(p_user uuid, p_gym text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_exp  timestamptz := now() + interval '15 minutes';
begin
  if p_gym is null or not public.is_staff(p_gym) then
    raise exception '只有員工可以產生重設碼' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception '找不到這個帳號' using errcode = 'P0002';
  end if;
  if p_user = auth.uid() then
    raise exception '自己的密碼請在「我的紀錄 → 改密碼」修改' using errcode = '42501';
  end if;
  if public.is_any_staff(p_user) and not public.is_owner() then
    raise exception '員工的帳號只有老闆可以重設密碼' using errcode = '42501';
  end if;
  -- 0～999999 平均分布（取 4 bytes 再取餘數，偏差可忽略）
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.password_resets (user_id, code_hash, expires_at, tries, gym_id, created_by, created_at)
  values (p_user, extensions.crypt(v_code, extensions.gen_salt('bf')), v_exp, 0, p_gym, auth.uid(), now())
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, gym_id = excluded.gym_id,
        created_by = excluded.created_by, created_at = excluded.created_at;
  perform public.write_audit(p_gym, 'user.reset_code', p_user, jsonb_build_object(
    'nickname', (select nickname from public.profiles where id = p_user),
    'username', (select username from public.profiles where id = p_user)));
  return jsonb_build_object('code', v_code, 'expires_at', v_exp,
    'username', (select username from public.profiles where id = p_user));
end $$;
revoke execute on function public.issue_reset_code(uuid, text) from public, anon;
grant execute on function public.issue_reset_code(uuid, text) to authenticated;

create or replace function public.cancel_reset_code(p_user uuid, p_gym text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_gym is null or not public.is_staff(p_gym) then
    raise exception '沒有權限' using errcode = '42501';
  end if;
  if public.is_any_staff(p_user) and not public.is_owner() then
    raise exception '員工的帳號只有老闆可以處理' using errcode = '42501';
  end if;
  delete from public.password_resets where user_id = p_user;
end $$;
revoke execute on function public.cancel_reset_code(uuid, text) from public, anon;
grant execute on function public.cancel_reset_code(uuid, text) to authenticated;

-- 客人用重設碼設新密碼（沒登入也能呼叫）
-- 回傳 'ok'、'bad'（帳號或重設碼不對）、'expired'（過期或打錯太多次，請櫃檯再產生）、'short'（密碼長度不對）
-- 打錯不用 raise（raise 會把「打錯次數」一起取消）
create or replace function public.reset_password_with_code(p_username text, p_code text, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  r      public.password_resets;
begin
  -- bcrypt 只看前 72 bytes（中文一個字 3 bytes），太長的擋下
  if char_length(coalesce(p_password, '')) < 8 or octet_length(p_password) > 72 then
    return 'short';
  end if;
  v_user := (select id from public.profiles where username = lower(btrim(coalesce(p_username, ''))));
  if v_user is null then
    return 'bad';
  end if;
  r := (select x from public.password_resets x where x.user_id = v_user for update);
  if r.user_id is null then
    return 'bad';
  end if;
  if r.expires_at <= now() or r.tries >= 5 then
    delete from public.password_resets where user_id = v_user;
    return 'expired';
  end if;
  if coalesce(p_code, '') !~ '^[0-9]{6}$' or extensions.crypt(p_code, r.code_hash) <> r.code_hash then
    update public.password_resets set tries = tries + 1 where user_id = v_user;
    return case when r.tries + 1 >= 5 then 'expired' else 'bad' end;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = v_user;
  delete from auth.sessions where user_id = v_user;   -- 其他手機登出
  delete from public.password_resets where user_id = v_user;
  perform public.write_audit(r.gym_id, 'user.password_reset', v_user, jsonb_build_object(
    'username', (select username from public.profiles where id = v_user)));
  return 'ok';
end $$;
revoke execute on function public.reset_password_with_code(text, text, text) from public;
grant execute on function public.reset_password_with_code(text, text, text) to anon, authenticated;
