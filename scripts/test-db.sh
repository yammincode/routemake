#!/usr/bin/env bash
# 本機資料庫測試：建一個空資料庫 → 模擬 Supabase → 跑全部 migration → 跑權限測試
# 需要本機 PostgreSQL；連線參數用 PGHOST / PGPORT / PGUSER 指定
set -euo pipefail
cd "$(dirname "$0")/../supabase"
DB=routemake_test
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f"
done
out=$(psql -v ON_ERROR_STOP=1 -d $DB -f tests/10_permissions.sql)
echo "$out"
fails=$(psql -Atq -d $DB -c "select count(*) from tests.results where not ok")
[ "$fails" = "0" ] || { echo "有 $fails 項失敗"; exit 1; }
