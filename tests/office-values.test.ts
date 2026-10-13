import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportOffice, importOffice } from '../server/office';

test('XLSX preserves numeric-looking text without changing ordinary numbers or formulas', async () => {
  const textValues = [
    '00123',
    '9007199254740993',
    '1234567890123456',
    '0.1234567890123456',
    '1.00',
    '+120',
    '-0',
    ' 120 ',
    '1e3',
    '0x10',
    '1e+21',
    '1e-7',
  ];
  const numericValues = ['0', '120', '-80', '12.5', '0.000001', '123456789012345'];
  const cells: Record<string, string> = {};
  textValues.forEach((value, i) => {
    cells[`A${i + 1}`] = value;
  });
  numericValues.forEach((value, i) => {
    cells[`B${i + 1}`] = value;
  });
  cells.C1 = '=SUM(B2:B3)';
  const bytes = await exportOffice({
    type: 'sheet',
    sheets: [{ id: 'sheet', name: 'Values', cells }],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  textValues.forEach((value, i) => assert.equal(sheet.getCell(`A${i + 1}`).value, value));
  numericValues.forEach((value, i) =>
    assert.equal(sheet.getCell(`B${i + 1}`).value, Number(value)),
  );
  assert.equal(sheet.getCell('C1').formula, 'SUM(B2:B3)');
  assert.equal(sheet.getCell('C1').result, 40);
  const imported = await importOffice('values.xlsx', bytes);
  assert.equal(imported.type, 'sheet');
  if (imported.type === 'sheet') assert.deepEqual(imported.sheets[0].cells, cells);
});
