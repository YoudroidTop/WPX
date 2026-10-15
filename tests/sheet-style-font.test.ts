import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readCellStyle, writeCellStyle } from '../server/sheet-style';
import { formatSelection } from '../shared/sheet-format';

test('font family and size round-trip through XLSX cell styles', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('S');
  writeCellStyle(sheet.getCell('A1'), { bold: true, fontFamily: '华文楷体', fontSize: 14 });
  sheet.getCell('A2').value = 'plain';
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  const reloaded = loaded.getWorksheet('S')!;
  assert.deepEqual(readCellStyle(reloaded.getCell('A1')), {
    bold: true,
    fontFamily: '华文楷体',
    fontSize: 14,
  });
  assert.deepEqual(readCellStyle(reloaded.getCell('A2')), {});
});

test('an undefined patch value clears the property and drops empty styles', () => {
  const sheet = { id: 's', name: 'S', cells: {}, styles: { A1: { color: '#ff0000' } } };
  const selection = { anchor: { row: 1, col: 0 }, focus: { row: 1, col: 0 } };
  const next = formatSelection(sheet, selection, { color: undefined });
  assert.equal(next.styles?.A1, undefined);
});
