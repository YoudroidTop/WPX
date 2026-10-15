import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { contentSchema, type SheetContent, type SheetPage } from '../shared/documents';
import { changeSheetStructure } from '../shared/sheet-structure';
import {
  createAutoFilter,
  filterBounds,
  filterColumnValues,
  filteredRows,
  removeAutoFilter,
  setColumnFilter,
} from '../shared/sheet-filter';
import { createCalculator } from '../shared/formulas';
import { exportOffice, importOffice } from '../server/office';

const table: SheetPage = {
  id: 's',
  name: 'S',
  cells: {
    A1: '城市',
    B1: '销量',
    A2: '北京',
    B2: '10',
    A3: '上海',
    B3: '=B2*2',
    A4: '北京',
    B4: '5',
    A5: '',
    B5: '7',
  },
  autoFilter: { range: 'A1:B5', columns: {} },
};
const valueAt = (sheet: SheetPage) => createCalculator(sheet.cells);

test('creating a filter from one cell covers its region with the top row as header', () => {
  const sheet = createAutoFilter(removeAutoFilter(table), {
    anchor: { row: 3, col: 1 },
    focus: { row: 3, col: 1 },
  });
  assert.deepEqual(sheet?.autoFilter, { range: 'A1:B5', columns: {} });
  assert.equal(
    createAutoFilter(
      { id: 'e', name: 'E', cells: {} },
      {
        anchor: { row: 1, col: 0 },
        focus: { row: 1, col: 0 },
      },
    ),
    null,
  );
});

test('hidden values hide matching rows using calculated values and blanks', () => {
  let sheet = setColumnFilter(table, 0, ['北京']);
  assert.deepEqual([...filteredRows(sheet, valueAt(sheet))], [2, 4]);
  sheet = setColumnFilter(sheet, 1, ['20']);
  assert.deepEqual([...filteredRows(sheet, valueAt(sheet))].sort(), [2, 3, 4]);
  sheet = setColumnFilter(table, 0, ['']);
  assert.deepEqual([...filteredRows(sheet, valueAt(sheet))], [5]);
  assert.equal(setColumnFilter(sheet, 0, []).autoFilter!.columns.A, undefined);
});

test('column values are distinct, sorted, and narrowed by other columns', () => {
  assert.deepEqual(filterColumnValues(table, valueAt(table), 0), ['北京', '上海', '']);
  assert.deepEqual(filterColumnValues(table, valueAt(table), 1), ['5', '7', '10', '20']);
  const sheet = setColumnFilter(table, 0, ['北京']);
  assert.deepEqual(filterColumnValues(sheet, valueAt(sheet), 1), ['7', '20']);
});

test('rows appended directly below the range are filtered too', () => {
  const sheet = setColumnFilter({ ...table, cells: { ...table.cells, A6: '北京' } }, 0, ['北京']);
  assert.equal(filterBounds(sheet)?.bottom, 6);
  assert.ok(filteredRows(sheet, valueAt(sheet)).has(6));
});

test('structure changes shift the range, re-key columns and drop the filter with its header', () => {
  const sheet = setColumnFilter(table, 1, ['5']);
  const colInserted = changeSheetStructure(sheet, 'col', 0, 1, 'insert');
  assert.deepEqual(colInserted.autoFilter, { range: 'B1:C5', columns: { C: { hidden: ['5'] } } });
  const colDeleted = changeSheetStructure(sheet, 'col', 1, 1, 'delete');
  assert.deepEqual(colDeleted.autoFilter, { range: 'A1:A5', columns: {} });
  const rowInserted = changeSheetStructure(sheet, 'row', 1, 2, 'insert');
  assert.equal(rowInserted.autoFilter?.range, 'A3:B7');
  assert.equal(changeSheetStructure(sheet, 'row', 1, 1, 'delete').autoFilter, undefined);
  assert.equal(changeSheetStructure(sheet, 'row', 3, 1, 'delete').autoFilter?.range, 'A1:B4');
});

test('the schema keeps the filter and rejects bad column keys', () => {
  const document: SheetContent = { type: 'sheet', sheets: [setColumnFilter(table, 0, ['北京'])] };
  assert.deepEqual(contentSchema.parse(document), document);
  const bad = { ...table, autoFilter: { range: 'A1:B5', columns: { a1: { hidden: [] } } } };
  assert.equal(contentSchema.safeParse({ type: 'sheet', sheets: [bad] }).success, false);
});

test('XLSX keeps the filter range and hides filtered rows', async () => {
  const sheet = setColumnFilter(table, 0, ['北京']);
  const bytes = await exportOffice({ type: 'sheet', sheets: [sheet] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const ws = workbook.worksheets[0];
  assert.equal(ws.getRow(2).hidden, true);
  assert.equal(ws.getRow(3).hidden, false);
  const imported = (await importOffice('book.xlsx', bytes)) as SheetContent;
  assert.deepEqual(imported.sheets[0].autoFilter, { range: 'A1:B5', columns: {} });
});
