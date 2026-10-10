# 原岩攀岩館 路線 PWA

完整規格在 SPEC.md，畫面與互動參考 prototype/mingde-routes.html（單檔原型，用 localStorage 假資料）。
開發前先讀這兩個檔案；規格與原型衝突時，以 SPEC.md 為準。

## 工作方式
- 一次只做 SPEC.md「開發順序」的一個步驟，做完停下來，告訴我怎麼在手機上測試
- 動手前先列計畫，我同意後再寫程式
- 每個步驟完成後用 git commit，訊息用繁體中文
- 需要我提供的帳號、金鑰、檔案，直接列清單告訴我，不要自己編假的值
- 金鑰只放在 .env.local，不能 commit
- 試用版與正式版分開（說明在 docs/試用與上線.md）：
  - 平常只 push 到開發分支 claude/happy-goldberg-szmqwa，Netlify 不會部署（netlify.toml 的 ignore 只建置 main）
  - 修改集中做完再 push，不要一個小改動就 push
  - 使用者在自己電腦用 scripts/trial.ps1 跑試用版確認
  - 使用者說「更新正式版」時，才把開發分支合併到 main 並 push（這是唯一會部署的動作）
  - 每次更新正式版：先把 lib/version.ts 的版本號加 0.1、日期改成當天並 commit，測試通過後才合併到 main；回報時說明這次的版本號和改了什麼
- 驗收清單在 docs/驗收清單.md：每次新增或修改功能，同一個 commit 要更新清單裡對應的段落（自動測試、手機步驟、📱 只能真機確認的項目）
- 使用者說「更新正式版」時，先列出「這次改動的項目」（從驗收清單挑出這次改動相關的段落和受影響的 📱 項目）；新版本輪到「定期必跑」時（每 3 次更新一次，從 v2.2 起算：v2.5、v2.8、v3.1…，上次的版本號加 0.3），提醒上線後先跑驗收清單最上面的「定期必跑」，沒輪到就說這次不用跑
- 改到「定期必跑」裡的畫面（按鈕名稱、流程）時，同一個 commit 要更新「定期必跑」
- push 前跑 npm run test:db、npm run build、npm run test:e2e，全部通過才 push；新功能要補測試（supabase/tests、tests/e2e）

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
