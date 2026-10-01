// 分頁切換（路線卡片的「紀錄／影片／留言」）；count 顯示在名稱旁
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div role="tablist" className="mt-4 mb-3 grid auto-cols-fr grid-flow-col gap-1 rounded-field bg-sunk p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className="rounded-[9px] py-2 text-note font-medium text-muted aria-selected:bg-surface aria-selected:font-bold aria-selected:text-ink aria-selected:shadow-card"
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="ml-1 font-num">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
