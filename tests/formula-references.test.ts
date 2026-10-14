import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createCalculator } from '../shared/formulas';
import { exportOffice } from '../server/office';

const cells = { A1: '12', A2: '', A3: 'label', A4: '-8', A5: '0' };
const cases: [string, number | string][] = [
  ['COUNT(A2)', 0],
  ['COUNT(A3)', 0],
  ['COUNT(A1,A2,A3,A4,A5)', 3],
  ['AVERAGE(A1,A2,A3)', 12],
  ['SUM(A1,A2,A3)', 12],
  ['MIN(A1,A2)', 12],
  ['MAX(A4,A2)', -8],
  ['AVERAGE(A2,A3)', '#DIV/0!'],
  ['AVERAGE(A1,A5)', 6],
  ['SUM(A3)', 0],
  ['MIN(A3)', 0],
  ['MAX(A3)', 0],
  ['COUNT(A2+0)', 1],
  ['SUM(A3+0)', '#VALUE!'],
  ['AVERAGE(A1,A2+0)', 6],
  ['SUM(A1,COUNT(A2),2*3)', 18],
  ['SUM(BA1)', '#REF!'],
  ['SUM(A501)', '#REF!'],
  ['SUM(A1,)', '#NAME?'],
];

test('aggregate direct references ignore blank and text while expressions retain coercion', () => {
  for (const [formula, expected] of cases) {
    assert.equal(createCalculator({ ...cells, B1: '=' + formula })('B1'), expected, formula);
  }
  for (const name of ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT']) {
    const calculate = createCalculator({
      ...cells,
      B1: `=${name}(A1,A2,A3,A4,A5)`,
      B2: `=${name}(A1:A5)`,
    });
    assert.equal(calculate('B1'), calculate('B2'), name);
  }
});

test('XLSX caches corrected aggregate results alongside the original formulas', async () => {
  const numericCases = cases.filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  const formulas = Object.fromEntries(
    numericCases.map(([formula], i) => [`B${i + 1}`, '=' + formula]),
  );
  const bytes = await exportOffice({
    type: 'sheet',
    sheets: [{ id: 'aggregates', name: 'Aggregates', cells: { ...cells, ...formulas } }],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  for (const [i, [formula, result]] of numericCases.entries()) {
    assert.equal(workbook.worksheets[0].getCell(`B${i + 1}`).formula, formula);
    assert.equal(workbook.worksheets[0].getCell(`B${i + 1}`).result, result, formula);
  }
});
