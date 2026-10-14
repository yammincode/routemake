-- =====================================================================
-- 影片按讚 👍：每人每支影片最多一個讚，可以收回（跟留言按讚一樣）
-- - 所有人都看得到讚數；登入且有暱稱才能按；只能收回自己的讚；不能改
-- - 影片刪掉（本人、員工刪，或路線下架）讚跟著刪；帳號刪掉讚跟著刪
-- 舊版 App 照常可用（不讀這張表）
-- =====================================================================

-- 用 execute 建表：Supabase SQL Editor 看到建表指令會跳出「開啟 RLS」提示並改寫整份 SQL，
-- 會把後面的設定切壞。這張表下面已經自己開啟 RLS。
do $do$ begin
  execute 'create ' || $t$table if not exists public.video_likes (
  video_id    uuid not null references public.route_videos (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (video_id, user_id)
)$t$;
end $do$;
create index if not exists video_likes_user_idx on public.video_likes (user_id);

alter table public.video_likes enable row level security;
drop policy if exists video_likes_read on public.video_likes;
create policy video_likes_read on public.video_likes for select to anon, authenticated using (true);
drop policy if exists video_likes_insert on public.video_likes;
create policy video_likes_insert on public.video_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.route_videos v where v.id = video_id)
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.nickname is not null)
  );
drop policy if exists video_likes_delete on public.video_likes;
create policy video_likes_delete on public.video_likes for delete to authenticated using (user_id = auth.uid());
revoke update, truncate on public.video_likes from anon, authenticated;
revoke insert, delete on public.video_likes from anon;
