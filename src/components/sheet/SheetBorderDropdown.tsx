import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, Grid } from 'lucide-react';
import type { SheetCellStyle } from '../../../shared/documents';

export const BORDER_OPTIONS = [
  { id: 'none', label: '无边框', hasBorder: false },
  { id: 'all', label: '所有框线', hasBorder: true },
  { id: 'outside', label: '外侧框线', hasBorder: true },
  { id: 'thick-outside', label: '粗外侧框线', hasBorder: true },
  { id: 'double-bottom', label: '双底框线', hasBorder: true },
  { id: 'bottom', label: '下框线', hasBorder: true },
  { id: 'top', label: '上框线', hasBorder: true },
  { id: 'left', label: '左框线', hasBorder: true },
  { id: 'right', label: '右框线', hasBorder: true },
] as const;

interface BorderDropdownProps {
  currentBorder?: boolean;
  currentStyle?: SheetCellStyle;
  onApplyBorder?: (type: string) => void;
  onChange?: (hasBorder: boolean) => void;
  trigger: React.ReactNode;
}

export function resolveActiveBorderPreset(
  currentStyle?: SheetCellStyle,
  currentBorder?: boolean,
): string {
  if (!currentStyle) return currentBorder ? 'all' : 'none';
  if (currentStyle.border) return 'all';
  const { borderTop, borderBottom, borderLeft, borderRight } = currentStyle;
  if (borderTop && borderBottom && borderLeft && borderRight) return 'outside';
  if (borderTop && !borderBottom && !borderLeft && !borderRight) return 'top';
  if (borderBottom && !borderTop && !borderLeft && !borderRight) return 'bottom';
  if (borderLeft && !borderTop && !borderBottom && !borderRight) return 'left';
  if (borderRight && !borderTop && !borderBottom && !borderLeft) return 'right';
  if (!borderTop && !borderBottom && !borderLeft && !borderRight) return 'none';
  return '';
}

export default function SheetBorderDropdown({
  currentBorder,
  currentStyle,
  onApplyBorder,
  onChange,
  trigger,
}: BorderDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: PointerEvent | MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener('pointerdown', handleClickOutside, true);
    }
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside, true);
    };
  }, [open]);

  const activePreset: string = useMemo(
    () => resolveActiveBorderPreset(currentStyle, currentBorder),
    [currentStyle, currentBorder],
  );

  function handleSelect(id: string) {
    if (onApplyBorder) {
      onApplyBorder(id);
    } else if (onChange) {
      onChange(id !== 'none');
    }
    setOpen(false);
  }

  return (
    <div className={`sheet-dropdown-container ${open ? 'is-open' : ''}`} ref={containerRef}>
      <div className="dropdown-trigger-wrapper" onClick={() => setOpen(!open)}>
        {trigger}
      </div>

      {open && (
        <div className="border-popover">
          {/* Row 1: Common border presets */}
          <div className="border-icons-row">
            <button
              type="button"
              className={`border-preset-btn ${activePreset === 'none' ? 'active' : ''}`}
              title="无边框"
              onClick={() => handleSelect('none')}
            >
              <div className="border-icon border-icon-none" />
              <span>无边框</span>
            </button>

            <button
              type="button"
              className={`border-preset-btn ${activePreset === 'all' ? 'active' : ''}`}
              title="所有框线 (全边框)"
              onClick={() => handleSelect('all')}
            >
              <div className="border-icon border-icon-all" />
              <span>所有框线</span>
            </button>

            <button
              type="button"
              className={`border-preset-btn ${activePreset === 'outside' ? 'active' : ''}`}
              title="外侧框线"
              onClick={() => handleSelect('outside')}
            >
              <div className="border-icon border-icon-outside" />
              <span>外侧框线</span>
            </button>

            <button
              type="button"
              className={`border-preset-btn ${activePreset === 'thick-outside' ? 'active' : ''}`}
              title="粗外侧框线"
              onClick={() => handleSelect('thick-outside')}
            >
              <div className="border-icon border-icon-thick-outside" />
              <span>粗外侧框线</span>
            </button>

            <button
              type="button"
              className={`border-preset-btn ${activePreset === 'double-bottom' ? 'active' : ''}`}
              title="双底框线"
              onClick={() => handleSelect('double-bottom')}
            >
              <div className="border-icon border-icon-double-bottom" />
              <span>双底框线</span>
            </button>
          </div>

          {/* Row 2: Directional borders */}
          <div className="border-icons-row">
            <button
              type="button"
              className={`border-preset-btn ${activePreset === 'bottom' ? 'active' : ''}`}
              title="下框线"
              onClick={() => handleSelect('bottom')}
            >
              <div className="border-icon border-icon-bottom" />
              <span>下框线</span>
            </button>

            <button
              type="button"
              className={`border-preset-btn ${activePreset === 'top' ? 'active' : ''}`}
              title="上框线"
              onClick={() => handleSelect('top')}
            >
              <div className="border-icon border-icon-top" />
              <span>上框线</span>
            </button>

            <button
              type="button"
              className={`border-preset-btn ${activePreset === 'left' ? 'active' : ''}`}
              title="左框线"
              onClick={() => handleSelect('left')}
            >
              <div className="border-icon border-icon-left" />
              <span>左框线</span>
            </button>

            <button
              type="button"
              className={`border-preset-btn ${activePreset === 'right' ? 'active' : ''}`}
              title="右框线"
              onClick={() => handleSelect('right')}
            >
              <div className="border-icon border-icon-right" />
              <span>右框线</span>
            </button>
          </div>

          <div className="palette-divider" />

          {/* Bottom beautify */}
          <button
            type="button"
            className="border-beautify-btn"
            onClick={() => handleSelect('all')}
          >
            <Sparkles size={14} />
            <span>一键美化表格框线</span>
          </button>
        </div>
      )}
    </div>
  );
}
