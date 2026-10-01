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
