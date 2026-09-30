# 原岩攀岩館 路線 PWA

完整規格在 SPEC.md，畫面與互動參考 prototype/mingde-routes.html（單檔原型，用 localStorage 假資料）。
開發前先讀這兩個檔案；規格與原型衝突時，以 SPEC.md 為準。

## 工作方式
- 一次只做 SPEC.md「開發順序」的一個步驟，做完停下來，告訴我怎麼在手機上測試
- 動手前先列計畫，我同意後再寫程式
- 每個步驟完成後用 git commit，訊息用繁體中文
- 需要我提供的帳號、金鑰、檔案，直接列清單告訴我，不要自己編假的值
- 金鑰只放在 .env.local，不能 commit

## 技術規則
- Next.js（App Router）+ TypeScript + Tailwind CSS，PWA
- 後端只用 Supabase（Postgres、Auth 帳號名稱＋密碼登入、Storage），部署到 Netlify
- 登入用「帳號名稱＋密碼」，不發簡訊、不寄信：帳號轉成 {帳號}@users.routemake.local 給 Supabase Auth（Confirm email 關閉）
- 跟會員系統（Tupuser）完全分開：獨立的 Supabase 專案、帳號、資料表，不共用、不串接，也不引用會員系統的程式
- 所有資料表變更都寫成 supabase/migrations 裡的 migration 檔
- 每張表都要有 RLS，權限在資料庫擋，不能只靠前端隱藏
- 私人心得（ascents.private_note）只有本人讀得到，員工也不行
- 介面全部繁體中文，時區 Asia/Taipei，手機優先（寬 360–430px）
- 難度 V0–V10；紀錄狀態只有 flash（顯示 Flash）、send（完攀）、project（嘗試中）
- 配色沿用原型：主色原岩酒紅 #6B2D3C，Flash 黃色 #F5B700
- 畫面完全照原型：每一頁都用 docs/design-system.md 的設計規範和 components/ui/ 的共用元件，不在頁面裡另寫顏色、字級、圓角；新元件先加進 components/ui/ 和 /design 展示頁
