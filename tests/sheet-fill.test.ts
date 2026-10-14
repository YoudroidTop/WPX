import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copySheetRange, fillSheetRange, translateFormula } from '../shared/sheet-fill';
import { decodeSheetClipboard, encodeSheetClipboard } from '../shared/sheet-clipboard';
import { parseSelection } from '../shared/sheet-selection';
import { type SheetPage, MAX_CELL_LENGTH } from '../shared/documents';
import { createCalculator } from '../shared/formulas';

test('relative translation respects locks, ranges, strings, errors and bounds', () => {
  assert.equal(translateFormula('=SUM(A1:$B$3)+$C1+D$2', 2, 1), '=SUM(B3:$B$3)+$C3+E$2');
  assert.equal(translateFormula('=A1+$A$1', -1, 0), '=#REF!+$A$1');
  assert.equal(translateFormula('=AZ500', 1, 1), '=#REF!');
  assert.equal(translateFormula('=#REF!+A1', 1, 0), '=#REF!+A2');
  assert.equal(translateFormula('="A1"&A1', 1, 1), '="A1"&B2');
  assert.equal(translateFormula('=Sheet1!A1', 1, 1), '=Sheet1!A1');
  assert.equal(translateFormula('A1', 1, 1), 'A1');
  assert.equal(translateFormula('=1E10+A1', 1, 1), '=1E10+B2');
});

test('overlapping copies read an immutable snapshot and replace target styles', () => {
  const page: SheetPage = {
    id: 's',
    name: 'Sheet',
    cells: { A1: '10', A2: '=A1*2', A3: 'old' },
    styles: { A1: { bold: true }, A3: { italic: true } },
  };
  const next = copySheetRange(page, parseSelection('A1:A2')!, page, { row: 2, col: 0 });
  assert.deepEqual(next.cells, { A1: '10', A2: '10', A3: '=A2*2' });
  assert.equal(createCalculator(next.cells)('A3'), 20);
  assert.deepEqual(next.styles?.A2, { bold: true });
  assert.equal(next.styles?.A3, undefined);
  assert.equal(page.cells.A2, '=A1*2');
  assert.deepEqual(page.styles?.A3, { italic: true });
});

test('directional fill copies source values, formula locks and styled blanks', () => {
  const page: SheetPage = {
    id: 's',
    name: 'Sheet',
    cells: { A1: '2', B1: '=A1*$A$1', A2: '9', B2: 'old', C2: 'old' },
    styles: { B1: { color: '#ff0000' }, C1: { fill: '#ffffff' } },
  };
  const down = fillSheetRange(page, parseSelection('A1:C3')!, 'down');
  assert.equal(down.cells.B3, '=A3*$A$1');
  assert.equal(createCalculator(down.cells)('B3'), 4);
  assert.equal(down.cells.C2, undefined);
  assert.deepEqual(down.styles?.C3, { fill: '#ffffff' });
  const right = fillSheetRange(
    { ...page, cells: { A1: '=$A1+A$1' } },
    parseSelection('A1:C1')!,
    'right',
  );
  assert.equal(right.cells.C1, '=$A1+C$1');
});

test('copy rejects overflow atomically and clipboard validates untrusted data', () => {
  const page: SheetPage = {
    id: 's',
    name: 'Sheet',
    cells: { A1: 'keep', A2: '=A1' },
    styles: { A1: { bold: true } },
  };
  assert.throws(
    () => copySheetRange(page, parseSelection('A1:A2')!, page, { row: 500, col: 0 }),
    /range/,
  );
  const long: SheetPage = {
    ...page,
    cells: { A1: '=' + 'A1+'.repeat(Math.floor(MAX_CELL_LENGTH / 3) - 1) + '1' },
  };
  assert.throws(
    () => copySheetRange(long, parseSelection('A1')!, page, { row: 499, col: 50 }),
    /cell-length/,
  );
  assert.equal(page.cells.A1, 'keep');
  const serialized = encodeSheetClipboard(page, parseSelection('A1:A2')!);
  const decoded = decodeSheetClipboard(serialized)!;
  assert.deepEqual(decoded.sheet.cells, page.cells);
  assert.deepEqual(decoded.sheet.styles, page.styles);
  assert.equal(decodeSheetClipboard('{bad'), null);
  assert.equal(
    decodeSheetClipboard(JSON.stringify({ version: 2, range: 'A1', sheet: page })),
    null,
  );
  assert.equal(
    decodeSheetClipboard(JSON.stringify({ version: 1, range: 'ZZ999', sheet: page })),
    null,
  );
  assert.equal(
    decodeSheetClipboard(
      JSON.stringify({
        version: 1,
        range: 'A1',
        sheet: { ...page, styles: { A1: { color: 'url(bad)' } } },
      }),
    ),
    null,
  );
});
