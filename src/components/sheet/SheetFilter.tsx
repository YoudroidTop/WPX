import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { MAX_FILTER_HIDDEN_VALUES } from '../../../shared/documents';

interface FilterMenuProps {
  /** Header cell the menu hangs from, e.g. "B1". */
  address: string;
  columnLabel: string;
  values: string[];
  hidden: string[];
  grid: RefObject<HTMLDivElement | null>;
  onApply: (hidden: string[]) => void;
  onSort: (direction: 'asc' | 'desc') => void;
  onClose: () => void;
}

const label = (value: string) => (value === '' ? '(空白)' : value);

/** AutoFilter dropdown: sort, search and a checklist of the column's distinct values. */
export function FilterMenu({
  address,
  columnLabel,
  values,
  hidden,
  grid,
  onApply,
  onSort,
  onClose,
}: FilterMenuProps) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [checked, setChecked] = useState(() => {
    const excluded = new Set(hidden);
    return new Set(values.filter((v) => !excluded.has(v)));
  });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const query = search.trim().toLowerCase();
  const shown = useMemo(
    () => (query ? values.filter((v) => label(v).toLowerCase().includes(query)) : values),
    [values, query],
  );
  const allShownChecked = shown.length > 0 && shown.every((v) => checked.has(v));

  useLayoutEffect(() => {
    const cell = grid.current?.querySelector<HTMLElement>(`td[data-cell="${address}"]`);
    if (!cell) return onClose();
    const rect = cell.getBoundingClientRect();
    const width = 240;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.min(rect.bottom, window.innerHeight - 380),
    });
    const close = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const el = grid.current;
    window.addEventListener('pointerdown', close, true);
    el?.addEventListener('scroll', onClose, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', close, true);
      el?.removeEventListener('scroll', onClose);
    };
  }, [address, grid, onClose]);

  function toggle(value: string) {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleAll() {
    setChecked((previous) => {
      const next = new Set(previous);
      for (const value of shown) {
        if (allShownChecked) next.delete(value);
        else next.add(value);
      }
      return next;
    });
  }

  function apply() {
    // With a search active, only checked matches stay visible, like Excel.
    const visible = query
      ? shown.filter((v) => checked.has(v))
      : values.filter((v) => checked.has(v));
    if (!visible.length) return setError('请至少选择一项。');
    const keep = new Set(visible);
    const next = values.filter((v) => !keep.has(v));
    if (next.length > MAX_FILTER_HIDDEN_VALUES)
      return setError(
        `最多可隐藏 ${MAX_FILTER_HIDDEN_VALUES} 个不同的值，请改为勾选要显示的少量值。`,
      );
    onApply(next);
    onClose();
  }

  if (!position) return null;
  return createPortal(
    <div
      ref={ref}
      className="sheet-filter-menu"
      role="dialog"
      aria-label={`筛选 ${columnLabel}`}
      style={position}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="sheet-filter-sort">
        <button type="button" onClick={() => (onSort('asc'), onClose())}>
          升序 ↑
        </button>
        <button type="button" onClick={() => (onSort('desc'), onClose())}>
          降序 ↓
        </button>
      </div>
      <input
        autoFocus
        type="search"
        aria-label="搜索筛选值"
        placeholder="搜索"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply();
          }
        }}
      />
      <div className="sheet-filter-values">
        <label className="modal-checkbox">
          <input type="checkbox" checked={allShownChecked} onChange={toggleAll} />
          {query ? '(选择所有搜索结果)' : '(全选)'}
        </label>
        {shown.map((value) => (
          <label key={value} className="modal-checkbox">
            <input type="checkbox" checked={checked.has(value)} onChange={() => toggle(value)} />
            <span>{label(value)}</span>
          </label>
        ))}
        {!shown.length && <p className="sheet-filter-empty">无匹配项</p>}
      </div>
      {error && <p className="modal-warning">{error}</p>}
      <div className="modal-buttons">
        {hidden.length > 0 && (
          <button
            className="secondary"
            type="button"
            onClick={() => {
              onApply([]);
              onClose();
            }}
          >
            清除筛选
          </button>
        )}
        <button className="secondary" type="button" onClick={onClose}>
          取消
        </button>
        <button className="primary" type="button" onClick={apply}>
          确定
        </button>
      </div>
    </div>,
    document.body,
  );
}
