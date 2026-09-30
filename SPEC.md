# 原岩攀岩館 路線 PWA 開發規格

2026-09-30

## 專案概述

做一個讓顧客查看路線、記錄完攀的 PWA，第一階段只開放明德館，不做 App Store／Google Play 上架。資料結構一開始就支援六間店，其他館之後只要建資料就能上線。

**第一階段範圍：**

- 顧客：在館內平面圖選區域、看各區路線、在照片上看起步點、記錄 Flash／完攀／嘗試中、寫私人心得、公開留言、看每月統計
- 管理後台：管理區域和照片、在照片上標路線、下架與整區換線、管理留言
- 場館切換：六間店都列出來，只有明德館顯示內容，其他顯示「即將上線」

**不在第一階段：** LINE 登入（正式開放前加上，見「開發順序」第 9 步）、推播通知、線上付款、原生 app、排行榜、顧客難度投票統計、3D 館內總覽（第二階段，用岩牆 CAD 匯出 glTF，以 three.js 呈現，沿用平面圖的區域對應；舊手機自動改顯示平面圖）。

## 技術架構

前端用 Next.js 做成 PWA，後端全部交給 Supabase，部署在 Netlify。

| 項目 | 選擇 | 用途 |
| --- | --- | --- |
| 前端 | Next.js（App Router）+ TypeScript + Tailwind CSS | 顧客端與管理後台，同一個專案 |
| PWA | Web App Manifest + Service Worker（`@serwist/next`） | 加到主畫面、App 圖示、快取靜態檔 |
| 資料庫 | Supabase Postgres | 路線、紀錄、留言 |
| 權限 | Supabase Row Level Security | 顧客只能改自己的資料，員工才能改路線 |
| 登入 | 帳號名稱 + 密碼（Supabase Auth，Confirm email 關閉） | 顧客與員工登入；不發簡訊、不寄信。帳號名稱 4–20 字（英文字母、數字、底線），App 轉成 {帳號}@users.routemake.local 存在 Supabase |
| 照片 | Supabase Storage，bucket `zone-photos` | 區域照片、場館平面圖，上傳前在瀏覽器壓到寬 1600px、JPEG |
| 部署 | Netlify，綁自家網域子網域 | 例如 route.自家網域 |
| 開發環境 | Windows + Node.js LTS + Supabase CLI | 本機開發與資料表 migration |

**原則：**

- 所有資料表變更都寫成 Supabase migration 檔，不要在後台手動改
- 顧客端手機優先，寬度 360–430px 為主要設計尺寸
- 介面全部繁體中文，時區 Asia/Taipei
- 難度一律 V0–V10，紀錄狀態只有 Flash、完攀、嘗試中三種

## 角色與權限

| 角色 | 誰 | 能做什麼 |
| --- | --- | --- |
| 顧客 | 任何註冊帳號並登入的人 | 看路線、記錄自己的紀錄與心得、留言、刪自己的留言 |
| 定線長 | 店長指派 | 顧客權限 + 在所屬場館新增／編輯／下架路線、上傳區域照片、設換線日、刪任何留言、開關單條路線留言 |
| 店長 | 老闆指派 | 定線長權限 + 新增／改名區域、上傳平面圖、開關全館留言、指派定線長 |

員工角色綁定到特定場館；老闆帳號是所有場館的店長。未登入的人可以看路線和留言，但要登入才能記錄或留言。

## 資料表設計

共 8 張表。路線下架不刪除，只填 `archived_at`，顧客的紀錄和心得才會一直累積。每人每條路線只有一筆紀錄，月統計以 `climbed_on` 日期計算。

```sql
-- 場館：六間店都先建好，只有明德館 is_live = true
gyms (
  id text primary key,            -- 'mingde'
  name text not null,             -- '明德館'
  is_live boolean default false,
  floorplan_path text,            -- 平面圖 SVG（Storage 路徑），從 CAD 匯出
  comments_enabled boolean default true,  -- 全館留言開關
  sort int
)

-- 區域：A 區、比賽牆、B 區、C 區、D 區
zones (
  id uuid primary key,
  gym_id text references gyms,
  name text not null,
  photo_path text,                -- Storage 路徑
  photo_width int, photo_height int,
  plan_shape jsonb,               -- 區域在平面圖上的多邊形 [[x,y],…]，0–100（%）；平面圖 SVG 有對應 id 時可省略
  model_mesh text,                -- 第二階段：3D 模型裡對應的物件名稱
  next_reset_on date,             -- 下次換線日
  code text not null,             -- 'A'，用來產生路線編號 A-01，也是平面圖 SVG 裡的圖形 id
  route_seq int default 0,
  sort int
)

-- 路線
routes (
  id uuid primary key,
  zone_id uuid references zones,
  code text not null,             -- 'A-07'，同區不重複
  grade int check (grade between 0 and 10),
  hold_color text check (hold_color in ('紅','橙','黃','綠','藍','紫','粉','黑','白')),
  style_tags text[] default '{}', -- 力量、指力、技巧、平衡、腳法、動態、協調、柔軟、耐力
  setter_note text,               -- 評語，40 字內
  pin_x numeric, pin_y numeric,   -- 起步點在照片上的位置，0–100（%）
  comments_enabled boolean default true,
  created_by uuid references profiles,
  created_at timestamptz default now(),
  archived_at timestamptz         -- 下架時間，null = 還在牆上
)

-- 顧客的紀錄：每人每條路線一筆
ascents (
  id uuid primary key,
  user_id uuid references profiles,
  route_id uuid references routes,
  status text check (status in ('flash','send','project')),
  climbed_on date not null,       -- 顧客可補登過去日期
  feel int check (feel in (1,2,3)),              -- 輕鬆／剛好／吃力
  grade_feel int check (grade_feel in (-1,0,1)), -- 偏軟／剛好／偏硬
  private_note text,              -- 私人心得，300 字內，只有本人看得到
  updated_at timestamptz default now(),
  unique (user_id, route_id)
)

-- 公開留言
comments (
  id uuid primary key,
  route_id uuid references routes,
  user_id uuid references profiles,
  body text not null,             -- 200 字內
  created_at timestamptz default now(),
  deleted_at timestamptz,         -- 軟刪除
  deleted_by uuid references profiles
)

-- 使用者（對應 auth.users）
profiles (
  id uuid primary key references auth.users,
  username text unique,           -- 帳號名稱（登入用，不公開）
  phone text unique,              -- 手機號碼（保留，目前不用）
  line_user_id text unique,       -- 正式開放前加 LINE 登入後才會有值
  nickname text,                  -- 留言顯示名稱
  avatar_url text,
  created_at timestamptz default now()
)

-- 員工角色
staff_roles (
  user_id uuid references profiles,
  gym_id text references gyms,
  role text check (role in ('setter','manager')),
  primary key (user_id, gym_id)
)

-- 操作紀錄：誰在什麼時候下架、刪留言
audit_log (
  id bigint generated always as identity primary key,
  user_id uuid, action text, target_id uuid,
  detail jsonb, created_at timestamptz default now()
)
```

**要建的 view／函式：**

- `monthly_stats(user, year, month)`：完攀數、Flash 數、攀爬天數、最高難度、各難度數量、每天完攀數
- `zone_progress(user, gym)`：每區目前牆上路線數與本人完成數
- `archive_zone(zone_id)`：整區換線，一次下架該區所有路線、清空換線日，寫入 audit_log

## 路線分數與積分

每條路線有分數，顧客在「我的紀錄」看每日積分與成長。規則只有一組（全部場館共用），存在 `scoring_rules`，只有老闆能在管理後台修改；修改後所有人的分數自動重算。

- 路線分數 = 難度分數 ×（1 + 風格加成），風格加成上限 30%
- 難度分數預設：V0 10、V1 15、V2 20、V3 30、V4 40、V5 55、V6 70、V7 90、V8 110、V9 135、V10 160
- 風格加成預設：力量、指力、耐力、協調 +10%；動態 +15%；技巧、平衡、腳法、柔軟 +5%
- 得分：Flash × 1.2、完攀 × 1、嘗試中 0；每條路線只算一次，算在完攀那天；路線下架後分數保留
- 我的紀錄 → 積分：今天、本月、單日最高、連續攀爬天數；今天比最近 7 天平均、本月比上個月；每日積分直條圖
- 第一階段不做排行榜

## 權限規則（RLS）

每張表都開 Row Level Security，權限一律在資料庫擋，不能只靠前端隱藏按鈕。

| 表 | 讀 | 新增／修改 | 刪除 |
| --- | --- | --- | --- |
| gyms | 所有人 | 只有 manager | 不開放 |
| zones | 所有人 | 該館 setter、manager | 只有 manager |
| routes | 所有人 | 該館 setter、manager | 不開放，用 `archived_at` 下架 |
| ascents | 只有本人 | 只有本人 | 只有本人 |
| comments | 所有人（`deleted_at` 為 null） | 登入者可新增，且該路線與場館留言皆開啟 | 本人，或該館 setter、manager（軟刪除） |
| profiles | 所有人只能讀暱稱和頭像 | 只有本人 | 不開放 |
| staff_roles | 本人、manager | 只有 manager | 只有 manager |
| Storage `zone-photos` | 公開讀 | 該館 setter、manager | 該館 setter、manager |

**特別注意：**

- `private_note` 在 ascents 表內，其他人（包含員工）都讀不到
- 留言開關要在資料庫檢查：路線 `comments_enabled` 和場館 `comments_enabled` 任一為 false，就拒絕新增
- 已下架路線不能新增留言，但顧客仍可修改自己的紀錄和心得
- `profiles.phone`、`profiles.username` 其他人讀不到

## 頁面與功能

畫面、配色、互動以原型為準；底部三個分頁：館內路線、我的紀錄、管理後台（只有員工看得到）。

| 路徑 | 頁面 | 內容 |
| --- | --- | --- |
| `/` | 入口頁 | 中間放原岩攀岩館 Logo，點一下進入選擇攀岩館；不顯示底部分頁；每次打開 App 都從這裡開始 |
| `/gyms` | 選擇攀岩館 | 六間店列表（已上線／即將上線），點一間進入該館；「返回」與手機上一頁回到入口頁 |
| `/gym/[gymId]` | 館內路線 | 已上線：右上角場館切換；館內平面圖（各區塊用顏色顯示完成進度，7 天內換線用紅色虛線框，點區塊進入該區）；各區卡片（照片縮圖、完成進度、換線倒數）；即將換線（最近 3 區，顯示還有幾條沒完攀）；最新路線（7 天內）。未上線：顯示「即將上線」。底部「館內路線」分頁記住上次選的館 |
| `/zone?id=區域id` | 區域 | 區域照片 + 起步點標記（顏色＝岩點色、數字＝V 級，已完攀加外圈，Flash 用黃圈）；難度、顏色、風格三排篩選，不符合的標記變淡；路線列表 |
| 路線卡片（底部彈出） | 路線詳情 | 難度、顏色、編號、風格標籤、評語；我的紀錄（Flash／完攀／嘗試中、日期、感覺、難度體感、私人心得）；公開留言（列表、送出、刪自己的；關閉時顯示「留言已關閉」） |
| `/me` | 我的紀錄 | 月份切換；完攀、Flash、攀爬天數、最高難度；跟上個月比較；攀爬日月曆熱度；本月難度分布；本月完攀與心得列表；累計完攀；目前牆上各難度進度 |
| `/admin` | 管理後台 | 全館留言開關；選區域；改區域名稱、換線日、上傳照片；新增區域；上傳場館平面圖 SVG（每個區域的圖形 id 用區域代碼，例如 A、B，app 自動對應到區域） |
| `/admin`（同頁選區域） | 標路線 | 點照片空白處新增路線（顏色、V 級、風格複選、評語、留言開關）；點標記編輯、看並刪留言、下架；整區換線（二次確認） |
| `/login` | 登入 | 帳號名稱＋密碼登入或註冊；首次登入要求填暱稱（`/welcome`）；忘記密碼第一階段由管理者在 Supabase 重設 |

**細節：**

- 首次開啟時提示「加到主畫面」，iOS 要用圖示教學（分享 → 加入主畫面）
- 照片上的標記用百分比定位，照片縮放時位置不變
- 同一張照片上標記太擠時，支援雙指放大照片
- 紀錄日期預設今天，可選到路線設定日之後、今天之前
- 原型裡的明德館平面圖多邊形是暫用的，正式版改用 CAD 匯出的 SVG

## PWA 注意事項

| 問題 | 影響 | 做法 |
| --- | --- | --- |
| LINE 內建瀏覽器 | 顧客從 LINE 點連結會開在 LINE 裡，無法加到主畫面 | 分享連結一律加 `?openExternalBrowser=1`，強制開 Safari／Chrome；偵測到 LINE 瀏覽器時顯示「用瀏覽器開啟」提示 |
| iOS 加到主畫面藏得深 | 很多人不知道怎麼裝 | 首次開啟顯示圖示教學；櫃檯放 QR code 和步驟說明 |
| 推播通知 | iOS 16.4 以上、且已加到主畫面才能收 | 第一階段不做推播；換線提醒先放首頁 |
| 資料存在雲端 | 所有資料在 Supabase，換手機或清瀏覽器都不會掉 | 不把重要資料存在手機的 localStorage |
| 岩館訊號不穩 | 沒網路時打不開 | Service Worker 快取頁面和區域照片；沒網路時可看路線，記錄等連線後再送出並提示 |

## 與會員系統的關係

路線 PWA 是獨立的系統，跟會員系統（Tupuser）完全分開：

- 使用獨立的 Supabase 專案，不共用資料庫、帳號或 `profiles` 表
- 不串接會員資料（方案、剩餘次數、入場紀錄），兩邊的程式也不互相引用
- 同一個顧客在兩個系統各自登入，帳號互不相通

## 開發順序與上線檢查

一次做一步，每步做完先在手機上測，再進下一步。

1. 建 Next.js 專案、Tailwind、PWA 設定（manifest、圖示、Service Worker），部署一個空殼到 Netlify
2. 建 Supabase 專案，寫 migration：8 張表、RLS、`zone-photos` bucket；建六間店和明德館 5 個區域的初始資料
3. 帳號名稱＋密碼登入、首次登入填暱稱、員工角色判斷
4. 管理後台：區域管理、照片與平面圖上傳、在照片上標路線、編輯與下架、整區換線
5. 顧客端：首頁（含平面圖）、區域頁、路線卡片、記錄與心得
6. 留言：送出、刪除、全館與單條開關、員工刪除
7. 我的紀錄：月統計、月曆、難度分布、累計
8. LINE 內建瀏覽器處理、加到主畫面教學、離線快取
9. （測試結束、正式開放前）LINE 登入：用 Supabase Custom OAuth Provider 的 OAuth2 模式（不要用 OIDC 模式，LINE 網頁登入的 ID token 是 HS256，Supabase 只收 ES256），或用 Edge Function 自己換 token。已用帳號登入的人可在設定頁綁 LINE，綁到同一個 `profiles`；第一次就用 LINE 登入的人是否要另外驗證身分，屆時再決定

**上線前檢查：**

- [ ] 明德館 5 區照片拍好上傳，所有路線標完
- [ ] 用另一個帳號測試：看不到別人的私人心得和手機號碼、不能改路線
- [ ] iPhone（Safari）和 Android（Chrome）都測過加到主畫面
- [ ] 從 LINE 點連結能正確跳到外部瀏覽器
- [ ] 隱私權政策與留言規範頁面上線
- [ ] 設定 Supabase 每日備份
- [ ] 定線長試用一週、常客試用兩週後再正式開放

## 待確認

- D 區是否就是兒童區
- D 區與 C 區中間的直立牆歸哪一區
- A 區是否拆成「A 區前段」「A 區後段」兩個區域
- 其他五間店的正式館名
