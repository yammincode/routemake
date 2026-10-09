# 資料庫

- `migrations/`：所有資料表變更，依檔名順序執行
- `setup/`：合併好的檔案，給 Supabase SQL Editor 一次貼上執行（`npm run bundle:sql -- <輸出檔> <migration…>` 產生）
- `tests/`：本機權限測試（`npm run test:db`，需要本機 PostgreSQL；`00_supabase_stub.sql` 只在本機模擬 Supabase，不要在正式環境執行）

## 已套用到正式 Supabase 的檔案

| 檔案 | 內容 | 套用日期 |
|---|---|---|
| `setup/step2-database.sql` | migration 0001–0006：8 張表、RLS、函式、照片 bucket、六間店與明德館 5 區 | 已套用 |
| `setup/step3-username-login.sql` | migration 0007：帳號名稱＋密碼登入、指派員工改用帳號名稱 | 已套用 |
| `setup/step4-scoring.sql` | migration 0008：路線分數、風格加成、每日積分（scoring_rules、points_summary） | 已套用 |
| `setup/step5-gym-names.sql` | migration 0009：六間店正式名稱 | 已套用 |
| `setup/step6-security-audit.sql` | migration 0010：留言頻率限制、操作紀錄顯示暱稱與看得懂的內容 | 已套用 |
| `setup/step7-route-videos.sql` | migration 0011：顧客分享影片（route_videos、route-videos 空間、下架自動刪除、每日上限） | 已套用 |
| `setup/step8-zone-order.sql` | migration 0012：店長拖曳整理區域順序（reorder_zones） | 已套用 |
| `setup/step9-gym-zones.sql` | migration 0013：萬華、中和、南港、新店開放並建立區域；明德比賽牆分四段、新增 Spray Wall；10 月換線日 | 已套用 |
| `setup/step10-comment-likes.sql` | migration 0014：留言按讚 👍（comment_likes） | 已套用 |
| `setup/step11-one-comment.sql` | migration 0015：每人每條路線一則留言（重複的保留最新一則）、edit_comment() 編輯留言 | 已套用 |
| `setup/step12-profile-card.sql` | migration 0016：人物卡（預設不公開、自我介紹擋聯絡方式、能力值依完攀計算＋自評、店長可清除） | 已套用 |
| `setup/step13-yds.sql` | migration 0017：上攀 YDS 等級（區域等級制、YDS 分數表、最高難度分抱石／上攀）；中和抱石區以外改 YDS | 已套用 |
| `setup/step14-spray-wall.sql` | migration 0018：Spray Wall（明德、南港）：岩館／岩友路線、圈圈標記、路線按讚、列表；岩友路線不算積分 | 已套用 |
| `setup/step15-usage.sql` | migration 0019：使用狀況（每人每天記一次打開、usage_stats() 活躍人數／趨勢／各館比較／熱門路線） | 已套用 |
| `setup/step16-hold-colors.sql` | migration 0020：岩點顏色新增灰、蒂芬妮 | 已套用 |
| `setup/step17-speed.sql` | migration 0021：加快速度（zone_view() 區域頁一次拿齊資料、紀錄表依路線索引） | 已套用 |
| `setup/step18-staff-search.sql` | migration 0022：指派員工更直覺（search_users() 用暱稱／帳號搜尋、assign_staff_user() 直接指派或改角色） | 已套用 |
| `setup/step19-nangang-zones.sql` | migration 0023：南港館細分 7 區（A→A1／A2／A3、B→B1／B2、C→C1／C2）；執行前要先把南港 A、B、C 整區換線 | 已套用 |
| `setup/step20-feedback.sql` | migration 0024：意見回饋（feedback 表、每人每天 5 則、只有老闆看得到全部、feedback_list()） | 已套用 |
| `setup/step21-zones-split.sql` | migration 0025：明德、新店、中和、萬華細分區域（萬華 D 右段＝教學區 Slab）；執行前要先把要切的區域整區換線 | 已套用 |
| `setup/step22-grade-vb.sql` | migration 0026：新增 VB 難度（grade = -1）、VB 分數（預設 5 分） | 已套用 |
| `setup/step23-usage-since.sql` | migration 0027：使用狀況「統計起始日」（usage_settings、set_usage_since()，usage_stats() 照起始日計算） | 已套用 |
| `setup/step24-nangang-c3.sql` | migration 0028：南港中間長牆切成 C2（左半）／C3（右半），新增 C3 區 | 已套用 |
| `setup/step25-video-tags.sql` | migration 0029：影片標籤（身高 4 段、動態／靜態，選填、只能選固定選項）；還沒套用時 App 照舊顯示影片、只是不能加標籤 | 待套用 |

## 規則摘要

| 表 | 讀 | 新增／修改 | 刪除 |
|---|---|---|---|
| gyms | 所有人 | 店長（新增只有老闆） | 不開放 |
| zones | 所有人 | 員工；定線長只能改照片和換線日，其他欄位只有店長 | 店長，且區域沒有任何路線 |
| routes | 所有人 | 該館員工；Spray Wall 的岩友路線登入有暱稱就能出（每人 24 小時 5 條），本人可改；編號自動產生、不能改 | 不開放，用 `archived_at` 下架（岩友路線本人也可以） |
| route_likes | 所有人 | 登入且有暱稱；路線在牆上；每人每條一個讚 | 只能收回自己的讚 |
| ascents | 只有本人 | 只有本人 | 只有本人 |
| comments | 所有人（未刪除） | 登入且有暱稱；路線未下架、路線與場館留言都開啟；每人每條路線一則；1 分鐘最多 5 則、24 小時最多 100 則；本人可用 `edit_comment()` 修改 | `delete_comment()`：本人或該館員工（軟刪除） |
| profiles | 所有人只能讀 id、暱稱、頭像（帳號名稱、手機不公開）；人物卡只能透過 `profile_card()`，未公開時只回傳暱稱 | 本人只能改暱稱、頭像；人物卡用 `save_my_card()`；店長可用 `clear_card_bio()` 清除自我介紹 | 不開放 |
| staff_roles | 本人、該館店長 | 店長只能指派定線長，店長由老闆指派（`lookup_user()` 先確認暱稱，再 `assign_staff(帳號, 館, 角色)`） | 同左（`remove_staff()`） |
| audit_log | 該館店長、老闆 | 只能由函式寫入 | 不開放 |
| scoring_rules | 所有人 | 只有老闆 | 不開放 |
| route_videos | 所有人 | 登入且有暱稱；路線未下架、留言開啟；路徑要是 `{館}/{路線}/{本人}/檔名`；不能修改 | `delete_video()`：本人或該館員工（員工刪除寫操作紀錄）；路線下架時自動刪除 |
| comment_likes | 所有人 | 登入且有暱稱；留言未刪除；每人每則一個讚；不能修改 | 只能收回自己的讚 |
| app_opens | 沒有人能直接讀寫 | 只能用 `record_open()` 記自己今天有打開 | 不開放 |
| Storage `zone-photos` | 公開 | `{館}/zones/` 員工、`{館}/floorplan/` 店長 | 同左 |
| Storage `route-videos` | 公開 | 同 route_videos；每支 50 MB、mp4／mov／webm；每人 24 小時 10 支 | 本人或該館員工 |

函式：`points_summary(年, 月)`、`route_points(難度, 風格)`、`ascent_points(難度, 風格, 狀態)`、`my_access()`、`monthly_stats(年, 月)`、`zone_progress(館)`、`archive_zone(區域)`、`delete_comment(留言)`、`lookup_user(帳號)`、`assign_staff(帳號, 館, 角色)`、`remove_staff(使用者, 館)`、`delete_video(影片)`、`video_paths_for_routes(路線[])`、`video_usage(館)`、`orphan_video_paths(館)`、`reorder_zones(館, 區域[])`

登入：帳號名稱＋密碼，Auth 裡存成 `{帳號}@users.routemake.local`（Supabase 要關閉 Confirm email）。
設定老闆、重設密碼：`setup/admin-snippets.sql`。
