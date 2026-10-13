-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261109000046_grand_slam

-- =====================================================================
-- 大滿貫兌換（step40）
-- 顧客在「我的紀錄 → 牆上進度」某個難度全部完成（★ 大滿貫）→ 打開兌換卡拿兌換碼（QR code）→ 櫃檯員工掃了按「確認兌換」
-- - slam_settings：只有一列；活動開關（預設關：只有老闆看得到兌換按鈕，可以先試）、最少條數、兌換期限、獎品文字
--   只能透過 set_slam_settings() 修改（只有老闆）
-- - slam_claims：兌換碼；本人看得到自己的、老闆看得到全部；新增和兌換都只能透過下面的函式
-- - 「全部完成」一律在資料庫重新算（不信手機算的）：開放的館現在牆上的岩館路線（Spray Wall 不算、下架不算），
--   跟 App 的牆上進度同一個算法；拿碼、員工查碼、確認兌換時都重新檢查
-- - 每個人每個難度只能兌換一次；碼過期了還是大滿貫可以再拿新的碼
-- 舊版 App 照常可用（不會用到這些函式）
-- =====================================================================

do $do$ begin
  execute 'create ' || $t$table if not exists public.slam_settings (
  id         int primary key default 1 check (id = 1),
  enabled    boolean not null default false,
  min_routes int not null default 10 check (min_routes between 1 and 500),
  valid_days int not null default 30 check (valid_days between 1 and 365),
  prize      text check (prize = btrim(prize) and char_length(prize) between 1 and 40),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
)$t$;
  execute 'create ' || $t$table if not exists public.slam_claims (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  grade         int not null,
  total         int not null check (total > 0),  -- 拿碼時這個難度牆上幾條
  achieved_on   date not null,                   -- 最後一條完成的攀爬日
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  redeemed_at   timestamptz,
  redeemed_by   uuid references public.profiles (id) on delete set null,
  redeemed_gym  text references public.gyms (id),
  check ((redeemed_at is null) = (redeemed_gym is null))
)$t$;
end $do$;
-- 每個人每個難度只能兌換一次
create unique index if not exists slam_claims_once_idx on public.slam_claims (user_id, grade) where redeemed_at is not null;
create index if not exists slam_claims_user_idx on public.slam_claims (user_id, grade, created_at desc);
create index if not exists slam_claims_recent_idx on public.slam_claims (created_at desc);

alter table public.slam_settings enable row level security;
alter table public.slam_claims enable row level security;
revoke all on public.slam_settings from anon, authenticated;
revoke all on public.slam_claims from anon, authenticated;
grant select on public.slam_claims to authenticated;
drop policy if exists slam_claims_read on public.slam_claims;
create policy slam_claims_read on public.slam_claims for select to authenticated
  using (user_id = auth.uid() or public.is_owner());
insert into public.slam_settings (id) values (1) on conflict (id) do nothing;

-- 這個人這個難度：牆上幾條、完成幾條、最後一條完成的攀爬日（內部用，不開放直接呼叫）
create or replace function public.slam_progress(p_user uuid, p_grade int)
returns table (total int, done int, achieved_on date)
language sql stable security definer set search_path = '' as $$
  select count(*)::int, count(a.id)::int, max(a.climbed_on)
    from public.routes r
    join public.zones z on z.id = r.zone_id
    join public.gyms g on g.id = z.gym_id
    left join public.ascents a on a.route_id = r.id and a.user_id = p_user and a.status in ('flash', 'send')
   where g.is_live and z.kind = 'wall' and r.kind = 'gym' and r.archived_at is null and r.grade = p_grade
$$;
revoke execute on function public.slam_progress(uuid, int) from public, anon, authenticated;

-- 8 碼兌換碼（不用 0、O、1、I 這些容易看錯的字）
create or replace function public.slam_new_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_b   bytea := uuid_send(gen_random_uuid());
  v_out text := '';
  i     int;
begin
  -- 隨機 uuid 的第 7、9 個 byte 有固定的版本位元，跳過
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    v_out := v_out || substr(v_abc, get_byte(v_b, i) % 32 + 1, 1);
  end loop;
  return v_out;
end $$;
revoke execute on function public.slam_new_code() from public, anon, authenticated;

-- 兌換碼一筆的公開欄位（給本人看）
create or replace function public.slam_claim_json(c public.slam_claims) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', c.code, 'grade', c.grade, 'total', c.total, 'achieved_on', c.achieved_on,
    'created_at', c.created_at, 'expires_at', c.expires_at,
    'redeemed_at', c.redeemed_at, 'redeemed_gym', c.redeemed_gym)
$$;
revoke execute on function public.slam_claim_json(public.slam_claims) from public, anon, authenticated;

-- 活動設定＋自己每個難度最新的一組碼（App 用來決定要不要顯示兌換按鈕、已兌換）
create or replace function public.slam_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enabled', s.enabled, 'min_routes', s.min_routes, 'valid_days', s.valid_days, 'prize', s.prize,
    'claims', coalesce((
      select jsonb_agg(public.slam_claim_json(c) order by c.grade)
        from public.slam_claims c
       where c.id in (select distinct on (grade) id from public.slam_claims
                       where user_id = auth.uid()
                       order by grade, (redeemed_at is not null) desc, created_at desc)
    ), '[]'::jsonb))
    from public.slam_settings s where s.id = 1
$$;
revoke execute on function public.slam_info() from public, anon;
grant execute on function public.slam_info() to authenticated;

-- 顧客拿兌換碼：活動要開著（老闆可以先試）、這個難度牆上至少 min_routes 條而且全部完成、還沒兌換過
-- 有還沒過期的碼就回同一組，沒有才發新的
create or replace function public.claim_slam(p_grade int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_set public.slam_settings;
  v_p   record;
  v_c   public.slam_claims;
begin
  if v_uid is null then
    raise exception '請先登入' using errcode = '42501';
  end if;
  select * into v_set from public.slam_settings where id = 1;
  if not v_set.enabled and not public.is_owner() then
    raise exception '大滿貫兌換活動還沒開始' using errcode = 'P0001';
  end if;
  -- 同一個人同一個難度同時按兩次只發一組
  perform pg_advisory_xact_lock(hashtext('slam:' || v_uid || ':' || p_grade));
  if exists (select 1 from public.slam_claims where user_id = v_uid and grade = p_grade and redeemed_at is not null) then
    raise exception '這個難度已經兌換過了' using errcode = 'P0001';
  end if;
  select * into v_p from public.slam_progress(v_uid, p_grade);
  if v_p.total < v_set.min_routes then
    raise exception '這個難度牆上要有 % 條以上才能兌換（現在 % 條）', v_set.min_routes, v_p.total using errcode = 'P0001';
  end if;
  if v_p.done < v_p.total then
    raise exception '這個難度牆上還有 % 條沒完成（% / %）', v_p.total - v_p.done, v_p.done, v_p.total using errcode = 'P0001';
  end if;
  select * into v_c from public.slam_claims
   where user_id = v_uid and grade = p_grade and redeemed_at is null and expires_at > now()
   order by created_at desc limit 1;
  if not found then
    loop
      begin
        insert into public.slam_claims (code, user_id, grade, total, achieved_on, expires_at)
        values (public.slam_new_code(), v_uid, p_grade, v_p.total, v_p.achieved_on, now() + make_interval(days => v_set.valid_days))
        returning * into v_c;
        exit;
      exception when unique_violation then
        -- 碼撞到了（機率極低）：換一組再試
      end;
    end loop;
  end if;
  return public.slam_claim_json(v_c);
end $$;
revoke execute on function public.claim_slam(int) from public, anon;
grant execute on function public.claim_slam(int) to authenticated;

-- 兌換碼：去掉空白、連字號，轉大寫
create or replace function public.slam_norm(p_code text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- 員工查兌換碼（任何一館的員工、老闆）：暱稱、難度、期限、有沒有兌換過、現在牆上是不是還全部完成
create or replace function public.slam_lookup(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c public.slam_claims;
  v_p record;
begin
  if not (public.is_owner() or exists (select 1 from public.staff_roles where user_id = auth.uid())) then
    raise exception '只有員工可以查兌換碼' using errcode = '42501';
  end if;
  select * into v_c from public.slam_claims where code = public.slam_norm(p_code);
  if not found then
    return null;
  end if;
  select * into v_p from public.slam_progress(v_c.user_id, v_c.grade);
  return public.slam_claim_json(v_c) || jsonb_build_object(
    'nickname', (select nickname from public.profiles where id = v_c.user_id),
    'redeemed_by', (select nickname from public.profiles where id = v_c.redeemed_by),
    'now_total', v_p.total, 'now_done', v_p.done,
    'min_routes', (select min_routes from public.slam_settings where id = 1),
    'enabled', (select enabled from public.slam_settings where id = 1));
end $$;
revoke execute on function public.slam_lookup(text) from public, anon;
grant execute on function public.slam_lookup(text) to authenticated;

-- 員工確認兌換：只能用自己有權限的館；資料庫重新檢查還是全部完成、沒過期、沒用過
create or replace function public.redeem_slam(p_code text, p_gym text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c   public.slam_claims;
  v_p   record;
  v_set public.slam_settings;
begin
  if not public.is_staff(p_gym) then
    raise exception '只有這間館的員工可以兌換' using errcode = '42501';
  end if;
  if not exists (select 1 from public.gyms where id = p_gym and is_live) then
    raise exception '找不到這間館' using errcode = 'P0002';
  end if;
  select * into v_set from public.slam_settings where id = 1;
  if not v_set.enabled and not public.is_owner() then
    raise exception '大滿貫兌換活動還沒開始' using errcode = 'P0001';
  end if;
  select * into v_c from public.slam_claims where code = public.slam_norm(p_code) for update;
  if not found then
    raise exception '找不到這組兌換碼' using errcode = 'P0002';
  end if;
  if v_c.redeemed_at is not null then
    raise exception '這組兌換碼已經兌換過了' using errcode = 'P0001';
  end if;
  if v_c.expires_at <= now() then
    raise exception '兌換碼過期了，請顧客重新打開兌換卡拿新的碼' using errcode = 'P0001';
  end if;
  if v_c.user_id = auth.uid() and not public.is_owner() then
    raise exception '不能兌換自己的兌換碼，請找其他員工' using errcode = '42501';
  end if;
  select * into v_p from public.slam_progress(v_c.user_id, v_c.grade);
  if v_p.total < v_set.min_routes or v_p.done < v_p.total then
    raise exception '牆上這個難度現在沒有全部完成（% / % 條），不能兌換', v_p.done, v_p.total using errcode = 'P0001';
  end if;
  update public.slam_claims set redeemed_at = now(), redeemed_by = auth.uid(), redeemed_gym = p_gym
   where id = v_c.id returning * into v_c;
  perform public.write_audit(p_gym, 'slam.redeem', v_c.id,
    jsonb_build_object('nickname', (select nickname from public.profiles where id = v_c.user_id), 'grade', v_c.grade, 'code', v_c.code));
  return public.slam_claim_json(v_c);
exception when unique_violation then
  raise exception '這個顧客這個難度已經兌換過了' using errcode = 'P0001';
end $$;
revoke execute on function public.redeem_slam(text, text) from public, anon;
grant execute on function public.redeem_slam(text, text) to authenticated;

-- 老闆改活動設定
create or replace function public.set_slam_settings(p_enabled boolean, p_min_routes int, p_valid_days int, p_prize text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception '只有老闆可以改大滿貫兌換設定' using errcode = '42501';
  end if;
  update public.slam_settings
     set enabled = p_enabled, min_routes = p_min_routes, valid_days = p_valid_days,
         prize = nullif(btrim(coalesce(p_prize, '')), ''), updated_at = now(), updated_by = auth.uid()
   where id = 1;
  perform public.write_audit(null, 'slam.settings', null,
    jsonb_build_object('enabled', p_enabled, 'min_routes', p_min_routes, 'valid_days', p_valid_days, 'prize', p_prize));
end $$;
revoke execute on function public.set_slam_settings(boolean, int, int, text) from public, anon;
grant execute on function public.set_slam_settings(boolean, int, int, text) to authenticated;

-- 老闆看兌換紀錄（最新的在上面）
create or replace function public.slam_claim_list(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception '只有老闆可以看兌換紀錄' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.slam_claim_json(c) || jsonb_build_object(
             'nickname', (select nickname from public.profiles where id = c.user_id),
             'redeemed_by', (select nickname from public.profiles where id = c.redeemed_by))
           order by coalesce(c.redeemed_at, c.created_at) desc)
      from public.slam_claims c
     where c.id in (select id from public.slam_claims
                     order by coalesce(redeemed_at, created_at) desc
                     limit least(greatest(coalesce(p_limit, 100), 1), 500))
  ), '[]'::jsonb);
end $$;
revoke execute on function public.slam_claim_list(int) from public, anon;
grant execute on function public.slam_claim_list(int) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261109000046', 'grand_slam');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
