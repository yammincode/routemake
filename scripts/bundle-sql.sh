#!/usr/bin/env bash
# 把 supabase/migrations 裡指定的 migration 合併成一個檔案，給 Supabase SQL Editor 一次貼上執行
# 用法：scripts/bundle-sql.sh <輸出檔> <migration 檔…>
# 同時記錄到 supabase_migrations.schema_migrations，之後改用 Supabase CLI 也不會重複執行
set -euo pipefail
out=$1; shift
{
  echo "-- ====================================================================="
  echo "-- 原岩路線 PWA：資料庫設定（自動產生，請勿手動修改）"
  echo "-- 由 scripts/bundle-sql.sh 從 supabase/migrations 合併"
  echo "-- 在 Supabase → SQL Editor 貼上整份內容，按 Run，只需要執行一次"
  echo "-- 整份會在同一個交易裡執行：中途出錯會全部取消，不會只做一半"
  echo "-- ====================================================================="
  echo
  echo "create schema if not exists supabase_migrations;"
  echo "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
  for f in "$@"; do
    base=$(basename "$f" .sql)
    echo
    echo "-- >>>>>>>>>> $base"
    echo
    cat "$f"
    echo
    echo "insert into supabase_migrations.schema_migrations (version, name) values ('${base%%_*}', '${base#*_}');"
  done
  echo
  echo "-- 完成：顯示結果"
  echo "select '設定完成' as 結果,"
  echo "       (select count(*) from public.gyms) as 場館數,"
  echo "       (select count(*) from public.zones) as 區域數,"
  echo "       (select count(*) from pg_policies where schemaname = 'public') as 權限規則數;"
} > "$out"
echo "已產生 $out"
