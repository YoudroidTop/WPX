import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { getSchema } from '@tiptap/core';
import { parseDocumentMutation } from '../cloud/document-mutations';
import { createApp } from '../server/app';
import { Store } from '../server/store';
import { exportOffice, importOffice } from '../server/office';
import {
  contentSchema,
  WORD_CHILD_TYPES,
  WORD_MARK_TYPES,
  WORD_NODE_TYPES,
  type RichNode,
  type WordContent,
} from '../shared/documents';
import { wordExtensions } from '../src/components/word/extensions';

const editorSchema = getSchema(wordExtensions());
// Fill every default attribute exactly as the editor's getJSON() does, then serialize it
// the way autosave sends it.
const asEditorJson = (doc: RichNode): RichNode =>
  JSON.parse(JSON.stringify(editorSchema.nodeFromJSON(doc).toJSON()));
const word = (doc: RichNode): WordContent => ({ type: 'word', doc });
const text = (value: string, marks?: RichNode['marks']): RichNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content });
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const richDoc = (): RichNode =>
  asEditorJson({
    type: 'doc',
    content: [
      paragraph(
        text('font', [
          {
            type: 'textStyle',
            attrs: {
              fontFamily: '"Microsoft YaHei", -apple-system, sans-serif',
              color: '#ff0000',
              fontSize: '10.5',
              lineHeight: '1.85',
            },
          },
        ]),
        text('mark', [{ type: 'highlight', attrs: { color: '#fffb8f' } }]),
        text('2', [{ type: 'subscript' }]),
        text('n', [{ type: 'superscript' }]),
        text('rgb', [{ type: 'textStyle', attrs: { color: 'rgb(12, 34, 56)' } }]),
        text('link', [{ type: 'link', attrs: { href: 'https://example.com', title: 'Example' } }]),
        {
          type: 'image',
          attrs: { src: PNG, alt: 'dot', title: '一像素', width: 120, height: '80' },
        },
        { type: 'image', attrs: { src: 'https://example.com/a.png' } },
      ),
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [paragraph(text('完成'))] },
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [
              paragraph(text('待办')),
              {
                type: 'taskList',
                content: [{ type: 'taskItem', content: [paragraph(text('嵌套'))] }],
              },
            ],
          },
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 3, type: 'a' },
        content: [{ type: 'listItem', content: [paragraph(text('c'))] }],
      },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1;')] },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { align: 'center' }, content: [paragraph(text('cell'))] },
            ],
          },
        ],
      },
    ],
  });

test('every node and mark the Word editor can produce is a persisted Word type', () => {
  assert.deepEqual(
    Object.keys(editorSchema.nodes).filter((type) => !WORD_NODE_TYPES.includes(type as never)),
    [],
  );
  assert.deepEqual(
    Object.keys(editorSchema.marks).filter((type) => !WORD_MARK_TYPES.includes(type as never)),
    [],
  );
});

test('allowed child nodes match every position the editor schema accepts', () => {
  for (const [name, type] of Object.entries(editorSchema.nodes)) {
    const reachable = new Set<string>();
    const visited = new Set<unknown>();
    const pending = [type.contentMatch];
    while (pending.length) {
      const match = pending.pop()!;
      if (visited.has(match)) continue;
      visited.add(match);
      for (let i = 0; i < match.edgeCount; i++) {
        const edge = match.edge(i);
        reachable.add(edge.type.name);
        pending.push(edge.next);
      }
    }
    assert.deepEqual(
      [...(WORD_CHILD_TYPES[name as keyof typeof WORD_CHILD_TYPES] ?? [])].sort(),
      [...reachable].sort(),
      name,
    );
  }
});

test('editor rich formatting, images and task lists save without losing attributes', () => {
  const doc = richDoc();
  const result = contentSchema.safeParse(word(doc));
  assert.ok(result.success, JSON.stringify(result.error?.issues));
  assert.deepEqual(result.data, word(doc));
});

test('every editor mark with default attributes passes the content schema', () => {
  for (const type of Object.keys(editorSchema.marks)) {
    const attrs = type === 'link' ? { href: 'https://example.com' } : undefined;
    const doc = asEditorJson({
      type: 'doc',
      content: [paragraph(text('x', [{ type, ...(attrs ? { attrs } : {}) }]))],
    });
    assert.equal(contentSchema.safeParse(word(doc)).success, true, type);
  }
});

test('unsafe or unbounded rich attributes are still rejected', () => {
  const withMark = (mark: NonNullable<RichNode['marks']>[number]) =>
    word({ type: 'doc', content: [paragraph(text('x', [mark]))] });
  const withImage = (src: string) =>
    word({ type: 'doc', content: [paragraph({ type: 'image', attrs: { src } })] });
  const rejected = {
    unknownMark: withMark({ type: 'fontWeight' }),
    unknownNode: word({ type: 'doc', content: [{ type: 'iframe' }] }),
    cssInjectionColor: withMark({ type: 'textStyle', attrs: { color: 'red; background: url(x)' } }),
    cssInjectionHighlight: withMark({ type: 'highlight', attrs: { color: 'red}' } }),
    cssInjectionFont: withMark({ type: 'textStyle', attrs: { fontFamily: 'Arial; x: y' } }),
    longFont: withMark({ type: 'textStyle', attrs: { fontFamily: 'a'.repeat(201) } }),
    fontSizeUnit: withMark({ type: 'textStyle', attrs: { fontSize: '12pt;' } }),
    lineHeightExpression: withMark({ type: 'textStyle', attrs: { lineHeight: 'calc(1)' } }),
    javascriptImage: withImage('javascript:alert(1)'),
    httpImage: withImage('http://example.com/a.png'),
    htmlDataImage: withImage('data:text/html;base64,PGI+'),
    nonBase64Image: withImage('data:image/png,<svg>'),
    missingImageSource: word({ type: 'doc', content: [paragraph({ type: 'image', attrs: {} })] }),
    taskChecked: word({
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [{ type: 'taskItem', attrs: { checked: 'yes' }, content: [paragraph()] }],
        },
      ],
    }),
  };
  for (const [name, content] of Object.entries(rejected))
    assert.equal(contentSchema.safeParse(content).success, false, name);
});

test('ZDOC round trip keeps rich Word content and DOCX export still succeeds', async () => {
  const content = word(richDoc());
  const zdoc = Buffer.from(JSON.stringify(content));
  assert.deepEqual(await importOffice('rich.zdoc', zdoc), content);

  const docx = await exportOffice(content);
  const imported = (await importOffice('rich.docx', docx)) as WordContent;
  const plain = JSON.stringify(imported.doc);
  for (const value of ['font', 'mark', '完成', '待办', '嵌套', 'cell'])
    assert.ok(plain.includes(value), value);
});

test('Node API saves and reads back rich Word content', async () => {
  const store = new Store(':memory:');
  const server = createApp({ store, authLimit: 100, staticDir: '/does-not-exist' }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  let cookie = '';
  const request = async (path: string, method = 'GET', body?: object) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    cookie ||= res.headers.get('set-cookie')?.split(';')[0] ?? '';
    return res;
  };
  try {
    await request('/auth/register', 'POST', {
      email: 'rich@example.com',
      name: 'Rich',
      password: 'strong-test-password',
    });
    const created = await (
      await request('/documents', 'POST', { kind: 'word', name: 'Rich' })
    ).json();
    const content = word(richDoc());
    const saved = await request(`/documents/${created.id}`, 'PATCH', {
      revision: created.revision,
      content,
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    const reopened = await (await request(`/documents/${created.id}`)).json();
    assert.deepEqual(reopened.content, content);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    store.db.close();
  }
});

test('Cloudflare Worker write parsing accepts rich Word content unchanged', async () => {
  const content = word(richDoc());
  const parsed = await parseDocumentMutation(
    new Request('https://fixture.test/api/documents/doc-id', {
      method: 'PATCH',
      body: JSON.stringify({ revision: 2, content }),
    }),
  );
  assert.deepEqual(parsed, { kind: 'update', id: 'doc-id', revision: 2, patch: { content } });
});
