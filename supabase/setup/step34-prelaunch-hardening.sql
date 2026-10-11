-- =====================================================================
-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）
-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併
-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次
-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半
-- =====================================================================


-- >>>>>>>>>> 20261102000038_prelaunch_hardening

-- =====================================================================
-- 上線前安全加強（審查結果）
-- 1. 路線編號：第 100 條起用 3 位數（A-100），原本會截成 A-10 跟舊路線撞號、那一區從此新增不了；
--    取號只能在新增路線時由資料庫做，不能直接呼叫（避免有人一直取號把 Spray Wall 的編號用掉）
-- 2. 影片：新增影片資料要先有本人上傳的檔案、24 小時最多 10 筆、說明不能放網址；
--    還在分享中的影片檔本人不能直接刪（先用 delete_video 刪資料，避免分享後偷換內容）；
--    岩友下架自己出的路線時，可以清掉別人分享在那條路線的影片檔；影片空間不開放未登入的人列出檔案
-- 3. Spray Wall：圈圈只留 x、y、t、r（不能塞其他資料灌大）；風格標籤重複的自動合併；
--    岩友路線不用定線說明（不能拿來放聯絡方式）
-- 4. 岩友路線被員工下架（或換公版照片自動下架）後，出題者不能再修改、放回牆上；留言開關只有員工能動
-- 5. 暱稱：不能用「原岩、官方、店長、定線、員工、管理員、客服、老闆」這類字（含簡體、館長、櫃檯；員工、老闆可以），
--    不能有看不見的字元（表情符號照常可以用）、不能只有空白、不能放網址；
--    聯絡方式檢查先把全形英數轉成半形（舊的自我介紹不受影響，下次修改人物卡時才檢查）；留言不能放網址（含 lin.ee 這類短網址）
-- 6. 刪除帳號：路線只改建立者時不重新檢查路線規則（區域改回抱石後，建過長耐力路線的員工帳號原本刪不掉）；
--    新增路線時 id 已經存在就直接擋（重送不會多取一個號，也不能用 upsert 一直推高流水號）
-- 7. 其他：區域類型只有店長能改（而且要先整區換線）；清除自我介紹只限公開的人物卡；
--    員工名單只能用指派／移除函式改（會寫操作紀錄）；不開放 TRUNCATE；紀錄的建立時間、留言的編輯時間不能自己改；
--    頭像欄位不開放修改；其他人讀不到註冊時間；區域照片不收 SVG
-- 舊版 App（v2.7）照常可以用：只加限制、收回用不到的權限，不改現有資料（頭像欄位超過 300 字的清空，App 沒有用到）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 共用：文字不能有網址；聯絡方式檢查先轉半形（ＬＩＮＥ、０９１２… 也擋得到）
-- ---------------------------------------------------------------------
-- 拿掉看不見的字元（零寬、方向控制、控制字元、Tag 等）：網址、暱稱檢查前先清掉，「evil.com 中間夾零寬字元」才擋得到
create or replace function public.strip_invisible(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(p, '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E007F\U000E0100-\U000E01EF]', '', 'g')
$$;

-- 網址：先全形轉半形、拿掉看不見的字元，「。」「｡」「[.]」「(.)」「(dot)」當成點，「evil . com」（點的前後都有空白）也當成「evil.com」
-- 網域後面接斜線（lin.ee/xx、forms.gle/xx）一律算網址；常見結尾（.com、.tw…）後面不能再接英數字（evil.com抽獎 算，evil.community 不算）
-- 「V5. Top 那顆很滑」這種一般句子：點後面有空白不會合併，Top、Me、Is 這些常見英文字不當成網址結尾
create or replace function public.link_free(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or regexp_replace(regexp_replace(public.strip_invisible(normalize(p, NFKC)),
      '\s*(。|｡|\[\.\]|\(\.\)|\[dot\]|\(dot\))\s*', '.', 'gi'), '\s+\.\s+', '.', 'g')
    !~* '(https?:|www\.|[a-z0-9-]+\.[a-z]{2,}/|[a-z0-9-]\.(com|tw|net|org|io|cc|app|co|ly|gl|gle|ee|gg|jp|hk|biz|vip|xyz)(?![a-z0-9]))'
$$;

create or replace function public.contact_free(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or public.strip_invisible(normalize(p, NFKC)) !~* '(https?://|www\.|\.(com|tw|net|org|io|me|cc|app)(?![a-z0-9])|line|instagram|\yig\y|facebook|\yfb\y|threads|wechat|telegram|@|[0-9０-９][0-9０-９ -]{6,}|加賴|加我|私訊|微信|電話)'
$$;

create or replace function public.bio_ok(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or (char_length(p) <= 60 and public.contact_free(p))
$$;
-- 自我介紹只能用 save_my_card() 改（它會用 bio_ok 檢查），資料表的約束只留長度：
-- 原本約束也用 bio_ok，新規則（全形）會讓舊的自我介紹不合格，這個人之後改暱稱等任何欄位都會失敗
create or replace function public.bio_len_ok(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or char_length(p) <= 60
$$;
alter table public.profiles drop constraint profiles_bio_ok;
alter table public.profiles add constraint profiles_bio_ok check (public.bio_len_ok(bio));

-- ---------------------------------------------------------------------
-- 1. 路線編號
-- ---------------------------------------------------------------------
create or replace function public.next_route_code(p_zone uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_seq  int;
begin
  -- 只在新增路線時（routes_before_insert 觸發器裡）取號
  if auth.uid() is not null and pg_trigger_depth() = 0 then
    raise exception '路線編號在新增路線時自動產生，不能直接取號' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_staff(public.zone_gym(p_zone))
     and not exists (select 1 from public.zones where id = p_zone and kind = 'spray') then
    raise exception '沒有權限在這個區域新增路線' using errcode = '42501';
  end if;
  perform set_config('app.internal', 'on', true);
  update public.zones set route_seq = route_seq + 1 where id = p_zone
  returning code, route_seq into v_code, v_seq;
  perform set_config('app.internal', 'off', true);
  if v_code is null then
    raise exception '找不到這個區域' using errcode = 'P0002';
  end if;
  -- 至少 2 位數（A-07）；第 100 條起照實寫（A-100），不能截掉
  return v_code || '-' || lpad(v_seq::text, greatest(2, length(v_seq::text)), '0');
end $$;

-- 新增路線：id 已經存在就直接擋（在取號之前），
-- 不然 insert ... on conflict（upsert）每送一次就先取一個號，流水號會被一直推高
create or replace function public.routes_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.routes where id = new.id) then
    raise exception '已經有相同的資料' using errcode = '23505';
  end if;
  if not public.is_db_admin() then
    new.created_by  := auth.uid();
    new.created_at  := now();
    new.archived_at := null;
  end if;
  if new.code is null or not public.is_db_admin() then
    new.code := public.next_route_code(new.zone_id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. 影片
-- ---------------------------------------------------------------------
-- 新增影片資料：要先有本人上傳的檔案、24 小時最多 10 筆、說明不能放網址
create or replace function public.route_videos_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_db_admin() then
    new.user_id := auth.uid();
    new.created_at := now();
    if not exists (select 1 from storage.objects o
                    where o.bucket_id = 'route-videos' and o.name = new.path and o.owner = auth.uid()) then
      raise exception '找不到上傳的影片檔，請重新分享' using errcode = '22023';
    end if;
    if (select count(*) from public.route_videos v
         where v.user_id = auth.uid() and v.created_at > now() - interval '1 day') >= 10 then
      raise exception '每人 24 小時內最多分享 10 支影片，明天再來' using errcode = '54000';
    end if;
    if not public.link_free(new.caption) then
      raise exception '影片說明不能放網址' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

alter table public.route_videos add constraint route_videos_path_len check (char_length(path) <= 200) not valid;

-- 可以刪除這個檔案嗎
-- - 該館員工：可以
-- - 還在分享中（有影片資料）：不行，要先用 delete_video 刪資料（本人不能偷換分享出去的影片內容）
-- - 自己上傳的：可以
-- - 岩友下架了自己出的路線：別人分享在這條路線的影片檔（資料已經跟著刪掉）由出題者清掉
create or replace function public.can_delete_video_file(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_route uuid;
begin
  if auth.uid() is null then return false; end if;
  if public.is_staff((storage.foldername(p_name))[1]) then return true; end if;
  if exists (select 1 from public.route_videos v where v.path = p_name) then return false; end if;
  if (storage.foldername(p_name))[3] = auth.uid()::text then return true; end if;
  begin
    v_route := ((storage.foldername(p_name))[2])::uuid;
  exception when others then
    return false;
  end;
  return exists (select 1 from public.routes r
                  where r.id = v_route and r.kind = 'community' and r.archived_at is not null and r.created_by = auth.uid());
end $$;

-- 讀檔案清單：只有自己上傳的、或可以刪的（員工、出題者清理用）；看影片用公開網址，不受影響
drop policy if exists route_videos_file_read on storage.objects;
create policy route_videos_file_read on storage.objects for select to authenticated
  using (bucket_id = 'route-videos'
         and ((storage.foldername(name))[3] = auth.uid()::text or public.can_delete_video_file(name)));

-- 下架前先取得要刪的影片檔路徑：員工；岩友下架自己出的路線也拿得到
create or replace function public.video_paths_for_routes(p_routes uuid[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(v.path), '{}')
    from public.route_videos v
    join public.routes r on r.id = v.route_id
   where v.route_id = any (p_routes)
     and (public.is_staff(public.route_gym(v.route_id)) or (r.kind = 'community' and r.created_by = auth.uid()))
$$;

-- 整區在牆上路線的影片檔路徑（員工；整區換線、換 Spray Wall 公版照片前用）
-- 回傳一個陣列：不受 API 一次最多 1000 筆的限制
create or replace function public.video_paths_for_zone(p_zone uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when not public.is_staff(public.zone_gym(p_zone)) then '{}'::text[] else coalesce(array_agg(v.path), '{}') end
    from public.route_videos v
    join public.routes r on r.id = v.route_id
   where r.zone_id = p_zone and r.archived_at is null
$$;
revoke execute on function public.video_paths_for_zone(uuid) from public, anon;
grant execute on function public.video_paths_for_zone(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3、4、6. 路線規則
-- ---------------------------------------------------------------------
-- 風格標籤重複的自動合併（照第一次出現的順序；最多就是 9 種）
-- 用觸發器不用約束：約束會讓已經有重複標籤的舊路線之後下架、換線都失敗
create or replace function public.routes_dedupe_tags() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.style_tags := coalesce(array(
    select t from unnest(new.style_tags) with ordinality as u(t, i) group by t order by min(i)), '{}');
  return new;
end $$;
create trigger routes_dedupe_tags before insert or update of style_tags on public.routes
  for each row execute function public.routes_dedupe_tags();

create or replace function public.routes_spray_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_kind text;
  v_sys  text;
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
  select kind, grade_system into v_kind, v_sys from public.zones where id = new.zone_id;
  if v_kind = 'spray' then
    if new.name is null or new.holds is null then
      raise exception 'Spray Wall 路線要有名稱和圈圈' using errcode = '22023';
    end if;
    if not public.holds_ok(new.holds) then
      raise exception '路線要有起攀（S）和完攀（T），圈圈最多 60 個' using errcode = '22023';
    end if;
    if not public.contact_free(new.name) or not public.contact_free(new.description) then
      raise exception '路線名稱和介紹不能放聯絡方式（網址、電話、LINE、IG 等）' using errcode = '22023';
    end if;
    new.name := btrim(new.name);
    new.description := nullif(btrim(new.description), '');
    -- 圈圈只留 x、y（小數兩位）、t、r，其他資料不存
    new.holds := (
      select jsonb_agg(jsonb_build_object(
               'x', round((h ->> 'x')::numeric, 2),
               'y', round((h ->> 'y')::numeric, 2),
               't', h ->> 't')
             || case when h ? 'r' and jsonb_typeof(h -> 'r') <> 'null' then jsonb_build_object('r', (h ->> 'r')::int) else '{}'::jsonb end
             order by i)
        from jsonb_array_elements(new.holds) with ordinality as e(h, i));
    -- 岩友路線沒有定線說明（只有員工出的岩館路線有）
    if new.kind = 'community' then
      new.setter_note := null;
    end if;
    -- 起步點標記放在第一個起攀圈
    v_first := (select h from jsonb_array_elements(new.holds) h where h ->> 't' = 's' limit 1);
    new.pin_x := (v_first ->> 'x')::numeric;
    new.pin_y := (v_first ->> 'y')::numeric;
  elsif v_sys = 'endurance' then
    if new.kind <> 'gym' then
      raise exception '長耐力區只能有岩館路線' using errcode = '22023';
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
    if new.kind <> 'gym' or new.holds is not null then
      raise exception '一般區域只能有岩館路線' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind and not public.is_db_admin() then
    raise exception '不能修改路線類型' using errcode = '42501';
  end if;
  return new;
end $$;

-- 放回牆上（archived_at 改變）時也檢查難度跟區域的等級制合不合（區域可能已經從上攀改成抱石）
drop trigger routes_grade_system on public.routes;
create trigger routes_grade_system before insert or update of grade, zone_id, archived_at on public.routes
  for each row execute function public.routes_grade_system();

-- 編號、區域、建立者、建立時間不能改；岩友路線下架後出題者不能再改、留言開關只有員工能動
create or replace function public.routes_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_db_admin() then return new; end if;
  if new.zone_id is distinct from old.zone_id or new.code is distinct from old.code
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception '不能修改路線編號、區域、建立者或建立時間' using errcode = '42501';
  end if;
  if old.kind = 'community' and not public.is_staff(public.zone_gym(old.zone_id)) then
    if old.archived_at is not null then
      raise exception '這條岩友路線已經下架，不能再修改' using errcode = '42501';
    end if;
    if new.comments_enabled is distinct from old.comments_enabled then
      raise exception '只有員工可以開關路線留言' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. 暱稱、留言
-- ---------------------------------------------------------------------
-- 看不見的字元：零寬、方向控制、控制字元、Tag、空白填充等（\u、\U 寫法，貼進 SQL Editor 不會少字）
-- 表情符號常用的 U+FE0F（❤️）和 U+200D（🧗‍♀️）接在符號後面可以，接在文字後面或放在開頭就擋；數字鍵帽（1️⃣＝數字＋FE0F＋20E3）可以
create or replace function public.nickname_hidden(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p ~ '[\u0001-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0\uFFF0-\uFFFB\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E007F\U000E0100-\U000E01EF]'
      or p ~ '(^|[A-Za-zÀ-ɏͰ-ϿЀ-ӿ\u3040-ヿ\u3100-ㄯ㐀-䶿一-鿿가-\uD7AF豈-\uFAFF０-ｚ])[\uFE00-\uFE0F\u200D]'
      or p ~ '[0-9]([\uFE00-\uFE0E\u200D]|\uFE0F(?!\u20E3))'
$$;
-- 比對冒充字之前先拿掉所有空白、看不見的字元（「店 長」「店＋Tag 字元＋長」都算「店長」）
create or replace function public.nickname_bare(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(public.strip_invisible(normalize(p, NFKC)), '[\s\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u2800\u3000]', '', 'g')
$$;
-- 英文字的冒充檢查要保留字中間的空白（「Staff Amy」拿掉空白會變成「StaffAmy」，就看不出 Staff 是一個字）
create or replace function public.nickname_spaced(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(public.strip_invisible(normalize(p, NFKC)), '[\s\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u2800\u3000]+', ' ', 'g')
$$;
create or replace function public.profiles_nickname_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_bare text;
begin
  if public.is_db_admin() or new.nickname is null
     or (tg_op = 'UPDATE' and new.nickname is not distinct from old.nickname) then
    return new;
  end if;
  if public.nickname_hidden(new.nickname) then
    raise exception '暱稱不能有看不見的字元（一般表情符號可以用）' using errcode = '22023';
  end if;
  v_bare := public.nickname_bare(new.nickname);
  if v_bare = '' then
    raise exception '暱稱不能只有空白' using errcode = '22023';
  end if;
  if not public.link_free(new.nickname) then
    raise exception '暱稱不能放網址' using errcode = '22023';
  end if;
  -- 英文字只在整個字時才算（Stafford、Gustaff 可以；admin、staff1、Staff Amy、S taff 不行）
  if (v_bare ~ '(原岩|官方|管理員|管理者|管理员|店長|店长|館長|馆长|館方|馆方|定線|定线|員工|员工|客服|老闆|老板|櫃檯|櫃台|柜台)'
      or v_bare ~* '(^|[^a-z])(admin|staff|official)([^a-z]|$)'
      or public.nickname_spaced(new.nickname) ~* '(^|[^a-z])(admin|staff|official)([^a-z]|$)')
     and not public.is_owner()
     and not exists (select 1 from public.staff_roles s where s.user_id = auth.uid()) then
    raise exception '暱稱不能用「原岩、官方、店長、館長、定線、員工、管理員、客服、老闆、櫃檯」這類字，以免被誤會是館方' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger profiles_nickname_check before insert or update of nickname on public.profiles
  for each row execute function public.profiles_nickname_check();

-- 留言：新增時編輯時間一律清空；新增、編輯都不能放網址
create or replace function public.comments_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() then
    new.user_id    := auth.uid();
    new.created_at := now();
    new.edited_at  := null;
    new.deleted_at := null;
    new.deleted_by := null;
    if public.recent_comment_count(interval '1 minute') >= 5 then
      raise exception '留言太頻繁，請稍後再試' using errcode = '54000';
    end if;
    if public.recent_comment_count(interval '1 day') >= 100 then
      raise exception '今天留言太多了，明天再來' using errcode = '54000';
    end if;
  end if;
  new.body := btrim(new.body);
  return new;
end $$;

create or replace function public.comments_link_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() and not public.link_free(new.body) then
    raise exception '留言不能放網址' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger comments_link_check before insert or update of body on public.comments
  for each row execute function public.comments_link_check();

-- ---------------------------------------------------------------------
-- 7. 其他
-- ---------------------------------------------------------------------
-- 區域類型（一般／Spray Wall）：只有店長，而且區域沒有在牆上的路線
create or replace function public.zones_kind_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind is distinct from old.kind then
    if not public.is_db_admin() and not public.is_manager(old.gym_id) then
      raise exception '只有店長可以改區域類型' using errcode = '42501';
    end if;
    if exists (select 1 from public.routes where zone_id = old.id and archived_at is null) then
      raise exception '這區還有路線，整區換線後才能改區域類型' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger zones_kind_guard before update of kind on public.zones
  for each row execute function public.zones_kind_guard();

-- 清除自我介紹：只限公開的人物卡（沒公開的別人看不到，不需要清，也不能讓店長藉此讀到）
create or replace function public.clear_card_bio(p_user uuid, p_gym text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_bio text;
begin
  if not public.is_manager(p_gym) then
    raise exception '只有店長可以清除自我介紹' using errcode = '42501';
  end if;
  if not coalesce((select card_public from public.profiles where id = p_user), false) then
    raise exception '這張人物卡沒有公開，不需要清除' using errcode = '22023';
  end if;
  v_bio := (select bio from public.profiles where id = p_user);
  update public.profiles set bio = null where id = p_user;
  perform public.write_audit(p_gym, 'card.clear', p_user, jsonb_build_object(
    'nickname', (select nickname from public.profiles where id = p_user), 'bio', v_bio));
end $$;

-- 紀錄的建立時間不能自己改（營運「使用狀況」用它算活躍人數）
create or replace function public.ascents_keep_created() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_db_admin() then
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger ascents_keep_created before update on public.ascents
  for each row execute function public.ascents_keep_created();

-- 員工名單只能用 assign_staff／assign_staff_user／remove_staff 改（會寫操作紀錄）
revoke insert, update, delete on public.staff_roles from authenticated;
-- TRUNCATE 不受 RLS 限制：一律不開放
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
revoke insert, update, delete on public.feedback from anon;

-- 頭像：App 沒有用到，不開放修改
update public.profiles set avatar_url = null where char_length(avatar_url) > 300;
alter table public.profiles add constraint profiles_avatar_url_len check (avatar_url is null or char_length(avatar_url) <= 300);
revoke update (avatar_url) on public.profiles from authenticated;
-- 其他人讀不到註冊時間（只看得到 id、暱稱、頭像）
revoke select (created_at) on public.profiles from anon, authenticated;

-- 區域照片只收 JPEG、PNG、WebP（App 一律轉成 JPEG；SVG 可以夾程式）
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'zone-photos';

insert into supabase_migrations.schema_migrations (version, name) values ('20261102000038', 'prelaunch_hardening');

-- 完成：顯示結果
select '設定完成' as 結果,
       (select count(*) from public.gyms) as 場館數,
       (select count(*) from public.zones) as 區域數,
       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;
