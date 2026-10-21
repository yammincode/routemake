-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261117000054_climber

-- =====================================================================
-- 攀岩角色（step48）：人物卡上的真人角色（B 貼紙線稿），夥伴站在旁邊
-- - profiles.climber：{"pose":"hang","hair":"pony",...}；null＝還沒做角色（App 照舊只有夥伴）
-- - 所有人都讀得到（人物卡、留言和影片旁的小頭像要用；不是個資）；不能直接改，只能用 save_my_climber 改自己的
-- - 每一項只能是固定的款式（climber_values，跟 lib/climber-values.json 一樣）
-- - 進階的款式照紀錄開放（climber_rules，跟 lib/climber-rules.json 一樣）：
--   攀爬日（有記錄的日子）1／2／3／5／7／10 天、上攀完攀 1／10／30 條、Flash 5 條、V5 以上完攀 10 條（岩友路線不算）
--   特殊獎品（sp：金色、琉璃、各館門口背景）要等徽章、任務做好，現在一律存不進去
-- - 存的時候用自己的紀錄再算一次：還沒解鎖的存不進去（改程式也一樣）
-- - 停權中不能改（跟夥伴一樣）
-- 舊版 App 照常可用（不讀這個欄位）
-- =====================================================================
alter table public.profiles add column if not exists climber jsonb;

-- 每一項可以選的款式（改這裡要一起改 lib/climber-values.json；tests/e2e/climber 會比對）
-- ※之後要拿掉或改名某個款式：同一個 migration 先把存了那個值的 profiles.climber 改掉（不然那些人之後改暱稱、停權都會被 check 擋下）
create or replace function public.climber_values() returns jsonb
language sql immutable set search_path = '' as $$
  select '{"pose":["hang","reach","heel","dyno","belay","brush","chalk","stand","thumb","hips","wave"],"holdC":["yellow","green","blue","red","purple","pink","black","white"],"harness":["none","black","red","blue","orange"],"gear":["none","qd","rope"],"hands":["none","tape","chalk"],"back":["none","pad","ropebag"],"bag":["yellow","red","blue","black","glass","none"],"effort":["none","strain","sweat","chalkface"],"skin":["a","b","c","d","e","f"],"eyes":["dot","big","smile","wink","sharp"],"mouth":["smile","grin","flat","o","tongue"],"beard":["none","stubble","mus","full"],"glasses":["none","round","square","sun"],"hair":["short","crop","buzz","pomp","spiky","middle","bob","long","pony","braids","bun","curly","afro","bald"],"hairC":["black","darkbrown","brown","blonde","grey","auburn","pink","blue"],"top":["tank","tech","tee","sport","long","hood","wind","flannel"],"print":["hold","mtn","hand","rope","stripe","none"],"topC":["mingde","wanhua","zhonghe","nangang","xindian","zhongli","black","white","grey","khaki","orange","pink","sky","gold"],"pants":["climb","crop","shorts","tights","jog","wide","cargo","overall"],"pantsC":["charcoal","black","khaki","olive","denim","brick","cream"],"shoe":["red","yellow","blue","green","purple","black"],"hat":["none","cap","beanie","bucket","helmet","band"],"hatC":["mingde","wanhua","zhonghe","nangang","xindian","zhongli","black","white","grey","khaki","orange","pink","sky","gold"],"bg":["longdong","wall","gym","plain","night","wanhua"]}'::jsonb
$$;

-- 要解鎖的款式：t＝看哪個數字（days／rope／flash／v5）、n＝門檻；sp＝特殊獎品（改這裡要一起改 lib/climber-rules.json）
create or replace function public.climber_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select '{"pose:reach":{"t":"days","n":1},"pose:brush":{"t":"days","n":2},"effort:strain":{"t":"days","n":3},"effort:sweat":{"t":"days","n":3},"pose:heel":{"t":"days","n":5},"hands:chalk":{"t":"days","n":7},"effort:chalkface":{"t":"days","n":7},"back:pad":{"t":"days","n":10},"pose:belay":{"t":"rope","n":1},"harness:black":{"t":"rope","n":1},"gear:qd":{"t":"rope","n":10},"back:ropebag":{"t":"rope","n":10},"harness:red":{"t":"rope","n":10},"harness:blue":{"t":"rope","n":10},"hat:helmet":{"t":"rope","n":30},"gear:rope":{"t":"rope","n":30},"harness:orange":{"t":"rope","n":30},"pose:dyno":{"t":"flash","n":5},"bg:night":{"t":"v5","n":10},"topC:gold":{"sp":"任一徽章升到金"},"hatC:gold":{"sp":"任一徽章升到金"},"bag:glass":{"sp":"任一徽章升到琉璃"},"bg:wanhua":{"sp":"萬華館的任務"}}'::jsonb
$$;

-- 值的檢查：物件、只有認得的欄位、每一項是字串而且在款式清單裡（少的欄位 App 用預設）
create or replace function public.climber_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p is null then true
    when jsonb_typeof(p) <> 'object' then false
    else not exists (
      select 1 from jsonb_each(p) e
       where not (public.climber_values() ? e.key)
          or jsonb_typeof(e.value) <> 'string'
          or not ((public.climber_values() -> e.key) ? (e.value #>> '{}')))
  end
$$;

alter table public.profiles drop constraint if exists profiles_climber_ok;
alter table public.profiles add constraint profiles_climber_ok check (public.climber_ok(climber));

-- 所有人都讀得到角色（跟夥伴一樣）；沒有直接改的權限
grant select (climber) on public.profiles to anon, authenticated;

-- 某個人的攀岩數字（解鎖用）：攀爬日、上攀完攀、Flash、V5 以上完攀；完攀類不算岩友路線（跟累計完攀一樣）
create or replace function public.climb_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'days', (select count(distinct a.climbed_on) from public.ascents a where a.user_id = p_user),
    'rope', (select count(*) from public.ascents a join public.routes r on r.id = a.route_id
              where a.user_id = p_user and a.status in ('flash', 'send') and r.kind <> 'community' and r.grade >= 100),
    'flash', (select count(*) from public.ascents a join public.routes r on r.id = a.route_id
               where a.user_id = p_user and a.status = 'flash' and r.kind <> 'community'),
    'v5', (select count(*) from public.ascents a join public.routes r on r.id = a.route_id
            where a.user_id = p_user and a.status in ('flash', 'send') and r.kind <> 'community' and r.grade between 5 and 99))
$$;
revoke execute on function public.climb_stats(uuid) from public, anon, authenticated;

-- 自己的數字（編輯角色時顯示還差多少、記完攀後看有沒有新解鎖）
create or replace function public.my_climb_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else public.climb_stats(auth.uid()) end
$$;
revoke execute on function public.my_climb_stats() from public, anon;
grant execute on function public.my_climb_stats() to authenticated;

-- 這一套裡面第一個還沒解鎖的款式（「欄位:值」；都解鎖了回傳 null）
create or replace function public.climber_locked(p jsonb, s jsonb) returns text
language sql immutable set search_path = '' as $$
  select e.key || ':' || (e.value #>> '{}')
    from jsonb_each(p) e
    cross join lateral (select public.climber_rules() -> (e.key || ':' || (e.value #>> '{}')) as r) x
   where x.r is not null
     and (x.r ? 'sp' or coalesce((s ->> (x.r ->> 't'))::int, 0) < (x.r ->> 'n')::int)
   limit 1
$$;

-- 存自己的角色（null＝不用角色，只用夥伴）
create or replace function public.save_my_climber(p_climber jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = '42501';
  end if;
  if not public.climber_ok(p_climber) then
    raise exception '角色的款式不對，請重新選一次' using errcode = '22023';
  end if;
  if p_climber is not null and public.climber_locked(p_climber, public.climb_stats(auth.uid())) is not null then
    raise exception '有款式還沒解鎖，請重新選一次' using errcode = '22023';
  end if;
  update public.profiles set climber = p_climber where id = auth.uid();
end $$;
revoke execute on function public.save_my_climber(jsonb) from public, anon;
grant execute on function public.save_my_climber(jsonb) to authenticated;

-- 停權中不能改角色（step43 的檢查多加 climber）
create or replace function public.profiles_block_suspended() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_db_admin() or auth.uid() is distinct from new.id then return new; end if;
  -- 用 jsonb 比對：還沒套用 step41、step48（沒有 mascot、climber 欄位）也能用
  if public.i_am_suspended() and (
       exists (select 1 from unnest(array['nickname', 'avatar_url', 'bio', 'climbing_years', 'home_gym',
                                          'home_gyms', 'self_stats', 'mascot', 'climber']) k
                where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k))
       or (new.card_public and not old.card_public)) then
    raise exception '帳號暫停中，暫時不能修改暱稱和人物卡' using errcode = '42501';
  end if;
  return new;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261117000054', 'climber');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
