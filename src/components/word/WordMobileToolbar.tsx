import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Undo2,
  Redo2,
  Image as ImageIcon,
  Camera,
  ListTree,
  Smartphone,
  FileText,
  ChevronDown,
} from 'lucide-react';
import type { WordViewSettings } from './types';

interface WordMobileToolbarProps {
  editor: Editor;
  viewSettings: WordViewSettings;
  onViewSettingsChange: (patch: Partial<WordViewSettings>) => void;
  onOpenOutline: () => void;
  onInsertImage: (src: string) => void;
}

export default function WordMobileToolbar({
  editor,
  viewSettings,
  onViewSettingsChange,
  onOpenOutline,
  onInsertImage,
}: WordMobileToolbarProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        onInsertImage(result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
    setImageMenuOpen(false);
  }

  // Current heading state
  const isH1 = editor.isActive('heading', { level: 1 });
  const isH2 = editor.isActive('heading', { level: 2 });
  const isH3 = editor.isActive('heading', { level: 3 });
  const isNormal = !isH1 && !isH2 && !isH3;

  return (
    <div className="word-mobile-toolbar" role="toolbar" aria-label="移动快捷工具栏">
      {/* Hidden File Inputs for Photo & Camera */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Heading Quick Selector Popup */}
      {headingMenuOpen && (
        <div className="mobile-toolbar-popup heading-popup">
          <button
            type="button"
            className={`popup-item ${isNormal ? 'active' : ''}`}
            onClick={() => {
              editor.chain().focus().setParagraph().run();
              setHeadingMenuOpen(false);
            }}
          >
            正文
          </button>
          <button
            type="button"
            className={`popup-item ${isH1 ? 'active' : ''}`}
            onClick={() => {
              editor.chain().focus().toggleHeading({ level: 1 }).run();
              setHeadingMenuOpen(false);
            }}
          >
            标题 1
          </button>
          <button
            type="button"
            className={`popup-item ${isH2 ? 'active' : ''}`}
            onClick={() => {
              editor.chain().focus().toggleHeading({ level: 2 }).run();
              setHeadingMenuOpen(false);
            }}
          >
            标题 2
          </button>
          <button
            type="button"
            className={`popup-item ${isH3 ? 'active' : ''}`}
            onClick={() => {
              editor.chain().focus().toggleHeading({ level: 3 }).run();
              setHeadingMenuOpen(false);
            }}
          >
            标题 3
          </button>
        </div>
      )}

      {/* Image Source Picker Popup */}
      {imageMenuOpen && (
        <div className="mobile-toolbar-popup image-popup">
          <button
            type="button"
            className="popup-item"
            onClick={() => {
              cameraInputRef.current?.click();
              setImageMenuOpen(false);
            }}
          >
            <Camera size={15} />
            <span>拍照</span>
          </button>
          <button
            type="button"
            className="popup-item"
            onClick={() => {
              photoInputRef.current?.click();
              setImageMenuOpen(false);
            }}
          >
            <ImageIcon size={15} />
            <span>从相册选择</span>
          </button>
        </div>
      )}

      <div className="mobile-toolbar-track">
        {/* Undo & Redo */}
        <button
          type="button"
          className="m-btn"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
          title="撤销"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          className="m-btn"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
          title="重做"
        >
          <Redo2 size={16} />
        </button>

        <span className="m-divider" />

        {/* Heading Dropdown Trigger */}
        <button
          type="button"
          className={`m-btn heading-trigger ${!isNormal ? 'active' : ''}`}
          onClick={() => {
            setHeadingMenuOpen((o) => !o);
            setImageMenuOpen(false);
          }}
          title="段落与标题"
        >
          <span className="heading-label">
            {isH1 ? 'H1' : isH2 ? 'H2' : isH3 ? 'H3' : '正文'}
          </span>
          <ChevronDown size={11} />
        </button>

        {/* Basic Text Formats */}
        <button
          type="button"
          className={`m-btn ${editor.isActive('bold') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="粗体"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          className={`m-btn ${editor.isActive('italic') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          className={`m-btn ${editor.isActive('underline') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="下划线"
        >
          <Underline size={16} />
        </button>
        <button
          type="button"
          className={`m-btn ${editor.isActive('strike') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="删除线"
        >
          <Strikethrough size={16} />
        </button>
        <button
          type="button"
          className={`m-btn ${editor.isActive('highlight') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
          title="高亮"
        >
          <Highlighter size={16} />
        </button>

        <span className="m-divider" />

        {/* Lists & Tasks */}
        <button
          type="button"
          className={`m-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="无序列表"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          className={`m-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="有序列表"
        >
          <ListOrdered size={16} />
        </button>
        <button
          type="button"
          className={`m-btn ${editor.isActive('taskList') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="任务清单"
        >
          <CheckSquare size={16} />
        </button>
        <button
          type="button"
          className={`m-btn ${editor.isActive('blockquote') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="引用块"
        >
          <Quote size={16} />
        </button>

        <span className="m-divider" />

        {/* Insert Image Menu */}
        <button
          type="button"
          className="m-btn"
          onClick={() => {
            setImageMenuOpen((o) => !o);
            setHeadingMenuOpen(false);
          }}
          title="插入图片（拍照/相册）"
        >
          <Camera size={16} />
        </button>

        {/* Outline / Headings */}
        <button
          type="button"
          className={`m-btn ${viewSettings.showOutline ? 'active' : ''}`}
          onClick={onOpenOutline}
          title="文档大纲"
        >
          <ListTree size={16} />
        </button>

        <span className="m-divider" />

        {/* Reflow View Toggle */}
        <button
          type="button"
          className={`m-btn reflow-btn ${viewSettings.mobileReflow ? 'active' : ''}`}
          onClick={() =>
            onViewSettingsChange({ mobileReflow: !viewSettings.mobileReflow })
          }
          title={viewSettings.mobileReflow ? '当前：移动排版（点击切换页面）' : '当前：页面视图（点击切换移动排版）'}
        >
          {viewSettings.mobileReflow ? <Smartphone size={16} /> : <FileText size={16} />}
          <span style={{ fontSize: 11, marginLeft: 2 }}>
            {viewSettings.mobileReflow ? '移动' : '页面'}
          </span>
        </button>
      </div>
    </div>
  );
}
