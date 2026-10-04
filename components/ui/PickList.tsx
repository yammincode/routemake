// 搜尋結果清單：點一列選取（例如指派員工時選人）；tag 顯示在右邊（例如「已是定線長」）
export function PickList({
  items,
  value,
  onPick,
}: {
  items: readonly { id: string; title: string; sub?: string; tag?: string }[];
  value?: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <ul className="m-0 mt-2 grid list-none gap-px overflow-hidden rounded-tile bg-line p-0 shadow-card">
      {items.map((it) => (
        <li key={it.id}>
          <button
            aria-pressed={value === it.id}
            onClick={() => onPick(it.id)}
            className="flex w-full items-center justify-between gap-2 bg-surface px-4 py-3 text-left aria-pressed:bg-sunk"
          >
            <span className="min-w-0">
              <b className="block truncate">{it.title}</b>
              {it.sub && <small className="text-meta text-muted">{it.sub}</small>}
            </span>
            {it.tag && <small className="flex-none text-meta text-muted">{it.tag}</small>}
          </button>
        </li>
      ))}
    </ul>
  );
}
