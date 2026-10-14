"use client";

// 👍 讚（留言、影片共用）：沒按過寫「讚」，有人按寫數字；按過變主色
// onLike 沒給時只顯示讚數（不能按）；dark：放在黑底（全螢幕播放）
export function LikeButton({ likes, liked, onLike, dark = false, className = "" }: { likes: number; liked: boolean; onLike?: () => void; dark?: boolean; className?: string }) {
  const tone = dark
    ? "border-white/35 text-white/85 aria-pressed:border-white aria-pressed:bg-white/20 aria-pressed:text-white"
    : "border-line text-muted aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent";
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? `收回讚，目前 ${likes} 個讚` : `按讚，目前 ${likes} 個讚`}
      disabled={!onLike}
      onClick={onLike}
      className={`inline-flex flex-none items-center gap-1 rounded-full border px-2.5 py-[3px] text-meta aria-pressed:font-bold disabled:border-transparent disabled:px-0 ${tone} ${className}`}
    >
      <LikeLabel likes={likes} />
    </button>
  );
}

function LikeLabel({ likes }: { likes: number }) {
  return (
    <>
      <span aria-hidden>👍</span>
      {likes > 0 ? <span className="font-num">{likes}</span> : "讚"}
    </>
  );
}

// 跟 LikeButton 一樣大的空位（看不見）：讚按鈕疊在別的按鈕上面時，先把位置留出來
export function LikeSpace({ likes }: { likes: number }) {
  return (
    <span aria-hidden className="invisible inline-flex flex-none items-center gap-1 rounded-full border px-2.5 py-[3px] text-meta font-bold">
      <LikeLabel likes={likes} />
    </span>
  );
}
