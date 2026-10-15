import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentSchema,
  MAX_SHEET_COMMENTS,
  type SheetContent,
  type SheetPage,
} from '../shared/documents';
import { changeSheetStructure } from '../shared/sheet-structure';
import { removeDuplicateRows, setCellComment, sortSheetRows } from '../shared/sheet-data';
import { exportOffice, importOffice } from '../server/office';

const base: SheetPage = {
  id: 's',
  name: 'S',
  cells: { A1: 'b', A2: 'a', B3: 'x' },
  comments: { A1: { text: 'on b' }, B3: { text: 'on x' } },
};

test('comments shift with inserted and deleted rows and columns', () => {
  const rowInserted = changeSheetStructure(base, 'row', 2, 2, 'insert');
  assert.deepEqual(Object.keys(rowInserted.comments ?? {}).sort(), ['A1', 'B5']);
  const colDeleted = changeSheetStructure(base, 'col', 1, 1, 'delete');
  assert.deepEqual(colDeleted.comments, { A1: { text: 'on b' } });
  const rowDeleted = changeSheetStructure(base, 'row', 1, 1, 'delete');
  assert.deepEqual(rowDeleted.comments, { B2: { text: 'on x' } });
});

test('comments move with their rows when sorting', () => {
  const sorted = sortSheetRows(base, { top: 1, bottom: 2, left: 0, right: 0 }, 'asc');
  assert.equal(sorted.cells.A1, 'a');
  assert.deepEqual(sorted.comments?.A2, { text: 'on b' });
  assert.equal(sorted.comments?.A1, undefined);
  assert.deepEqual(sorted.comments?.B3, { text: 'on x' });
});

test('removing duplicate rows keeps the comment of the surviving row', () => {
  const sheet: SheetPage = {
    id: 's',
    name: 'S',
    cells: { A1: 'k', A2: 'k', A3: 'z' },
    comments: { A3: { text: 'z note' } },
  };
  const { sheet: next } = removeDuplicateRows(
    sheet,
    { top: 1, bottom: 3, left: 0, right: 0 },
    false,
  );
  assert.deepEqual(next.comments, { A2: { text: 'z note' } });
});

test('setCellComment trims, stamps and removes blank comments', () => {
  const added = setCellComment(base, 'C1', '  hello ', 42);
  assert.deepEqual(added.comments?.C1, { text: 'hello', updatedAt: 42 });
  assert.equal(setCellComment(added, 'C1', '   ').comments?.C1, undefined);
});

test('the schema keeps comments and enforces the per-sheet cap', () => {
  const document: SheetContent = { type: 'sheet', sheets: [base] };
  assert.deepEqual(contentSchema.parse(document), document);
  const tooMany = Object.fromEntries(
    Array.from({ length: MAX_SHEET_COMMENTS + 1 }, (_, i) => [
      `${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`,
      { text: 'x' },
    ]),
  );
  const result = contentSchema.safeParse({
    type: 'sheet',
    sheets: [{ ...base, comments: tooMany }],
  });
  assert.equal(result.success, false);
});

test('comments round-trip through XLSX notes, including on empty cells', async () => {
  const document: SheetContent = {
    type: 'sheet',
    sheets: [{ ...base, comments: { ...base.comments, D9: { text: 'empty cell note' } } }],
  };
  const imported = (await importOffice('book.xlsx', await exportOffice(document))) as SheetContent;
  assert.deepEqual(imported.sheets[0].comments, {
    A1: { text: 'on b' },
    B3: { text: 'on x' },
    D9: { text: 'empty cell note' },
  });
});
