import type { ReactNode } from "react";

// 說明文件頁（隱私權政策、留言與影片規範）的段落樣式
export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-section font-bold">{title}</h2>
      <div className="grid gap-2 text-sub leading-relaxed text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:m-0 [&_ul]:grid [&_ul]:gap-1 [&_ul]:p-0">{children}</div>
    </section>
  );
}

export function DraftNotice() {
  return <p className="mt-0 mb-4 rounded-btn bg-blush px-3.5 py-2.5 text-note text-accent">草稿：正式上線前由原岩確認內容。</p>;
}
