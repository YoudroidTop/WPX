import { ChevronDown } from 'lucide-react';
import { SYSTEM_FONTS } from '../sheet/SheetFontDropdown';

export const CHINESE_FONT_SIZES = [
  { label: '初号', pt: '42' },
  { label: '小初', pt: '36' },
  { label: '一号', pt: '26' },
  { label: '小一', pt: '24' },
  { label: '二号', pt: '22' },
  { label: '小二', pt: '18' },
  { label: '三号', pt: '16' },
  { label: '小三', pt: '15' },
  { label: '四号', pt: '14' },
  { label: '小四', pt: '12' },
  { label: '五号', pt: '10.5' },
  { label: '小五', pt: '9' },
  { label: '8', pt: '8' },
  { label: '9', pt: '9' },
  { label: '10', pt: '10' },
  { label: '11', pt: '11' },
  { label: '12', pt: '12' },
  { label: '14', pt: '14' },
  { label: '16', pt: '16' },
  { label: '18', pt: '18' },
  { label: '20', pt: '20' },
  { label: '22', pt: '22' },
  { label: '24', pt: '24' },
  { label: '26', pt: '26' },
  { label: '28', pt: '28' },
  { label: '36', pt: '36' },
  { label: '48', pt: '48' },
  { label: '72', pt: '72' },
];

export const STEP_FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 15, 16, 18, 20, 22, 24, 26, 36, 42, 48, 72];

export function WordFontSelector({
  currentFont,
  onSelectFont,
}: {
  currentFont: string;
  onSelectFont: (font: string) => void;
}) {
  return (
    <div className="word-select-wrapper" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        aria-label="字体"
        value={currentFont}
        onChange={(e) => onSelectFont(e.target.value)}
        style={{
          height: 28,
          fontSize: 12,
          padding: '0 20px 0 6px',
          border: '1px solid #dce4d5',
          borderRadius: 4,
          background: '#ffffff',
          color: '#344239',
          outline: 'none',
          cursor: 'pointer',
          minWidth: 100,
        }}
      >
        <option value="">默认字体</option>
        {SYSTEM_FONTS.map((font) => (
          <option key={font.name} value={font.name} style={{ fontFamily: font.family }}>
            {font.name}
          </option>
        ))}
      </select>
      <ChevronDown size={13} style={{ position: 'absolute', right: 5, pointerEvents: 'none', color: '#7a8b79' }} />
    </div>
  );
}

export function WordSizeSelector({
  currentSize,
  onSelectSize,
}: {
  currentSize: string;
  onSelectSize: (pt: string) => void;
}) {
  const displayLabel = CHINESE_FONT_SIZES.find((item) => item.pt === currentSize)?.label ?? currentSize;

  return (
    <div className="word-select-wrapper" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        aria-label="字号"
        value={currentSize}
        onChange={(e) => onSelectSize(e.target.value)}
        style={{
          height: 28,
          fontSize: 12,
          padding: '0 18px 0 6px',
          border: '1px solid #dce4d5',
          borderRadius: 4,
          background: '#ffffff',
          color: '#344239',
          outline: 'none',
          cursor: 'pointer',
          minWidth: 62,
        }}
      >
        {CHINESE_FONT_SIZES.map((item, idx) => (
          <option key={`${item.pt}-${idx}`} value={item.pt}>
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} style={{ position: 'absolute', right: 4, pointerEvents: 'none', color: '#7a8b79' }} />
    </div>
  );
}
