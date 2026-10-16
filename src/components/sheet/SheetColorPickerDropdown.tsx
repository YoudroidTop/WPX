import React, { useState, useRef, useEffect } from 'react';
import { Pipette } from 'lucide-react';

// Standard Office 10x6 Theme Color Palette
export const THEME_COLOR_MATRIX: string[][] = [
  // Row 1: Base colors
  ['#ffffff', '#000000', '#eeece1', '#1f497d', '#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646'],
  // Row 2: 80% lighter
  ['#f2f2f2', '#7f7f7f', '#ddd9c3', '#c6d9f0', '#dbe5f1', '#f2dcdb', '#ebf1dd', '#e5e0ec', '#dbeef3', '#fdeada'],
  // Row 3: 60% lighter
  ['#d8d8d8', '#595959', '#c4bd97', '#8db3e2', '#b8cce4', '#e5b9b7', '#d7e3bc', '#ccc1d9', '#b7dde8', '#fbd5b5'],
  // Row 4: 40% lighter
  ['#bfbfbf', '#3f3f3f', '#938953', '#548dd4', '#95b3d7', '#d99694', '#c3d69b', '#b2a2c7', '#92cddc', '#fac08f'],
  // Row 5: 25% darker
  ['#a5a5a5', '#262626', '#494429', '#17365d', '#366092', '#953734', '#76933c', '#5f497a', '#31859b', '#e36c09'],
  // Row 6: 50% darker
  ['#7f7f7f', '#0c0c0c', '#1d1b10', '#0f243e', '#244061', '#632423', '#4f6228', '#3f3151', '#205867', '#974806'],
];

// Standard 10 high-saturation colors
export const STANDARD_COLORS: string[] = [
  '#c00000',
  '#ff0000',
  '#ffc000',
  '#ffff00',
  '#92d050',
  '#00b050',
  '#00b0f0',
  '#0070c0',
  '#002060',
  '#7030a0',
];

interface ColorPickerDropdownProps {
  type: 'color' | 'fill';
  currentColor?: string;
  usedColors?: string[];
  onChange: (hex: string | undefined) => void;
  trigger: React.ReactNode;
}

export default function SheetColorPickerDropdown({
  type,
  currentColor,
  usedColors = [],
  onChange,
  trigger,
}: ColorPickerDropdownProps) {
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

  function handleSelect(color: string | undefined) {
    onChange(color);
    setOpen(false);
  }

  // Deduplicate and filter used colors
  const filteredUsedColors = Array.from(new Set(usedColors.filter(Boolean))).slice(0, 10);

  return (
    <div className={`sheet-dropdown-container ${open ? 'is-open' : ''}`} ref={containerRef}>
      <div className="dropdown-trigger-wrapper" onClick={() => setOpen(!open)}>
        {trigger}
      </div>

      {open && (
        <div className="color-palette-popover">
          {/* Top special option */}
          {type === 'fill' ? (
            <button
              type="button"
              className={`color-special-btn no-color-btn ${!currentColor ? 'selected' : ''}`}
              onClick={() => handleSelect(undefined)}
            >
              <span className="no-color-slash" />
              无填充颜色
            </button>
          ) : (
            <button
              type="button"
              className={`color-special-btn auto-color-btn ${!currentColor || currentColor.toLowerCase() === '#000000' ? 'selected' : ''}`}
              onClick={() => handleSelect('#000000')}
            >
              <span className="auto-color-swatch" />
              自动 (纯黑)
            </button>
          )}

          {/* Theme colors */}
          <div className="palette-section-title">主题颜色</div>
          <div className="theme-color-grid">
            {THEME_COLOR_MATRIX.map((row, rIdx) => (
              <div key={rIdx} className="theme-color-row">
                {row.map((hex, cIdx) => (
                  <button
                    key={cIdx}
                    type="button"
                    className={`color-swatch-btn ${currentColor?.toLowerCase() === hex ? 'selected' : ''}`}
                    style={{ backgroundColor: hex }}
                    title={hex}
                    onClick={() => handleSelect(hex)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Standard colors */}
          <div className="palette-section-title">标准色</div>
          <div className="standard-color-row">
            {STANDARD_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`color-swatch-btn ${currentColor?.toLowerCase() === hex ? 'selected' : ''}`}
                style={{ backgroundColor: hex }}
                title={hex}
                onClick={() => handleSelect(hex)}
              />
            ))}
          </div>

          {/* Used colors */}
          {filteredUsedColors.length > 0 && (
            <>
              <div className="palette-section-title">
                {type === 'fill' ? '文档已使用填充颜色' : '文档已使用字体颜色'}
              </div>
              <div className="used-color-row">
                {filteredUsedColors.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className="color-swatch-btn"
                    style={{ backgroundColor: hex }}
                    title={hex}
                    onClick={() => handleSelect(hex)}
                  />
                ))}
              </div>
            </>
          )}

          <div className="palette-divider" />

          {/* Native custom color picker */}
          <label className="more-colors-btn">
            <Pipette size={14} />
            <span>其他颜色...</span>
            <input
              type="color"
              value={currentColor ?? (type === 'fill' ? '#ffffff' : '#000000')}
              onChange={(e) => handleSelect(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
