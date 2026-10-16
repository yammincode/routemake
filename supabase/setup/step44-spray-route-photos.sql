-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261113000050_spray_route_photos

-- =====================================================================
-- Spray Wall 岩館路線改成員工上傳照片（step44）
-- - routes.photo_path：岩館路線自己的照片（zone-photos 空間的 {館}/routes/…jpg，旁邊有 .thumb.jpg 縮圖）
--   只有 Spray Wall 的岩館路線可以有；岩友路線、一般區域、長耐力都不行
-- - 一張照片只給一條路線用
-- - 有照片的岩館路線圈圈可以不畫（照片本來就標好路線）；有畫就跟原本一樣要有起攀 S、完攀 T
--   沒有圈圈時起步點標記放在照片中間（Spray Wall 不畫平面圖標記，只是欄位不能空）
-- - 照片只有那間館的員工能上傳（Storage 的 {館}/routes/ 資料夾）
-- - spray_list 多回傳 photo_path（列表縮圖用）
-- 舊版 App 照常可用：沒有照片的路線規則跟原本一樣
-- =====================================================================
alter table public.routes add column if not exists photo_path text;
alter table public.routes drop constraint if exists routes_photo_path_ok;
alter table public.routes add constraint routes_photo_path_ok
  check (photo_path is null or (kind = 'gym' and photo_path ~ '^[a-z0-9_]+/routes/[A-Za-z0-9_-]+\.jpg$'));
-- 一張照片只給一條路線用（換照片時會刪掉舊的，共用的話會連別條的照片一起刪）
create unique index if not exists routes_photo_path_key on public.routes (photo_path) where photo_path is not null;

-- 照片 Storage：{館}/zones/ 員工、{館}/floorplan/ 店長、{館}/routes/（Spray Wall 岩館路線照片）員工
create or replace function public.can_manage_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case (storage.foldername(p_name))[2]
           when 'zones'     then public.is_staff((storage.foldername(p_name))[1])
           when 'floorplan' then public.is_manager((storage.foldername(p_name))[1])
           when 'routes'    then public.is_staff((storage.foldername(p_name))[1])
           else false
         end
$$;

create or replace function public.routes_spray_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_kind text;
  v_sys  text;
  v_gym  text;
  v_first jsonb;
begin
  -- 只改建立者（刪除帳號）、下架、留言開關：不用重新檢查路線規則（區域換過等級制的舊路線也改得動）
  -- 放回牆上（archived_at 從有值變成空的）照樣要檢查：區域規則可能已經換了
  if tg_op = 'UPDATE'
     and not (old.archived_at is not null and new.archived_at is null)
     and (to_jsonb(new) - array['created_by', 'archived_at', 'comments_enabled'])
       = (to_jsonb(old) - array['created_by', 'archived_at', 'comments_enabled']) then
    return new;
  end if;
  select kind, grade_system, gym_id into v_kind, v_sys, v_gym from public.zones where id = new.zone_id;
  if v_kind = 'spray' then
    -- 岩館路線有照片可以不畫圈圈；岩友路線一定要畫
    if new.name is null or (new.holds is null and new.photo_path is null) then
      raise exception 'Spray Wall 路線要有名稱和圈圈（岩館路線可以只放照片）' using errcode = '22023';
    end if;
    if new.photo_path is not null and (new.kind <> 'gym' or split_part(new.photo_path, '/', 1) <> v_gym) then
      raise exception '只有這間館的岩館路線可以放照片' using errcode = '22023';
    end if;
    if new.holds is not null and not public.holds_ok(new.holds) then
      raise exception '路線要有起攀（S）和完攀（T），圈圈最多 60 個' using errcode = '22023';
    end if;
    if not public.contact_free(new.name) or not public.contact_free(new.description) then
      raise exception '路線名稱和介紹不能放聯絡方式（網址、電話、LINE、IG 等）' using errcode = '22023';
    end if;
    new.name := btrim(new.name);
    new.description := nullif(btrim(new.description), '');
    -- 岩友路線沒有定線說明（只有員工出的岩館路線有）
    if new.kind = 'community' then
      new.setter_note := null;
    end if;
    if new.holds is not null then
      -- 圈圈只留 x、y（小數兩位）、t、r，其他資料不存
      new.holds := (
        select jsonb_agg(jsonb_build_object(
                 'x', round((h ->> 'x')::numeric, 2),
                 'y', round((h ->> 'y')::numeric, 2),
                 't', h ->> 't')
               || case when h ? 'r' and jsonb_typeof(h -> 'r') <> 'null' then jsonb_build_object('r', (h ->> 'r')::int) else '{}'::jsonb end
               order by i)
          from jsonb_array_elements(new.holds) with ordinality as e(h, i));
      -- 起步點標記放在第一個起攀圈
      v_first := (select h from jsonb_array_elements(new.holds) h where h ->> 't' = 's' limit 1);
      new.pin_x := (v_first ->> 'x')::numeric;
      new.pin_y := (v_first ->> 'y')::numeric;
    else
      new.pin_x := 50;
      new.pin_y := 50;
    end if;
  elsif v_sys = 'endurance' then
    if new.kind <> 'gym' or new.photo_path is not null then
      raise exception '長耐力區只能有岩館路線（不能另外放照片）' using errcode = '22023';
    end if;
    if new.holds is null or not public.endurance_holds_ok(new.holds) then
      raise exception '長耐力路線要照順序標 2–50 個點' using errcode = '22023';
    end if;
    -- 依順序重新整理：只留 x、y（四捨五入到小數兩位），第 1 點 s、最後一點 t、中間 h
    new.holds := (
      select jsonb_agg(jsonb_build_object(
               'x', round((h ->> 'x')::numeric, 2),
               'y', round((h ->> 'y')::numeric, 2),
               't', case when i = 1 then 's' when i = jsonb_array_length(new.holds) then 't' else 'h' end) order by i)
        from jsonb_array_elements(new.holds) with ordinality as e(h, i));
    if tg_op = 'UPDATE' and new.holds is distinct from old.holds
       and public.route_has_ascents(new.id) then
      raise exception '已經有人記錄過這條路線，點的位置和順序不能再改（難度、說明可以改）' using errcode = '22023';
    end if;
    new.hold_color := '白';
    new.pin_x := (new.holds -> 0 ->> 'x')::numeric;
    new.pin_y := (new.holds -> 0 ->> 'y')::numeric;
  else
    if new.kind <> 'gym' or new.holds is not null or new.photo_path is not null then
      raise exception '一般區域只能有岩館路線' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind and not public.is_db_admin() then
    raise exception '不能修改路線類型' using errcode = '42501';
  end if;
  return new;
end $$;

-- Spray Wall 路線列表：多回傳 photo_path（岩館路線的照片）
create or replace function public.spray_list(p_zone uuid, p_kind text, p_grade int, p_sort text, p_offset int, p_limit int)
returns jsonb language sql stable security definer set search_path = '' as $$
  with base as (
    select r.id, r.code, r.name, r.grade, r.description, r.holds, r.photo_path, r.kind, r.created_at, r.created_by,
           r.style_tags, r.comments_enabled,
           p.nickname as author,
           (select count(distinct a.user_id) from public.ascents a where a.route_id = r.id and a.status in ('flash', 'send'))::int as sends,
           (select count(*) from public.route_likes l where l.route_id = r.id)::int as likes,
           exists (select 1 from public.route_likes l where l.route_id = r.id and l.user_id = auth.uid()) as liked
      from public.routes r
      left join public.profiles p on p.id = r.created_by
     where r.zone_id = p_zone and r.archived_at is null and r.kind = p_kind
       and (p_grade is null or r.grade = p_grade)
       and (p_sort is distinct from 'mine' or r.created_by = auth.uid())
  )
  select coalesce(jsonb_agg(to_jsonb(b) - 'created_by' || jsonb_build_object('mine', b.created_by = auth.uid())
           order by case p_sort when 'sends' then b.sends when 'likes' then b.likes else 0 end desc, b.created_at desc), '[]'::jsonb)
    from (select * from base
           order by case p_sort when 'sends' then sends when 'likes' then likes else 0 end desc, created_at desc
           offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 50)) b
$$;
revoke execute on function public.spray_list(uuid, text, int, text, int, int) from public;
grant execute on function public.spray_list(uuid, text, int, text, int, int) to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261113000050', 'spray_route_photos');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
