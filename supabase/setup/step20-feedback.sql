-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261019000024_feedback

-- 意見回饋：使用者寫給開發者的建議、問題回報
-- - 要登入才能送；每人 24 小時最多 5 則
-- - 本人看得到自己送過的（含處理狀態）；只有老闆看得到全部，並能改處理狀態
-- - 自動附上 App 版本、當時看的館、手機類型，方便查問題

do $do$ begin
  execute 'create ' || $t$table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('idea', 'bug', 'other')),
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  contact     text check (char_length(contact) <= 100),
  gym_id      text references public.gyms (id) on delete set null,
  app_version text check (char_length(app_version) <= 20),
  device      text check (char_length(device) <= 200),
  status      text not null default 'new' check (status in ('new', 'doing', 'done')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
)$t$;
end $do$;
create index feedback_user_idx on public.feedback (user_id, created_at desc);
create index feedback_status_idx on public.feedback (status, created_at desc);
alter table public.feedback enable row level security;

create policy feedback_read on public.feedback for select to authenticated
  using (user_id = auth.uid() or public.is_owner());
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = auth.uid());
create policy feedback_update on public.feedback for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
-- 不開放刪除

-- 新增：固定是本人、狀態從「未讀」開始；24 小時最多 5 則
create or replace function public.feedback_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() then
    new.user_id    := auth.uid();
    new.status     := 'new';
    new.created_at := now();
    new.updated_at := now();
    if (select count(*) from public.feedback f where f.user_id = auth.uid() and f.created_at > now() - interval '1 day') >= 5 then
      raise exception '今天已經送出 5 則回饋，明天再來，謝謝你！' using errcode = '54000';
    end if;
  end if;
  new.body    := btrim(new.body);
  new.contact := nullif(btrim(coalesce(new.contact, '')), '');
  return new;
end $$;
create trigger feedback_before_insert before insert on public.feedback
  for each row execute function public.feedback_before_insert();

-- 修改：老闆只能改處理狀態，內容不能動
create or replace function public.feedback_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() and (
       new.user_id is distinct from old.user_id or new.kind is distinct from old.kind or new.body is distinct from old.body
       or new.contact is distinct from old.contact or new.gym_id is distinct from old.gym_id
       or new.app_version is distinct from old.app_version or new.device is distinct from old.device
       or new.created_at is distinct from old.created_at) then
    raise exception '回饋內容不能修改，只能改處理狀態' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger feedback_before_update before update on public.feedback
  for each row execute function public.feedback_before_update();

-- 老闆看回饋時一起顯示暱稱與帳號（其他人呼叫會被擋）
create or replace function public.feedback_list(p_status text default null) returns table (
  id uuid, kind text, body text, contact text, gym_id text, app_version text, device text,
  status text, created_at timestamptz, nickname text, username text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception '只有老闆可以看所有回饋' using errcode = '42501';
  end if;
  return query
    select f.id, f.kind, f.body, f.contact, f.gym_id, f.app_version, f.device, f.status, f.created_at, p.nickname, p.username
      from public.feedback f join public.profiles p on p.id = f.user_id
     where p_status is null or f.status = p_status
     order by f.created_at desc
     limit 200;
end $$;
revoke execute on function public.feedback_list(text) from public, anon;
grant execute on function public.feedback_list(text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261019000024', 'feedback');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
