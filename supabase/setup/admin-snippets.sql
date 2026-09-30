-- =====================================================================
-- 管理用 SQL（在 Supabase → SQL Editor 執行，每次只選需要的那一段）
-- 把「帳號名稱」和「新密碼」換成實際的值；帳號名稱一律小寫
-- =====================================================================

-- 1. 把某個帳號設成老闆（所有場館的店長）
update public.profiles set is_owner = true where username = '帳號名稱';

-- 2. 幫忘記密碼的人重設密碼（新密碼至少 8 碼，重設後請對方登入再自行記好）
update auth.users
   set encrypted_password = extensions.crypt('新密碼', extensions.gen_salt('bf')),
       updated_at = now()
 where email = '帳號名稱@users.routemake.local';

-- 3. 查某個帳號的暱稱和員工身分
select p.username as 帳號, p.nickname as 暱稱, p.is_owner as 老闆,
       (select string_agg(s.gym_id || ':' || s.role, ', ') from public.staff_roles s where s.user_id = p.id) as 員工身分
  from public.profiles p where p.username = '帳號名稱';
