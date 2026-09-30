# 資料庫

- `migrations/`：所有資料表變更，依檔名順序執行
- `setup/`：合併好的檔案，給 Supabase SQL Editor 一次貼上執行（`npm run bundle:sql -- <輸出檔> <migration…>` 產生）
- `tests/`：本機權限測試（`npm run test:db`，需要本機 PostgreSQL；`00_supabase_stub.sql` 只在本機模擬 Supabase，不要在正式環境執行）

## 已套用到正式 Supabase 的檔案

| 檔案 | 內容 | 套用日期 |
|---|---|---|
| `setup/step2-database.sql` | migration 0001–0006：8 張表、RLS、函式、照片 bucket、六間店與明德館 5 區 | 待套用 |

## 規則摘要

| 表 | 讀 | 新增／修改 | 刪除 |
|---|---|---|---|
| gyms | 所有人 | 店長（新增只有老闆） | 不開放 |
| zones | 所有人 | 員工；定線員只能改照片和換線日，其他欄位只有店長 | 店長，且區域沒有任何路線 |
| routes | 所有人 | 該館員工；編號自動產生、不能改 | 不開放，用 `archived_at` 下架 |
| ascents | 只有本人 | 只有本人 | 只有本人 |
| comments | 所有人（未刪除） | 登入且有暱稱；路線未下架、路線與場館留言都開啟 | `delete_comment()`：本人或該館員工（軟刪除） |
| profiles | 所有人只能讀 id、暱稱、頭像 | 本人只能改暱稱、頭像 | 不開放 |
| staff_roles | 本人、該館店長 | 店長只能指派定線員，店長由老闆指派（`assign_staff()`） | 同左（`remove_staff()`） |
| audit_log | 該館店長、老闆 | 只能由函式寫入 | 不開放 |
| Storage `zone-photos` | 公開 | `{館}/zones/` 員工、`{館}/floorplan/` 店長 | 同左 |

函式：`my_access()`、`monthly_stats(年, 月)`、`zone_progress(館)`、`archive_zone(區域)`、`delete_comment(留言)`、`assign_staff(手機, 館, 角色)`、`remove_staff(使用者, 館)`

老闆：`profiles.is_owner = true`，第一次登入後在 SQL Editor 設定（第 3 步說明）。
