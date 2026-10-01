import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/ui/Card";
import { DocSection, DraftNotice } from "@/components/ui/Doc";

export const metadata: Metadata = { title: "隱私權政策 | 原岩路線" };

// 隱私權政策（草稿）：內容依本 App 實際收集的資料撰寫
export default function PrivacyPage() {
  return (
    <>
      <PageTitle sub="最後更新：2026 年 10 月">隱私權政策</PageTitle>
      <DraftNotice />
      <p className="m-0 text-sub leading-relaxed">
        原岩攀岩館（以下稱「原岩」）提供「原岩路線」讓你查看館內路線、記錄攀爬。我們依照《個人資料保護法》蒐集、處理及利用你的資料，說明如下。
      </p>

      <DocSection title="我們蒐集哪些資料">
        <ul>
          <li>帳號資料：你設定的帳號名稱、密碼（加密儲存，原岩員工也看不到）、暱稱。</li>
          <li>攀爬紀錄：你記錄的 Flash／完攀／嘗試中、日期、感覺、難度體感。</li>
          <li>私人心得：你在紀錄裡寫的心得。</li>
          <li>公開留言：你在路線下的留言與發表時間。</li>
          <li>分享的影片：你上傳的攀爬影片、說明文字、上傳時間與檔案大小。影片可能拍到你的長相與聲音。</li>
          <li>使用紀錄：登入時間等系統自動產生的技術紀錄，用於維護安全。</li>
        </ul>
        <p className="m-0">我們不會要求你提供真實姓名、手機號碼、Email 或付款資料。</p>
      </DocSection>

      <DocSection title="誰看得到你的資料">
        <ul>
          <li>私人心得與攀爬紀錄：只有你自己看得到，原岩員工也看不到。</li>
          <li>暱稱、公開留言與分享的影片：所有人都看得到（影片不用登入也能播放）。</li>
          <li>帳號名稱：其他使用者看不到；店長指派員工時可以用帳號名稱查詢暱稱。</li>
        </ul>
      </DocSection>

      <DocSection title="使用目的">
        <ul>
          <li>讓你記錄與查看自己的攀爬紀錄、每月統計。</li>
          <li>提供路線資訊、留言與影片交流。</li>
          <li>維護服務安全、處理違反留言與影片規範的內容。</li>
        </ul>
        <p className="m-0">我們不會將你的資料出售或提供給第三方做行銷使用。</p>
      </DocSection>

      <DocSection title="資料存放">
        <p className="m-0">
          資料存放在雲端資料庫服務 Supabase，傳輸過程加密。資料存在雲端，換手機或清除瀏覽器資料都不會遺失。為了讓你沒有網路時也能使用，App 會在你的手機暫存最近讀取的資料，登出時會清除。
        </p>
      </DocSection>

      <DocSection title="你的權利">
        <p className="m-0">
          你可以隨時查看、修改或刪除自己的紀錄、留言與影片。路線下架或整區換線時，那條路線的影片會自動刪除。如果想查詢、停止使用或刪除整個帳號，請洽原岩櫃檯，我們會在確認是本人後處理。
        </p>
      </DocSection>

      <DocSection title="政策修改">
        <p className="m-0">本政策修改時會在此頁公告。相關規則請見<Link href="/rules" className="text-accent underline">留言與影片規範</Link>。</p>
      </DocSection>

      <DocSection title="聯絡我們">
        <p className="m-0">原岩攀岩館（聯絡方式待補）</p>
      </DocSection>
    </>
  );
}
