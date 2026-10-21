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
| `setup/step25-video-tags.sql` | migration 0029：影片標籤（身高 4 段、動態／靜態，選填、只能選固定選項）；還沒套用時 App 照舊顯示影片、只是不能加標籤 | 已套用 |
| `setup/step26-nangang-b3-d.sql` | migration 0030：南港重新分區，新增 B3（1F 左下斜牆左半）、D1／D2（2F D 牆左右兩半）；原本的區域和路線不動（B1、B2 範圍變了，要整區換線後重拍、重標） | 已套用 |
| `setup/step27-reset-events.sql` | migration 0031：換線公告（reset_events、授權名單 reset_editors、can_edit_resets()、reset_calendar()；存檔自動更新各區下次換線日；整區換線改接下一筆公告；各區換線日讀取時以公告為準、刪掉的區自動從公告移除；my_access 多回傳 can_edit_resets） | 已套用（10/10 前的版本，少的「一次刪多區」修正由 step29 補上） |
| `setup/step28-ops-access.sql` | migration 0032：營運分頁權限（usage_viewers：老闆授權誰看哪幾館的使用狀況；usage_stats 改成老闆＋被授權的人，店長不再自動看得到；set_usage_viewer()、usage_viewer_list()；my_access 多回傳 usage_gyms）。要先套用 step27 | 已套用 |
| `setup/step29-zone-delete-fix.sql` | migration 0033：補 step27 舊版少的修正（重新分區一次刪好幾區時，換線公告裡已刪掉的區一起拿掉；第二次執行會在最後登記那一行報錯，代表已經套用過） | 已套用 |
| `setup/step30-endurance.sql` | migration 0034：長耐力區域（第三種等級制 endurance；路線照順序標 2–50 點、YDS、不用顏色；有人記錄過點就不能改；ascents.highpoint 最高爬到第幾點；嘗試中照比例算分：ascent_points 5 個參數版、points_summary、zone_view） | 已套用 |
| `setup/step31-home-gyms.sql` | migration 0035：人物卡「常去的館」可以複選（profiles.home_gyms，原本的 home_gym 搬進去並保留＝第一間；save_my_card 新版收好幾間；舊版一間照常可用（存回原本第一間不會洗掉其他館，換成別間只留那一間）；profile_card 多回傳 home_gyms） | 已套用 |
| `setup/step32-zhonghe-a-merge.sql` | migration 0036：中和 A1、A2 合併回「A 區」（沿用 A1 那一筆改成代碼 A，路線、照片、紀錄照舊；A2 的舊路線搬到 A、換線公告的 A2 改成 A，再刪掉 A2；A2 牆上還有路線時會擋下，要先整區換線；請先更新正式版（v2.3 以後）再執行，舊版 App 的平面圖畫不出 A 區；再執行一次不會改到東西，但最後登記那一行會報錯，代表已經套用過） | 已套用 |
| `setup/step33-hold-color-brown.sql` | migration 0037：岩點顏色新增咖啡（排在粉和黑中間）；請先執行這份再更新正式版（新版 App 選咖啡存路線要這份才存得進去，舊版不受影響） | 已套用 |
| `setup/step34-prelaunch-hardening.sql` | migration 0038–0039：上線前安全加強（路線第 100 條起用 3 位數、取號只能在新增路線時；影片要先有本人上傳的檔案、24 小時 15 支、說明不能放網址、新版分享的影片記下分享者紀錄上的攀爬日（舊版 App 分享的不記）、分享中的影片檔不能偷換、未登入列不出影片檔；Spray Wall 圈圈只存位置、岩友路線下架後不能恢復；暱稱不能冒充館方、留言不能放網址；刪帳號修正；區域類型、清除自介、員工名單、建立時間、頭像、註冊時間、SVG 照片的權限）；舊版 App 照常可用，但舊版改暱稱被新規則擋下時看不到原因（只顯示「發生錯誤」），建議跟新版同一天上線；要先執行 step34 再更新正式版（新版的 15 支、攀爬日要 step34 才有） | 已套用 |
| `setup/step35-video-feel-tags.sql` | migration 0040：影片型態標籤（route_videos.feel_tags：💪 力量感、🤏 手指超痛、🧠 超難爬、🧘 risky、🦶 精準腳法、🤸 柔軟大師，只收這 6 個、最多 2 個、重複的自動去掉；分享後不能改）；舊版 App 照常可用；新版在還沒執行時照樣分享（不帶型態），建議執行後再更新正式版 | 已套用 |
| `setup/step36-rope-video-limit.sql` | migration 0041：上攀影片放寬（上攀區每支最長 3 分鐘、100 MB；抱石、長耐力、Spray Wall 照舊 60 秒、50 MB，影片資料依區域檢查；影片檔 bucket 上限 100 MB）。**另外要在 Supabase 把專案的上傳檔案大小上限改成 100 MB**：Storage → Settings（或 Project Settings → Storage）→ Upload file size limit 改成 100 MB → Save；舊版 App 照常可用（自己限制 60 秒、50 MB）；**請先執行這份、改好上傳上限，再更新正式版**（新版上攀可以選 3 分鐘的影片，資料庫沒更新時要等壓縮、上傳完才被擋） | 已套用 |
| `setup/step37-xindian-a-merge.sql` | migration 0042：新店抱石 A1、A2 合併成「抱石 A 區」（沿用 A1 那一筆，路線、照片、換線日、紀錄照舊；A2 的舊路線和紀錄搬到 A、換線公告的 A2 改成 A，再刪掉 A2；A2 牆上還有路線時擋下；再執行一次不會改到東西）；新舊版 App 都能用（平面圖還沒執行時畫兩區） | 已套用 |
| `setup/step38-video-thumbs.sql` | migration 0043＋0044：①影片縮圖（省流量：列表只放縮圖，按了播放才載入影片）。route_videos 多一欄 thumb_path；新的 bucket video-thumbs（公開讀、每張最大 1 MB、只收 webp／jpeg，路徑跟影片一樣、跟影片同名）；縮圖要本人上傳、跟影片同名，不對就當作沒有縮圖（不擋分享）；刪檔規則跟影片一樣；後台「清理漏刪的檔案」一起清縮圖。②路線列顯示影片數：區域頁一次讀資料（zone_view）多帶每條路線的影片數。再執行一次不會改到東西。新舊版 App 都能用（還沒執行時新版照常分享、列表顯示灰色方塊＋▶、路線列只顯示留言數）。**執行後**在自己電腦跑 `scripts/video-thumbs.mjs` 幫舊影片補縮圖（說明在檔案開頭） | 已套用 |
| `setup/step39-xindian-a-split.sql` | migration 0045：新店抱石 A 區拆回 A1、A2（step37 的反過來）。A 那一筆改回「抱石 A1 區」（照片、換線日、紀錄照舊，之後的路線編號接著往下）；新增「抱石 A2 區」排在 A1 後面（沒有照片，請在管理後台上傳）；合併時搬過去的 A2 舊路線（A2-xx，已下架）和顧客紀錄搬回 A2，A2 的新編號接在舊的最大號後面；還沒結束的換線公告有 A 的，A1、A2 都排上；A 牆上還有路線時擋下（請先整區換線）；再執行一次不會改到東西。新舊版 App 都能用（平面圖照資料庫有的區畫） | 已套用 |
| `setup/step40-grand-slam.sql` | migration 0046：大滿貫兌換（slam_settings 活動設定：開關預設關（只有老闆可以先試）、最少 10 條、期限 30 天、獎品文字，只有老闆能改；slam_claims 兌換碼：本人和老闆看得到，新增和兌換只能透過函式；claim_slam 拿碼、slam_lookup 員工查碼、redeem_slam 員工確認兌換（只能用自己的館），都在資料庫重新檢查牆上的路線全部完成；每人每個難度只能兌換一次；slam_claim_list 老闆看紀錄）。新舊版 App 都能用（還沒執行時新版不顯示兌換按鈕） | 未套用 |
| `setup/step41-mascots.sql` | migration 0047：原岩夥伴（profiles.mascot：選哪隻夥伴、各部位顏色、卡片背景；所有人看得到（留言、影片旁的頭像），不能直接改，只能用 save_my_mascot 改自己的；只能選開放中的館的夥伴（中壢館開幕前太空小熊不能選），顏色只能從固定色盤挑）。跟 step40、step42 互不影響，可以單獨執行。再執行一次不會改到東西（最後登記那一行會報錯，代表已經套用過）。新舊版 App 都能用（還沒執行時新版大家都是高山猛牛、人物卡不能選夥伴） | 未套用 |
| `setup/step42-video-likes.sql` | migration 0048：影片按讚 👍（video_likes：所有人看得到讚數，登入且有暱稱才能按，每人每支一個讚，只能收回自己的；影片刪掉讚跟著刪）。再執行一次不會改到東西（最後登記那一行會報錯，代表已經套用過）。新舊版 App 都能用（還沒執行時新版照常顯示影片，只是沒有讚的按鈕） | 已套用 |
| `setup/step43-accounts.sql` | migration 0049：帳號管理（profiles 多停權欄位（到哪天、原因、誰停的），不公開；停權中在資料庫擋留言、改留言、按讚、分享影片、上傳檔案、出岩友路線、改暱稱和人物卡、換夥伴、送回饋，記錄完攀照常；suspend_user／unsuspend_user：店長 3／7／30 天、永久只有老闆，員工和老闆不能停；店長只刪得到自己館的留言、只能解除自己停的；search_accounts、account_info、suspended_accounts、account_comments：員工看帳號管理；delete_user_videos＋delete_user：老闆刪別人（員工不能被刪；先刪影片資料、App 刪檔案，再刪帳號），delete_my_videos＋delete_my_account：本人輸入密碼刪自己；password_resets＋issue_reset_code／cancel_reset_code：店長、老闆產生 6 位數重設碼（只存加密後的、15 分鐘、員工的帳號只有老闆能產生；定線長不行），reset_password_with_code：沒登入也能用，打錯 5 次作廢，成功後其他手機登出；my_access 多回傳 suspension）。跟 step40、step41 互不影響，可以單獨執行（要先套用 step42）。新舊版 App 都能用（還沒執行時新版沒有停權、帳號管理寫要套用 step43、忘記密碼請洽櫃檯）。**執行後**用測試帳號試一次重設密碼、刪除我的帳號（第一次由資料庫改密碼、刪 auth 帳號） | 已套用 |
| `setup/step44-spray-route-photos.sql` | migration 0050：Spray Wall 岩館路線改成員工上傳照片（routes.photo_path：只有 Spray Wall 的岩館路線能放，路徑一定是那間館的 {館}/routes/；有照片圈圈可以不畫；Storage {館}/routes/ 只有那館員工能上傳；spray_list 多回傳 photo_path）。還沒執行時 App 照常（岩館路線照舊在公版照片上畫圈） | 已套用 |
| `setup/step45-usage-insights.sql` | migration 0051：使用狀況更多數據分析（app_opens 多一欄 hours：當天幾點有打開，record_open 每次補上那一格，之前的紀錄沒有時間；usage_insights：「人」「互動」分頁的回頭率、新客人第一週、常客分群、程度分布、進步、幾點最多人用、每天留言影片按讚、熱門影片和留言、夥伴，權限跟 usage_stats 一樣；route_insights：「路線」分頁的每條路線試過／完攀／Flash／難度體感、各區熱度、換線前後、難度供需、熱門路線，老闆、被授權看那一館的人和那一館的員工（定線員、店長）看得到；usage_activity 內部用，App 不能直接叫；都只回傳總數，不回傳客人的帳號）。還沒執行 step41、step42 也可以執行（沒有的就不算）。再執行一次不會改到東西（最後登記那一行會報錯，代表已經套用過）。新舊版 App 都能用（還沒執行時新版照舊顯示現在的使用狀況，多的分析寫要套用 step45） | 已套用 |
| `setup/step46-route-insights-zone.sql` | migration 0052：路線分析點路線跳到區域頁（route_insights 的每條路線、熱門路線多回傳 zone_id；只換掉這個函式，權限照舊）。要先套用 step45。再執行一次不會改到東西（最後登記那一行會報錯，代表已經套用過）。新舊版 App 都能用（還沒執行時新版路線分析的路線不能點，其他照常） | 未套用 |
| `setup/step48-climber.sql` | migration 0054：攀岩角色（profiles.climber：人物卡上的真人角色選了哪幾款（動作、髮型、衣服、褲子、背景…）；所有人看得到（人物卡、留言和影片旁的小頭像），不能直接改，只能用 save_my_climber 改自己的；款式只能是固定的那幾種（climber_values）；進階款照自己的紀錄開放（climber_rules：攀爬日 1／2／3／5／7／10 天、上攀完攀 1／10／30 條、Flash 5 條、V5 以上完攀 10 條，岩友路線不算；金色、琉璃、各館門口背景是特殊獎品，現在一律存不進去），存的時候資料庫再算一次；my_climb_stats：自己的數字；停權中不能改）。要先套用 step41、step43。再執行一次不會改到東西（最後登記那一行會報錯，代表已經套用過）。新舊版 App 都能用（還沒執行時新版人物卡照舊只有夥伴，編輯寫要套用 step48） | 未套用 |

## 規則摘要

| 表 | 讀 | 新增／修改 | 刪除 |
|---|---|---|---|
| gyms | 所有人 | 店長（新增只有老闆） | 不開放 |
| zones | 所有人 | 員工；定線長只能改照片和換線日，其他欄位只有店長 | 店長，且區域沒有任何路線 |
| routes | 所有人 | 該館員工；Spray Wall 的岩友路線登入有暱稱就能出（每人 24 小時 5 條），本人可改（下架後不能再改、不能放回牆上；留言開關只有員工）；編號自動產生（第 100 條起 3 位數）、不能改、不能直接取號 | 不開放，用 `archived_at` 下架（岩友路線本人也可以） |
| route_likes | 所有人 | 登入且有暱稱；路線在牆上；每人每條一個讚 | 只能收回自己的讚 |
| video_likes | 所有人 | 登入且有暱稱；影片還在；每人每支一個讚；不能改 | 只能收回自己的讚（影片刪掉跟著刪） |
| ascents | 只有本人 | 只有本人 | 只有本人 |
| comments | 所有人（未刪除） | 登入且有暱稱；路線未下架、路線與場館留言都開啟；每人每條路線一則；1 分鐘最多 5 則、24 小時最多 100 則；不能放網址；本人可用 `edit_comment()` 修改 | `delete_comment()`：本人或該館員工（軟刪除） |
| profiles | 所有人只能讀 id、暱稱、頭像（帳號名稱、手機、註冊時間不公開）；人物卡只能透過 `profile_card()`，未公開時只回傳暱稱 | 本人只能改暱稱（不能用原岩、官方、店長、館長、定線、櫃檯等字（含簡體），員工、老闆除外；不能有看不見的字元、只有空白、網址；一般表情符號可以）；人物卡用 `save_my_card()`；店長可用 `clear_card_bio()` 清除公開人物卡的自我介紹 | 不開放 |
| staff_roles | 本人、該館店長 | 只能用函式（會寫操作紀錄）：店長只能指派定線長，店長由老闆指派（`lookup_user()` 先確認暱稱，再 `assign_staff(帳號, 館, 角色)`） | 同左（`remove_staff()`） |
| audit_log | 該館店長、老闆 | 只能由函式寫入 | 不開放 |
| scoring_rules | 所有人 | 只有老闆 | 不開放 |
| route_videos | 所有人 | 登入且有暱稱；路線未下架、留言開啟；路徑要是 `{館}/{路線}/{本人}/檔名`，而且要先上傳好本人的檔案；身高、動作、型態只收固定選項（型態最多 2 個）；長度、大小依區域（上攀 180 秒、100 MB，其他 60 秒、50 MB）；24 小時 15 筆；說明不能放網址；App 有送攀爬日和完成狀態時，由資料庫從本人紀錄帶入（舊版 App、沒送完成狀態的不記攀爬日）；不能修改 | `delete_video()`：本人或該館員工（員工刪除寫操作紀錄）；路線下架時自動刪除 |
| comment_likes | 所有人 | 登入且有暱稱；留言未刪除；每人每則一個讚；不能修改 | 只能收回自己的讚 |
| app_opens | 沒有人能直接讀寫 | 只能用 `record_open()` 記自己今天有打開（step45 起多記幾點） | 不開放 |
| Storage `zone-photos` | 公開（只收 JPEG、PNG、WebP） | `{館}/zones/` 員工、`{館}/floorplan/` 店長 | 同左 |
| Storage `route-videos` | 用網址公開播放；檔案清單只有本人、該館員工看得到 | 同 route_videos；每支 100 MB（影片資料再依區域檢查：上攀 3 分鐘、100 MB，其他 60 秒、50 MB）、mp4／mov／webm；每人 24 小時 15 支 | 該館員工；本人（分享中的要先用 `delete_video()` 刪資料）；岩友路線下架後出題者可清掉這條路線的影片檔 |

函式：`points_summary(年, 月)`、`route_points(難度, 風格)`、`ascent_points(難度, 風格, 狀態)`、`my_access()`、`monthly_stats(年, 月)`、`zone_progress(館)`、`archive_zone(區域)`、`delete_comment(留言)`、`lookup_user(帳號)`、`assign_staff(帳號, 館, 角色)`、`remove_staff(使用者, 館)`、`delete_video(影片)`、`video_paths_for_routes(路線[])`、`video_usage(館)`、`orphan_video_paths(館)`、`reorder_zones(館, 區域[])`

登入：帳號名稱＋密碼，Auth 裡存成 `{帳號}@users.routemake.local`（Supabase 要關閉 Confirm email）。
設定老闆、重設密碼：`setup/admin-snippets.sql`。
