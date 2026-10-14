import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSelection,
  selectionLabel,
  copySelection,
  clearSelection,
  selectionStats,
} from '../shared/sheet-selection';

test('selection accepts reversed rectangles and enforces worksheet limits', () => {
  const selection = parseSelection(' c3:a1 ')!;
  assert.equal(selectionLabel(selection), 'A1:C3');
  assert.equal(selectionLabel(parseSelection('AZ500')!), 'AZ500');
  for (const value of ['A0', 'BA1', 'A501', 'A1:B2:C3', 'A1 junk', ''])
    assert.equal(parseSelection(value), null);
});
test('range copy and clear preserve formulas and cells outside the rectangle', () => {
  const cells = Object.freeze({ A1: '120', B1: '=A1+80', A2: '你好', C1: 'keep' });
  const selection = parseSelection('B2:A1')!;
  assert.equal(copySelection(cells, selection), '120\t=A1+80\n你好\t');
  assert.deepEqual(clearSelection(cells, selection), { C1: 'keep' });
  assert.equal(cells.A1, '120');
});
test('selection statistics use formula results while ignoring text, blanks and errors', () => {
  const cells = { A1: '120', B1: '=A1+80', A2: '你好', B2: '=1/0' };
  assert.deepEqual(selectionStats(cells, parseSelection('A1:C3')!), {
    count: 4,
    numericCount: 2,
    sum: 320,
    average: 160,
  });
  assert.deepEqual(selectionStats({}, parseSelection('A1:AZ500')!), {
    count: 0,
    numericCount: 0,
    sum: 0,
    average: null,
  });
});
