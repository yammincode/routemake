-- =====================================================================
-- 管理用 SQL（在 Supabase → SQL Editor 執行，每次只選需要的那一段）
-- 把「帳號名稱」和「新密碼」換成實際的值；帳號名稱一律小寫
-- =====================================================================

-- 1. 把某個帳號設成老闆（所有場館的店長）
update public.profiles set is_owner = true where username = '帳號名稱';

-- 2. 幫忘記密碼的人重設密碼（新密碼至少 8 碼，重設後請對方登入再自行記好）
--    先確認是本人：請對方說出暱稱和最近記錄的 2–3 條路線，用第 3 段的查詢對照
--    兩行一起執行：第二行把這個帳號在所有手機上的登入都登出（如果有人盜用，最多 1 小時內失效）
update auth.users
   set encrypted_password = extensions.crypt('新密碼', extensions.gen_salt('bf')),
       updated_at = now()
 where email = '帳號名稱@users.routemake.local';
delete from auth.sessions where user_id = (select id from auth.users where email = '帳號名稱@users.routemake.local');

-- 3. 查某個帳號的暱稱、員工身分，和最近記錄的路線（只有日期和路線，不含私人心得）
select p.username as 帳號, p.nickname as 暱稱, p.is_owner as 老闆,
       (select string_agg(s.gym_id || ':' || s.role, ', ') from public.staff_roles s where s.user_id = p.id) as 員工身分,
       (select string_agg(a.climbed_on || ' ' || r.code, '、' order by a.climbed_on desc)
          from (select * from public.ascents x where x.user_id = p.id order by x.climbed_on desc limit 5) a
          join public.routes r on r.id = a.route_id) as 最近記錄
  from public.profiles p where p.username = '帳號名稱';

-- 4. 帳號被盜、或要讓某人所有手機都重新登入（不改密碼）
delete from auth.sessions where user_id = (select id from auth.users where email = '帳號名稱@users.routemake.local');

-- 5. 停權（不能再登入；紀錄、留言都保留）；兩行一起執行，已經登入的最多 1 小時內失效
--    是員工的話，先到管理後台把員工身分移除
update auth.users set banned_until = 'infinity' where email = '帳號名稱@users.routemake.local';
delete from auth.sessions where user_id = (select id from auth.users where email = '帳號名稱@users.routemake.local');
--    解除停權
update auth.users set banned_until = null where email = '帳號名稱@users.routemake.local';

-- 6. 刪除帳號（本人要求刪除時；先用第 2 段的方法確認是本人）
--    ① 是員工的話，先到管理後台把員工身分移除
--    ② 到 Supabase → Authentication → Users，搜尋「帳號名稱@users.routemake.local」→ 刪除
--       他的紀錄、私人心得、留言、按讚、影片資料、意見回饋會一起刪掉；他出的路線留著（沒有出題者）
--    ③ 影片檔：刪除 1 小時後，請他去過的每一館員工到管理後台「影片」按「清理漏刪的檔案」
--       （刪除前可以先用下面這行看他有幾支影片檔）
select count(*) as 影片檔數 from storage.objects
 where bucket_id = 'route-videos'
   and (storage.foldername(name))[3] = (select id::text from public.profiles where username = '帳號名稱');
