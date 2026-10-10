-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261030000035_home_gyms

-- =====================================================================
-- 人物卡「常去的館」改成可以複選
-- - profiles.home_gyms：常去的館（可以好幾間），照場館順序存、不重複、只能是有的館；跟其他人物卡欄位一樣不開放直接讀寫
-- - 原本的 home_gym 搬進來；home_gym 留著、永遠＝第一間，給還沒更新的舊版 App 讀
-- - save_my_card 新版（p_home_gyms 好幾間）；舊版（p_home_gym 一間）照常可用：
--   舊版只認得一間館，存檔時那間本來就在清單裡就不動清單（不會洗掉在新版勾的其他館）；換成別間就只存那一間；清空就清空
-- - profile_card 多回傳 home_gyms
-- =====================================================================
alter table public.profiles add column if not exists home_gyms text[] not null default '{}';
update public.profiles set home_gyms = array[home_gym] where home_gym is not null and home_gyms = '{}';

-- 儲存自己的人物卡（新版：常去的館可以好幾間）
create or replace function public.save_my_card(p_public boolean, p_bio text, p_years text, p_home_gyms text[], p_self smallint[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_gyms text[];
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = '42501';
  end if;
  if not public.bio_ok(nullif(btrim(p_bio), '')) then
    raise exception '自我介紹最多 60 字，而且不能放聯絡方式（網址、電話、LINE、IG 等）' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_home_gyms, '{}')) g
              where g is null or not exists (select 1 from public.gyms x where x.id = g)) then
    raise exception '常去的館要從清單裡選' using errcode = '22023';
  end if;
  -- 照場館順序、不重複
  v_gyms := array(select x.id from public.gyms x where x.id = any (coalesce(p_home_gyms, '{}')) order by x.sort, x.id);
  update public.profiles set
    card_public = coalesce(p_public, false),
    bio = nullif(btrim(p_bio), ''),
    climbing_years = nullif(p_years, ''),
    home_gyms = v_gyms,
    home_gym = v_gyms[1],
    self_stats = p_self
   where id = auth.uid();
end $$;
revoke execute on function public.save_my_card(boolean, text, text, text[], smallint[]) from public, anon;
grant execute on function public.save_my_card(boolean, text, text, text[], smallint[]) to authenticated;

-- 舊版 App 存人物卡（只有一間館）：轉給新版存
create or replace function public.save_my_card(p_public boolean, p_bio text, p_years text, p_home_gym text, p_self smallint[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_home text := nullif(p_home_gym, '');
  v_now  text[];
begin
  v_now := coalesce((select home_gyms from public.profiles where id = auth.uid()), '{}');
  perform public.save_my_card(p_public, p_bio, p_years,
    case when v_home is null then '{}'::text[]
         when v_home = any (v_now) then v_now
         else array[v_home] end,
    p_self);
end $$;
revoke execute on function public.save_my_card(boolean, text, text, text, smallint[]) from public, anon;
grant execute on function public.save_my_card(boolean, text, text, text, smallint[]) to authenticated;

-- 讀人物卡：多回傳 home_gyms（照場館順序，已經沒有的館不列）；其他跟 0018 一樣
create or replace function public.profile_card(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
  v_self boolean;
  v_ability int[];
  v_counted int;
  v_month int;
  v_total int;
  v_top int;
  v_top_yds int;
  v_month_start date;
  v_gyms text[];
begin
  p := (select x from public.profiles x where x.id = p_user);
  if p.id is null then
    raise exception '找不到這個人' using errcode = 'P0002';
  end if;
  v_self := coalesce(p_user = auth.uid(), false);  -- 未登入時 auth.uid() 是 null，要當成「不是本人」
  if not p.card_public and not v_self then
    return jsonb_build_object('nickname', p.nickname, 'public', false, 'self', false);
  end if;

  v_month_start := date_trunc('month', public.taipei_today())::date;
  v_total := (select count(*) from public.ascents a join public.routes rk on rk.id = a.route_id and rk.kind = 'gym' where a.user_id = p_user and a.status in ('flash', 'send'));
  v_month := (select count(*) from public.ascents a join public.routes rk on rk.id = a.route_id and rk.kind = 'gym' where a.user_id = p_user and a.status in ('flash', 'send') and a.climbed_on >= v_month_start);
  v_top := (select max(r.grade) from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
             where a.user_id = p_user and a.status in ('flash', 'send') and r.grade < 100);
  v_top_yds := (select max(r.grade) from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
                 where a.user_id = p_user and a.status in ('flash', 'send') and r.grade >= 100);
  v_counted := (select count(*) from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
                 where a.user_id = p_user and a.status in ('flash', 'send') and cardinality(r.style_tags) > 0);
  v_ability := (
    with s as (
      select r.grade, r.style_tags from public.ascents a join public.routes r on r.id = a.route_id and r.kind = 'gym'
       where a.user_id = p_user and a.status in ('flash', 'send')
    ), ax(k, tags) as (
      values (1, '{力量}'::text[]), (2, '{指力}'), (3, '{動態,協調}'), (4, '{耐力}'), (5, '{技巧,腳法,平衡}'), (6, '{柔軟}')
    ), pts as (
      select ax.k, coalesce(sum(public.route_points(s.grade, '{}')) filter (where s.style_tags && ax.tags), 0)::numeric as v
        from ax left join s on true group by ax.k
    )
    select array_agg(case when m.mx > 0 then round(100 * pts.v / m.mx)::int else 0 end order by pts.k)
      from pts, (select max(v) as mx from pts) m
  );
  v_gyms := array(select x.id from public.gyms x where x.id = any (p.home_gyms) order by x.sort, x.id);

  return jsonb_build_object(
    'nickname', p.nickname, 'public', p.card_public, 'self', v_self,
    'bio', p.bio, 'years', p.climbing_years, 'home_gym', v_gyms[1], 'home_gyms', to_jsonb(v_gyms), 'self_stats', p.self_stats,
    'ability', v_ability, 'ability_sends', v_counted,
    'total_sends', v_total, 'month_sends', v_month, 'top_grade', v_top, 'top_yds', v_top_yds
  );
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261030000035', 'home_gyms');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
