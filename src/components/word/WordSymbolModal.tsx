import { useState } from 'react';
import { X } from 'lucide-react';

const SYMBOL_CATEGORIES = [
  {
    title: '常用货币',
    symbols: ['¥', '$', '€', '£', '₽', '₩', '₿', '¢', 'HK$', 'NT$'],
  },
  {
    title: '数学符号',
    symbols: ['±', '×', '÷', '=', '≠', '≈', '≤', '≥', '∑', '√', '∞', 'π', '∫', '²', '³', '%', '‰', '°', '∠', '⊥', '△'],
  },
  {
    title: '标点与序号',
    symbols: ['—', '…', '·', '“', '”', '‘', '’', '「', '」', '『', '』', '【', '】', '《', '》', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'],
  },
  {
    title: '特殊标记与箭头',
    symbols: ['©', '®', '™', '§', '¶', '★', '☆', '✓', '✕', '▲', '▼', '◆', '◇', '➔', '➜', '←', '→', '↑', '↓', '↔'],
  },
];

export default function WordSymbolModal({
  isOpen,
  onClose,
  onInsertSymbol,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsertSymbol: (sym: string) => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 440,
          background: '#ffffff',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #e2e8dc',
            background: '#f8faf6',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#2d3b2e' }}>插入特殊符号</div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#687865' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Header */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e6ece0', background: '#fafcf9', padding: '0 12px' }}>
          {SYMBOL_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.title}
              type="button"
              onClick={() => setActiveTab(idx)}
              style={{
                border: 0,
                background: 'transparent',
                padding: '8px 12px',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: activeTab === idx ? 600 : 400,
                color: activeTab === idx ? '#1b784d' : '#5b6c59',
                borderBottom: activeTab === idx ? '2px solid #1b784d' : '2px solid transparent',
              }}
            >
              {cat.title}
            </button>
          ))}
        </div>

        {/* Symbols Grid */}
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
          {SYMBOL_CATEGORIES[activeTab].symbols.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => {
                onInsertSymbol(sym);
                onClose();
              }}
              style={{
                height: 38,
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#ffffff',
                border: '1px solid #dce4d5',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.1s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#1b784d';
                e.currentTarget.style.background = '#f0f7ec';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#dce4d5';
                e.currentTarget.style.background = '#ffffff';
              }}
            >
              {sym}
            </button>
          ))}
        </div>

        <div style={{ padding: '8px 16px', background: '#f8faf6', borderTop: '1px solid #e8ede3', fontSize: 11, color: '#889985' }}>
          点击符号即可直接插入到光标所在处
        </div>
      </div>
    </div>
  );
}
