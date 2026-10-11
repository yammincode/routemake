// 左右滑動換頁（區域頁換區）：只管手勢，換頁、畫面由呼叫的人決定
// 1. 手指移動 10px 後才決定方向：左右（|dx| ≥ 1.5 |dy|）才算滑動，上下、斜斜的都當捲動，這一次就不管了
// 2. 確定是左右滑之後擋掉捲動（iPhone 斜斜滑會順便捲一點、Android 下拉重新整理），內容跟著手指移一點
// 3. 放開時：滑超過 1/6 螢幕（60–90px），或至少 30px 而且很快（放開前 0.1 秒每毫秒 0.5px 以上）才換；
//    停一下才放開不算快；放開前正在往回拉（或方向反過來）不算
// 4. 不算的：螢幕最左、最右 24px（iPhone、Android 的返回手勢）、兩指（縮放照片）、長按（選字）、
//    可以左右捲的東西上（篩選列）、照片放大時（data-noswipe）、輸入框、整頁被放大時、系統手勢打斷（touchcancel）
// 5. 手機設定「減少動態效果」：內容不跟著手指移動，放開直接換
export type SwipeDir = "prev" | "next"; // prev：往右滑（看左邊的上一頁）；next：往左滑

const EDGE = 24;
const LOCK = 10;
const RATIO = 1.5;
const LONG_PRESS = 450;
const FLICK_MIN = 30;
const FLICK_SPEED = 0.5;
const BACK_SPEED = 0.15; // 放開前往回拉超過這個速度（px/ms）就不換
const commitDistance = () => Math.min(90, Math.max(60, window.innerWidth / 6));

export type SwipeOptions = {
  can: (d: SwipeDir) => boolean; // 那個方向有沒有下一頁
  onCommit: (d: SwipeDir) => void;
  onLock?: (d: SwipeDir | null) => void; // 開始左右滑（顯示提示）／結束（null）
  moving: () => HTMLElement | null; // 跟著手指移動的元素
};

// 在 root 上聽手指；回傳取消的函式。opts 用 getter 拿，換頁後不用重新綁
export function attachSwipe(root: HTMLElement, opts: () => SwipeOptions): () => void {
  type Gesture = { x0: number; y0: number; t0: number; sy0: number; lock: "h" | "v" | null; dir: SwipeDir; dx: number; samples: { x: number; t: number }[] };
  let g: Gesture | null = null;
  let aborted = false; // 這一次（到手指全部離開前）都不算
  let raf = 0;
  let unsettle: (() => void) | null = null; // 還在彈回的動畫：下一次滑的時候先收掉，免得計時器把新的位置清掉
  const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const paint = (dx: number | null, settle = false) => {
    cancelAnimationFrame(raf);
    unsettle?.();
    const el = opts().moving();
    if (!el) return;
    if (dx == null || reduce()) {
      if (settle && el.style.transform && !reduce()) {
        // 彈回原位，動畫完再拿掉樣式
        el.style.transition = "transform 0.18s ease-out";
        el.style.transform = "translateX(0px)";
        const timer = setTimeout(() => done(), 260);
        const off = () => {
          clearTimeout(timer);
          el.removeEventListener("transitionend", done);
          unsettle = null;
        };
        const done = () => {
          off();
          el.style.transition = el.style.transform = el.style.willChange = "";
        };
        el.addEventListener("transitionend", done);
        unsettle = off;
      } else el.style.transition = el.style.transform = el.style.willChange = "";
      return;
    }
    raf = requestAnimationFrame(() => {
      const d: SwipeDir = dx < 0 ? "next" : "prev";
      // 那邊沒有頁：只晃一點點，讓人知道到底了
      const amt = opts().can(d) ? dx * 0.35 : Math.max(-24, Math.min(24, dx * 0.12));
      el.style.transition = "";
      el.style.willChange = "transform";
      el.style.transform = `translateX(${amt.toFixed(1)}px)`;
    });
  };
  const stop = (settle: boolean) => {
    const locked = g?.lock === "h";
    g = null;
    paint(null, settle);
    if (locked) opts().onLock?.(null);
  };
  const abort = () => {
    aborted = true;
    stop(false);
  };

  // 從手指按的地方往上找，有不該滑的東西就不算
  const blocked = (target: EventTarget | null, x: number) => {
    if (x < EDGE || x > window.innerWidth - EDGE) return true;
    if ((window.visualViewport?.scale ?? 1) > 1.01) return true;
    for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
      if (el.matches("input, textarea, select, [contenteditable], [data-noswipe], [role=dialog]")) return true;
      const ox = getComputedStyle(el).overflowX;
      if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) return true;
    }
    return false;
  };

  // 手指按著的東西中途被換掉（例如「讀取中…」換成照片）：之後的移動、放開只會送到那個已經不在畫面上的東西，
  // 不會傳到 root；所以也聽那個東西本身，等它不在 root 裡面了才由它轉過來
  let unfollow = () => {};
  const follow = (target: EventTarget | null) => {
    unfollow();
    if (!(target instanceof Node)) return;
    const gone = () => !root.contains(target);
    const mv = (e: Event) => gone() && onMove(e as TouchEvent);
    const en = (e: Event) => gone() && onEnd(e as TouchEvent);
    const cc = () => gone() && onCancel();
    target.addEventListener("touchmove", mv, { passive: false });
    target.addEventListener("touchend", en, { passive: true });
    target.addEventListener("touchcancel", cc, { passive: true });
    unfollow = () => {
      target.removeEventListener("touchmove", mv);
      target.removeEventListener("touchend", en);
      target.removeEventListener("touchcancel", cc);
      unfollow = () => {};
    };
  };

  const onStart = (e: TouchEvent) => {
    if (e.touches.length > 1) return abort();
    // 上一次沒收到放開：先收掉
    if (g) stop(false);
    aborted = false;
    const t = e.touches[0];
    if (blocked(e.target, t.clientX)) {
      g = null;
      return;
    }
    follow(e.target);
    g = { x0: t.clientX, y0: t.clientY, t0: e.timeStamp, sy0: window.scrollY, lock: null, dir: "next", dx: 0, samples: [{ x: t.clientX, t: e.timeStamp }] };
  };
  const onMove = (e: TouchEvent) => {
    if (!g || aborted) return;
    if (e.touches.length > 1) return abort();
    const t = e.touches[0];
    const dx = t.clientX - g.x0;
    const dy = t.clientY - g.y0;
    if (!g.lock) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK) return;
      // 按住不動一陣子才移動：在選字，不算
      if (e.timeStamp - g.t0 > LONG_PRESS) {
        g = null;
        return;
      }
      g.lock = Math.abs(dx) >= RATIO * Math.abs(dy) ? "h" : "v";
      if (g.lock === "v") return;
      g.dir = dx < 0 ? "next" : "prev";
      opts().onLock?.(g.dir);
    }
    if (g.lock !== "h") return;
    if (e.cancelable) e.preventDefault();
    g.dx = dx;
    g.samples.push({ x: t.clientX, t: e.timeStamp });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 100) g.samples.shift();
    paint(dx);
  };
  const onEnd = (e: TouchEvent) => {
    if (e.touches.length > 0) return; // 還有手指在螢幕上（兩指的時候已經取消了）
    unfollow();
    const gg = g;
    const wasAborted = aborted;
    aborted = false;
    if (!gg || wasAborted || gg.lock !== "h") return stop(true);
    const dir: SwipeDir = gg.dx < 0 ? "next" : "prev";
    // 放開前 0.1 秒的速度（從那時候到放開；停住不動就是 0）
    const recent = gg.samples.filter((s) => e.timeStamp - s.t <= 100);
    const s0 = recent[0];
    const s1 = recent[recent.length - 1];
    const speed = s0 && s1 !== s0 ? (s1.x - s0.x) / Math.max(1, e.timeStamp - s0.t) : 0;
    const far = Math.abs(gg.dx) >= commitDistance();
    const flick = Math.abs(gg.dx) >= FLICK_MIN && Math.sign(speed) === Math.sign(gg.dx) && Math.abs(speed) >= FLICK_SPEED;
    const back = Math.sign(speed) === -Math.sign(gg.dx) && Math.abs(speed) >= BACK_SPEED;
    const still = Math.abs(window.scrollY - gg.sy0) <= 10;
    const selecting = !(window.getSelection()?.isCollapsed ?? true);
    if (dir === gg.dir && (far || flick) && !back && still && !selecting && opts().can(dir)) {
      stop(false);
      opts().onCommit(dir);
    } else stop(true);
  };
  const onCancel = () => {
    unfollow();
    aborted = false;
    stop(true);
  };

  root.addEventListener("touchstart", onStart, { passive: true });
  root.addEventListener("touchmove", onMove, { passive: false });
  root.addEventListener("touchend", onEnd, { passive: true });
  root.addEventListener("touchcancel", onCancel, { passive: true });
  return () => {
    cancelAnimationFrame(raf);
    unsettle?.();
    unfollow();
    root.removeEventListener("touchstart", onStart);
    root.removeEventListener("touchmove", onMove);
    root.removeEventListener("touchend", onEnd);
    root.removeEventListener("touchcancel", onCancel);
  };
}
