import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extendSheetRange, fillTarget } from '../shared/sheet-fill';
import { parseSelection, selectionLabel } from '../shared/sheet-selection';
import type { SheetPage } from '../shared/documents';
const range = (value: string) => parseSelection(value)!;
const page = (cells: Record<string, string>): SheetPage => ({ id: 's', name: 'Sheet', cells });

test('drag targets extend only one axis and preserve reversed selections', () => {
  assert.equal(selectionLabel(fillTarget(range('C3:A1'), { row: 7, col: 3 })), 'A1:C7');
  assert.equal(selectionLabel(fillTarget(range('B3:C4'), { row: 3, col: 0 })), 'A3:C4');
  assert.equal(selectionLabel(fillTarget(range('B3:C4'), { row: 1, col: 1 })), 'B1:C4');
  assert.equal(selectionLabel(fillTarget(range('A1:C2'), { row: 2, col: 1 })), 'A1:C2');
});
test('numeric seeds extend down, up and left without binary rounding noise', () => {
  const down = extendSheetRange(page({ A1: '0.1', A2: '0.2' }), range('A1:A2'), range('A1:A5'));
  assert.equal(down.cells.A3, '0.3');
  assert.equal(down.cells.A5, '0.5');
  const up = extendSheetRange(page({ B3: '3', B4: '5' }), range('B3:B4'), range('B1:B4'));
  assert.equal(up.cells.B1, '-1');
  assert.equal(up.cells.B2, '1');
  const left = extendSheetRange(page({ C1: '10', D1: '20' }), range('C1:D1'), range('A1:D1'));
  assert.equal(left.cells.A1, '-10');
  assert.equal(left.cells.B1, '0');
});
test('single numbers, text and irregular numbers repeat their source blocks', () => {
  assert.equal(extendSheetRange(page({ A1: '2' }), range('A1'), range('A1:A4')).cells.A4, '2');
  const original = page({ A1: '1', A2: '2', A3: '4', B1: 'a', B2: 'b' });
  const next = extendSheetRange(original, range('A1:B3'), range('A1:B6'));
  assert.equal(next.cells.A6, '4');
  assert.equal(next.cells.B4, 'a');
  assert.equal(next.cells.B5, 'b');
  assert.equal(next.cells.B6, undefined);
  assert.equal(
    extendSheetRange(page({ A1: '001', A2: '002' }), range('A1:A2'), range('A1:A3')).cells.A3,
    '001',
  );
  assert.equal(original.cells.A4, undefined);
});
test('formula and style patterns extend while preserving locks and original seeds', () => {
  const original: SheetPage = {
    ...page({ B2: '=$A2+A$1+$A$1', B3: '=A3*2' }),
    styles: { B2: { bold: true }, B3: { fill: '#ffffff' } },
  };
  const next = extendSheetRange(original, range('B2:B3'), range('B2:B6'));
  assert.equal(next.cells.B4, '=$A4+A$1+$A$1');
  assert.equal(next.cells.B5, '=A5*2');
  assert.deepEqual(next.styles?.B4, { bold: true });
  assert.deepEqual(next.styles?.B5, { fill: '#ffffff' });
  const right = extendSheetRange(original, range('B2:B3'), range('B2:D3'));
  assert.equal(right.cells.D2, '=$A2+C$1+$A$1');
  assert.deepEqual(original.cells, { B2: '=$A2+A$1+$A$1', B3: '=A3*2' });
});
test('invalid rectangles and numeric overflow are rejected atomically', () => {
  const original = page({ A1: '900000000000000', A2: '100000000000000' });
  assert.throws(() => extendSheetRange(original, range('A1:A2'), range('A1:A500')), /number-range/);
  assert.throws(() => extendSheetRange(page({ A1: '1' }), range('A1'), range('A1:C3')), /range/);
  assert.equal(original.cells.A3, undefined);
});
