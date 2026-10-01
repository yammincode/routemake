-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261009000014_comment_likes

-- =====================================================================
-- 留言按讚 👍：每人每則留言最多一個讚，可以收回
-- - 所有人都看得到讚數；登入且有暱稱才能按；只能收回自己的讚
-- - 已刪除的留言不能按讚
-- =====================================================================

-- 用 execute 建表：Supabase SQL Editor 看到建表指令會跳出「開啟 RLS」提示並改寫整份 SQL，
-- 會把後面的函式切壞。這張表下面已經自己開啟 RLS。
do $do$ begin
  execute 'create ' || $t$table public.comment_likes (
  comment_id  uuid not null references public.comments (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
)$t$;
end $do$;
create index comment_likes_user_idx on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;
create policy comment_likes_read on public.comment_likes for select to anon, authenticated using (true);
create policy comment_likes_insert on public.comment_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.comments c where c.id = comment_id and c.deleted_at is null)
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.nickname is not null)
  );
create policy comment_likes_delete on public.comment_likes for delete to authenticated using (user_id = auth.uid());
revoke update, truncate on public.comment_likes from anon, authenticated;
revoke insert, delete on public.comment_likes from anon;

insert into supabase_migrations.schema_migrations (version, name) values ('20261009000014', 'comment_likes');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from pg_policies where tablename = 'comment_likes') as 按讚權限規則;
