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

// Shared by the editor and the schema regression tests, so any node, mark or
// attribute the editor can produce is checked against the persisted content schema.
export function wordExtensions() {
  return [
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
  ];
}
