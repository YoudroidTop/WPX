import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createCalculator } from '../shared/formulas';
import { exportOffice, importOffice } from '../server/office';

const cells = { A1: '12', A2: '8', A3: '', A4: 'text' };
const cases: [string, number | string][] = [
  ['$A$1+A$2', 20],
  ['$A1*2', 24],
  ['$a$1+a$2', 20],
  ['SUM($A$1:$A$2)', 20],
  ['SUM(A$2:$A1)', 20],
  ['AVERAGE($A$1,$A$3,$A4)', 12],
  ['COUNT($A$1:$A$4)', 2],
  ['SUM($A$1,$A$2*2)', 28],
  ['MAX($A$1,$A$2)', 12],
  ['MIN($A$1,$A$2)', 8],
  ['$BA$1', '#REF!'],
  ['$A$501', '#REF!'],
  ['SUM($A$1:$BA$1)', '#REF!'],
  ['$B$1', '#CYCLE!'],
];
test('absolute and mixed references evaluate with the same bounds and aggregate rules', () => {
  for (const [formula, expected] of cases)
    assert.equal(createCalculator({ ...cells, B1: '=' + formula })('B1'), expected, formula);
  for (const formula of ['$$A1', '$A$$1', 'A1$', '$ A1', 'A$ 1'])
    assert.match(String(createCalculator({ ...cells, B1: '=' + formula })('B1')), /^#/, formula);
  assert.equal(createCalculator({ A1: '=$B1', B1: '=A$1' })('A1'), '#CYCLE!');
});
test('XLSX roundtrip preserves reference markers and calculated caches', async () => {
  const numericCases = cases.filter(
    (item): item is [string, number] => typeof item[1] === 'number',
  );
  const source = {
    ...cells,
    ...Object.fromEntries(numericCases.map(([formula], i) => [`B${i + 1}`, '=' + formula])),
  };
  const bytes = await exportOffice({
    type: 'sheet',
    sheets: [{ id: 'references', name: 'References', cells: source }],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  for (const [i, [formula, value]] of numericCases.entries()) {
    assert.equal(workbook.worksheets[0].getCell(`B${i + 1}`).formula, formula);
    assert.equal(workbook.worksheets[0].getCell(`B${i + 1}`).result, value);
  }
  const restored = await importOffice('references.xlsx', bytes);
  assert.equal(restored.type, 'sheet');
  if (restored.type !== 'sheet') throw new Error('Unexpected document type');
  const calculate = createCalculator(restored.sheets[0].cells);
  for (const [i, [formula, value]] of numericCases.entries()) {
    assert.equal(restored.sheets[0].cells[`B${i + 1}`], '=' + formula);
    assert.equal(calculate(`B${i + 1}`), value);
  }
});
