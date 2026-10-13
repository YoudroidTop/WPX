import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { exportOffice, importOffice } from '../server/office';
import type { RichNode, WordContent } from '../shared/documents';

const paragraph = (text: string): RichNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

test('DOCX round trip preserves interleaved tables, whitespace, breaks and basic marks', async () => {
  const content: WordContent = {
    type: 'word',
    doc: {
      type: 'doc',
      content: [
        paragraph(' Before & after '),
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [paragraph(' Cell one '), paragraph('Second paragraph')],
                },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [] }] },
              ],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2, textAlign: 'center' },
          content: [
            {
              type: 'text',
              text: ' Start ',
              marks: [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'strike' },
                { type: 'underline' },
              ],
            },
            { type: 'hardBreak' },
            { type: 'text', text: ' End ' },
          ],
        },
      ],
    },
  };
  const restored = await importOffice('roundtrip.docx', await exportOffice(content));
  assert.equal(restored.type, 'word');
  if (restored.type !== 'word') return;
  assert.deepEqual(
    restored.doc.content?.map((n) => n.type),
    ['paragraph', 'table', 'heading'],
  );
  const [first, table, heading] = restored.doc.content!;
  assert.equal(first.content?.[0].text, ' Before & after ');
  assert.deepEqual(table, content.doc.content![1]);
  assert.deepEqual(heading, content.doc.content![2]);
});

test('DOCX inline order and disabled formatting are respected', async () => {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:rPr><w:b w:val="0"/><w:i w:val="false"/><w:u w:val="none"/></w:rPr><w:t> one </w:t><w:tab/><w:t>two</w:t><w:br/><w:t>three</w:t></w:r></w:p></w:body></w:document>',
  );
  const restored = await importOffice(
    'inline.docx',
    await zip.generateAsync({ type: 'nodebuffer' }),
  );
  assert.equal(restored.type, 'word');
  if (restored.type === 'word')
    assert.deepEqual(restored.doc.content?.[0].content, [
      { type: 'text', text: ' one ' },
      { type: 'text', text: '\t' },
      { type: 'text', text: 'two' },
      { type: 'hardBreak' },
      { type: 'text', text: 'three' },
    ]);
});

test('DOCX rejects entity declarations, missing body and unsupported nested tables', async () => {
  for (const [xml, error] of [
    ['<!DOCTYPE w:document [<!ENTITY x "text">]><w:document><w:body/></w:document>', /实体声明/],
    ['<w:document/>', /有效的 Word/],
    [
      '<w:document><w:body><w:tbl><w:tr><w:tc><w:tbl/></w:tc></w:tr></w:tbl></w:body></w:document>',
      /嵌套表格/,
    ],
  ] as const) {
    const zip = new JSZip();
    zip.file('word/document.xml', xml);
    await assert.rejects(
      importOffice('invalid.docx', await zip.generateAsync({ type: 'nodebuffer' })),
      error,
    );
  }
});
