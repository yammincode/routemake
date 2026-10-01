import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/ui/Card";
import { DocSection, DraftNotice } from "@/components/ui/Doc";

export const metadata: Metadata = { title: "留言與影片規範 | 原岩路線" };

// 留言與影片分享規範（草稿）
export default function RulesPage() {
  return (
    <>
      <PageTitle sub="讓每個人都能自在地分享 beta">留言與影片規範</PageTitle>
      <DraftNotice />

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

      <DocSection title="違規處理">
        <ul>
          <li>定線長與店長可以刪除違反規範的留言和影片，刪除紀錄會保留在系統中。</li>
          <li>情節嚴重或多次違規，原岩可以關閉留言功能或停止帳號使用。</li>
          <li>每條路線、全館的留言與影片分享都可能因為管理需要暫時關閉。</li>
        </ul>
      </DocSection>

      <DocSection title="其他">
        <p className="m-0">
          留言和影片是公開的，所有人都看得到你的暱稱、留言和影片內容。個人資料的處理方式請見<Link href="/privacy" className="text-accent underline">隱私權政策</Link>。
        </p>
      </DocSection>
    </>
  );
}
