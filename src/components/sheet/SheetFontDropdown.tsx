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

export const DEFAULT_FONT = '微软雅黑';

/** Maps a stored font name to a CSS font stack; unknown names (e.g. from XLSX) pass through. */
export function fontStack(name?: string) {
  if (!name) return undefined;
  return SYSTEM_FONTS.find((f) => f.name === name)?.family ?? `"${name.replace(/"/g, '')}", sans-serif`;
}

const RECENT_KEY = 'wpx.sheet.recentFonts';
function readRecentFonts(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string').slice(0, 3) : [];
  } catch {
    return [];
  }
}
function rememberFont(name: string) {
  try {
    const next = [name, ...readRecentFonts().filter((n) => n !== name)].slice(0, 3);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode); recents are a convenience only.
  }
}

interface FontDropdownProps {
  currentFont?: string;
  onSelect: (fontFamily: string) => void;
  trigger: React.ReactNode;
}

export default function SheetFontDropdown({
  currentFont = DEFAULT_FONT,
  onSelect,
  trigger,
}: FontDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  const filtered = SYSTEM_FONTS.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase().trim()),
  );

  const recent = open
    ? readRecentFonts()
        .map((name) => SYSTEM_FONTS.find((f) => f.name === name))
        .filter((f): f is (typeof SYSTEM_FONTS)[number] => !!f)
    : [];

  function handlePick(item: { name: string; family: string }) {
    rememberFont(item.name);
    onSelect(item.name);
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
            {!searchTerm && recent.length > 0 && (
              <>
                <div className="font-group-label">最近使用</div>
                {recent.map((item) => {
                  const isSelected = currentFont === item.name;
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
              const isSelected = currentFont === item.name;
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
