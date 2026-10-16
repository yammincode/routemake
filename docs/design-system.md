# 設計規範

來源：`prototype/mingde-routes.html`。所有頁面都要用這套規範和 `components/ui/` 的共用元件，不要在頁面裡另外寫顏色、字級、圓角。
對照用的元件展示頁：`/design`（可切換淺色／深色）。

- Tailwind 設定：`app/globals.css`（Tailwind 4 的設定寫在 `@theme` 裡，沒有 `tailwind.config.js`）
- 固定選項（岩點色、風格、狀態文字）：`lib/design.ts`

## 顏色

顏色都是 CSS 變數，深色模式只換變數值（跟隨手機設定；`<html data-theme="light|dark">` 可強制切換）。

| Tailwind | 變數 | 淺色 | 深色 | 用途 |
|---|---|---|---|---|
| `bg-bg` | `--bg` | #E6E8E4 | #0F1412 | 頁面底色 |
| `bg-surface` | `--surface` | #FAFBF9 | #19201D | 卡片、面板 |
| `bg-sunk` | `--sunk` | #EEF0EC | #141A17 | 輸入框、留言、凹陷區塊 |
| `text-ink` | `--ink` | #15201B | #E7ECE9 | 主要文字、選中狀態底色 |
| `text-muted` | `--muted` | #5E6A64 | #98A59F | 次要文字 |
| `border-line` | `--line` | #D2D7D2 | #2A3430 | 線條、未選中邊框 |
| `bg-accent` | `--accent` | #6B2D3C | #E09AA8 | 原岩酒紅：完攀、進度、開關 |
| `bg-accent-soft` | `--accent-soft` | 酒紅 14% | 粉 18% | 完攀標籤底色、月曆第 1 級 |
| `bg-blush` | `--blush` | #F6E3DF | #2A1C1F | 平面圖完成度 0% 的顏色 |
| `text-warn` | `--warn` | #B4471F | #F08A5D | 7 天內換線、刪除、危險按鈕 |
| （平面圖側面） | `--plan-shade` | #000000 | #66726C | 立體平面圖方塊、地板側面的混色（深色模式混灰，完成度低的深色方塊側面也看得到） |
| `bg-flash` | `--flash` | #F5B700 | #F5B700 | Flash |
| `text-flash-ink` | `--flash-ink` | #2B2100 | #2B2100 | Flash 黃底上的文字 |

**岩點色**（`HOLD_COLORS`，順序＝後台色盤順序，一排 6 色剛好兩排）：紅 #D7263D、橙 #F28A1E、黃 #F4D03F、綠 #2E9E5B、藍 #2F6FD6、紫 #7B3FB5、粉 #F07BB5、咖啡 #7B4B2A、黑 #1A1A1A、白 #FAFAFA、灰 #8E9196、蒂芬妮 #81D8D0。黃、白、粉、蒂芬妮的標記用深色字（`holdTextColor()`），其他用白字。新增顏色要同時改資料庫的 `routes_hold_color_check`（migration）。

**平面圖完成度**：`color-mix(accent (18 + 完成比例×72)%, blush)`。

**各館顏色**（凡是要分館的地方都用這組，例如換線行事曆、我的紀錄的路線進度）：`lib/gyms.ts` 的 `GYM_COLORS`，照各店標準色（明德 #6D3540、萬華 #6959B2、中和 #01BCB5、南港 #066D6A、新店 #006382、中壢 #304562）；色塊上的字用 `inkOn()` 自動選深字或白字。

**難度色帶**：膠帶顏色用 `gradeColor`，色塊加一圈 30% ink 細框（深色模式的黑色膠帶也看得到）；還沒定顏色的 V9、V10 和上攀用虛線框。同一個難度合成一段、寫條數；所有區域用同一個比例，路線多的牆色帶比較長。選了難度時，範圍內的段保持粗、其他縮成細線；整區沒有這個難度就把縮圖變灰、區名變淡（字不要整張透明，淺色模式會看不清楚）。上攀為主的館（抱石少於一半）不顯示抱石的難度分布和四格。有上攀（含長耐力）路線的館多一張上攀難度分布（`RopeChart`，上攀沒有膠帶顏色，長條用主色）和上攀四格（`BandPicker` 給 `bands=ROPE_BANDS`：入門 5.9 以下／進階 5.10／挑戰 5.11+，沒有小色條）；抱石和上攀同時只篩一種。

Spray Wall 圈圈顏色：`--hold-start`（起攀 S）、`--hold-mid`（路線點）、`--hold-top`（完攀 T），只用在照片上的圈圈。

## 字體

| Tailwind | 字型 | 字重 | 用途 |
|---|---|---|---|
| `font-sans`（預設） | Noto Sans TC | 400、500、700、900 | 所有中文 |
| `font-num` | Barlow Condensed | 600、700 | 數字、難度（V5）、日期數字、Flash |

## 字級

| Tailwind | 大小／行高 | 用途 |
|---|---|---|
| `text-title` | 30 / 1.15，900 | 頁面大標 |
| `text-sheet` | 22，700 | 面板標題 |
| `text-section` | 17，700 | 區塊標題、區域名稱 |
| `text-body` | 16 / 1.6 | 內文（預設） |
| `text-sub` | 15 | 副標、按鈕、分頁 |
| `text-note` | 14 | 表單標籤、提示 |
| `text-meta` | 13 | 路線資訊、小字 |
| `text-tiny` | 12 | 風格標籤、圖例 |

數字（搭配 `font-num font-bold`）：`text-num-sheet` 36（路線卡片難度）、`text-num-stat` 34（統計、累計）、`text-num-row` 32（路線列難度）、`text-num-card` 28（最新路線）、`text-num-reset` 26（換線倒數）、`text-num-bar` 20（長條圖）、`text-num-picker` 18（難度選擇）、`text-num-chip` 17（篩選）、`text-num-pin` 15（起步點標記）。

## 圓角

| Tailwind | px | 用途 |
|---|---|---|
| `rounded-full` | 全圓 | 膠囊按鈕、標籤、標記 |
| `rounded-t-sheet` | 22 | 底部面板上緣 |
| `rounded-plan` | 18 | 平面圖、即將上線框 |
| `rounded-card` | 16 | 區域卡片、管理設定框 |
| `rounded-tile` | 14 | 路線列、統計格、岩牆照片、狀態按鈕 |
| `rounded-btn` | 12 | 按鈕、留言、場館列、分頁 |
| `rounded-field` | 10 | 輸入框、三選一、評語框、縮圖 |
| `rounded-cell` | 8 | 月曆格、難度選擇 |
| `rounded-tape` | 3 | 色條 |

## 陰影

- `shadow-card`：`0 1px 2px rgba(20,32,27,.06), 0 4px 14px rgba(20,32,27,.06)`，深色模式為無
- `shadow-pin`：`0 1px 4px rgba(0,0,0,.45)`，起步點標記

## 間距與版面

- 內容最寬 560（`max-w-page`），左右 16，上 12，下 112（留給底部分頁）
- 手機主要尺寸 360–430；iPhone 瀏海和底部安全區域用 `env(safe-area-inset-*)`
- 卡片列表間距 10（區域）、8（路線、統計）；區塊標題上 30、下 12
- 可左右滑的列（篩選、最新路線）左右延伸到螢幕邊（`-mx-4 px-4`），隱藏捲軸
- 館首頁「所有區域」和區域頁的排列固定，見 CLAUDE.md「版型固定」（`tests/e2e/zone-bands.test.mjs` 會檢查區域頁由上而下的順序）

## 動畫

- 底部面板往上滑 0.22 秒（`animate-sheet`）
- 新增標記彈出 0.25 秒（`animate-pop`）
- 大滿貫兌換卡的條紋一直往右走 1.2 秒一輪（`animate-slam-stripe`；截圖的話不會動）
- 夥伴說話的泡泡、跳出來的夥伴從下面浮上來 0.3 秒（`animate-talk`）；Flash、破紀錄的彩帶往下掉 1.4 秒（`animate-confetti`，顏色是 Flash 黃加上岩點的紅、藍、綠、粉、白）
- 區域頁換區：新的區從滑的方向滑進來 0.2 秒（`animate-zone-next` 從右邊、`animate-zone-prev` 從左邊）；滑的時候內容跟著手指移、彈回 0.18 秒（`lib/swipe.ts`）
- 手機設定「減少動態效果」時以上都不播（`globals.css` 最下面），換區也不跟著手指移動
- 手機設定「減少動態」時關閉

## 共用元件（`components/ui/`）

| 檔案 | 元件 |
|---|---|
| `Card.tsx` | `Card`、`PageTitle`、`SectionTitle`、`Empty`、`Tip`、`BackLink` |
| `Button.tsx` | `Button`（default／primary／danger）、`LinkButton` |
| `Chip.tsx` | `ChipRow`（wrap：排不下就換行）、`Chip` |
| `Sheet.tsx` | `Sheet`（full：全螢幕，左上「‹」關閉、返回鍵只關面板，路線卡片用；bare：最上面不留空，內容放滿版照片）、`SheetTitle`、`SheetSub`、`SheetSection` |
| `ClimbDay.tsx` | `ClimbDay`（攀爬日膠囊：預設今天，點開今天／昨天／前天／📅 選日期；路線卡片按鈕上面）、`dayLabel` |
| `Form.tsx` | `Label`、`TextField`、`TextArea`、`Toggle`（disabled：處理中不能切）、`Segmented`（small：一排小膠囊）、`OptionGrid`（單選方塊、選填，再按一次取消；2 或 4 格一排，可加小字說明）、`MultiOptionGrid`（複選方塊、3 格一排，最多 max 個，選滿後其他格變淡按不了；影片型態用）、`Rating`（1–5 分）、`ColorPicker`、`GradePicker`、`TagPicker`、`Check` |
| `Route.tsx` | `Points`、`Grade`、`RouteTag`（小一號的路線標示：難度色塊＋「店名・區域・路線」，New~ 用）、`HoldDot`、`Tape`、`Tags`、`NewBadge`、`StatusBadge`、`StatusPicker`（compact：路線卡片一排小按鈕）、`RouteRow`（color 不給＝長耐力路線，不畫膠帶）、`RouteList`、`VideoCount`、`CommentCount`（路線列「幾天前」後面依序放影片數、留言數，有才放）、`SetterNote` |
| `Wall.tsx` | `WallPhoto`（`hideable`：左上角「隱藏路線／顯示路線」按鈕，只用在顧客區域頁；放大時加 `data-noswipe`，在照片上左右拖是拖照片、不換區）、`Pin`（`focus`：New~ 看路線跳過來的那一條，放大、黃圈閃三下）、`TempPin` |
| `Gym.tsx` | `ZoneCard`（難度色帶版：小縮圖、完成數、`GradeStrip`、難度範圍或篩選結果、換線倒數；guest 只寫條數）、`ZoneList`、`GradeStrip`（區域難度色帶）、`GradeChart`（全館難度分布）、`RopeChart`（館首頁的上攀難度分布：5.6–5.9 每級一根、5.10 以上 a–d 合成一根，主色；下面三段可以點）、`BandPicker`（全部／入門 VB–V2／進階 V3–V5／挑戰 V6+；`missing`：這裡沒有路線的那段變淡、點不了；`bands`、`all`：上攀用 `ROPE_BANDS`、「5.6–5.13」）、`BandSwatch`（難度段的三段小色條）、`ZoneGradeCard`（區域頁照片下面的「○○ 區難度」色帶卡：共幾條、`GradeStrip` 拉滿整個寬度、難度範圍；選了難度寫「V3–V5 有 ○ 條」）、`BandHeading`（區域頁路線分段標題：色條＋「入門 VB–V2」＋幾條）、`GoalLine`（快換線提醒）、`NewRouteRow`、`NewRouteCard`（color 不給就不畫色點）、`GymRow`（lines：館名下面的換線小字；tag 給空字串不顯示右邊的字）、`SoonBox`、`dueText`；`ZoneCard` 的 due 是換線（7 天內 warn）；`ZoneNav`（區域頁標題下面的上一區／下一區：左右兩個一樣寬的方框，上面小字「‹ 上一區」「下一區 ›」、下面區名，跟「‹ 館名」返回不一樣；第一區沒有左邊、最後一區沒有右邊（空著）；長名字截短、報讀唸完整名字；`focus` 用按鈕換區後焦點留在同一邊，沒有那一邊就停在另一邊）、`SwipeHint`（左右滑動時螢幕邊緣的深色膠囊，寫要去的那一區） |
| `Resets.tsx` | `ResetLines`（選館頁換線小字：換線中、剛換好 NEW、○ 天後換線）、`ResetMonth`（換線行事曆：一列一週，館的顏色長條，兩天跨兩格，點日期／色塊選日子）、`ResetDateRow`（日期＋名稱一列）、`GymDot`（館的顏色色票） |
| `FloorPlan.tsx` | `FloorPlan`（guest：每區寫條數、統一底色；換線不畫在平面圖上（不寫字、不畫虛線框，報讀照樣唸「○ 天後換線」）；有好幾層的館（南港）同一張卡片由上到下畫，每層上方標 1F、2F；區域名字沒改過寫簡稱，店長改過名字就寫新名字，依旁邊的空間縮小、放不下截短加「…」，見 `lib/floorplan.ts` 的 `planLabel`、`planText`）。右上角「立體／平面」切換，記在這支手機（`usePlanMode`），館首頁和管理後台一起換；立體（預設）是 2.5D 斜俯視建築模型（幾何在 `lib/plan25d.ts`）：方塊越高路線越多（後面的小區頂面會被擋掉超過 4 成時整張圖自動壓低）、照真的前後位置畫、頂面依完成度上色、側面混 `--plan-shade`、後牆半透明（門口留空）、櫃台是矮方塊，牆、櫃台、地上的字不擋點擊；區名正立、固定 13.5px（照卡片寬度換算），放在平面圖同樣的位置（區名在區裡面的跟著頂面浮上去），蓋到別區的方塊就挪到旁邊，太擠自動推開，離原本位置遠了加指引線，改過的長名字超過 5 個字寬截短；按鈕（鍵盤、報讀）是區名、照區域順序，鍵盤移到時有深色外框，方塊也能點；後台選中的方塊浮起來、區名變深色膠囊（不移動）；只跟平面圖有關的計算每張圖記起來，量到卡片寬度才畫 |
| `Like.tsx` | `LikeButton`（👍 讚：沒人按寫「讚」、有人按寫數字，按過變主色；沒有 onLike 只顯示讚數；`dark` 放黑底的全螢幕播放）、`LikeSpace`（跟讚按鈕一樣大的隱形空位，讚疊在整列按鈕上時先留位置）；留言、影片共用 |
| `Comments.tsx` | `CommentItem`（含 👍 按讚 LikeButton；刪除要按兩次；New~ 用：place 路線一行＋onOpen「看路線 ›」、clamp 最多 3 行）、`CommentList`、`CommentForm`、`ClosedNotice`、`PrivateHint` |
| `Spray.tsx` | `HoldMarks`（照片上的圈圈：起攀 S 綠、路線點 藍、完攀 T 紅；細框 1.5px＋外圈極細深色邊，兩指放大時框不變粗；S／T 標籤 15px）、`HoldLegend`、`HoldTools`（選種類與大小）、`SprayRow`、`RouteThumb`（列表縮圖，放大到路線範圍）、`PhotoThumb`（岩館路線自己照片的縮圖，整張裁正方形）、`HOLD_TYPES`、`HOLD_SIZES` |
| `Profile.tsx` | `Avatar`（暱稱第一個字）、`HexChart`（六角形能力表）、`ProfileCardView`（人物卡） |
| `Tabs.tsx` | `Tabs`（分頁：路線卡片的紀錄／影片／留言、New~ 的影片／留言、我的紀錄路線進度的牆上進度／我的進度） |
| `SortList.tsx` | `SortList`（拖曳排序，例如整理區域順序） |
| `Video.tsx` | 省流量：列表只放縮圖 `thumb`（`<img loading="lazy">`，沒有縮圖是 `bg-line` 灰色方塊＋▶），不放 `<video>`；`VideoViewer` 從列表點開的那支直接播，滑到別支先顯示縮圖和 ▶、按了才載入。`VideoRow`、`VideoList`（路線卡片影片分頁：一支一列，方形縮圖＋片長、心得、誰・攀爬日（沒有紀錄時「○ 天前分享」，`videoWhen`）、`VideoResult` 分享者紀錄、New~ 的哪條路線（`place`）、型態一行（`feel`，`feelTagText`）、身高・動作一行（`tags`）；有 `onLike` 時右下角 👍 讚（`likes`、`liked`，獨立按鈕疊在列上，按讚不播放；全螢幕播放在名字那一行））、`VideoStrip`（橫向滑動縮圖，後台用）、`VideoThumb`、`VideoViewer`（全螢幕播放，左右滑換支）、`VideoPickButton`、`PickedFile`、`VideoTrim`（顧客分享影片；VideoTrim 剪輯長度：預覽、▶ 播放選的這段、時間軸、開始／結束拉桿＋－／＋ 0.5 秒，最長 max 秒，結束不超過影片長度；disabled：處理中不能改） |
| `Stats.tsx` | `DailyBars`、`TrendBars`（使用狀況趨勢）、`MonthSwitcher`、`StatGrid`、`StatTile`、`Delta`、`CalendarHeat`、`MonthGradeChart`（我的紀錄本月完攀直條圖：每個難度一根、黃色那段是 Flash、難度下面膠帶色；點一根選它其他變淡；上攀用主色；沒有完攀只有其他紀錄的那根畫虛線、沒紀錄的變淡點不了）、`TotalRow`、`SetBox` |
| `Progress.tsx` | 我的紀錄「路線進度」：`GymLegend`（各館色點＋館名）、`GymBar`（依館分段的長條，各店標準色；`of` 是滿格幾條，`track` 灰底：牆上進度有、我的進度沒有）、`ProgressCard`（抱石／上攀一張卡片，標題用 h4；`mode="wall"` 牆上進度：右上「你完成 幾 / 幾 條」、下一行「★ 大滿貫 ○ 個難度」或「還沒有大滿貫」，每行「完成/總數」，全部完成寫「★ 大滿貫」；`mode="mine"` 我的進度：右上「累計完攀 幾 條」，每行「幾 條」，最多的難度畫滿；點一行展開各館數字，某館那個難度全部完成也加 ★；`slam`／`onSlam`：大滿貫兌換，那一行右邊換成「★ 兌換 ›」或「★ 已兌換」，展開和兌換是兩個按鈕）、`SlamStar`（大滿貫星星，Flash 黃） |
| `Account.tsx` | 帳號管理：`SuspendNotice`（被停權的人每頁上方的提示條，2A 案：酒紅細框、粉底，到哪天／還有幾天、原因、能做和不能做什麼；永久寫「帳號已停權」）、`AccountSummary`（後台帳號管理一個人：頭像、暱稱、@帳號、一行數量；`recent` 給了才顯示「先跟本人核對」最近完攀；`suspension`、按鈕放 children）、`SuspendedLine`（停權中：到哪天、原因、誰停的）、`ResetCodeBox`（櫃檯重設碼：大字 6 位數、倒數、請客人怎麼做）、`ToggleButton`（帳號管理的動作按鈕：按了展開、再按收起；`warn` 停權、刪帳號用警示色） |
| `Slam.tsx` | 大滿貫兌換：`SlamTicket`（兌換卡＝B 案票券＋C 案動態條紋和時間：上半段膠帶顏色＋大難度（沒有膠帶顏色用主色）、`LiveStripe`、QR code、兌換碼、`LiveClock`、撕線、暱稱／獎品／期限；`redeemed` 已兌換：上半段變灰、條紋停住、QR code 淡掉蓋章）、`QrCode`（SVG，白底，深色模式也是）、`LiveStripe`（膠帶色＋Flash 黃斜條紋一直往右走，`animate-slam-stripe`，減少動態時不動；`stopped` 灰色不動）、`LiveClock`（台北時間，秒在跳）、`SlamRedeemTag`（牆上進度那一行的「★ 兌換 ›」黃色膠囊／「★ 已兌換」） |
| `Insights.tsx` | 使用狀況數據分析：`HighlightCard`（本週重點：左邊主色大數字、一句話＋說明、右邊 ›，點了跳到那一段）、`MeterRow`／`MeterList`（一行橫條：名稱、長條、右邊數字；`muted` 灰色長條當比較用，例如「牆上」對「完攀」）、`SplitBar`（加起來是全部的分段長條，主色深→淺→線色三段，下面圖例寫人數）、`InsightPill`（路線標記：hard 主色淡底「可能太難」、easy 黃底「可能太簡單」、plain 灰底「冷門、偏硬偏軟」）、`InsightRouteRow`（路線分析的一行：難度、名稱、數字、右邊標記，跟熱門路線同樣子；有 `onClick` 時整行可點、最右邊 ›） |
| `Mascot.tsx` | 原岩夥伴（六館 logo 的動物，圖在 `lib/mascot-art.ts`、資料在 `lib/mascots.ts`）：`MascotArt`（夥伴圖，部位顏色用 CSS 變數 `--m1`…換；`troll` 幹話模式加刀疤和棒棒糖）、`MascotAvatar`（圓形頭像，淡館色底；null＝還在讀，空的圓）、`UserAvatar`（某個人的頭像，自動讀那個人的夥伴和這支手機的幹話模式；留言、影片名字前面）、`CharacterTop`（人物卡上半段角色卡：背景色、大夥伴、右上角名字）、`MascotPicker`（選夥伴，三隻一排，還沒開放的館寫「即將登場」點不了）、`MascotColors`（每個部位一排色票、卡片背景六館標準色、換回原本的顏色）、`MascotBubble`（頁面上面夥伴的泡泡：館首頁、區域頁、我的紀錄，✕ 關掉）、`MascotBuddyView`（右下角小夥伴：點牠說話，泡泡上「🤫 閉嘴」）、`MascotToastView`（做了事情夥伴從上面跳出來，背景是夥伴的卡片背景色、白字（跟角色卡一樣，背景都是深的館色）；party 撒彩帶）。頁面最下面留 10rem＋iPhone 底部橫條，最後一列不被底部分頁和小夥伴擋住夥伴本身的顏色、背景色是資料（跟各館顏色一樣），不另外配色 |
| `Share.tsx` | 分享到 IG：`ShareButton`（酒紅細框膠囊＋相機圖示；路線卡片記錄後、我的紀錄、分享影片完成後）、`ShareOffer`（分享影片完成後的提示框：灰底、一行說明＋`ShareButton`＋小字）、`SharePicker`（勾選要放的資料，10/16 使用者選 A 案：「背景｜資料」用 `Tabs`，3 欄大方塊，圖示＋名稱，勾了酒紅框淡酒紅底加 ✓；選項和預設在 `lib/share-options.ts`）、`SharePreview`（底部面板，`picker` 放在預覽下面、`action` 給影片「套用並處理」：先顯示「製作中 ○%」，做好放預覽圖，再按「分享到 IG」叫出手機分享選單；叫不出就變成「存○○到手機」）。分享出去的圖在 `lib/share-cards.ts` 用 canvas 畫（1080×1920，固定用淺色模式的顏色、膠帶色、各店標準色、原岩夥伴的顏色，不跟著手機深色模式變） |
| `Log.tsx` | `LogList`、`LogRow`（操作紀錄） |
| `Endurance.tsx` | `NumberMarks`（長耐力路線照順序的點：細圈＋號碼，第 1 點綠、最後一點紅、中間藍；放大照片時線和號碼不變粗；reached 之後的點變淡；onTap 編輯時點圈圈刪點，號碼點不到＝點在照片上）、`HighpointPicker`（最高爬到第幾點：－／拉桿／＋，最多到倒數第 2 點，下面大字「30 ／ 38 點」） |
| `Grant.tsx` | `GrantList`、`GrantRow`（授權名單的一個人：暱稱、帳號）、`GrantGroup`（一組權限：小標＋膠囊，按下去＝有權限，再按一次取消；營運分頁老闆用） |
| `HowTo.tsx` | `HowTo`（「怎麼看」說明：第一次展開，按「知道了」收成一行，記在這支手機） |
| `Toast.tsx` | `ToastProvider`、`useToast` |
| `Icon.tsx` | `Icon`（flash、send、project、chat、lock、down、video、play） |

頁面層級：`components/Header.tsx`（Logo＋場館切換；管理後台不給館，只有 Logo）、`components/TabBar.tsx`（底部分頁：館內路線、New~、人物卡、我的紀錄，員工多「管理後台」，老闆和被授權的人多「營運」；五、六個分頁時間距縮小，360 寬也排得下一行；六個分頁時「管理後台」寫成「後台」）、`components/LoginGate.tsx`（要先登入的頁面：沒登入顯示說明和登入按鈕）、`components/ErrorScreen.tsx`（出錯、找不到頁面的中文畫面）。

篩選鈕：頁面上的長篩選（難度、顏色）用 `ChipRow` 左右滑；面板裡選項不多（只出現有用到的，例如影片的身高、動作、型態）用 `ChipRow wrap` 換行排，不要左右滑（窄手機會把後面的選項整顆藏起來，看不出還有）。

刪除、清除、移除、下架這類不能復原的操作一律按兩次：第一次按鈕文字變成「確定○○？再按一次」（列表裡空間小的只寫「確定下架？」；Spray Wall 岩友路線是跳提示「再按一次確認」）。
