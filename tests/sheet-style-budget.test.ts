import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  columnName,
  contentSchema,
  MAX_CONTENT_BYTES,
  MAX_LIST_OPTIONS,
  MAX_SHEET_COMMENTS,
  MAX_SHEET_VALIDATIONS,
  type SheetContent,
} from '../shared/documents';
import { decodeSheetClipboard, encodeSheetClipboard } from '../shared/sheet-clipboard';
import { parseSelection } from '../shared/sheet-selection';

function fullSheet(): SheetContent {
  const styles = Object.fromEntries(
    Array.from({ length: 26_000 }, (_, index) => [
      `${columnName(index % 52)}${Math.floor(index / 52) + 1}`,
      { bold: true, italic: true, fill: '#fff0c2', align: 'center' as const },
    ]),
  );
  return { type: 'sheet', sheets: [{ id: 'bulk', name: 'Bulk', cells: {}, styles }] };
}

test('a full formatted sheet below the byte limit fits validation and clipboard budgets', () => {
  const document = fullSheet();
  assert.ok(Buffer.byteLength(JSON.stringify(document)) < MAX_CONTENT_BYTES);
  assert.deepEqual(contentSchema.parse(document), document);
  const clipboard = encodeSheetClipboard(document.sheets[0], parseSelection('A1:AZ500')!);
  const decoded = decodeSheetClipboard(clipboard);
  assert.ok(decoded);
  assert.deepEqual(decoded.sheet.styles, document.sheets[0].styles);
});

test('leaf accounting only applies to bounded valid styles at the sheet style map', () => {
  const document = fullSheet();
  const rejected = (value: unknown) => {
    const result = contentSchema.safeParse(value);
    assert.equal(result.success, false);
    if (!result.success)
      assert.equal(result.error.issues[0].message, 'Document structure exceeds limits');
  };
  let deep: unknown = 'x';
  for (let i = 0; i < 45; i++) deep = { nested: deep };
  rejected({
    ...document,
    sheets: [{ ...document.sheets[0], styles: { A1: { bold: true, extra: deep } } }],
  });
  rejected({ ...document, sheets: [{ ...document.sheets[0], styles: { A1: { fill: deep } } }] });
  rejected({ type: 'word', doc: { type: 'doc', content: [] }, styles: document.sheets[0].styles });
  rejected({
    ...document,
    sheets: [{ ...document.sheets[0], styles: { A1: { extra: Array(100_001).fill(1) } } }],
  });
  assert.equal(
    contentSchema.safeParse({
      ...document,
      sheets: [{ ...document.sheets[0], styles: { A1: { fill: 'invalid' } } }],
    }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      ...document,
      sheets: [{ ...document.sheets[0], styles: { ZZ999: { bold: true } } }],
    }).success,
    false,
  );
});

test('a full sheet with every cell filled plus maximum comments and validations fits the budget', () => {
  const document = fullSheet();
  const sheet = document.sheets[0];
  sheet.cells = Object.fromEntries(Object.keys(sheet.styles!).map((address) => [address, '1']));
  sheet.comments = Object.fromEntries(
    Object.keys(sheet.styles!)
      .slice(0, MAX_SHEET_COMMENTS)
      .map((address) => [address, { text: 'note', author: 'QA', updatedAt: 1 }]),
  );
  sheet.validations = Array.from({ length: MAX_SHEET_VALIDATIONS }, (_, i) => ({
    id: `v${i}`,
    range: `${columnName(i)}1:${columnName(i)}500`,
    rule: {
      type: 'list' as const,
      options: Array.from({ length: MAX_LIST_OPTIONS }, (_, j) => String(j)),
    },
    mode: 'stop' as const,
  }));
  assert.ok(Buffer.byteLength(JSON.stringify(document)) < MAX_CONTENT_BYTES);
  assert.equal(contentSchema.safeParse(document).success, true);
});
