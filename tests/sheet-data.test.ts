import test from 'node:test';
import assert from 'node:assert/strict';
import type { SheetPage } from '../shared/documents';
import {
  autoSumRange,
  currentRegion,
  dataRange,
  parseDelimitedText,
  removeDuplicateRows,
  sortSheetRows,
  splitTextToColumns,
} from '../shared/sheet-data';
import { createCalculator } from '../shared/formulas';

const table: SheetPage = {
  id: 's',
  name: 'S',
  cells: {
    A1: '姓名',
    B1: '销售额',
    A2: '张三',
    B2: '300',
    A3: '李四',
    B3: '100',
    A4: '王五',
    B4: '200',
  },
  styles: { A3: { bold: true }, B3: { fill: '#ff0000' } },
};

test('a single cell expands to its current region and detects the header row', () => {
  assert.deepEqual(currentRegion(table.cells, { row: 3, col: 1 }), {
    top: 1,
    bottom: 4,
    left: 0,
    right: 1,
  });
  const range = dataRange(table.cells, { anchor: { row: 2, col: 1 }, focus: { row: 2, col: 1 } });
  assert.equal(range?.hasHeader, true);
  assert.equal(
    dataRange(table.cells, { anchor: { row: 9, col: 5 }, focus: { row: 9, col: 5 } }),
    null,
  );
});

test('whole-column selections are clamped to used rows', () => {
  const range = dataRange(table.cells, { anchor: { row: 1, col: 0 }, focus: { row: 500, col: 1 } });
  assert.deepEqual(range?.bounds, { top: 1, bottom: 4, left: 0, right: 1 });
});

test('sortSheetRows keeps the header and moves styles with their rows', () => {
  const sorted = sortSheetRows(table, { top: 1, bottom: 4, left: 0, right: 1 }, 'asc', {
    sortCol: 1,
    hasHeader: true,
  });
  assert.equal(sorted.cells.A1, '姓名');
  assert.deepEqual([sorted.cells.A2, sorted.cells.A3, sorted.cells.A4], ['李四', '王五', '张三']);
  assert.deepEqual(sorted.styles?.A2, { bold: true });
  assert.deepEqual(sorted.styles?.B2, { fill: '#ff0000' });
  assert.equal(sorted.styles?.A3, undefined);
});

test('removeDuplicateRows compacts unique rows upward', () => {
  const sheet: SheetPage = {
    id: 's',
    name: 'S',
    cells: { A1: 'k', A2: 'a', B2: '1', A3: 'b', B3: '2', A4: 'a', B4: '1', A5: 'c' },
  };
  const result = removeDuplicateRows(sheet, { top: 1, bottom: 5, left: 0, right: 1 }, true);
  assert.equal(result.removed, 1);
  assert.deepEqual(
    [result.sheet.cells.A2, result.sheet.cells.A3, result.sheet.cells.A4, result.sheet.cells.A5],
    ['a', 'b', 'c', undefined],
  );
});

test('splitTextToColumns writes parts into adjacent columns', () => {
  const sheet: SheetPage = { id: 's', name: 'S', cells: { A1: 'a, b ,c', A2: 'x', B1: 'old' } };
  const result = splitTextToColumns(sheet, { top: 1, bottom: 2, left: 0, right: 0 }, 'comma');
  assert.ok(result);
  assert.deepEqual(
    [result.sheet.cells.A1, result.sheet.cells.B1, result.sheet.cells.C1, result.sheet.cells.A2],
    ['a', 'b', 'c', 'x'],
  );
  assert.equal(result.overwritten, 1);
  assert.equal(result.split, 1);
});

test('autoSumRange looks up, then left, and never includes the target', () => {
  const calc = createCalculator({ A1: 'h', A2: '1', A3: '2', C5: '4', D5: '5' });
  assert.equal(autoSumRange(calc, { row: 4, col: 0 }), 'A2:A3');
  assert.equal(autoSumRange(calc, { row: 5, col: 4 }), 'C5:D5');
  assert.equal(autoSumRange(calc, { row: 1, col: 0 }), null);
});

test('parseDelimitedText trims values and honours quotes', () => {
  assert.deepEqual(parseDelimitedText('a, b ,"c, d"\n1,2,3\n'), [
    ['a', 'b', 'c, d'],
    ['1', '2', '3'],
  ]);
  assert.deepEqual(parseDelimitedText('x\ty, z'), [['x', 'y, z']]);
});
