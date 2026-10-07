-- 新增 VB 難度（比 V0 簡單）：存成 grade = -1；VB 分數另外設定（預設 5 分，比 V0 的 10 分低）
-- 難度膠帶顏色只在 App 畫面上用，資料庫不用改

alter table public.routes drop constraint if exists routes_grade_check;
alter table public.routes add constraint routes_grade_check check (grade between -1 and 10 or grade between 100 and 119);

alter table public.scoring_rules add column if not exists vb_points int not null default 5
  check (vb_points between 0 and 1000);

create or replace function public.route_points_raw(p_grade int, p_tags text[]) returns numeric
language sql stable set search_path = '' as $$
  select (case when p_grade >= 100 then r.yds_points[p_grade - 99]
               when p_grade < 0 then r.vb_points
               else r.grade_points[p_grade + 1] end)
         * (1 + least(r.max_style_bonus,
           coalesce((select sum((r.style_bonus ->> t)::numeric) from unnest(p_tags) t), 0)) / 100.0)
    from public.scoring_rules r where r.id = 1
$$;

-- 改計分規則時，操作紀錄也記下 VB 分數
create or replace function public.scoring_rules_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  perform public.write_audit(null, 'scoring.update', null, jsonb_build_object(
    'vb_points', new.vb_points, 'grade_points', new.grade_points, 'style_bonus', new.style_bonus,
    'max_style_bonus', new.max_style_bonus, 'flash_multiplier', new.flash_multiplier));
  return new;
end $$;
