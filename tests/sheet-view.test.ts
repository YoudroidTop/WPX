import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentSchema, type SheetContent, type SheetPage } from '../shared/documents';
import { frozenOffsets, shiftFrozenBoundary } from '../shared/sheet-view';
import { changeSheetStructure } from '../shared/sheet-structure';
import { exportOffice, importOffice } from '../server/office';

test('frozen offsets respect custom dimensions and heading sizes', () => {
  assert.deepEqual(
    frozenOffsets(3, 29, (i) => [48, 36, 29][i]),
    { offsets: [29, 77, 113], size: 142 },
  );
  assert.deepEqual(
    frozenOffsets(2, 44, (i) => [215, 100][i]),
    { offsets: [44, 259], size: 359 },
  );
  assert.deepEqual(
    frozenOffsets(0, 44, () => 120),
    { offsets: [], size: 44 },
  );
});

test('freeze boundary follows insertion and deletion before it, not after it', () => {
  assert.equal(shiftFrozenBoundary(3, 1, 2, 'insert', 499), 5);
  assert.equal(shiftFrozenBoundary(3, 3, 2, 'insert', 499), 3);
  assert.equal(shiftFrozenBoundary(3, 1, 5, 'delete', 499), 1);
  assert.equal(shiftFrozenBoundary(3, 0, 3, 'delete', 499), 0);
  assert.equal(shiftFrozenBoundary(499, 1, 2, 'insert', 499), 499);
  const page: SheetPage = { id: 's', name: 'Sheet', cells: {}, frozenRows: 2, frozenColumns: 2 };
  const moved = changeSheetStructure(page, 'row', 1, 1, 'insert');
  assert.equal(moved.frozenRows, 3);
  assert.equal(moved.frozenColumns, 2);
  assert.equal(changeSheetStructure(moved, 'col', 0, 2, 'delete').frozenColumns, 0);
  assert.equal(page.frozenRows, 2);
});

test('frozen rows and columns survive native and XLSX round trips', async () => {
  for (const [frozenRows, frozenColumns] of [
    [1, 0],
    [0, 1],
    [2, 3],
  ]) {
    const doc: SheetContent = {
      type: 'sheet',
      sheets: [{ id: 's', name: 'Sheet', cells: { A1: '10' }, frozenRows, frozenColumns }],
    };
    assert.deepEqual(await importOffice('test.zdoc', Buffer.from(JSON.stringify(doc))), doc);
    const imported = await importOffice('test.xlsx', await exportOffice(doc));
    assert.equal(imported.type, 'sheet');
    if (imported.type === 'sheet') {
      assert.equal(imported.sheets[0].frozenRows, frozenRows);
      assert.equal(imported.sheets[0].frozenColumns, frozenColumns);
    }
  }
  const doc = { type: 'sheet', sheets: [{ id: 's', name: 'Sheet', cells: {}, frozenRows: 500 }] };
  assert.equal(contentSchema.safeParse(doc).success, false);
  doc.sheets[0].frozenRows = -1;
  assert.equal(contentSchema.safeParse(doc).success, false);
});
