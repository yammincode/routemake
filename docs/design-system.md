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
| `bg-flash` | `--flash` | #F5B700 | #F5B700 | Flash |
| `text-flash-ink` | `--flash-ink` | #2B2100 | #2B2100 | Flash 黃底上的文字 |

**岩點色**（`HOLD_COLORS`）：紅 #D7263D、橙 #F28A1E、黃 #F4D03F、綠 #2E9E5B、藍 #2F6FD6、紫 #7B3FB5、粉 #F07BB5、黑 #1A1A1A、白 #FAFAFA。黃、白、粉的標記用深色字（`holdTextColor()`）。

**平面圖完成度**：`color-mix(accent (18 + 完成比例×72)%, blush)`。

**各館顏色**（換線行事曆）：`lib/gyms.ts` 的 `GYM_COLORS`，照各店標準色（明德 #6D3540、萬華 #6959B2、中和 #01BCB5、南港 #066D6A、新店 #006382、中壢 #304562）；色塊上的字用 `inkOn()` 自動選深字或白字。

**難度色帶**：膠帶顏色用 `gradeColor`，色塊加一圈 30% ink 細框（深色模式的黑色膠帶也看得到）；還沒定顏色的 V9、V10 和上攀用虛線框。同一個難度合成一段、寫條數；所有區域用同一個比例，路線多的牆色帶比較長。選了難度時，範圍內的段保持粗、其他縮成細線；整區沒有這個難度就把縮圖變灰、區名變淡（字不要整張透明，淺色模式會看不清楚）。上攀為主的館（抱石少於一半）不顯示難度分布和篩選。

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

## 動畫

- 底部面板往上滑 0.22 秒（`animate-sheet`）
- 新增標記彈出 0.25 秒（`animate-pop`）
- 手機設定「減少動態」時關閉

## 共用元件（`components/ui/`）

| 檔案 | 元件 |
|---|---|
| `Card.tsx` | `Card`、`PageTitle`、`SectionTitle`、`Empty`、`Tip`、`BackLink` |
| `Button.tsx` | `Button`（default／primary／danger）、`LinkButton` |
| `Chip.tsx` | `ChipRow`（wrap：排不下就換行）、`Chip` |
| `Sheet.tsx` | `Sheet`、`SheetTitle`、`SheetSub`、`SheetSection` |
| `Form.tsx` | `Label`、`TextField`、`TextArea`、`Toggle`、`Segmented`（small：一排小膠囊）、`OptionGrid`（單選方塊、選填，再按一次取消；2 或 4 格一排，可加小字說明）、`Rating`（1–5 分）、`ColorPicker`、`GradePicker`、`TagPicker`、`Check` |
| `Route.tsx` | `Points`、`Grade`、`HoldDot`、`Tape`、`Tags`、`NewBadge`、`StatusBadge`、`StatusPicker`（compact：路線卡片一排小按鈕）、`RouteRow`、`RouteList`、`CommentCount`、`SetterNote` |
| `Wall.tsx` | `WallPhoto`（`hideable`：左上角「隱藏路線／顯示路線」按鈕，只用在顧客區域頁）、`Pin`、`TempPin` |
| `Gym.tsx` | `ZoneCard`（難度色帶版：小縮圖、完成數、`GradeStrip`、難度範圍或篩選結果、換線倒數；guest 只寫條數）、`ZoneList`、`GradeStrip`（區域難度色帶）、`GradeChart`（全館難度分布）、`BandPicker`（全部／入門 VB–V2／進階 V3–V5／挑戰 V6+）、`GoalLine`（快換線提醒）、`NewRouteRow`、`NewRouteCard`、`GymRow`（lines：館名下面的換線小字；tag 給空字串不顯示右邊的字）、`SoonBox`、`dueText`；`ZoneCard` 的 due 是換線（7 天內 warn） |
| `Resets.tsx` | `ResetLines`（選館頁換線小字：換線中、剛換好 NEW、○ 天後換線）、`ResetMonth`（換線行事曆：一列一週，館的顏色長條，兩天跨兩格，點日期／色塊選日子）、`ResetDateRow`（日期＋名稱一列）、`GymDot`（館的顏色色票） |
| `FloorPlan.tsx` | `FloorPlan`（guest：每區寫條數、統一底色；7 天內換線只畫虛線框，不寫字；有好幾層的館（南港）同一張卡片由上到下畫，每層上方標 1F、2F；區域名字沒改過寫簡稱，店長改過名字就寫新名字，太長自動縮小，見 `lib/floorplan.ts` 的 `planLabel`、`planFontSize`） |
| `Comments.tsx` | `CommentItem`（含 👍 按讚；刪除要按兩次）、`CommentList`、`CommentForm`、`ClosedNotice`、`PrivateHint` |
| `Spray.tsx` | `HoldMarks`（照片上的圈圈：起攀 S 綠、路線點 藍、完攀 T 紅）、`HoldLegend`、`HoldTools`（選種類與大小）、`SprayRow`、`RouteThumb`（列表縮圖，放大到路線範圍）、`HOLD_TYPES`、`HOLD_SIZES` |
| `Profile.tsx` | `Avatar`（暱稱第一個字）、`HexChart`（六角形能力表）、`ProfileCardView`（人物卡） |
| `Tabs.tsx` | `Tabs`（路線卡片的紀錄／影片／留言分頁） |
| `SortList.tsx` | `SortList`（拖曳排序，例如整理區域順序） |
| `Video.tsx` | `VideoRow`、`VideoList`（路線卡片影片分頁：一支一列，方形縮圖＋片長、說明、誰・多久前、`VideoResult` 分享者紀錄、身高・動作）、`VideoStrip`（橫向滑動縮圖，後台用）、`VideoThumb`、`VideoViewer`（全螢幕播放，左右滑換支）、`VideoPickButton`、`PickedFile`（顧客分享影片） |
| `Stats.tsx` | `DailyBars`、`TrendBars`（使用狀況趨勢）、`MonthSwitcher`、`StatGrid`、`StatTile`、`Delta`、`CalendarHeat`、`GradeBars`、`TotalRow`、`SetBox` |
| `Log.tsx` | `LogList`、`LogRow`（操作紀錄） |
| `Grant.tsx` | `GrantList`、`GrantRow`（授權名單的一個人：暱稱、帳號）、`GrantGroup`（一組權限：小標＋膠囊，按下去＝有權限，再按一次取消；營運分頁老闆用） |
| `HowTo.tsx` | `HowTo`（「怎麼看」說明：第一次展開，按「知道了」收成一行，記在這支手機） |
| `Toast.tsx` | `ToastProvider`、`useToast` |
| `Icon.tsx` | `Icon`（flash、send、project、chat、lock、down、video、play） |

頁面層級：`components/Header.tsx`（Logo＋場館切換；管理後台不給館，只有 Logo）、`components/TabBar.tsx`（底部分頁：館內路線、人物卡、我的紀錄，員工多「管理後台」，老闆和被授權的人多「營運」；五個分頁時間距縮小，360 寬也排得下一行）、`components/LoginGate.tsx`（要先登入的頁面：沒登入顯示說明和登入按鈕）、`components/ErrorScreen.tsx`（出錯、找不到頁面的中文畫面）。

篩選鈕：頁面上的長篩選（難度、顏色）用 `ChipRow` 左右滑；面板裡選項不多（7 顆以內，例如影片的身高、動作）用 `ChipRow wrap` 換行排，不要左右滑（窄手機會把後面的選項整顆藏起來，看不出還有）。

刪除、清除、移除、下架這類不能復原的操作一律按兩次：第一次按鈕文字變成「確定○○？再按一次」（列表裡空間小的只寫「確定下架？」；Spray Wall 岩友路線是跳提示「再按一次確認」）。
