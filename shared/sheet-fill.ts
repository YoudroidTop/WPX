import { columnName, MAX_CELL_LENGTH, MAX_COLUMNS, MAX_ROWS, type SheetPage } from './documents';
import {
  cellAddress,
  parseSelection,
  selectionBounds,
  type CellPoint,
  type SheetSelection,
} from './sheet-selection';

export function translateFormula(raw: string, rowDelta: number, columnDelta: number) {
  if (!raw.startsWith('=') || /(?<![#A-Z0-9_])(?:[A-Z_][A-Z0-9_]*|'(?:[^']|'')*')!/i.test(raw))
    return raw;
  return raw
    .split(/("(?:[^"]|"")*")/g)
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(
            /(?<![A-Z0-9_])(?<columnLock>\$?)(?<column>[A-Z]+)(?<rowLock>\$?)(?<row>[1-9]\d*)(?![A-Z0-9_])/gi,
            (token, columnLock: string, column: string, rowLock: string, rowText: string) => {
              const point = parseSelection(`${column}${rowText}`)?.anchor;
              if (!point) return token;
              const row = point.row + (rowLock ? 0 : rowDelta),
                col = point.col + (columnLock ? 0 : columnDelta);
              if (row < 1 || row > MAX_ROWS || col < 0 || col >= MAX_COLUMNS) return '#REF!';
              return `${columnLock}${columnName(col)}${rowLock}${row}`;
            },
          ),
    )
    .join('');
}

function writeCopy(target: SheetPage, source: SheetPage, from: CellPoint, to: CellPoint) {
  const fromAddress = cellAddress(from),
    toAddress = cellAddress(to);
  const value = translateFormula(
    source.cells[fromAddress] ?? '',
    to.row - from.row,
    to.col - from.col,
  );
  if (value.length > MAX_CELL_LENGTH) throw new Error('cell-length');
  if (value) target.cells[toAddress] = value;
  else delete target.cells[toAddress];
  if (source.styles?.[fromAddress]) target.styles![toAddress] = { ...source.styles[fromAddress] };
  else delete target.styles![toAddress];
}

export function copySheetRange(
  source: SheetPage,
  range: SheetSelection,
  destination: SheetPage,
  start: CellPoint,
): SheetPage {
  const bounds = selectionBounds(range);
  if (
    start.row < 1 ||
    start.row + bounds.bottom - bounds.top > MAX_ROWS ||
    start.col < 0 ||
    start.col + bounds.right - bounds.left >= MAX_COLUMNS
  )
    throw new Error('range');
  const result = {
    ...destination,
    cells: { ...destination.cells },
    styles: { ...destination.styles },
  };
  for (let row = bounds.top; row <= bounds.bottom; row++)
    for (let col = bounds.left; col <= bounds.right; col++)
      writeCopy(
        result,
        source,
        { row, col },
        { row: start.row + row - bounds.top, col: start.col + col - bounds.left },
      );
  return result;
}

export function fillSheetRange(
  sheet: SheetPage,
  range: SheetSelection,
  direction: 'down' | 'right',
): SheetPage {
  const bounds = selectionBounds(range);
  const result = { ...sheet, cells: { ...sheet.cells }, styles: { ...sheet.styles } };
  for (let row = bounds.top; row <= bounds.bottom; row++)
    for (let col = bounds.left; col <= bounds.right; col++) {
      if (direction === 'down' ? row === bounds.top : col === bounds.left) continue;
      writeCopy(
        result,
        sheet,
        {
          row: direction === 'down' ? bounds.top : row,
          col: direction === 'right' ? bounds.left : col,
        },
        { row, col },
      );
    }
  return result;
}
