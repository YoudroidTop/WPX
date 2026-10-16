import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Table2, Plus, Trash2 } from 'lucide-react';

interface WordTableGridPickerProps {
  onInsertTable: (rows: number, cols: number) => void;
  isInTable?: boolean;
  onAddRowBefore?: () => void;
  onAddRowAfter?: () => void;
  onAddColBefore?: () => void;
  onAddColAfter?: () => void;
  onDeleteRow?: () => void;
  onDeleteCol?: () => void;
  onDeleteTable?: () => void;
}

export default function WordTableGridPicker({
  onInsertTable,
  isInTable,
  onAddRowBefore,
  onAddRowAfter,
  onAddColBefore,
  onAddColAfter,
  onDeleteRow,
  onDeleteCol,
  onDeleteTable,
}: WordTableGridPickerProps) {
  const [open, setOpen] = useState(false);
  const [hoverRows, setHoverRows] = useState(3);
  const [hoverCols, setHoverCols] = useState(3);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function updatePos() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPos({
          top: rect.bottom + 4,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 260)),
        });
      }
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    return () => window.removeEventListener('resize', updatePos);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        className={`ribbon-icon-btn ${isInTable ? 'active' : ''}`}
        title="表格"
        aria-label="表格"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Table2 size={16} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            className="word-table-picker-popover"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
              background: '#ffffff',
              border: '1px solid #dce4d5',
              borderRadius: 6,
              boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
              padding: 10,
              width: 200,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: '#334433', marginBottom: 6 }}>
              插入表格 ({hoverRows} × {hoverCols})
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: 3,
                marginBottom: 8,
              }}
              onMouseLeave={() => {
                setHoverRows(1);
                setHoverCols(1);
              }}
            >
              {Array.from({ length: 6 }).map((_, r) =>
                Array.from({ length: 8 }).map((_, c) => {
                  const active = r < hoverRows && c < hoverCols;
                  return (
                    <div
                      key={`${r}-${c}`}
                      onMouseEnter={() => {
                        setHoverRows(r + 1);
                        setHoverCols(c + 1);
                      }}
                      onClick={() => {
                        onInsertTable(r + 1, c + 1);
                        setOpen(false);
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        border: '1px solid',
                        borderColor: active ? '#1b784d' : '#d8ded3',
                        background: active ? '#e4f0dc' : '#f8faf6',
                        cursor: 'pointer',
                        borderRadius: 2,
                      }}
                    />
                  );
                }),
              )}
            </div>

            {isInTable && (
              <div style={{ borderTop: '1px solid #e5ebe0', paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: '#7a8b79', marginBottom: 4, fontWeight: 500 }}>
                  当前表格操作
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      onAddRowBefore?.();
                      setOpen(false);
                    }}
                    style={{ fontSize: 11, padding: '4px 6px', textAlign: 'left', background: '#f5f7f3', border: '1px solid #dce4d5', borderRadius: 3, cursor: 'pointer' }}
                  >
                    + 上方插入行
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddRowAfter?.();
                      setOpen(false);
                    }}
                    style={{ fontSize: 11, padding: '4px 6px', textAlign: 'left', background: '#f5f7f3', border: '1px solid #dce4d5', borderRadius: 3, cursor: 'pointer' }}
                  >
                    + 下方插入行
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddColBefore?.();
                      setOpen(false);
                    }}
                    style={{ fontSize: 11, padding: '4px 6px', textAlign: 'left', background: '#f5f7f3', border: '1px solid #dce4d5', borderRadius: 3, cursor: 'pointer' }}
                  >
                    + 左侧插入列
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddColAfter?.();
                      setOpen(false);
                    }}
                    style={{ fontSize: 11, padding: '4px 6px', textAlign: 'left', background: '#f5f7f3', border: '1px solid #dce4d5', borderRadius: 3, cursor: 'pointer' }}
                  >
                    + 右侧插入列
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteRow?.();
                      setOpen(false);
                    }}
                    style={{ fontSize: 11, padding: '4px 6px', textAlign: 'left', background: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', borderRadius: 3, cursor: 'pointer' }}
                  >
                    - 删除行
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteCol?.();
                      setOpen(false);
                    }}
                    style={{ fontSize: 11, padding: '4px 6px', textAlign: 'left', background: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', borderRadius: 3, cursor: 'pointer' }}
                  >
                    - 删除列
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTable?.();
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    fontSize: 11,
                    padding: '4px 6px',
                    background: '#fff1f0',
                    border: '1px solid #ffa39e',
                    color: '#cf1322',
                    borderRadius: 3,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <Trash2 size={12} /> 删除整表
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
