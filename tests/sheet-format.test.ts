import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentSchema, type SheetPage, type SheetContent } from '../shared/documents';
import { formatSelection, formatCellValue, applyBorderSelection } from '../shared/sheet-format';
import { parseSelection, clearSelection } from '../shared/sheet-selection';
import { changeSheetStructure } from '../shared/sheet-structure';
import { exportOffice, importOffice } from '../server/office';

test('range formatting preserves values and outside styles; clearing contents preserves styles', () => {
  const page: SheetPage = {
    id: 's',
    name: 'Sheet',
    cells: { A1: '0.25', B1: '=A1*2' },
    styles: { D1: { bold: true }, A1: { italic: true } },
  };
  const range = parseSelection('A1:B2')!;
  const next = formatSelection(page, range, { bold: true, numberFormat: 'percent' });
  assert.equal(next.cells, page.cells);
  assert.deepEqual(next.styles?.A1, { italic: true, bold: true, numberFormat: 'percent' });
  assert.deepEqual(next.styles?.B2, { bold: true, numberFormat: 'percent' });
  assert.deepEqual(next.styles?.D1, { bold: true });
  assert.deepEqual(page.styles?.A1, { italic: true });
  assert.deepEqual(formatSelection(next, range, null).styles, { D1: { bold: true } });
  assert.deepEqual(clearSelection(next.cells, range), {});
  assert.equal(formatCellValue('0.25', next.styles?.A1), '25.00%');
  assert.equal(formatCellValue('#REF!', next.styles?.A1), '#REF!');
  assert.equal(formatCellValue('', next.styles?.A1), '');
});
test('structural moves retain formatted blank cells and prevent edge loss', () => {
  const page: SheetPage = {
    id: 's',
    name: 'Sheet',
    cells: {},
    styles: { B2: { fill: '#ffffff' } },
  };
  assert.deepEqual(changeSheetStructure(page, 'row', 1, 2, 'insert').styles, {
    B4: { fill: '#ffffff' },
  });
  assert.deepEqual(changeSheetStructure(page, 'col', 1, 1, 'delete').styles, {});
  assert.throws(
    () =>
      changeSheetStructure({ ...page, styles: { AZ500: { bold: true } } }, 'row', 1, 1, 'insert'),
    /occupied-edge/,
  );
});
test('basic styles survive validation and XLSX roundtrip, including styled blank cells', async () => {
  const style = {
    bold: true,
    italic: true,
    underline: true,
    color: '#ff0000',
    fill: '#ffeedd',
    align: 'center' as const,
    border: true,
    numberFormat: 'percent' as const,
  };
  const doc: SheetContent = {
    type: 'sheet',
    sheets: [
      {
        id: 's',
        name: 'Sheet',
        cells: { A1: '0.25', B1: '=A1*2' },
        styles: { A1: style, B1: { numberFormat: 'currency' }, C3: style },
      },
    ],
  };
  assert.deepEqual(contentSchema.parse(doc), doc);
  assert.deepEqual(await importOffice('test.zdoc', Buffer.from(JSON.stringify(doc))), doc);
  assert.equal(
    contentSchema.safeParse({
      ...doc,
      sheets: [{ ...doc.sheets[0], styles: { A1: { fill: 'invalid' } } }],
    }).success,
    false,
  );
  const imported = await importOffice('test.xlsx', await exportOffice(doc));
  assert.equal(imported.type, 'sheet');
  if (imported.type !== 'sheet') return;
  assert.deepEqual(imported.sheets[0].styles, doc.sheets[0].styles);
  assert.equal(imported.sheets[0].cells.A1, '0.25');
  assert.equal(imported.sheets[0].cells.B1, '=A1*2');
});

test('applyBorderSelection outside borders only perimeter and preserves inner cells without borders', () => {
  const page: SheetPage = {
    id: 's',
    name: 'Sheet',
    cells: {},
    styles: {},
  };
  // 3x3 selection: B2:D4
  const range = parseSelection('B2:D4')!;
  const next = applyBorderSelection(page, range, 'outside');

  // Corners
  assert.deepEqual(next.styles?.B2, { borderTop: true, borderLeft: true });
  assert.deepEqual(next.styles?.D2, { borderTop: true, borderRight: true });
  assert.deepEqual(next.styles?.B4, { borderBottom: true, borderLeft: true });
  assert.deepEqual(next.styles?.D4, { borderBottom: true, borderRight: true });

  // Edges
  assert.deepEqual(next.styles?.C2, { borderTop: true });
  assert.deepEqual(next.styles?.B3, { borderLeft: true });
  assert.deepEqual(next.styles?.D3, { borderRight: true });
  assert.deepEqual(next.styles?.C4, { borderBottom: true });

  // Center (inner cell): MUST NOT have borders!
  assert.equal(next.styles?.C3, undefined);

  // Clearing borders
  const cleared = applyBorderSelection(next, range, 'none');
  assert.equal(cleared.styles?.B2, undefined);
  assert.equal(cleared.styles?.C2, undefined);
  assert.equal(cleared.styles?.D4, undefined);
});

test('directional borders survive validation and XLSX export round trip', async () => {
  const doc: SheetContent = {
    type: 'sheet',
    sheets: [
      {
        id: 's',
        name: 'Sheet',
        cells: { B2: 'Outer' },
        styles: {
          B2: { borderTop: true, borderLeft: true },
          C2: { borderTop: true },
          D2: { borderTop: true, borderRight: true },
        },
      },
    ],
  };
  assert.deepEqual(contentSchema.parse(doc), doc);
  const exported = await exportOffice(doc);
  const imported = await importOffice('test-border.xlsx', exported);
  assert.equal(imported.type, 'sheet');
  if (imported.type !== 'sheet') return;
  assert.deepEqual(imported.sheets[0].styles?.B2, { borderTop: true, borderLeft: true });
  assert.deepEqual(imported.sheets[0].styles?.C2, { borderTop: true });
  assert.deepEqual(imported.sheets[0].styles?.D2, { borderTop: true, borderRight: true });
});
