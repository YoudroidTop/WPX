import test from 'node:test';
import assert from 'node:assert/strict';
import { sortSheetSelection } from '../shared/sheet-sort';

test('sortSheetSelection sorts numeric values ascending and descending', () => {
  const cells = {
    A1: '10',
    A2: '2',
    A3: '100',
    A4: '20',
  };
  const sel = { anchor: { row: 1, col: 0 }, focus: { row: 4, col: 0 } };

  const asc = sortSheetSelection(cells, sel, 'asc');
  assert.equal(asc.A1, '2');
  assert.equal(asc.A2, '10');
  assert.equal(asc.A3, '20');
  assert.equal(asc.A4, '100');

  const desc = sortSheetSelection(cells, sel, 'desc');
  assert.equal(desc.A1, '100');
  assert.equal(desc.A2, '20');
  assert.equal(desc.A3, '10');
  assert.equal(desc.A4, '2');
});

test('sortSheetSelection moves multi-column row data together and puts blanks at bottom', () => {
  const cells = {
    A1: 'Alice',
    B1: '95',
    A2: '',
    B2: '80',
    A3: 'Bob',
    B3: '90',
  };
  const sel = { anchor: { row: 1, col: 0 }, focus: { row: 3, col: 1 } };

  const asc = sortSheetSelection(cells, sel, 'asc');
  assert.equal(asc.A1, 'Alice');
  assert.equal(asc.B1, '95');
  assert.equal(asc.A2, 'Bob');
  assert.equal(asc.B2, '90');
  assert.equal(asc.A3, undefined);
  assert.equal(asc.B3, '80');
});
