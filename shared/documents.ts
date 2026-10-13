import { z } from 'zod';

export const STORAGE_LIMIT = 3_000_000_000;
export const MAX_IMPORT_BYTES = 10_000_000;
export const MAX_CONTENT_BYTES = 4_000_000;
export const MAX_ROWS = 500;
export const MAX_COLUMNS = 52;
export type DocumentKind = 'word' | 'sheet' | 'slide';
export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
}
export interface WordContent {
  type: 'word';
  doc: RichNode;
}
export interface SheetPage {
  id: string;
  name: string;
  cells: Record<string, string>;
}
export interface SheetContent {
  type: 'sheet';
  sheets: SheetPage[];
}
export interface Slide {
  id: string;
  title: string;
  body: string;
  notes: string;
  theme: 'forest' | 'paper' | 'midnight';
}
export interface SlideContent {
  type: 'slide';
  slides: Slide[];
}
export type DocumentContent = WordContent | SheetContent | SlideContent;
export interface DocumentSummary {
  id: string;
  name: string;
  kind: DocumentKind;
  size: number;
  revision: number;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}
export interface CloudDocument extends DocumentSummary {
  content: DocumentContent;
}
export interface Account {
  id: string;
  email: string;
  name: string;
  usedBytes: number;
  limitBytes: number;
}
export const kindLabels: Record<DocumentKind, string> = {
  word: '文字文档',
  sheet: '电子表格',
  slide: '演示文稿',
};
export const extensions: Record<DocumentKind, string> = {
  word: 'docx',
  sheet: 'xlsx',
  slide: 'pptx',
};

const richNode: z.ZodType<RichNode> = z.lazy(() =>
  z.object({
    type: z.enum([
      'doc',
      'paragraph',
      'text',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
      'blockquote',
      'codeBlock',
      'hardBreak',
      'horizontalRule',
      'table',
      'tableRow',
      'tableCell',
      'tableHeader',
    ]),
    text: z.string().max(1_000_000).optional(),
    attrs: z
      .object({
        level: z.number().int().min(1).max(6).optional(),
        textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
        start: z.number().int().optional(),
        colspan: z.number().int().min(1).max(52).optional(),
        rowspan: z.number().int().min(1).max(500).optional(),
        colwidth: z.array(z.number().positive()).nullable().optional(),
      })
      .optional(),
    marks: z
      .array(
        z.object({
          type: z.enum(['bold', 'italic', 'strike', 'underline', 'code', 'link']),
          attrs: z
            .object({
              href: z
                .string()
                .max(2048)
                .refine((s) => /^(https?:\/\/|mailto:)/i.test(s))
                .optional(),
              target: z.string().optional(),
              rel: z.string().optional(),
              class: z.string().nullable().optional(),
            })
            .optional(),
        }),
      )
      .optional(),
    content: z.array(richNode).max(10_000).optional(),
  }),
);
const cellAddress = /^(?:[A-Z]|A[A-Z])(?:[1-9]\d?|[1-4]\d{2}|500)$/;
const nativeContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('word'), doc: richNode.refine((n) => n.type === 'doc') }),
  z.object({
    type: z.literal('sheet'),
    sheets: z
      .array(
        z.object({
          id: z.string().max(100),
          name: z.string().min(1).max(31),
          cells: z.record(z.string().regex(cellAddress), z.string().max(10_000)),
        }),
      )
      .min(1)
      .max(20),
  }),
  z.object({
    type: z.literal('slide'),
    slides: z
      .array(
        z.object({
          id: z.string().max(100),
          title: z.string().max(500),
          body: z.string().max(10_000),
          notes: z.string().max(10_000),
          theme: z.enum(['forest', 'paper', 'midnight']),
        }),
      )
      .min(1)
      .max(100),
  }),
]);
export const contentSchema = z
  .preprocess((value, context) => {
    const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    let nodes = 0;
    while (stack.length) {
      const item = stack.pop()!;
      if (++nodes > 100_000 || item.depth > 40) {
        context.addIssue({ code: 'custom', message: 'Document structure exceeds limits' });
        return z.NEVER;
      }
      if (item.value && typeof item.value === 'object') {
        for (const child of Object.values(item.value))
          stack.push({ value: child, depth: item.depth + 1 });
      }
    }
    return value;
  }, nativeContentSchema)
  .superRefine((value, context) => {
    if (value.type === 'sheet') {
      if (
        new Set(value.sheets.map((s) => s.id)).size !== value.sheets.length ||
        new Set(value.sheets.map((s) => s.name.toLowerCase())).size !== value.sheets.length ||
        value.sheets.some((s) => /[\\/*?:\[\]]/.test(s.name))
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Sheet names and IDs must be unique and valid',
        });
      }
    } else if (value.type === 'slide') {
      if (new Set(value.slides.map((s) => s.id)).size !== value.slides.length)
        context.addIssue({ code: 'custom', message: 'Slide IDs must be unique' });
    } else {
      const allowed: Record<string, string[]> = {
        doc: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'blockquote',
          'codeBlock',
          'horizontalRule',
          'table',
        ],
        paragraph: ['text', 'hardBreak'],
        heading: ['text', 'hardBreak'],
        codeBlock: ['text'],
        bulletList: ['listItem'],
        orderedList: ['listItem'],
        listItem: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'blockquote',
          'codeBlock',
          'table',
        ],
        blockquote: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'blockquote',
          'codeBlock',
          'table',
        ],
        table: ['tableRow'],
        tableRow: ['tableCell', 'tableHeader'],
        tableCell: ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock'],
        tableHeader: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'blockquote',
          'codeBlock',
        ],
      };
      const walk = (node: RichNode) => {
        if (
          (node.type === 'text' && !node.text) ||
          (node.content ?? []).some((child) => !(allowed[node.type] ?? []).includes(child.type))
        )
          context.addIssue({ code: 'custom', message: 'Invalid rich-text structure' });
        for (const child of node.content ?? []) walk(child);
      };
      walk(value.doc);
    }
  });
export function blankContent(kind: DocumentKind): DocumentContent {
  if (kind === 'word')
    return { type: 'word', doc: { type: 'doc', content: [{ type: 'paragraph' }] } };
  if (kind === 'sheet')
    return { type: 'sheet', sheets: [{ id: crypto.randomUUID(), name: '工作表 1', cells: {} }] };
  return {
    type: 'slide',
    slides: [
      {
        id: crypto.randomUUID(),
        title: '从一个好想法开始',
        body: '在这里写下你的第一句话',
        notes: '',
        theme: 'forest',
      },
    ],
  };
}
export function columnName(index: number): string {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}
