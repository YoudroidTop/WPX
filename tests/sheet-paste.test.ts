import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasteSheetCells } from '../shared/sheet-paste';
import { MAX_CELL_LENGTH } from '../shared/documents';

test('sheet paste rejects the whole operation at every limit without changing source cells', () => {
  const cells = Object.freeze({ A1: 'keep', AZ500: 'edge' });
  for (const [text, row, column, reason] of [
    ['replace\nextra', 500, 0, 'rows'],
    ['replace\textra', 1, 51, 'columns'],
    [`replace\t${'x'.repeat(MAX_CELL_LENGTH + 1)}`, 1, 0, 'cell-length'],
  ] as const) {
    assert.deepEqual(pasteSheetCells(cells, text, row, column), { ok: false, reason });
    assert.deepEqual(cells, { A1: 'keep', AZ500: 'edge' });
  }
});

test('sheet paste preserves formulas, clears empty cells and normalizes clipboard line endings', () => {
  const cells = { A1: 'keep', B2: 'old', C2: 'clear', D2: 'outside' };
  for (const newline of ['\n', '\r\n', '\r']) {
    assert.deepEqual(pasteSheetCells(cells, `120\t${newline}80\t=SUM(B2:B3)${newline}`, 2, 1), {
      ok: true,
      cells: { A1: 'keep', B2: '120', B3: '80', C3: '=SUM(B2:B3)', D2: 'outside' },
    });
  }
  assert.equal(cells.C2, 'clear');
});

test('sheet paste accepts exact final row, column and cell length without truncation', () => {
  const text = 'x'.repeat(MAX_CELL_LENGTH);
  assert.deepEqual(pasteSheetCells({ A1: 'keep' }, `${text}\n`, 500, 51), {
    ok: true,
    cells: { A1: 'keep', AZ500: text },
  });
});
