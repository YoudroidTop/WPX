import { ListTree, X } from 'lucide-react';
import type { WordHeadingItem } from './types';
import type { Editor } from '@tiptap/react';

interface WordOutlineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  headings: WordHeadingItem[];
  editor: Editor | null;
}

export default function WordOutlineDrawer({
  isOpen,
  onClose,
  headings,
  editor,
}: WordOutlineDrawerProps) {
  if (!isOpen) return null;

  function handleHeadingClick(pos: number) {
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos).run();
    // Scroll into view if needed
    const domNode = editor.view.nodeDOM(pos);
    if (domNode instanceof HTMLElement) {
      domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  return (
    <div
      className="word-outline-drawer"
      style={{
        width: 220,
        background: '#fcfdfa',
        borderRight: '1px solid #e0e5dc',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100%',
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #e2e8dc',
          background: '#f4f7f2',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#334433' }}>
          <ListTree size={16} color="#1b784d" />
          <span>文档大纲</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#7a8b79' }}
        >
          <X size={15} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {headings.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9aaa96', textAlign: 'center', padding: '24px 8px' }}>
            暂无标题大纲
            <div style={{ fontSize: 11, marginTop: 4 }}>设置「标题1/2/3」后在此生成层级目录</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {headings.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleHeadingClick(item.pos)}
                style={{
                  border: 0,
                  background: 'transparent',
                  textAlign: 'left',
                  padding: '5px 8px',
                  paddingLeft: 8 + (item.level - 1) * 12,
                  fontSize: item.level === 1 ? 13 : 12,
                  fontWeight: item.level === 1 ? 600 : 400,
                  color: item.level === 1 ? '#1b784d' : '#455544',
                  borderRadius: 4,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#edf4ea';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {item.text || '(无标题)'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
