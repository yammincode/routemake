-- 南港館中間的長牆（原本整條是 C2）切成兩區：左半 C2、右半 C3（靠櫃台那一側）
-- 只新增 C3 這一筆區域；C2 沿用原本那筆（切之前 C2 沒有路線，不用搬）
-- 已經有 C3 就不會重複新增

insert into public.zones (gym_id, code, name, sort)
select 'g4', 'C3', 'C3 區', 8
 where not exists (select 1 from public.zones z where z.gym_id = 'g4' and z.code = 'C3');
