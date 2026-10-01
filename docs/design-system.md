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
| `Chip.tsx` | `ChipRow`、`Chip` |
| `Sheet.tsx` | `Sheet`、`SheetTitle`、`SheetSub`、`SheetSection` |
| `Form.tsx` | `Label`、`TextField`、`TextArea`、`Toggle`、`Segmented`、`ColorPicker`、`GradePicker`、`TagPicker`、`Check` |
| `Route.tsx` | `Points`、`Grade`、`HoldDot`、`Tape`、`Tags`、`NewBadge`、`StatusBadge`、`StatusPicker`、`RouteRow`、`RouteList`、`CommentCount`、`SetterNote` |
| `Wall.tsx` | `WallPhoto`、`Pin`、`TempPin` |
| `Gym.tsx` | `ZoneCard`、`ZoneList`、`ProgressBar`、`ResetList`、`NewRouteRow`、`NewRouteCard`、`GymRow`、`SoonBox`、`dueText` |
| `FloorPlan.tsx` | `FloorPlan` |
| `Comments.tsx` | `CommentItem`、`CommentList`、`CommentForm`、`ClosedNotice`、`PrivateHint` |
| `SortList.tsx` | `SortList`（拖曳排序，例如整理區域順序） |
| `Video.tsx` | `VideoItem`、`VideoList`、`VideoPickButton`、`PickedFile`（顧客分享影片） |
| `Stats.tsx` | `DailyBars`、`MonthSwitcher`、`StatGrid`、`StatTile`、`Delta`、`CalendarHeat`、`GradeBars`、`TotalRow`、`SetBox` |
| `Log.tsx` | `LogList`、`LogRow`（操作紀錄） |
| `Toast.tsx` | `ToastProvider`、`useToast` |
| `Icon.tsx` | `Icon`（flash、send、project、chat、lock、down、video） |

頁面層級：`components/Header.tsx`（Logo＋場館切換）、`components/TabBar.tsx`（底部三個分頁）。
