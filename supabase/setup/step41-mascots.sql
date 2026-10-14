-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261110000047_mascots

-- =====================================================================
-- 原岩夥伴：人物卡和頭像用六館 logo 的動物，可以換色、選卡片背景
-- - profiles.mascot：{"id": "wanhua", "colors": ["#d7263d", null, null], "bg": "#6959b2"}；null＝還沒選（App 當成明德氂牛）
-- - 所有人都讀得到（留言、影片旁的頭像要用；不是個資）；不能直接改，只能用 save_my_mascot 改自己的
-- - 只能選已經開放的館的夥伴（中壢館開幕前中壢熊不能選）；顏色只能從固定色盤挑（跟 lib/mascots.ts 一樣）
-- 舊版 App 照常可用（不讀這個欄位）
-- =====================================================================
alter table public.profiles add column if not exists mascot jsonb;

-- 夥伴的值檢查：只有 id、colors、bg 三個欄位；夥伴要認得；每個部位的顏色是色盤裡的或 null（原本的顏色）；背景是六館標準色
create or replace function public.mascot_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  -- 用 case 一層一層檢查：型別不對的值不會被丟進 jsonb_object_keys、jsonb_array_elements（會出錯）
  select case
    when p is null then true
    when jsonb_typeof(p) <> 'object' then false
    when exists (select 1 from jsonb_object_keys(p) k where k not in ('id', 'colors', 'bg')) then false
    when coalesce(p ->> 'id', '') not in ('mingde', 'wanhua', 'zhonghe', 'nangang', 'xindian', 'zhongli') then false
    when coalesce(jsonb_typeof(p -> 'bg'), 'null') <> 'null'
      and coalesce(p ->> 'bg', '') not in ('#6d3540', '#6959b2', '#01bcb5', '#066d6a', '#006382', '#304562') then false
    when coalesce(jsonb_typeof(p -> 'colors'), 'null') = 'null' then true
    when jsonb_typeof(p -> 'colors') <> 'array' then false
    when jsonb_array_length(p -> 'colors') > 3 then false
    else not exists (
      select 1 from jsonb_array_elements(p -> 'colors') c
       where jsonb_typeof(c) <> 'null'
         and (jsonb_typeof(c) <> 'string' or c #>> '{}' not in (
           '#6d3540', '#6959b2', '#01bcb5', '#066d6a', '#006382', '#304562',
           '#d7263d', '#f28a1e', '#f4d03f', '#2e9e5b', '#2f6fd6', '#f07bb5', '#7b4b2a', '#8e9196', '#1a1a1a',
           '#f8c5a3', '#b5dcf2', '#a7d398', '#f5b1aa', '#f2e5dc', '#fbd8b5', '#ffe9a8', '#d9c6f0', '#ffffff'))
    )
  end
$$;

alter table public.profiles drop constraint if exists profiles_mascot_ok;
alter table public.profiles add constraint profiles_mascot_ok check (public.mascot_ok(mascot));

-- 所有人都讀得到夥伴（跟暱稱一樣）；沒有直接改的權限
grant select (mascot) on public.profiles to anon, authenticated;

-- 存自己的夥伴（null＝換回預設）
create or replace function public.save_my_mascot(p_mascot jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_gym text;
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = '42501';
  end if;
  if not public.mascot_ok(p_mascot) then
    raise exception '夥伴或顏色不對，請重新選一次' using errcode = '22023';
  end if;
  if p_mascot is not null then
    v_gym := case p_mascot ->> 'id'
      when 'mingde' then 'mingde' when 'wanhua' then 'g2' when 'zhonghe' then 'g3'
      when 'nangang' then 'g4' when 'xindian' then 'g5' when 'zhongli' then 'g6' end;
    if not coalesce((select g.is_live from public.gyms g where g.id = v_gym), false) then
      raise exception '這隻夥伴即將登場，現在還不能選' using errcode = '22023';
    end if;
  end if;
  update public.profiles set mascot = p_mascot where id = auth.uid();
end $$;
revoke execute on function public.save_my_mascot(jsonb) from public, anon;
grant execute on function public.save_my_mascot(jsonb) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261110000047', 'mascots');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
