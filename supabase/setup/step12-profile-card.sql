-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261011000016_profile_card

-- =====================================================================
-- 人物卡：自我介紹、攀岩年資、常去的館、自評能力；能力值另外依完攀紀錄自動計算
-- 防騷擾：
-- - 預設不公開（card_public = false），本人打開才給別人看；沒公開時別人只看得到暱稱
-- - 新欄位不開放直接讀寫（沒有欄位權限），只能透過下面的函式
-- - 自我介紹不能放聯絡方式（網址、電話、LINE、IG…），資料庫檢查
-- - 不提供行蹤：不回傳最後攀爬時間、爬了哪些路線、今天在哪間館
-- - 店長、老闆可以清除不當的自我介紹（寫操作紀錄）
-- =====================================================================
alter table public.profiles
  add column if not exists card_public boolean not null default false,
  add column if not exists bio text,
  add column if not exists climbing_years text,
  add column if not exists home_gym text references public.gyms (id) on delete set null,
  add column if not exists self_stats smallint[];

-- 自我介紹檢查：最多 60 字、不能有聯絡方式
create or replace function public.bio_ok(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or (
    char_length(p) <= 60
    and p !~* '(https?://|www\.|\.(com|tw|net|org|io|me|cc|app)\y|line|instagram|\yig\y|facebook|\yfb\y|threads|wechat|telegram|@|[0-9０-９][0-9０-９ -]{6,}|加賴|加我|私訊|微信|電話)'
  )
$$;

alter table public.profiles
  add constraint profiles_bio_ok check (public.bio_ok(bio)),
  add constraint profiles_years_ok check (climbing_years is null or climbing_years in ('lt1', '1-3', '3-5', '5+')),
  add constraint profiles_self_stats_ok check (
    self_stats is null or (cardinality(self_stats) = 6 and 1 <= all (self_stats) and 5 >= all (self_stats))
  );

-- 讀人物卡：公開或本人才回傳完整內容，否則只有暱稱
-- 能力值六項（力量、指力、動態、耐力、技巧、柔軟）：所有完攀（Flash、完攀）依路線風格標籤累計難度分數，
-- 以最高的一項為 100 換算，所以會隨爬過的路線類型總量改變
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
  v_month_start date;
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
  v_total := (select count(*) from public.ascents a where a.user_id = p_user and a.status in ('flash', 'send'));
  v_month := (select count(*) from public.ascents a where a.user_id = p_user and a.status in ('flash', 'send') and a.climbed_on >= v_month_start);
  v_top := (select max(r.grade) from public.ascents a join public.routes r on r.id = a.route_id
             where a.user_id = p_user and a.status in ('flash', 'send'));
  v_counted := (select count(*) from public.ascents a join public.routes r on r.id = a.route_id
                 where a.user_id = p_user and a.status in ('flash', 'send') and cardinality(r.style_tags) > 0);
  v_ability := (
    with s as (
      select r.grade, r.style_tags from public.ascents a join public.routes r on r.id = a.route_id
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

  return jsonb_build_object(
    'nickname', p.nickname, 'public', p.card_public, 'self', v_self,
    'bio', p.bio, 'years', p.climbing_years, 'home_gym', p.home_gym, 'self_stats', p.self_stats,
    'ability', v_ability, 'ability_sends', v_counted,
    'total_sends', v_total, 'month_sends', v_month, 'top_grade', v_top
  );
end $$;
revoke execute on function public.profile_card(uuid) from public;
grant execute on function public.profile_card(uuid) to anon, authenticated;

-- 儲存自己的人物卡
create or replace function public.save_my_card(p_public boolean, p_bio text, p_years text, p_home_gym text, p_self smallint[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = '42501';
  end if;
  if not public.bio_ok(nullif(btrim(p_bio), '')) then
    raise exception '自我介紹最多 60 字，而且不能放聯絡方式（網址、電話、LINE、IG 等）' using errcode = '22023';
  end if;
  update public.profiles set
    card_public = coalesce(p_public, false),
    bio = nullif(btrim(p_bio), ''),
    climbing_years = nullif(p_years, ''),
    home_gym = nullif(p_home_gym, ''),
    self_stats = p_self
   where id = auth.uid();
end $$;
revoke execute on function public.save_my_card(boolean, text, text, text, smallint[]) from public, anon;
grant execute on function public.save_my_card(boolean, text, text, text, smallint[]) to authenticated;

-- 店長、老闆清除不當的自我介紹（記在該館操作紀錄）
create or replace function public.clear_card_bio(p_user uuid, p_gym text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_bio text;
begin
  if not public.is_manager(p_gym) then
    raise exception '只有店長可以清除自我介紹' using errcode = '42501';
  end if;
  v_bio := (select bio from public.profiles where id = p_user);
  update public.profiles set bio = null where id = p_user;
  perform public.write_audit(p_gym, 'card.clear', p_user, jsonb_build_object(
    'nickname', (select nickname from public.profiles where id = p_user), 'bio', v_bio));
end $$;
revoke execute on function public.clear_card_bio(uuid, text) from public, anon;
grant execute on function public.clear_card_bio(uuid, text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261011000016', 'profile_card');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from pg_proc where proname in ('profile_card', 'save_my_card', 'clear_card_bio')) as 人物卡函式,
       (select count(*) from public.profiles where card_public) as 已公開人數;
