import { cellAddress, selectionBounds, type SheetSelection } from './sheet-selection';

export function sortSheetSelection(
  cells: Record<string, string>,
  selection: SheetSelection,
  direction: 'asc' | 'desc',
  sortColIndex?: number,
): Record<string, string> {
  const b = selectionBounds(selection);
  if (b.top === b.bottom) return cells;

  const colToSort =
    sortColIndex !== undefined && sortColIndex >= b.left && sortColIndex <= b.right
      ? sortColIndex
      : b.left;

  const rows: { rowIndex: number; sortValue: string; rowCells: Record<number, string> }[] = [];
  for (let r = b.top; r <= b.bottom; r++) {
    const rowCells: Record<number, string> = {};
    for (let c = b.left; c <= b.right; c++) {
      const addr = cellAddress({ row: r, col: c });
      if (cells[addr] !== undefined) {
        rowCells[c] = cells[addr];
      }
    }
    const sortVal = rowCells[colToSort] ?? '';
    rows.push({ rowIndex: r, sortValue: sortVal, rowCells });
  }

  rows.sort((a, bRow) => {
    const valA = a.sortValue.trim();
    const valB = bRow.sortValue.trim();
    if (valA === '' && valB === '') return 0;
    if (valA === '') return 1;
    if (valB === '') return -1;

    const numA = Number(valA);
    const numB = Number(valB);
    const isNumA = !Number.isNaN(numA);
    const isNumB = !Number.isNaN(numB);

    let cmp = 0;
    if (isNumA && isNumB) {
      cmp = numA - numB;
    } else {
      cmp = valA.localeCompare(valB, 'zh-CN');
    }
    return direction === 'asc' ? cmp : -cmp;
  });

  const next = { ...cells };
  for (let i = 0; i < rows.length; i++) {
    const targetRow = b.top + i;
    const sortedRowCells = rows[i].rowCells;
    for (let c = b.left; c <= b.right; c++) {
      const targetAddr = cellAddress({ row: targetRow, col: c });
      if (sortedRowCells[c] !== undefined && sortedRowCells[c] !== '') {
        next[targetAddr] = sortedRowCells[c];
      } else {
        delete next[targetAddr];
      }
    }
  }

  return next;
}
