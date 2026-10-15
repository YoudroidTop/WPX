import React, { useState, useRef, useEffect } from 'react';
import { Search, Check } from 'lucide-react';

export const SYSTEM_FONTS = [
  { name: '宋体', family: 'SimSun, "Songti SC", serif' },
  { name: '微软雅黑', family: '"Microsoft YaHei", -apple-system, sans-serif' },
  { name: '楷体', family: 'KaiTi, "Kaiti SC", STKaiti, serif' },
  { name: '黑体', family: 'SimHei, "Heiti SC", sans-serif' },
  { name: '仿宋', family: 'FangSong, "Fangsong SC", STFangsong, serif' },
  { name: '冬青黑体', family: '"Hiragino Sans GB", "冬青黑体简体中文", sans-serif' },
  { name: '苹方', family: '"PingFang SC", sans-serif' },
  { name: '思源黑体', family: '"Source Han Sans CN", sans-serif' },
  { name: '华文楷体', family: 'STKaiti, KaiTi, serif' },
  { name: '华文宋体', family: 'STSong, SimSun, serif' },
  { name: '华文仿宋', family: 'STFangsong, FangSong, serif' },
  { name: 'Arial', family: 'Arial, sans-serif' },
  { name: 'Calibri', family: 'Calibri, sans-serif' },
  { name: 'Times New Roman', family: '"Times New Roman", serif' },
];

interface FontDropdownProps {
  currentFont?: string;
  onSelect: (fontFamily: string) => void;
  trigger: React.ReactNode;
}

export default function SheetFontDropdown({
  currentFont = '微软雅黑',
  onSelect,
  trigger,
}: FontDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  const filtered = SYSTEM_FONTS.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase().trim()),
  );

  function handlePick(item: { name: string; family: string }) {
    onSelect(item.family);
    setOpen(false);
  }

  return (
    <div className={`sheet-dropdown-container ${open ? 'is-open' : ''}`} ref={containerRef}>
      <div className="dropdown-trigger-wrapper" onClick={() => setOpen(!open)}>
        {trigger}
      </div>

      {open && (
        <div className="font-dropdown-popover">
          {/* Top search box */}
          <div className="font-search-box">
            <Search size={13} />
            <input
              autoFocus
              placeholder="搜索字体..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="font-list-scroll">
            {/* Recently used */}
            {!searchTerm && (
              <>
                <div className="font-group-label">最近使用</div>
                {SYSTEM_FONTS.slice(0, 2).map((item) => {
                  const isSelected =
                    currentFont === item.name || currentFont.includes(item.name);
                  return (
                    <button
                      key={`recent-${item.name}`}
                      type="button"
                      className={`font-item-btn ${isSelected ? 'active' : ''}`}
                      style={{ fontFamily: item.family }}
                      onClick={() => handlePick(item)}
                    >
                      {isSelected && <Check size={14} className="font-check-icon" />}
                      <span>{item.name}</span>
                    </button>
                  );
                })}
                <div className="palette-divider" />
                <div className="font-group-label">推荐字体</div>
              </>
            )}

            {filtered.map((item) => {
              const isSelected =
                currentFont === item.name || currentFont.includes(item.name);
              return (
                <button
                  key={item.name}
                  type="button"
                  className={`font-item-btn ${isSelected ? 'active' : ''}`}
                  style={{ fontFamily: item.family }}
                  onClick={() => handlePick(item)}
                >
                  {isSelected && <Check size={14} className="font-check-icon" />}
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
