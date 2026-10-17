import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import {
  Undo2,
  Redo2,
  Paintbrush,
  RemoveFormatting,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript,
  Subscript,
  Highlighter,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Indent,
  Outdent,
  CheckSquare,
  List,
  ListOrdered,
  Quote,
  FilePlus,
  Split,
  Table2,
  Image,
  Minus,
  StickyNote,
  Omega,
  Link as LinkIcon,
  CalendarClock,
  FileText,
  Maximize2,
  Columns3,
  Droplet,
  Stamp,
  ListTree,
  Hash,
  Search,
  Lock,
  Unlock,
  Ruler,
  Eye,
  Maximize,
  ChevronDown,
} from 'lucide-react';
import type { WordRibbonTab, WordPageSettings, WordViewSettings } from './types';
import WordColorPickerDropdown from './WordColorPickerDropdown';
import { WordFontSelector, WordSizeSelector, STEP_FONT_SIZES } from './WordFontDropdown';
import WordTableGridPicker from './WordTableGridPicker';

interface WordRibbonProps {
  editor: Editor;
  currentTab: WordRibbonTab;
  onTabChange: (tab: WordRibbonTab) => void;
  formatPainterActive: boolean;
  onToggleFormatPainter: () => void;
  pageSettings: WordPageSettings;
  onPageSettingsChange: (patch: Partial<WordPageSettings>) => void;
  viewSettings: WordViewSettings;
  onViewSettingsChange: (patch: Partial<WordViewSettings>) => void;
  onOpenSymbolModal: () => void;
  onOpenCountModal: () => void;
  onOpenFindReplace: () => void;
  onInsertImage: (src: string) => void;
  onInsertLink: () => void;
  onInsertTableOfContents: () => void;
}

export default function WordRibbon({
  editor,
  currentTab,
  onTabChange,
  formatPainterActive,
  onToggleFormatPainter,
  pageSettings,
  onPageSettingsChange,
  viewSettings,
  onViewSettingsChange,
  onOpenSymbolModal,
  onOpenCountModal,
  onOpenFindReplace,
  onInsertImage,
  onInsertLink,
  onInsertTableOfContents,
}: WordRibbonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Current states from editor
  const currentFont = editor.getAttributes('textStyle').fontFamily || '';
  const currentSize = editor.getAttributes('textStyle').fontSize || '11';
  const currentTextColor = editor.getAttributes('textStyle').color;
  const currentHighlightColor = editor.getAttributes('highlight').color;

  function handleFontStep(delta: number) {
    const currentNum = parseFloat(currentSize) || 11;
    let next: number | undefined;
    if (delta > 0) {
      next = STEP_FONT_SIZES.find((s) => s > currentNum);
    } else {
      next = [...STEP_FONT_SIZES].reverse().find((s) => s < currentNum);
    }
    if (next) {
      editor.chain().focus().setMark('textStyle', { fontSize: String(next) }).run();
    }
  }

  function handleImageFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onInsertImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleInsertDateTime() {
    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    editor.chain().focus().insertContent(formatted).run();
  }

  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById('editor-header-tabs');
    setHeaderTarget(el);
  }, []);

  const tabContent = (
    <div className="header-ribbon-tabs">
      <button
        type="button"
        className={`header-tab-btn ${currentTab === 'home' ? 'active' : ''}`}
        onClick={() => onTabChange('home')}
      >
        开始
      </button>
      <button
        type="button"
        className={`header-tab-btn ${currentTab === 'insert' ? 'active' : ''}`}
        onClick={() => onTabChange('insert')}
      >
        插入
      </button>
      <button
        type="button"
        className={`header-tab-btn ${currentTab === 'page' ? 'active' : ''}`}
        onClick={() => onTabChange('page')}
      >
        页面
      </button>
      <button
        type="button"
        className={`header-tab-btn ${currentTab === 'review' ? 'active' : ''}`}
        onClick={() => onTabChange('review')}
      >
        审阅
      </button>
      <button
        type="button"
        className={`header-tab-btn ${currentTab === 'view' ? 'active' : ''}`}
        onClick={() => onTabChange('view')}
      >
        视图
      </button>
    </div>
  );

  return (
    <div className="sheet-ribbon word-ribbon" role="toolbar" aria-label="Word 工具栏">
      {/* Tab Navigation: Portal to header center if present, otherwise render inline */}
      {headerTarget ? (
        createPortal(tabContent, headerTarget)
      ) : (
        <div className="ribbon-tabs">{tabContent}</div>
      )}

      {/* Hidden File Input for Image Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageFileSelect}
      />

      {/* Ribbon Panels */}
      <div className="ribbon-panel">
        {/* ===================== TAB 1: 开始 (HOME) ===================== */}
        {currentTab === 'home' && (
          <div className="ribbon-group-row">
            {/* 历史与格式操作 */}
            <div className="ribbon-group">
              <button
                type="button"
                className="ribbon-icon-btn"
                title="撤销 (Ctrl+Z)"
                aria-label="撤销"
                disabled={!editor.can().undo()}
                onClick={() => editor.chain().focus().undo().run()}
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                className="ribbon-icon-btn"
                title="重做 (Ctrl+Y)"
                aria-label="重做"
                disabled={!editor.can().redo()}
                onClick={() => editor.chain().focus().redo().run()}
              >
                <Redo2 size={16} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${formatPainterActive ? 'active' : ''}`}
                title="格式刷"
                aria-label="格式刷"
                onClick={onToggleFormatPainter}
              >
                <Paintbrush size={16} />
              </button>
              <button
                type="button"
                className="ribbon-icon-btn"
                title="清除格式"
                aria-label="清除格式"
                onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
              >
                <RemoveFormatting size={16} />
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 字体、字号与步进 */}
            <div className="ribbon-group">
              <WordFontSelector
                currentFont={currentFont}
                onSelectFont={(font) => {
                  if (font) editor.chain().focus().setFontFamily(font).run();
                  else editor.chain().focus().unsetFontFamily().run();
                }}
              />
              <WordSizeSelector
                currentSize={currentSize}
                onSelectSize={(pt) => {
                  editor.chain().focus().setMark('textStyle', { fontSize: pt }).run();
                }}
              />
              <button
                type="button"
                className="ribbon-icon-btn"
                title="增大字号"
                aria-label="增大字号"
                onClick={() => handleFontStep(1)}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>A⁺</span>
              </button>
              <button
                type="button"
                className="ribbon-icon-btn"
                title="减小字号"
                aria-label="减小字号"
                onClick={() => handleFontStep(-1)}
              >
                <span style={{ fontSize: 11, fontWeight: 700 }}>A⁻</span>
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 文本字形样式 */}
            <div className="ribbon-group">
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('bold') ? 'active' : ''}`}
                title="加粗 (Ctrl+B)"
                aria-label="加粗"
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('italic') ? 'active' : ''}`}
                title="斜体 (Ctrl+I)"
                aria-label="斜体"
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('underline') ? 'active' : ''}`}
                title="下划线 (Ctrl+U)"
                aria-label="下划线"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
              >
                <Underline size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('strike') ? 'active' : ''}`}
                title="删除线"
                aria-label="删除线"
                onClick={() => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('superscript') ? 'active' : ''}`}
                title="上标 (X²)"
                aria-label="上标"
                onClick={() => editor.chain().focus().toggleSuperscript().run()}
              >
                <Superscript size={14} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('subscript') ? 'active' : ''}`}
                title="下标 (X₂)"
                aria-label="下标"
                onClick={() => editor.chain().focus().toggleSubscript().run()}
              >
                <Subscript size={14} />
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 文本高亮色与文字颜色 */}
            <div className="ribbon-group">
              <WordColorPickerDropdown
                type="highlight"
                currentColor={currentHighlightColor}
                onChange={(color) => {
                  if (color) editor.chain().focus().setHighlight({ color }).run();
                  else editor.chain().focus().unsetHighlight().run();
                }}
                trigger={
                  <button
                    type="button"
                    className="ribbon-icon-btn"
                    title="文本突出显示颜色"
                    aria-label="高亮"
                    style={{ position: 'relative' }}
                  >
                    <Highlighter size={15} />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 2,
                        left: 4,
                        right: 4,
                        height: 3,
                        background: currentHighlightColor || '#fffb8f',
                        borderRadius: 1,
                      }}
                    />
                  </button>
                }
              />
              <WordColorPickerDropdown
                type="color"
                currentColor={currentTextColor}
                onChange={(color) => {
                  if (color) editor.chain().focus().setColor(color).run();
                  else editor.chain().focus().unsetColor().run();
                }}
                trigger={
                  <button
                    type="button"
                    className="ribbon-icon-btn"
                    title="字体颜色"
                    aria-label="字体颜色"
                    style={{ position: 'relative' }}
                  >
                    <Palette size={15} />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 2,
                        left: 4,
                        right: 4,
                        height: 3,
                        background: currentTextColor || '#202824',
                        borderRadius: 1,
                      }}
                    />
                  </button>
                }
              />
            </div>

            <div className="ribbon-divider" />

            {/* 段落样式选择 */}
            <div className="ribbon-group">
              <select
                aria-label="段落样式"
                value={
                  editor.isActive('heading', { level: 1 })
                    ? '1'
                    : editor.isActive('heading', { level: 2 })
                      ? '2'
                      : editor.isActive('heading', { level: 3 })
                        ? '3'
                        : editor.isActive('blockquote')
                          ? 'quote'
                          : editor.isActive('codeBlock')
                            ? 'code'
                            : '0'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '0') editor.chain().focus().setParagraph().run();
                  else if (val === '1' || val === '2' || val === '3')
                    editor.chain().focus().setHeading({ level: Number(val) as 1 | 2 | 3 }).run();
                  else if (val === 'quote') editor.chain().focus().toggleBlockquote().run();
                  else if (val === 'code') editor.chain().focus().toggleCodeBlock().run();
                }}
                style={{
                  height: 28,
                  fontSize: 12,
                  padding: '0 8px',
                  border: '1px solid #dce4d5',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#344239',
                  outline: 'none',
                  cursor: 'pointer',
                  minWidth: 78,
                }}
              >
                <option value="0">正文</option>
                <option value="1">标题 1</option>
                <option value="2">标题 2</option>
                <option value="3">标题 3</option>
                <option value="quote">引用</option>
                <option value="code">代码块</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 对齐方式 */}
            <div className="ribbon-group">
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
                title="左对齐"
                aria-label="左对齐"
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
              >
                <AlignLeft size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
                title="居中"
                aria-label="居中"
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
              >
                <AlignCenter size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
                title="右对齐"
                aria-label="右对齐"
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
              >
                <AlignRight size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive({ textAlign: 'justify' }) ? 'active' : ''}`}
                title="两端对齐"
                aria-label="两端对齐"
                onClick={() => editor.chain().focus().setTextAlign('justify').run()}
              >
                <AlignJustify size={15} />
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 缩进与行距 */}
            <div className="ribbon-group">
              <button
                type="button"
                className="ribbon-icon-btn"
                title="减少缩进"
                aria-label="减少缩进"
                onClick={() => {
                  // Outdent paragraph by removing left margin or lift list
                  if (editor.isActive('listItem') || editor.isActive('taskItem')) {
                    editor.chain().focus().liftListItem('listItem').run();
                  }
                }}
              >
                <Outdent size={15} />
              </button>
              <button
                type="button"
                className="ribbon-icon-btn"
                title="增加缩进"
                aria-label="增加缩进"
                onClick={() => {
                  if (editor.isActive('listItem') || editor.isActive('taskItem')) {
                    editor.chain().focus().sinkListItem('listItem').run();
                  }
                }}
              >
                <Indent size={15} />
              </button>

              {/* 行间距 */}
              <select
                aria-label="行距"
                defaultValue="1.85"
                onChange={(e) => {
                  const val = e.target.value;
                  editor.chain().focus().setMark('textStyle', { lineHeight: val }).run();
                }}
                style={{
                  height: 28,
                  fontSize: 12,
                  padding: '0 4px',
                  border: '1px solid #dce4d5',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#344239',
                  outline: 'none',
                  cursor: 'pointer',
                  width: 58,
                }}
              >
                <option value="1.0">1.0</option>
                <option value="1.15">1.15</option>
                <option value="1.5">1.5</option>
                <option value="1.85">默认</option>
                <option value="2.0">2.0</option>
                <option value="2.5">2.5</option>
                <option value="3.0">3.0</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 列表与引用 */}
            <div className="ribbon-group">
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('taskList') ? 'active' : ''}`}
                title="任务列表 (待办复选框)"
                aria-label="任务列表"
                onClick={() => editor.chain().focus().toggleTaskList().run()}
              >
                <CheckSquare size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
                title="项目符号 (无序列表)"
                aria-label="无序列表"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                <List size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
                title="编号 (有序列表)"
                aria-label="有序列表"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered size={15} />
              </button>
              <button
                type="button"
                className={`ribbon-icon-btn ${editor.isActive('blockquote') ? 'active' : ''}`}
                title="引用块"
                aria-label="引用块"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              >
                <Quote size={15} />
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 快速插入表格 */}
            <div className="ribbon-group">
              <button
                type="button"
                className="ribbon-btn"
                title="插入表格"
                aria-label="插入表格"
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
              >
                <Table2 size={15} />
                <span>插入表格</span>
              </button>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: 插入 (INSERT) ===================== */}
        {currentTab === 'insert' && (
          <div className="ribbon-group-row">
            {/* 分页符与页面 */}
            <div className="ribbon-group">
              <button
                type="button"
                className="ribbon-btn"
                onClick={() => {
                  editor.chain().focus().setHorizontalRule().run();
                }}
                title="插入分页分割符"
              >
                <Split size={15} />
                <span>分页符</span>
              </button>
              <button
                type="button"
                className="ribbon-btn"
                onClick={() => {
                  editor.chain().focus().insertContent('<p><br></p><hr><p><br></p>').run();
                }}
                title="插入空白页"
              >
                <FilePlus size={15} />
                <span>空白页</span>
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 表格系统 */}
            <div className="ribbon-group">
              <WordTableGridPicker
                isInTable={editor.isActive('table')}
                onInsertTable={(rows, cols) => {
                  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                }}
                onAddRowBefore={() => editor.chain().focus().addRowBefore().run()}
                onAddRowAfter={() => editor.chain().focus().addRowAfter().run()}
                onAddColBefore={() => editor.chain().focus().addColumnBefore().run()}
                onAddColAfter={() => editor.chain().focus().addColumnAfter().run()}
                onDeleteRow={() => editor.chain().focus().deleteRow().run()}
                onDeleteCol={() => editor.chain().focus().deleteColumn().run()}
                onDeleteTable={() => editor.chain().focus().deleteTable().run()}
              />
              <span style={{ fontSize: 12, color: '#687865' }}>表格</span>
            </div>

            <div className="ribbon-divider" />

            {/* 插图与对象 */}
            <div className="ribbon-group">
              <button
                type="button"
                className="ribbon-btn"
                onClick={() => fileInputRef.current?.click()}
                title="插入本地图片"
              >
                <Image size={15} />
                <span>图片</span>
              </button>
              <button
                type="button"
                className="ribbon-btn"
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                title="插入水平分割线"
              >
                <Minus size={15} />
                <span>分割线</span>
              </button>
              <button
                type="button"
                className="ribbon-btn"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .insertContent('<blockquote><p>💡 在此输入重要文本提示框内容…</p></blockquote>')
                    .run();
                }}
                title="插入文本说明卡片"
              >
                <StickyNote size={15} />
                <span>提示框</span>
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 符号与链接 */}
            <div className="ribbon-group">
              <button
                type="button"
                className="ribbon-btn"
                onClick={onOpenSymbolModal}
                title="插入特殊符号与数学符号"
              >
                <Omega size={15} />
                <span>特殊符号</span>
              </button>
              <button
                type="button"
                className={`ribbon-btn ${editor.isActive('link') ? 'active' : ''}`}
                onClick={onInsertLink}
                title="插入或编辑超链接"
              >
                <LinkIcon size={15} />
                <span>超链接</span>
              </button>
              <button
                type="button"
                className="ribbon-btn"
                onClick={handleInsertDateTime}
                title="插入当前系统日期时间"
              >
                <CalendarClock size={15} />
                <span>日期时间</span>
              </button>
            </div>
          </div>
        )}

        {/* ===================== TAB 3: 页面 (PAGE) ===================== */}
        {currentTab === 'page' && (
          <div className="ribbon-group-row">
            {/* 页边距 */}
            <div className="ribbon-group">
              <span style={{ fontSize: 12, color: '#556658' }}>页边距:</span>
              <select
                aria-label="页边距"
                value={pageSettings.margin}
                onChange={(e) =>
                  onPageSettingsChange({ margin: e.target.value as WordPageSettings['margin'] })
                }
                style={{
                  height: 28,
                  fontSize: 12,
                  padding: '0 6px',
                  border: '1px solid #dce4d5',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#344239',
                  cursor: 'pointer',
                }}
              >
                <option value="normal">普通 (标准版心)</option>
                <option value="narrow">窄 (更多内容)</option>
                <option value="moderate">适中</option>
                <option value="wide">宽 (沉浸阅读)</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 纸张方向 */}
            <div className="ribbon-group">
              <button
                type="button"
                className={`ribbon-btn ${pageSettings.orientation === 'portrait' ? 'active' : ''}`}
                onClick={() => onPageSettingsChange({ orientation: 'portrait' })}
              >
                <FileText size={15} />
                <span>纵向</span>
              </button>
              <button
                type="button"
                className={`ribbon-btn ${pageSettings.orientation === 'landscape' ? 'active' : ''}`}
                onClick={() => onPageSettingsChange({ orientation: 'landscape' })}
              >
                <FileText size={15} style={{ transform: 'rotate(90deg)' }} />
                <span>横向</span>
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 纸张大小 */}
            <div className="ribbon-group">
              <span style={{ fontSize: 12, color: '#556658' }}>纸张:</span>
              <select
                aria-label="纸张大小"
                value={pageSettings.paperSize}
                onChange={(e) =>
                  onPageSettingsChange({ paperSize: e.target.value as WordPageSettings['paperSize'] })
                }
                style={{
                  height: 28,
                  fontSize: 12,
                  padding: '0 6px',
                  border: '1px solid #dce4d5',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#344239',
                  cursor: 'pointer',
                }}
              >
                <option value="a4">A4 (210 × 297 mm)</option>
                <option value="a3">A3 (297 × 420 mm)</option>
                <option value="letter">Letter (8.5 × 11 in)</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 分栏 */}
            <div className="ribbon-group">
              <span style={{ fontSize: 12, color: '#556658' }}>分栏:</span>
              <select
                aria-label="分栏"
                value={String(pageSettings.columns)}
                onChange={(e) =>
                  onPageSettingsChange({ columns: Number(e.target.value) as 1 | 2 | 3 })
                }
                style={{
                  height: 28,
                  fontSize: 12,
                  padding: '0 6px',
                  border: '1px solid #dce4d5',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#344239',
                  cursor: 'pointer',
                }}
              >
                <option value="1">单栏</option>
                <option value="2">两栏</option>
                <option value="3">三栏</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 页面底色 */}
            <div className="ribbon-group">
              <Droplet size={15} color="#556658" />
              <span style={{ fontSize: 12, color: '#556658' }}>背景底色:</span>
              <select
                aria-label="页面背景色"
                value={pageSettings.backgroundColor}
                onChange={(e) => onPageSettingsChange({ backgroundColor: e.target.value })}
                style={{
                  height: 28,
                  fontSize: 12,
                  padding: '0 6px',
                  border: '1px solid #dce4d5',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#344239',
                  cursor: 'pointer',
                }}
              >
                <option value="#ffffff">纯白</option>
                <option value="#c7edcc">护眼绿</option>
                <option value="#faf6ed">羊皮纸米黄</option>
                <option value="#f4f5f7">浅灰</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 页面水印 */}
            <div className="ribbon-group">
              <Stamp size={15} color="#556658" />
              <span style={{ fontSize: 12, color: '#556658' }}>水印:</span>
              <select
                aria-label="页面水印"
                value={pageSettings.watermark}
                onChange={(e) => onPageSettingsChange({ watermark: e.target.value })}
                style={{
                  height: 28,
                  fontSize: 12,
                  padding: '0 6px',
                  border: '1px solid #dce4d5',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#344239',
                  cursor: 'pointer',
                }}
              >
                <option value="">无水印</option>
                <option value="草稿">草稿 (DRAFT)</option>
                <option value="绝密">绝密 (TOP SECRET)</option>
                <option value="机密">机密 (CONFIDENTIAL)</option>
                <option value="内部资料">内部资料</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 插入目录 (排除 AI) */}
            <div className="ribbon-group">
              <button
                type="button"
                className="ribbon-btn"
                onClick={onInsertTableOfContents}
                title="基于标题生成文档目录"
              >
                <ListTree size={15} />
                <span>插入目录</span>
              </button>
            </div>
          </div>
        )}

        {/* ===================== TAB 4: 审阅 (REVIEW) ===================== */}
        {currentTab === 'review' && (
          <div className="ribbon-group-row">
            {/* 字数统计 */}
            <div className="ribbon-group">
              <button
                type="button"
                className="ribbon-btn"
                onClick={onOpenCountModal}
                title="查看详细字数统计"
              >
                <Hash size={15} />
                <span>字数统计</span>
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 查找与替换 */}
            <div className="ribbon-group">
              <button
                type="button"
                className="ribbon-btn"
                onClick={onOpenFindReplace}
                title="查找与替换文本 (Ctrl+F)"
              >
                <Search size={15} />
                <span>查找与替换</span>
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 只读保护 */}
            <div className="ribbon-group">
              <button
                type="button"
                className={`ribbon-btn ${viewSettings.readOnly ? 'active' : ''}`}
                onClick={() => onViewSettingsChange({ readOnly: !viewSettings.readOnly })}
                title="切换只读保护状态"
              >
                {viewSettings.readOnly ? <Lock size={15} /> : <Unlock size={15} />}
                <span>{viewSettings.readOnly ? '只读保护中' : '文档编辑中'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ===================== TAB 5: 视图 (VIEW) ===================== */}
        {currentTab === 'view' && (
          <div className="ribbon-group-row">
            {/* 导航与辅助线 */}
            <div className="ribbon-group">
              <button
                type="button"
                className={`ribbon-btn ${viewSettings.showOutline ? 'active' : ''}`}
                onClick={() => onViewSettingsChange({ showOutline: !viewSettings.showOutline })}
                title="展开/收起文档大纲"
              >
                <ListTree size={15} />
                <span>文档大纲</span>
              </button>
              <button
                type="button"
                className={`ribbon-btn ${viewSettings.showRuler ? 'active' : ''}`}
                onClick={() => onViewSettingsChange({ showRuler: !viewSettings.showRuler })}
                title="显示/隐藏页面标尺"
              >
                <Ruler size={15} />
                <span>标尺</span>
              </button>
              <button
                type="button"
                className={`ribbon-btn ${viewSettings.eyeCare ? 'active' : ''}`}
                onClick={() => onViewSettingsChange({ eyeCare: !viewSettings.eyeCare })}
                title="一键切换护眼模式"
              >
                <Eye size={15} />
                <span>护眼模式</span>
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 缩放比例 */}
            <div className="ribbon-group">
              <span style={{ fontSize: 12, color: '#556658' }}>缩放:</span>
              <select
                aria-label="显示比例"
                value={String(viewSettings.zoom)}
                onChange={(e) => onViewSettingsChange({ zoom: parseFloat(e.target.value) })}
                style={{
                  height: 28,
                  fontSize: 12,
                  padding: '0 6px',
                  border: '1px solid #dce4d5',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#344239',
                  cursor: 'pointer',
                }}
              >
                <option value="0.75">75%</option>
                <option value="0.9">90%</option>
                <option value="1">100%</option>
                <option value="1.25">125%</option>
                <option value="1.5">150%</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 专注模式 */}
            <div className="ribbon-group">
              <button
                type="button"
                className={`ribbon-btn ${viewSettings.zenMode ? 'active' : ''}`}
                onClick={() => onViewSettingsChange({ zenMode: !viewSettings.zenMode })}
                title="全屏专注沉浸编辑"
              >
                <Maximize size={15} />
                <span>{viewSettings.zenMode ? '退出专注' : '专注模式'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
