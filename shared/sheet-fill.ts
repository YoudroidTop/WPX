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

export function fillTarget(source: SheetSelection, point: CellPoint): SheetSelection {
  const b = selectionBounds(source);
  const vertical = Math.max(b.top - point.row, point.row - b.bottom, 0);
  const horizontal = Math.max(b.left - point.col, point.col - b.right, 0);
  if (!vertical && !horizontal) return source;
  return vertical >= horizontal
    ? {
        anchor: { row: Math.min(b.top, point.row), col: b.left },
        focus: { row: Math.max(b.bottom, point.row), col: b.right },
      }
    : {
        anchor: { row: b.top, col: Math.min(b.left, point.col) },
        focus: { row: b.bottom, col: Math.max(b.right, point.col) },
      };
}

function numericSeries(values: string[]): { first: number; step: number } | null {
  if (
    values.length < 2 ||
    values.some(
      (value) =>
        !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || value.replace(/[-.]/g, '').length > 15,
    )
  )
    return null;
  const numbers = values.map(Number),
    first = numbers[0],
    step = numbers[1] - first;
  if (
    !numbers.every((number, index) => {
      const expected = first + step * index;
      return (
        Math.abs(number - expected) <= Math.max(1e-12, Math.abs(expected) * Number.EPSILON * 4)
      );
    })
  )
    return null;
  return { first, step };
}

export function extendSheetRange(
  sheet: SheetPage,
  source: SheetSelection,
  target: SheetSelection,
): SheetPage {
  const from = selectionBounds(source),
    to = selectionBounds(target);
  const vertical = to.top !== from.top || to.bottom !== from.bottom;
  if (
    to.top < 1 ||
    to.bottom > MAX_ROWS ||
    to.left < 0 ||
    to.right >= MAX_COLUMNS ||
    to.top > from.top ||
    to.bottom < from.bottom ||
    to.left > from.left ||
    to.right < from.right ||
    (vertical && (to.left !== from.left || to.right !== from.right))
  )
    throw new Error('range');
  const result = { ...sheet, cells: { ...sheet.cells }, styles: { ...sheet.styles } };
  const length = vertical ? from.bottom - from.top + 1 : from.right - from.left + 1;
  const lanes = new Map<number, ReturnType<typeof numericSeries>>();
  for (
    let lane = vertical ? from.left : from.top;
    lane <= (vertical ? from.right : from.bottom);
    lane++
  ) {
    const values = Array.from(
      { length },
      (_, index) =>
        sheet.cells[
          cellAddress(
            vertical ? { row: from.top + index, col: lane } : { row: lane, col: from.left + index },
          )
        ] ?? '',
    );
    lanes.set(lane, numericSeries(values));
  }
  for (let row = to.top; row <= to.bottom; row++)
    for (let col = to.left; col <= to.right; col++) {
      if (row >= from.top && row <= from.bottom && col >= from.left && col <= from.right) continue;
      const index = vertical ? row - from.top : col - from.left;
      const seedIndex = ((index % length) + length) % length;
      writeCopy(
        result,
        sheet,
        vertical ? { row: from.top + seedIndex, col } : { row, col: from.left + seedIndex },
        { row, col },
      );
      const series = lanes.get(vertical ? col : row);
      if (series) {
        const value = series.first + series.step * index;
        if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
          throw new Error('number-range');
        result.cells[cellAddress({ row, col })] = String(Number(value.toPrecision(15)));
      }
    }
  return result;
}
