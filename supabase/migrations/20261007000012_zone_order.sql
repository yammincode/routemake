-- =====================================================================
-- 區域排序：店長（老闆）在後台拖曳整理區域順序，一次儲存
-- - 要傳入這間館「全部」區域，順序就是新的排序；少傳、多傳、重複都會被擋
-- - 寫操作紀錄 zone.reorder
-- =====================================================================
create or replace function public.reorder_zones(p_gym text, p_zones uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_all uuid[];
begin
  if not public.is_manager(p_gym) then
    raise exception '只有店長可以調整區域順序' using errcode = '42501';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_all from public.zones where gym_id = p_gym;
  if p_zones is null
     or cardinality(p_zones) <> cardinality(v_all)
     or (select array_agg(distinct z order by z) from unnest(p_zones) z) is distinct from v_all then
    raise exception '區域清單不完整，請重新整理後再試' using errcode = '22023';
  end if;
  update public.zones z set sort = o.n
    from unnest(p_zones) with ordinality as o(id, n)
   where z.id = o.id and z.sort is distinct from o.n;
  perform public.write_audit(p_gym, 'zone.reorder', null, jsonb_build_object(
    'zones', (select jsonb_agg(z.name order by o.n) from unnest(p_zones) with ordinality as o(id, n) join public.zones z on z.id = o.id)));
end $$;
revoke execute on function public.reorder_zones(text, uuid[]) from public, anon;
grant execute on function public.reorder_zones(text, uuid[]) to authenticated;
