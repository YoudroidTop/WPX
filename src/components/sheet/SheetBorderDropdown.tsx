import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Grid } from 'lucide-react';

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
  onChange: (hasBorder: boolean) => void;
  trigger: React.ReactNode;
}

export default function SheetBorderDropdown({
  currentBorder,
  onChange,
  trigger,
}: BorderDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleSelect(hasBorder: boolean) {
    onChange(hasBorder);
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
              className="border-preset-btn"
              title="无边框"
              onClick={() => handleSelect(false)}
            >
              <div className="border-icon border-icon-none" />
              <span>无边框</span>
            </button>

            <button
              type="button"
              className="border-preset-btn active"
              title="所有框线 (全边框)"
              onClick={() => handleSelect(true)}
            >
              <div className="border-icon border-icon-all" />
              <span>所有框线</span>
            </button>

            <button
              type="button"
              className="border-preset-btn"
              title="外侧框线"
              onClick={() => handleSelect(true)}
            >
              <div className="border-icon border-icon-outside" />
              <span>外侧框线</span>
            </button>

            <button
              type="button"
              className="border-preset-btn"
              title="粗外侧框线"
              onClick={() => handleSelect(true)}
            >
              <div className="border-icon border-icon-thick-outside" />
              <span>粗外侧框线</span>
            </button>

            <button
              type="button"
              className="border-preset-btn"
              title="双底框线"
              onClick={() => handleSelect(true)}
            >
              <div className="border-icon border-icon-double-bottom" />
              <span>双底框线</span>
            </button>
          </div>

          {/* Row 2: Directional borders */}
          <div className="border-icons-row">
            <button
              type="button"
              className="border-preset-btn"
              title="下框线"
              onClick={() => handleSelect(true)}
            >
              <div className="border-icon border-icon-bottom" />
              <span>下框线</span>
            </button>

            <button
              type="button"
              className="border-preset-btn"
              title="上框线"
              onClick={() => handleSelect(true)}
            >
              <div className="border-icon border-icon-top" />
              <span>上框线</span>
            </button>

            <button
              type="button"
              className="border-preset-btn"
              title="左框线"
              onClick={() => handleSelect(true)}
            >
              <div className="border-icon border-icon-left" />
              <span>左框线</span>
            </button>

            <button
              type="button"
              className="border-preset-btn"
              title="右框线"
              onClick={() => handleSelect(true)}
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
            onClick={() => handleSelect(true)}
          >
            <Sparkles size={14} />
            <span>一键美化表格框线</span>
          </button>
        </div>
      )}
    </div>
  );
}
