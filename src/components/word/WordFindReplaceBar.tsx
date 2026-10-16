import { useState } from 'react';
import { ChevronUp, ChevronDown, Replace, X } from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface WordFindReplaceBarProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

export default function WordFindReplaceBar({ isOpen, onClose, editor }: WordFindReplaceBarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);

  if (!isOpen || !editor) return null;

  function countMatches(term: string) {
    if (!term) {
      setMatchCount(null);
      return;
    }
    const text = editor!.getText();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = text.match(regex);
    setMatchCount(matches ? matches.length : 0);
  }

  function handleSearchChange(term: string) {
    setSearchTerm(term);
    countMatches(term);
  }

  function handleFindNext() {
    if (!searchTerm) return;
    const win = window as any;
    if (typeof window !== 'undefined' && win.find) {
      win.find(searchTerm, false, false, true, false, true, false);
    }
  }

  function handleFindPrev() {
    if (!searchTerm) return;
    const win = window as any;
    if (typeof window !== 'undefined' && win.find) {
      win.find(searchTerm, false, true, true, false, true, false);
    }
  }

  function handleReplace() {
    if (!searchTerm || !editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    if (selectedText.toLowerCase() === searchTerm.toLowerCase()) {
      editor.chain().focus().insertContentAt({ from, to }, replaceTerm).run();
      handleFindNext();
    } else {
      handleFindNext();
    }
    countMatches(searchTerm);
  }

  function handleReplaceAll() {
    if (!searchTerm || !editor) return;
    const { doc } = editor.state;
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let tr = editor.state.tr;
    let offset = 0;

    doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        let match;
        const nodeText = node.text;
        while ((match = regex.exec(nodeText)) !== null) {
          const start = pos + match.index + offset;
          const end = start + match[0].length;
          tr = tr.insertText(replaceTerm, start, end);
          offset += replaceTerm.length - match[0].length;
        }
      }
    });

    if (tr.docChanged) {
      editor.view.dispatch(tr);
    }
    setMatchCount(0);
  }

  return (
    <div
      className="word-find-replace-bar"
      style={{
        position: 'absolute',
        top: 8,
        right: 24,
        zIndex: 50,
        background: '#ffffff',
        border: '1px solid #dce4d5',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          placeholder="查找文本..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (e.shiftKey) handleFindPrev();
              else handleFindNext();
            }
          }}
          style={{
            height: 26,
            padding: '0 8px',
            fontSize: 12,
            border: '1px solid #dce4d5',
            borderRadius: 4,
            outline: 'none',
            width: 120,
          }}
        />
        {matchCount !== null && (
          <span style={{ fontSize: 11, color: matchCount > 0 ? '#1b784d' : '#cf1322', minWidth: 40 }}>
            {matchCount > 0 ? `${matchCount} 处` : '无匹配'}
          </span>
        )}
        <button
          type="button"
          onClick={handleFindPrev}
          title="上一个 (Shift+Enter)"
          style={{ border: 0, background: '#f0f4ec', borderRadius: 3, cursor: 'pointer', padding: '3px 4px', display: 'flex', alignItems: 'center' }}
        >
          <ChevronUp size={14} color="#455544" />
        </button>
        <button
          type="button"
          onClick={handleFindNext}
          title="下一个 (Enter)"
          style={{ border: 0, background: '#f0f4ec', borderRadius: 3, cursor: 'pointer', padding: '3px 4px', display: 'flex', alignItems: 'center' }}
        >
          <ChevronDown size={14} color="#455544" />
        </button>
      </div>

      <span style={{ width: 1, height: 16, background: '#e0e5dc' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          placeholder="替换为..."
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          style={{
            height: 26,
            padding: '0 8px',
            fontSize: 12,
            border: '1px solid #dce4d5',
            borderRadius: 4,
            outline: 'none',
            width: 100,
          }}
        />
        <button
          type="button"
          onClick={handleReplace}
          title="替换当前"
          style={{
            height: 26,
            padding: '0 6px',
            fontSize: 11,
            background: '#f4f7f2',
            border: '1px solid #dce4d5',
            borderRadius: 3,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Replace size={12} /> 替换
        </button>
        <button
          type="button"
          onClick={handleReplaceAll}
          title="全部替换"
          style={{
            height: 26,
            padding: '0 6px',
            fontSize: 11,
            background: '#f4f7f2',
            border: '1px solid #dce4d5',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          全部
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        title="关闭"
        style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2, color: '#7a8b79', marginLeft: 4 }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
