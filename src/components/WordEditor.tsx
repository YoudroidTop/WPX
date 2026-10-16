import { useState, useRef, useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';

import type { WordContent } from '../../shared/documents';
import WordRibbon from './word/WordRibbon';
import WordSymbolModal from './word/WordSymbolModal';
import WordCountModal, { computeWordStats } from './word/WordCountModal';
import WordFindReplaceBar from './word/WordFindReplaceBar';
import WordOutlineDrawer from './word/WordOutlineDrawer';
import type {
  WordRibbonTab,
  WordPageSettings,
  WordViewSettings,
  WordHeadingItem,
} from './word/types';

// Extend TextStyle to support custom fontSize and lineHeight
const CustomTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontSize?.replace('pt', ''),
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}pt` };
        },
      },
      lineHeight: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.lineHeight,
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.lineHeight) return {};
          return { style: `line-height: ${attributes.lineHeight}` };
        },
      },
    };
  },
});

export default function WordEditor({
  content,
  onChange,
}: {
  content: WordContent;
  onChange: (content: WordContent) => void;
}) {
  const [currentTab, setCurrentTab] = useState<WordRibbonTab>('home');
  const [formatPainterActive, setFormatPainterActive] = useState(false);
  const formatPainterMarks = useRef<{ marks: readonly any[]; attrs: any } | null>(null);

  // Modals state
  const [symbolModalOpen, setSymbolModalOpen] = useState(false);
  const [countModalOpen, setCountModalOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);

  // Page layout and appearance settings
  const [pageSettings, setPageSettings] = useState<WordPageSettings>({
    margin: 'normal',
    orientation: 'portrait',
    paperSize: 'a4',
    columns: 1,
    backgroundColor: '#ffffff',
    watermark: '',
  });

  // View settings
  const [viewSettings, setViewSettings] = useState<WordViewSettings>({
    showRuler: true,
    eyeCare: false,
    zoom: 1,
    zenMode: false,
    showOutline: false,
    readOnly: false,
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      CustomTextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder: '写下你的第一行好想法…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'left' }),
      TableKit,
    ],
    content: content.doc,
    editable: !viewSettings.readOnly,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': '文档正文',
        spellcheck: 'false',
      },
      handleDOMEvents: {
        mouseup: () => {
          if (formatPainterActive && formatPainterMarks.current && editor) {
            const { from, to } = editor.state.selection;
            if (from !== to) {
              let chain = editor.chain().focus();
              formatPainterMarks.current.marks.forEach((mark) => {
                chain = chain.setMark(mark.type, mark.attrs);
              });
              chain.run();
              setFormatPainterActive(false);
              formatPainterMarks.current = null;
            }
          }
          return false;
        },
      },
    },
    onUpdate: ({ editor }) => onChange({ type: 'word', doc: editor.getJSON() }),
  });

  // Sync read-only status
  useEffect(() => {
    if (editor) {
      editor.setEditable(!viewSettings.readOnly);
    }
  }, [editor, viewSettings.readOnly]);

  // Keyboard shortcut Ctrl+F for Find and Replace
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFindReplaceOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!editor) return null;

  // Format painter toggle
  function handleToggleFormatPainter() {
    if (formatPainterActive) {
      setFormatPainterActive(false);
      formatPainterMarks.current = null;
    } else {
      const stored = editor!.state.storedMarks || editor!.state.selection.$from.marks();
      formatPainterMarks.current = {
        marks: stored,
        attrs: editor!.getAttributes('textStyle'),
      };
      setFormatPainterActive(true);
    }
  }

  // Insert image
  function handleInsertImage(src: string) {
    editor!.chain().focus().setImage({ src }).run();
  }

  // Insert link
  function handleInsertLink() {
    const previousUrl = editor!.getAttributes('link').href;
    const url = window.prompt('请输入超链接 URL (例如 https://example.com):', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor!.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  // Extract headings for outline and TOC
  function getHeadings(): WordHeadingItem[] {
    const items: WordHeadingItem[] = [];
    editor!.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        items.push({
          id: `heading-${pos}`,
          level: node.attrs.level || 1,
          text: node.textContent,
          pos,
        });
      }
    });
    return items;
  }

  // Insert Table of Contents
  function handleInsertTableOfContents() {
    const headings = getHeadings();
    if (headings.length === 0) {
      alert('文档中暂无标题，请先设置「标题 1 / 2 / 3」后再插入目录');
      return;
    }
    let tocHtml = '<blockquote><p><strong>📑 文档目录</strong></p><ul>';
    for (const h of headings) {
      const indent = (h.level - 1) * 16;
      tocHtml += `<li style="margin-left: ${indent}px">${h.text || '未命名标题'}</li>`;
    }
    tocHtml += '</ul></blockquote><p></p>';
    editor!.chain().focus().insertContent(tocHtml).run();
  }

  // Page Dimension Calculations
  const pageDimensions = useMemo(() => {
    let width = 794;
    let minHeight = 1000;
    if (pageSettings.paperSize === 'a3') {
      width = pageSettings.orientation === 'portrait' ? 1123 : 1587;
      minHeight = pageSettings.orientation === 'portrait' ? 1587 : 1123;
    } else if (pageSettings.paperSize === 'letter') {
      width = pageSettings.orientation === 'portrait' ? 816 : 1056;
      minHeight = pageSettings.orientation === 'portrait' ? 1056 : 816;
    } else {
      // a4
      width = pageSettings.orientation === 'portrait' ? 794 : 1050;
      minHeight = pageSettings.orientation === 'portrait' ? 1050 : 794;
    }

    let padding = '68px 74px';
    if (pageSettings.margin === 'narrow') padding = '32px 36px';
    else if (pageSettings.margin === 'moderate') padding = '50px 50px';
    else if (pageSettings.margin === 'wide') padding = '90px 100px';

    return { width, minHeight, padding };
  }, [pageSettings.paperSize, pageSettings.orientation, pageSettings.margin]);

  const headings = getHeadings();
  const wordStats = computeWordStats(editor.getText(), content.doc);

  return (
    <div
      className={`word-editor ${viewSettings.zenMode ? 'word-zen-mode' : ''} ${viewSettings.eyeCare ? 'eye-care-active' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        position: 'relative',
        background: viewSettings.eyeCare ? '#c7edcc' : '#f4f6f2',
      }}
    >
      {/* Ribbon Toolbar */}
      {!viewSettings.zenMode && (
        <WordRibbon
          editor={editor}
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          formatPainterActive={formatPainterActive}
          onToggleFormatPainter={handleToggleFormatPainter}
          pageSettings={pageSettings}
          onPageSettingsChange={(patch) => setPageSettings((prev) => ({ ...prev, ...patch }))}
          viewSettings={viewSettings}
          onViewSettingsChange={(patch) => setViewSettings((prev) => ({ ...prev, ...patch }))}
          onOpenSymbolModal={() => setSymbolModalOpen(true)}
          onOpenCountModal={() => setCountModalOpen(true)}
          onOpenFindReplace={() => setFindReplaceOpen(true)}
          onInsertImage={handleInsertImage}
          onInsertLink={handleInsertLink}
          onInsertTableOfContents={handleInsertTableOfContents}
        />
      )}

      {/* Main Workspace with optional Outline Drawer */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {/* Document Outline Drawer */}
        {viewSettings.showOutline && (
          <WordOutlineDrawer
            isOpen={viewSettings.showOutline}
            onClose={() => setViewSettings((prev) => ({ ...prev, showOutline: false }))}
            headings={headings}
            editor={editor}
          />
        )}

        {/* Word Canvas / Scroll Area */}
        <div
          className="word-canvas"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px 24px 80px',
            position: 'relative',
            cursor: formatPainterActive ? 'copy' : 'default',
          }}
        >
          {/* Find and Replace Bar */}
          <WordFindReplaceBar
            isOpen={findReplaceOpen}
            onClose={() => setFindReplaceOpen(false)}
            editor={editor}
          />

          {/* Page Ruler */}
          {viewSettings.showRuler && (
            <div
              className="page-ruler"
              style={{
                maxWidth: pageDimensions.width * viewSettings.zoom,
                margin: '0 auto 8px',
              }}
            >
              <span>0</span>
              <span>5</span>
              <span>10</span>
              <span>15</span>
              <span>20</span>
              <span>25</span>
              <span>30</span>
            </div>
          )}

          {/* Editable Word Page */}
          <div
            style={{
              transform: viewSettings.zoom !== 1 ? `scale(${viewSettings.zoom})` : undefined,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
            }}
          >
            <div
              className="word-page"
              style={{
                maxWidth: pageDimensions.width,
                width: '100%',
                minHeight: pageDimensions.minHeight,
                padding: pageDimensions.padding,
                backgroundColor: pageSettings.backgroundColor,
                margin: 'auto',
                position: 'relative',
                boxShadow: '0 4px 18px rgba(0, 0, 0, 0.08)',
                borderRadius: 2,
              }}
            >
              {/* Watermark Overlay */}
              {pageSettings.watermark && (
                <div
                  className="word-watermark"
                  style={{
                    position: 'absolute',
                    top: '40%',
                    left: '50%',
                    transform: 'translate(-50%, -50%) rotate(-35deg)',
                    fontSize: 64,
                    fontWeight: 700,
                    color: 'rgba(0, 0, 0, 0.06)',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    letterSpacing: 8,
                    zIndex: 0,
                  }}
                >
                  {pageSettings.watermark}
                </div>
              )}

              {/* Tiptap Editor Content */}
              <div
                style={{
                  columnCount: pageSettings.columns,
                  columnGap: 36,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Editor Status Bar */}
      <div
        className="editor-statusbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 20px',
          fontSize: 12,
          color: '#71826f',
          background: '#fcfdfa',
          borderTop: '1px solid #dfe5d9',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => setCountModalOpen(true)}
            title="点击查看详细字数统计"
          >
            字数 {wordStats.charsNoSpaces}
          </span>
          <span>
            {pageSettings.paperSize.toUpperCase()} ·{' '}
            {pageSettings.orientation === 'portrait' ? '纵向' : '横向'}
          </span>
          {viewSettings.readOnly && (
            <span style={{ color: '#d48806', fontWeight: 600 }}>🔒 只读保护中</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>显示比例 {Math.round(viewSettings.zoom * 100)}%</span>
          {viewSettings.zenMode && (
            <button
              type="button"
              onClick={() => setViewSettings((prev) => ({ ...prev, zenMode: false }))}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                background: '#e4f0dc',
                border: '1px solid #b7cba7',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              退出专注模式
            </button>
          )}
          <span>自动保存到云端</span>
        </div>
      </div>

      {/* Modals */}
      <WordSymbolModal
        isOpen={symbolModalOpen}
        onClose={() => setSymbolModalOpen(false)}
        onInsertSymbol={(sym) => editor.chain().focus().insertContent(sym).run()}
      />
      <WordCountModal
        isOpen={countModalOpen}
        onClose={() => setCountModalOpen(false)}
        stats={wordStats}
      />
    </div>
  );
}
