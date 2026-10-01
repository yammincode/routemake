-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261010000015_one_comment

-- =====================================================================
-- 每人每條路線只能留一則留言；之後只能編輯，或刪除後再留
-- - 已經有多則的：保留最新一則，較舊的改成已刪除（資料還在資料庫，畫面不顯示）
-- - edit_comment()：只有本人能改，路線下架或留言關閉時不能改；記錄編輯時間（畫面顯示「已編輯」）
-- =====================================================================
alter table public.comments add column if not exists edited_at timestamptz;

update public.comments c set deleted_at = now()
 where c.deleted_at is null
   and exists (
     select 1 from public.comments d
      where d.route_id = c.route_id and d.user_id = c.user_id and d.deleted_at is null
        and (d.created_at > c.created_at or (d.created_at = c.created_at and d.id > c.id))
   );

create unique index if not exists comments_one_per_user on public.comments (route_id, user_id) where deleted_at is null;

create or replace function public.edit_comment(p_comment uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.comments;
begin
  c := (select x from public.comments x where x.id = p_comment and x.deleted_at is null);
  if c.id is null then
    raise exception '找不到這則留言' using errcode = 'P0002';
  end if;
  if c.user_id is distinct from auth.uid() then
    raise exception '只能編輯自己的留言' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.routes r join public.zones z on z.id = r.zone_id join public.gyms g on g.id = z.gym_id
     where r.id = c.route_id and r.archived_at is null and r.comments_enabled and g.comments_enabled
  ) then
    raise exception '這條路線已下架或關閉留言，不能編輯' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 200 then
    raise exception '留言要 1–200 個字' using errcode = '22023';
  end if;
  update public.comments set body = btrim(p_body), edited_at = now() where id = p_comment;
end $$;
revoke execute on function public.edit_comment(uuid, text) from public, anon;
grant execute on function public.edit_comment(uuid, text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261010000015', 'one_comment');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from pg_indexes where indexname = 'comments_one_per_user') as 一則留言限制,
       (select count(*) from pg_proc where proname = 'edit_comment') as 編輯留言;
