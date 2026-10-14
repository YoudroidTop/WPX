import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeSheetStructure, shiftFormula, validSheetName } from '../shared/sheet-structure';
import { contentSchema, type SheetContent } from '../shared/documents';
import { createCalculator } from '../shared/formulas';
import { exportOffice, importOffice } from '../server/office';

test('row and column insertion shifts cells, dimensions and absolute/mixed references', () => {
  const page = {
    id: 'one',
    name: 'Sheet',
    cells: { A1: '10', A2: '20', B3: '=SUM($A$1:A2)+A$2' },
    rowHeights: { 2: 48 },
    columnWidths: { 1: 180 },
  };
  const inserted = changeSheetStructure(page, 'row', 2, 2, 'insert');
  assert.deepEqual(inserted.cells, { A1: '10', A4: '20', B5: '=SUM($A$1:A4)+A$4' });
  assert.deepEqual(inserted.rowHeights, { 4: 48 });
  assert.equal(createCalculator(inserted.cells)('B5'), 50);
  const column = changeSheetStructure(inserted, 'col', 0, 1, 'insert');
  assert.equal(column.cells.C5, '=SUM($B$1:B4)+B$4');
  assert.deepEqual(column.columnWidths, { 2: 180 });
  assert.equal(page.cells.A2, '20');
});
test('deletion shrinks ranges and reports removed references instead of silently reading another cell', () => {
  assert.equal(shiftFormula('=SUM(A1:A5)', 'row', 2, 2, 'delete'), '=SUM(A1:A3)');
  assert.equal(shiftFormula('=SUM(A5:A1)', 'row', 2, 2, 'delete'), '=SUM(A3:A1)');
  assert.equal(shiftFormula('=SUM(A2:A3)', 'row', 2, 2, 'delete'), '=SUM(#REF!)');
  assert.equal(shiftFormula('=$A$2+2', 'row', 2, 1, 'delete'), '=#REF!+2');
  assert.equal(createCalculator({ A1: '=SUM(#REF!)' })('A1'), '#REF!');
  const page = { id: 'x', name: 'Sheet', cells: { A1: 'keep', A2: 'remove', A4: '=A2' } };
  assert.deepEqual(changeSheetStructure(page, 'row', 2, 1, 'delete').cells, {
    A1: 'keep',
    A3: '=#REF!',
  });
});
test('structural insertion refuses to drop occupied edge cells and validates worksheet names', () => {
  const page = { id: 'x', name: 'Sheet', cells: { AZ500: 'keep' } };
  assert.throws(() => changeSheetStructure(page, 'row', 1, 1, 'insert'), /occupied-edge/);
  assert.throws(() => changeSheetStructure(page, 'col', 0, 1, 'insert'), /occupied-edge/);
  for (const name of ['', 'Sheet', 'sheet', 'a/b', 'x'.repeat(32)])
    assert.equal(validSheetName(name, [page]), false);
  assert.equal(validSheetName('Renamed', [page]), true);
});
test('optional dimensions survive native validation and XLSX round trip', async () => {
  const content: SheetContent = {
    type: 'sheet',
    sheets: [
      {
        id: 's',
        name: 'Sheet',
        cells: { A1: '5', B2: '=A1*2' },
        columnWidths: { 0: 215, 3: 89 },
        rowHeights: { 1: 48, 4: 72 },
      },
    ],
  };
  assert.deepEqual(contentSchema.parse(content), content);
  const imported = await importOffice('dimensions.xlsx', await exportOffice(content));
  assert.equal(imported.type, 'sheet');
  if (imported.type !== 'sheet') return;
  assert.equal(imported.sheets[0].columnWidths?.[0], 215);
  assert.equal(imported.sheets[0].columnWidths?.[3], 89);
  assert.deepEqual(imported.sheets[0].rowHeights, { 1: 48, 4: 72 });
  assert.deepEqual(imported.sheets[0].cells, content.sheets[0].cells);
  assert.throws(() =>
    contentSchema.parse({
      ...content,
      sheets: [{ ...content.sheets[0], rowHeights: { 501: 30 } }],
    }),
  );
});
