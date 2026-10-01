# 資料庫

- `migrations/`：所有資料表變更，依檔名順序執行
- `setup/`：合併好的檔案，給 Supabase SQL Editor 一次貼上執行（`npm run bundle:sql -- <輸出檔> <migration…>` 產生）
- `tests/`：本機權限測試（`npm run test:db`，需要本機 PostgreSQL；`00_supabase_stub.sql` 只在本機模擬 Supabase，不要在正式環境執行）

## 已套用到正式 Supabase 的檔案

| 檔案 | 內容 | 套用日期 |
|---|---|---|
| `setup/step2-database.sql` | migration 0001–0006：8 張表、RLS、函式、照片 bucket、六間店與明德館 5 區 | 已套用 |
| `setup/step3-username-login.sql` | migration 0007：帳號名稱＋密碼登入、指派員工改用帳號名稱 | 已套用 |
| `setup/step4-scoring.sql` | migration 0008：路線分數、風格加成、每日積分（scoring_rules、points_summary） | 待套用 |
| `setup/step5-gym-names.sql` | migration 0009：六間店正式名稱 | 待套用 |
| `setup/step6-security-audit.sql` | migration 0010：留言頻率限制、操作紀錄顯示暱稱與看得懂的內容 | 待套用 |
| `setup/step7-route-videos.sql` | migration 0011：顧客分享影片（route_videos、route-videos 空間、下架自動刪除、每日上限） | 待套用 |
| `setup/step8-zone-order.sql` | migration 0012：店長拖曳整理區域順序（reorder_zones） | 待套用 |
| `setup/step9-gym-zones.sql` | migration 0013：萬華、中和、南港、新店開放並建立區域；明德比賽牆分四段、新增 Spray Wall；10 月換線日 | 待套用 |

## 規則摘要

| 表 | 讀 | 新增／修改 | 刪除 |
|---|---|---|---|
| gyms | 所有人 | 店長（新增只有老闆） | 不開放 |
| zones | 所有人 | 員工；定線長只能改照片和換線日，其他欄位只有店長 | 店長，且區域沒有任何路線 |
| routes | 所有人 | 該館員工；編號自動產生、不能改 | 不開放，用 `archived_at` 下架 |
| ascents | 只有本人 | 只有本人 | 只有本人 |
| comments | 所有人（未刪除） | 登入且有暱稱；路線未下架、路線與場館留言都開啟；1 分鐘最多 5 則、24 小時最多 100 則 | `delete_comment()`：本人或該館員工（軟刪除） |
| profiles | 所有人只能讀 id、暱稱、頭像（帳號名稱、手機不公開） | 本人只能改暱稱、頭像 | 不開放 |
| staff_roles | 本人、該館店長 | 店長只能指派定線長，店長由老闆指派（`lookup_user()` 先確認暱稱，再 `assign_staff(帳號, 館, 角色)`） | 同左（`remove_staff()`） |
| audit_log | 該館店長、老闆 | 只能由函式寫入 | 不開放 |
| scoring_rules | 所有人 | 只有老闆 | 不開放 |
| route_videos | 所有人 | 登入且有暱稱；路線未下架、留言開啟；路徑要是 `{館}/{路線}/{本人}/檔名`；不能修改 | `delete_video()`：本人或該館員工（員工刪除寫操作紀錄）；路線下架時自動刪除 |
| Storage `zone-photos` | 公開 | `{館}/zones/` 員工、`{館}/floorplan/` 店長 | 同左 |
| Storage `route-videos` | 公開 | 同 route_videos；每支 50 MB、mp4／mov／webm；每人 24 小時 10 支 | 本人或該館員工 |

函式：`points_summary(年, 月)`、`route_points(難度, 風格)`、`ascent_points(難度, 風格, 狀態)`、`my_access()`、`monthly_stats(年, 月)`、`zone_progress(館)`、`archive_zone(區域)`、`delete_comment(留言)`、`lookup_user(帳號)`、`assign_staff(帳號, 館, 角色)`、`remove_staff(使用者, 館)`、`delete_video(影片)`、`video_paths_for_routes(路線[])`、`video_usage(館)`、`orphan_video_paths(館)`、`reorder_zones(館, 區域[])`

登入：帳號名稱＋密碼，Auth 裡存成 `{帳號}@users.routemake.local`（Supabase 要關閉 Confirm email）。
設定老闆、重設密碼：`setup/admin-snippets.sql`。
