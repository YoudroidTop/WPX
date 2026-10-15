import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSchema, type SheetContent, type SheetPage } from '../shared/documents';
import { changeSheetStructure, shiftRange } from '../shared/sheet-structure';
import {
  applyValidation,
  clearValidation,
  invalidCells,
  isValidValue,
  parseListOptions,
  validationAt,
} from '../shared/sheet-validation';
import { createCalculator } from '../shared/formulas';
import { exportOffice, importOffice } from '../server/office';

const sheet: SheetPage = { id: 's', name: 'S', cells: {} };
const list = { type: 'list' as const, options: ['是', '否'] };

test('rules check list membership, numbers and text length; blanks always pass', () => {
  assert.equal(isValidValue(list, '是'), true);
  assert.equal(isValidValue(list, '也许'), false);
  assert.equal(isValidValue(list, ''), true);
  const score = { type: 'number' as const, min: 0, max: 100, integer: true };
  assert.equal(isValidValue(score, 100), true);
  assert.equal(isValidValue(score, '99.5'), false);
  assert.equal(isValidValue(score, 'abc'), false);
  assert.equal(isValidValue({ type: 'textLength', max: 3 }, 'abcd'), false);
});

test('a new rule replaces overlapping coverage by splitting older rules', () => {
  const first = applyValidation(
    sheet,
    { top: 1, bottom: 10, left: 0, right: 0 },
    list,
    'stop',
    'a',
  )!;
  const second = applyValidation(
    first,
    { top: 4, bottom: 5, left: 0, right: 0 },
    { type: 'number' },
    'warning',
    'b',
  )!;
  assert.deepEqual(
    second.validations!.map((v) => v.range),
    ['A1:A3', 'A6:A10', 'A4:A5'],
  );
  assert.equal(validationAt(second.validations, { row: 4, col: 0 })?.id, 'b');
  assert.equal(validationAt(second.validations, { row: 9, col: 0 })?.rule.type, 'list');
  const cleared = clearValidation(second, { top: 1, bottom: 500, left: 0, right: 0 });
  assert.deepEqual(cleared.validations, []);
});

test('ranges grow, shrink, clamp and disappear with structure changes', () => {
  assert.equal(shiftRange('A2:A500', 'row', 10, 3, 'insert'), 'A2:A500');
  assert.equal(shiftRange('A2:A5', 'row', 1, 1, 'insert'), 'A3:A6');
  assert.equal(shiftRange('A2:A5', 'row', 3, 2, 'delete'), 'A2:A3');
  assert.equal(shiftRange('B2:C5', 'col', 1, 2, 'delete'), null);
  assert.equal(shiftRange('B2:D5', 'col', 0, 1, 'delete'), 'A2:C5');
  const withRule = applyValidation(sheet, { top: 2, bottom: 5, left: 1, right: 1 }, list, 'stop')!;
  assert.equal(
    changeSheetStructure(withRule, 'col', 0, 1, 'insert').validations![0].range,
    'C2:C5',
  );
  assert.deepEqual(changeSheetStructure(withRule, 'col', 1, 1, 'delete').validations, []);
});

test('invalidCells flags values that break their rule using calculated values', () => {
  const base = applyValidation(sheet, { top: 1, bottom: 3, left: 0, right: 0 }, list, 'warning')!;
  const page: SheetPage = {
    ...applyValidation(
      base,
      { top: 1, bottom: 2, left: 1, right: 1 },
      { type: 'number', max: 10 },
      'stop',
    )!,
    cells: { A1: '是', A2: '不', B1: '=2*3', B2: '=4*5', C1: 'free' },
  };
  assert.deepEqual([...invalidCells(page, createCalculator(page.cells))].sort(), ['A2', 'B2']);
});

test('list input is split on newlines or commas and de-duplicated', () => {
  assert.deepEqual(parseListOptions('已完成, 进行中\n待处理，已完成'), [
    '已完成',
    '进行中',
    '待处理',
  ]);
});

test('the schema rejects commas in options, bad ranges and oversized lists', () => {
  const doc = (validations: unknown): unknown => ({
    type: 'sheet',
    sheets: [{ ...sheet, validations }],
  });
  const ok = { id: 'v', range: 'A1:B9', rule: list, mode: 'stop' };
  assert.equal(contentSchema.safeParse(doc([ok])).success, true);
  assert.equal(
    contentSchema.safeParse(doc([{ ...ok, rule: { type: 'list', options: ['a,b'] } }])).success,
    false,
  );
  assert.equal(contentSchema.safeParse(doc([{ ...ok, range: 'A1:ZZ9' }])).success, false);
  assert.equal(
    contentSchema.safeParse(doc([{ ...ok, rule: { type: 'number', min: 5, max: 1 } }])).success,
    false,
  );
  const long = Array.from({ length: 20 }, (_, i) => `option-${i}-xxxxxxxx`);
  assert.equal(
    contentSchema.safeParse(doc([{ ...ok, rule: { type: 'list', options: long } }])).success,
    false,
  );
});

test('validations round-trip through XLSX', async () => {
  const document: SheetContent = {
    type: 'sheet',
    sheets: [
      {
        ...sheet,
        cells: { A1: '是' },
        validations: [
          { id: '1', range: 'A1:B20', rule: list, mode: 'stop' },
          {
            id: '2',
            range: 'C2',
            rule: { type: 'number', min: 1, integer: true },
            mode: 'warning',
          },
          { id: '3', range: 'D1:D4', rule: { type: 'textLength', max: 8 }, mode: 'stop' },
          { id: '4', range: 'E1:E2', rule: { type: 'number' }, mode: 'stop' },
        ],
      },
    ],
  };
  const imported = (await importOffice('book.xlsx', await exportOffice(document))) as SheetContent;
  const simplified = imported.sheets[0].validations!.map(({ range, rule, mode }) => ({
    range,
    rule,
    mode,
  }));
  assert.deepEqual(
    simplified.sort((a, b) => a.range.localeCompare(b.range)),
    document.sheets[0].validations!.map(({ range, rule, mode }) => ({ range, rule, mode })),
  );
});
