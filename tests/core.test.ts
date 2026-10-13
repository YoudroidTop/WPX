import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalculator } from '../shared/formulas';
import { blankContent, contentSchema, STORAGE_LIMIT } from '../shared/documents';
import { Store, ApiError } from '../server/store';
import { exportOffice, importOffice } from '../server/office';
import JSZip from 'jszip';

test('formulas evaluate precedence, ranges, dependencies, and bounded errors', () => {
  const calculate = createCalculator({
    A1: '12',
    A2: '3',
    A3: 'hello',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A2)*2',
    B3: '=MIN(A1:A2)+MAX(A1:A2)',
    C1: '=B1+B2',
    C2: '=COUNT(A1:A3)',
    C3: '=2+3*4',
    D1: '=D2',
    D2: '=D1',
    D3: '=1/0',
    E1: '=globalThis.alert(1)',
    E2: '=SUM(BA1:BA2)',
    E3: '=SUM(A1:A501)',
  });
  for (const [address, expected] of Object.entries({
    B1: 15,
    B2: 15,
    B3: 15,
    C1: 30,
    C2: 2,
    C3: 14,
    D1: '#CYCLE!',
    D2: '#CYCLE!',
    D3: '#DIV/0!',
    E1: '#NAME?',
    E2: '#REF!',
    E3: '#REF!',
  }))
    assert.equal(calculate(address), expected, address);
});
test('schema restricts spreadsheet bounds and unsafe links', () => {
  assert.equal(
    contentSchema.safeParse({
      type: 'sheet',
      sheets: [{ id: '1', name: 'Sheet', cells: { BA1: 'oops' } }],
    }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      type: 'word',
      doc: {
        type: 'doc',
        content: [
          {
            type: 'text',
            text: 'bad',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    }).success,
    false,
  );
});
test('quota is byte-exact, transactional, and counts trash until permanent deletion', () => {
  const initial = blankContent('word');
  const size = Buffer.byteLength(JSON.stringify(initial));
  const store = new Store(':memory:', size * 2);
  store.db
    .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
    .run('u', 'u@test.dev', 'U', 'not-used', 0);
  assert.equal(STORAGE_LIMIT, 3_000_000_000);
  const one = store.create('u', 'First', initial),
    two = store.create('u', 'Second', initial);
  assert.equal(store.used('u'), size * 2);
  assert.throws(
    () => store.create('u', 'Third', initial),
    (e: unknown) => e instanceof ApiError && e.status === 413,
  );
  const trashed = store.update('u', one.id, one.revision, { deleted: true });
  assert.equal(store.used('u'), size * 2);
  const larger = {
    type: 'word' as const,
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '中文 😀' }] }],
    },
  };
  assert.throws(
    () => store.update('u', two.id, two.revision, { content: larger }),
    (e: unknown) => e instanceof ApiError && e.status === 413,
  );
  assert.equal(store.get('u', two.id).revision, two.revision);
  store.remove('u', one.id, trashed.revision);
  assert.equal(store.used('u'), size);
  store.create('u', 'Third', initial);
  assert.equal(store.used('u'), size * 2);
  store.db.close();
});
test('Office exports are valid OOXML containers and basic text imports round trip', async () => {
  for (const kind of ['word', 'sheet', 'slide'] as const) {
    const content = blankContent(kind);
    if (content.type === 'word')
      content.doc.content = [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '卓乐文档测试 & <hello>', marks: [{ type: 'bold' }] }],
        },
      ];
    if (content.type === 'sheet')
      content.sheets[0].cells = { A1: '10', A2: '20', B1: '=SUM(A1:A2)' };
    const bytes = await exportOffice(content);
    const zip = await JSZip.loadAsync(bytes);
    assert.ok(zip.file('[Content_Types].xml'));
    const imported = await importOffice(
      `test.${{ word: 'docx', sheet: 'xlsx', slide: 'pptx' }[kind]}`,
      bytes,
    );
    assert.equal(imported.type, kind);
    if (imported.type === 'word') assert.match(JSON.stringify(imported), /卓乐文档测试 & <hello>/);
    if (imported.type === 'sheet')
      assert.equal(createCalculator(imported.sheets[0].cells)('B1'), 30);
    if (imported.type === 'slide') assert.equal(imported.slides[0].title, '从一个好想法开始');
  }
});
test('native backups restore complete model and import rejects oversized expansion', async () => {
  const content = blankContent('slide');
  assert.deepEqual(
    await importOffice('backup.zdoc', Buffer.from(JSON.stringify(content))),
    content,
  );
  const zip = new JSZip();
  zip.file('word/document.xml', 'a'.repeat(20_000_001));
  await assert.rejects(
    importOffice(
      'bomb.docx',
      await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    ),
    /解压后过大/,
  );
});

test('native model rejects duplicate IDs, malformed trees and excessive nesting', () => {
  assert.equal(
    contentSchema.safeParse({
      type: 'slide',
      slides: Array.from({ length: 2 }, () => ({
        id: 'same',
        title: 'Title',
        body: '',
        notes: '',
        theme: 'paper',
      })),
    }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      type: 'word',
      doc: { type: 'doc', content: [{ type: 'text', text: 'invalid root child' }] },
    }).success,
    false,
  );
  let node: any = { type: 'paragraph' };
  for (let i = 0; i < 50; i++) node = { type: 'blockquote', content: [node] };
  assert.equal(
    contentSchema.safeParse({ type: 'word', doc: { type: 'doc', content: [node] } }).success,
    false,
  );
});
