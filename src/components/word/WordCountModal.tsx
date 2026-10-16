import { X } from 'lucide-react';

interface WordStats {
  charsNoSpaces: number;
  charsWithSpaces: number;
  chineseChars: number;
  words: number;
  paragraphs: number;
}

export function computeWordStats(text: string, rawDoc?: any): WordStats {
  const charsWithSpaces = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z0-9_-]+/g) || []).length;
  const words = chineseChars + englishWords;
  
  // Count paragraphs from blocks or newlines
  let paragraphs = 0;
  if (rawDoc && Array.isArray(rawDoc.content)) {
    paragraphs = rawDoc.content.filter((n: any) => n.type === 'paragraph' || n.type === 'heading').length;
  }
  if (paragraphs === 0) {
    paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0).length || 1;
  }

  return {
    charsNoSpaces,
    charsWithSpaces,
    chineseChars,
    words,
    paragraphs,
  };
}

export default function WordCountModal({
  isOpen,
  onClose,
  stats,
}: {
  isOpen: boolean;
  onClose: () => void;
  stats: WordStats;
}) {
  if (!isOpen) return null;

  const items = [
    { label: '页数', value: '1 页' },
    { label: '中文字符', value: stats.chineseChars.toLocaleString() },
    { label: '单词数 (中文字+英文词)', value: stats.words.toLocaleString() },
    { label: '字符数 (计空格)', value: stats.charsWithSpaces.toLocaleString() },
    { label: '字符数 (不计空格)', value: stats.charsNoSpaces.toLocaleString() },
    { label: '段落数', value: stats.paragraphs.toLocaleString() },
  ];

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
          width: 360,
          background: '#ffffff',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          overflow: 'hidden',
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
          <div style={{ fontSize: 14, fontWeight: 600, color: '#2d3b2e' }}>字数统计</div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#687865' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  color: '#415244',
                  borderBottom: '1px dashed #e8eee4',
                  paddingBottom: 6,
                }}
              >
                <span>{item.label}</span>
                <span style={{ fontWeight: 600, color: '#1b784d' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '10px 16px', background: '#f8faf6', borderTop: '1px solid #e8ede3', textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              background: '#1b784d',
              color: '#ffffff',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
