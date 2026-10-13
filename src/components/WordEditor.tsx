import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Table2,
  Quote,
} from 'lucide-react';
import type { WordContent } from '../../shared/documents';
export default function WordEditor({
  content,
  onChange,
}: {
  content: WordContent;
  onChange: (content: WordContent) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
      Placeholder.configure({ placeholder: '写下你的第一行好想法…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'left' }),
      TableKit,
    ],
    content: content.doc,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': '文档正文',
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor }) => onChange({ type: 'word', doc: editor.getJSON() }),
  });
  if (!editor) return null;
  const actions = [
    {
      label: '撤销',
      icon: Undo2,
      run: () => editor.chain().focus().undo().run(),
      disabled: !editor.can().undo(),
    },
    {
      label: '重做',
      icon: Redo2,
      run: () => editor.chain().focus().redo().run(),
      disabled: !editor.can().redo(),
    },
    {
      label: '加粗',
      icon: Bold,
      run: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold'),
    },
    {
      label: '斜体',
      icon: Italic,
      run: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic'),
    },
    {
      label: '下划线',
      icon: Underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
      active: editor.isActive('underline'),
    },
    {
      label: '删除线',
      icon: Strikethrough,
      run: () => editor.chain().focus().toggleStrike().run(),
      active: editor.isActive('strike'),
    },
    {
      label: '左对齐',
      icon: AlignLeft,
      run: () => editor.chain().focus().setTextAlign('left').run(),
      active: editor.isActive({ textAlign: 'left' }),
    },
    {
      label: '居中',
      icon: AlignCenter,
      run: () => editor.chain().focus().setTextAlign('center').run(),
      active: editor.isActive({ textAlign: 'center' }),
    },
    {
      label: '右对齐',
      icon: AlignRight,
      run: () => editor.chain().focus().setTextAlign('right').run(),
      active: editor.isActive({ textAlign: 'right' }),
    },
    {
      label: '无序列表',
      icon: List,
      run: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList'),
    },
    {
      label: '有序列表',
      icon: ListOrdered,
      run: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive('orderedList'),
    },
    {
      label: '引用',
      icon: Quote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive('blockquote'),
    },
    {
      label: '插入表格',
      icon: Table2,
      run: () =>
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
  ];
  return (
    <div className="word-editor">
      <div className="editor-toolbar">
        <select
          aria-label="段落样式"
          value={
            editor.isActive('heading', { level: 1 })
              ? '1'
              : editor.isActive('heading', { level: 2 })
                ? '2'
                : editor.isActive('heading', { level: 3 })
                  ? '3'
                  : '0'
          }
          onChange={(e) => {
            const level = Number(e.target.value);
            level
              ? editor
                  .chain()
                  .focus()
                  .setHeading({ level: level as 1 | 2 | 3 })
                  .run()
              : editor.chain().focus().setParagraph().run();
          }}
        >
          <option value="0">正文</option>
          <option value="1">标题 1</option>
          <option value="2">标题 2</option>
          <option value="3">标题 3</option>
        </select>
        <span className="toolbar-divider" />
        {actions.map((action) => (
          <button
            key={action.label}
            className={`icon-button ${action.active ? 'active' : ''}`}
            title={action.label}
            aria-label={action.label}
            aria-pressed={action.active}
            disabled={action.disabled}
            onClick={action.run}
          >
            <action.icon size={17} />
          </button>
        ))}
        {editor.isActive('table') && (
          <>
            <button onClick={() => editor.chain().focus().addRowAfter().run()}>添加行</button>
            <button onClick={() => editor.chain().focus().addColumnAfter().run()}>添加列</button>
            <button onClick={() => editor.chain().focus().deleteTable().run()}>删除表格</button>
          </>
        )}
      </div>
      <div className="word-canvas">
        <div className="page-ruler">
          <span>0</span>
          <span>5</span>
          <span>10</span>
          <span>15</span>
        </div>
        <EditorContent editor={editor} className="word-page" />
      </div>
      <div className="editor-statusbar">
        <span>字数 {editor.getText().replace(/\s/g, '').length}</span>
        <span>基础文字编辑 · 自动保存到云端</span>
      </div>
    </div>
  );
}
