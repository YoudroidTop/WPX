import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pipette } from 'lucide-react';
import { THEME_COLOR_MATRIX, STANDARD_COLORS } from '../sheet/SheetColorPickerDropdown';

const HIGHLIGHT_PRESETS = [
  { name: '无填充', color: undefined },
  { name: '明黄', color: '#fffb8f' },
  { name: '青绿', color: '#b7eb8f' },
  { name: '天蓝', color: '#91caff' },
  { name: '粉红', color: '#ffadd2' },
  { name: '浅紫', color: '#d3adf7' },
  { name: '橙黄', color: '#ffd591' },
  { name: '浅灰', color: '#f0f0f0' },
];

interface WordColorPickerDropdownProps {
  type: 'color' | 'highlight';
  currentColor?: string;
  onChange: (color: string | undefined) => void;
  trigger: React.ReactNode;
}

export default function WordColorPickerDropdown({
  type,
  currentColor,
  onChange,
  trigger,
}: WordColorPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function updatePos() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPos({
          top: rect.bottom + 4,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 240)),
        });
      }
    }
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
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

  function handleSelect(c?: string) {
    onChange(c);
    setOpen(false);
  }

  return (
    <div className="sheet-dropdown-container" ref={containerRef} style={{ display: 'inline-flex' }}>
      <div onClick={() => setOpen((prev) => !prev)}>{trigger}</div>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            className="sheet-color-picker-popover"
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
              width: 216,
            }}
          >
            {type === 'highlight' ? (
              <div className="color-section">
                <div style={{ fontSize: 11, color: '#7a8b79', marginBottom: 6, fontWeight: 500 }}>
                  高亮底色
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {HIGHLIGHT_PRESETS.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      title={item.name}
                      onClick={() => handleSelect(item.color)}
                      style={{
                        height: 26,
                        border: '1px solid #d0d7cd',
                        borderRadius: 3,
                        background: item.color || '#ffffff',
                        cursor: 'pointer',
                        fontSize: 10,
                        color: '#445544',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {!item.color ? '无' : ''}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="color-auto-btn"
                  onClick={() => handleSelect(undefined)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '5px 8px',
                    fontSize: 12,
                    textAlign: 'left',
                    background: '#f4f7f2',
                    border: '1px solid #dce4d5',
                    borderRadius: 4,
                    cursor: 'pointer',
                    marginBottom: 8,
                    color: '#2d3b2e',
                  }}
                >
                  自动（默认颜色）
                </button>
                <div style={{ fontSize: 11, color: '#7a8b79', marginBottom: 4, fontWeight: 500 }}>
                  主题颜色
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                  {THEME_COLOR_MATRIX.map((row, rIdx) => (
                    <div key={rIdx} style={{ display: 'flex', gap: 2 }}>
                      {row.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          title={hex}
                          onClick={() => handleSelect(hex)}
                          style={{
                            width: 17,
                            height: 15,
                            padding: 0,
                            border: currentColor === hex ? '1px solid #000' : '1px solid #e0e5dc',
                            background: hex,
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 11, color: '#7a8b79', marginBottom: 4, fontWeight: 500 }}>
                  标准颜色
                </div>
                <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                  {STANDARD_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      onClick={() => handleSelect(hex)}
                      style={{
                        width: 17,
                        height: 17,
                        padding: 0,
                        border: currentColor === hex ? '1px solid #000' : '1px solid #e0e5dc',
                        background: hex,
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: '#415244',
                    cursor: 'pointer',
                    paddingTop: 4,
                    borderTop: '1px solid #e9eee4',
                  }}
                >
                  <Pipette size={14} />
                  <span>更多自定义颜色...</span>
                  <input
                    type="color"
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                    value={currentColor || '#000000'}
                    onChange={(e) => handleSelect(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
