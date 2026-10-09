import Link from "next/link";
import { DocSection } from "@/components/ui/Doc";

// 隱私權政策、留言與影片規範的內文：/privacy、/rules 頁面和註冊頁的彈出面板共用
// onOpenDoc：在彈出面板裡時，兩份文件互相的連結改成切換面板內容（不離開註冊頁，打好的帳號密碼才不會不見）
type Doc = "privacy" | "rules";
function DocLink({ to, onOpenDoc, children }: { to: Doc; onOpenDoc?: (d: Doc) => void; children: string }) {
  if (onOpenDoc)
    return (
      <button type="button" onClick={() => onOpenDoc(to)} className="text-accent underline">
        {children}
      </button>
    );
  return (
    <Link href={`/${to}`} className="text-accent underline">
      {children}
    </Link>
  );
}

export function PrivacyContent({ onOpenDoc }: { onOpenDoc?: (d: Doc) => void }) {
  return (
    <>
      <p className="m-0 text-sub leading-relaxed">
        原岩攀岩館（以下稱「原岩」）提供「原岩路線」讓你查看館內路線、記錄攀爬。我們依照《個人資料保護法》蒐集、處理及利用你的資料，說明如下。
      </p>

      <DocSection title="我們蒐集哪些資料">
        <ul>
          <li>帳號資料：你設定的帳號名稱、密碼（加密儲存，原岩員工也看不到）、暱稱。</li>
          <li>攀爬紀錄：你記錄的 Flash／完攀／嘗試中、日期、感覺、難度體感。</li>
          <li>私人心得：你在紀錄裡寫的心得。</li>
          <li>公開留言：你在路線下的留言與發表時間。</li>
          <li>人物卡（選填）：自我介紹、攀岩年資、常去的館、自評能力；另外由你的完攀紀錄自動計算能力值、最高完攀難度與本月完攀數。</li>
          <li>分享的影片：你上傳的攀爬影片、說明文字、上傳時間與檔案大小，以及你自己選填的身高區間（例如 170–179 公分）和動作（動態／靜態）。影片可能拍到你的長相與聲音。</li>
          <li>使用紀錄：登入時間等系統自動產生的技術紀錄，用於維護安全；登入後每天記錄一次「今天有打開 App」與當時看的館，只用來統計使用人數，不會記錄你看了哪些頁面或路線。</li>
        </ul>
        <p className="m-0">我們不會要求你提供真實姓名、手機號碼、Email 或付款資料。</p>
      </DocSection>

      <DocSection title="誰看得到你的資料">
        <ul>
          <li>私人心得與攀爬紀錄：只有你自己看得到，原岩員工也看不到。</li>
          <li>暱稱、公開留言與分享的影片（含選填的身高區間、動作）：所有人都看得到（影片不用登入也能播放）。</li>
          <li>人物卡：預設只有你自己看得到，你打開「公開人物卡」後其他人才看得到；不會顯示你的攀爬時間、爬了哪些路線或私人心得。</li>
          <li>帳號名稱：其他使用者看不到；店長、老闆指派員工時，可以用暱稱或帳號名稱搜尋會員（只看得到暱稱與帳號名稱）。</li>
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
        <p className="m-0">本政策修改時會在此頁公告。相關規則請見<DocLink to="rules" onOpenDoc={onOpenDoc}>留言與影片規範</DocLink>。</p>
      </DocSection>

      <DocSection title="聯絡我們">
        <p className="m-0">原岩攀岩館（聯絡方式待補）</p>
      </DocSection>
    </>
  );
}

export function RulesContent({ onOpenDoc }: { onOpenDoc?: (d: Doc) => void }) {
  return (
    <>
      <DocSection title="歡迎這樣留言">
        <ul>
          <li>分享 beta、腳法、動作技巧。</li>
          <li>說說這條路線哪裡好玩、哪裡卡。</li>
          <li>回報岩點鬆動、轉動等安全問題（也請同時告訴櫃檯）。</li>
        </ul>
      </DocSection>

      <DocSection title="請不要這樣留言">
        <ul>
          <li>人身攻擊、嘲笑他人、歧視或騷擾。</li>
          <li>色情、暴力或違法內容。</li>
          <li>廣告、推銷、與攀岩無關的連結。</li>
          <li>公開他人的個人資料（姓名、電話、照片等）。</li>
          <li>冒充原岩員工或他人。</li>
        </ul>
      </DocSection>

      <DocSection title="分享影片">
        <ul>
          <li>只分享你自己在原岩攀爬的影片，每支最長 60 秒、50 MB 以內，每人每天最多 10 支。</li>
          <li>影片裡如果拍到其他人，上傳前要先取得他們同意；拍到小朋友請先問過家長。</li>
          <li>影片是公開的，不用登入也看得到；路線下架或整區換線時，那條路線的影片會自動刪除。</li>
          <li>你可以隨時刪除自己的影片；上面「請不要這樣留言」的規範也適用於影片。</li>
        </ul>
      </DocSection>

      <DocSection title="人物卡">
        <ul>
          <li>人物卡是讓大家知道「這位留言、分享影片的人」是怎樣的攀岩者，不是交友功能，App 沒有私訊、追蹤或加好友。</li>
          <li>人物卡預設不公開，你自己打開才會給別人看；隨時可以關閉。</li>
          <li>自我介紹不能放聯絡方式（網址、電話、LINE、IG 等），也不能有騷擾、歧視或冒犯的內容。</li>
          <li>請不要用人物卡打聽、追蹤或騷擾其他人。店長可以清除不當的自我介紹，嚴重時停止帳號使用。</li>
        </ul>
      </DocSection>

      <DocSection title="違規處理">
        <ul>
          <li>定線長與店長可以刪除違反規範的留言和影片，刪除紀錄會保留在系統中。</li>
          <li>情節嚴重或多次違規，原岩可以關閉留言功能或停止帳號使用。</li>
          <li>每條路線、全館的留言與影片分享都可能因為管理需要暫時關閉。</li>
        </ul>
      </DocSection>

      <DocSection title="其他">
        <p className="m-0">
          留言和影片是公開的，所有人都看得到你的暱稱、留言和影片內容。個人資料的處理方式請見<DocLink to="privacy" onOpenDoc={onOpenDoc}>隱私權政策</DocLink>。
        </p>
      </DocSection>
    </>
  );
}
