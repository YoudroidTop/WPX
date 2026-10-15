import {
  columnName,
  MAX_ROWS,
  MAX_COLUMNS,
  type SheetAutoFilter,
  type SheetPage,
} from './documents';
import { parseSelection, cellAddress } from './sheet-selection';
import { shiftFrozenBoundary } from './sheet-view';

type Axis = 'row' | 'col';
type Operation = 'insert' | 'delete';
// Structural shifts move absolute references too; dollar signs only constrain copy/fill.
export function shiftFormula(
  raw: string,
  axis: Axis,
  at: number,
  count: number,
  operation: Operation,
) {
  if (!raw.startsWith('=')) return raw;
  const limit = axis === 'row' ? MAX_ROWS : MAX_COLUMNS - 1;
  function shift(value: number) {
    if (operation === 'insert') return value >= at ? value + count : value;
    if (value >= at && value < at + count) return null;
    return value >= at + count ? value - count : value;
  }
  function decode(ref: string) {
    const match = /^(\$?)([A-Z]+)(\$?)([1-9]\d*)$/i.exec(ref)!;
    const point = parseSelection(ref.replaceAll('$', ''))?.anchor;
    return point ? { point, columnLock: match[1], rowLock: match[3] } : null;
  }
  function encode(ref: NonNullable<ReturnType<typeof decode>>, value: number) {
    const point = { ...ref.point, [axis]: value };
    return `${ref.columnLock}${columnName(point.col)}${ref.rowLock}${point.row}`;
  }
  return raw.replace(
    /(?<![A-Z0-9_])\$?[A-Z]+\$?[1-9]\d*(?:\s*:\s*\$?[A-Z]+\$?[1-9]\d*)?(?![A-Z0-9_])/gi,
    (token) => {
      const parts = token.split(/\s*:\s*/),
        first = decode(parts[0]),
        second = parts[1] ? decode(parts[1]) : null;
      if (!first || (parts[1] && !second)) return token;
      if (!second) {
        const value = shift(first.point[axis]);
        return value === null || value > limit ? '#REF!' : encode(first, value);
      }
      let low = Math.min(first.point[axis], second.point[axis]),
        high = Math.max(first.point[axis], second.point[axis]);
      if (operation === 'delete') {
        const survivorsLow = low >= at && low < at + count ? at + count : low;
        const survivorsHigh = high >= at && high < at + count ? at - 1 : high;
        if (survivorsLow > survivorsHigh) return '#REF!';
        low = shift(survivorsLow)!;
        high = shift(survivorsHigh)!;
      } else {
        low = shift(low)!;
        high = shift(high)!;
      }
      if (high > limit) return '#REF!';
      const forward = first.point[axis] <= second.point[axis];
      return `${encode(first, forward ? low : high)}:${encode(second, forward ? high : low)}`;
    },
  );
}
/**
 * Shifts, grows or shrinks a stored range such as "A2:A500". Unlike formula references a
 * range is clamped at the sheet edge on insert; it is dropped (null) only when deleted entirely.
 */
export function shiftRange(
  range: string,
  axis: Axis,
  at: number,
  count: number,
  operation: Operation,
): string | null {
  const selection = parseSelection(range);
  if (!selection) return null;
  const limit = axis === 'row' ? MAX_ROWS : MAX_COLUMNS - 1;
  const a = selection.anchor[axis],
    b = selection.focus[axis];
  let low = Math.min(a, b),
    high = Math.max(a, b);
  if (operation === 'insert') {
    if (low >= at) low += count;
    if (high >= at) high += count;
    if (low > limit) return null;
    high = Math.min(high, limit);
  } else {
    if (low >= at && low < at + count) low = at + count;
    if (high >= at && high < at + count) high = at - 1;
    if (low > high) return null;
    if (low >= at + count) low -= count;
    if (high >= at + count) high -= count;
  }
  const start = { ...selection.anchor, [axis]: low },
    end = { ...selection.focus, [axis]: high };
  const top = Math.min(start.row, end.row),
    bottom = Math.max(start.row, end.row),
    left = Math.min(start.col, end.col),
    right = Math.max(start.col, end.col);
  const from = cellAddress({ row: top, col: left }),
    to = cellAddress({ row: bottom, col: right });
  return from === to ? from : `${from}:${to}`;
}
/**
 * Moves an AutoFilter with a structure change. Column criteria are re-keyed to their new
 * letters; deleting the header row or every filtered column removes the filter.
 */
function shiftAutoFilter(
  filter: SheetAutoFilter,
  axis: Axis,
  at: number,
  count: number,
  operation: Operation,
): SheetAutoFilter | null {
  const header = parseSelection(filter.range)?.anchor.row;
  if (
    axis === 'row' &&
    operation === 'delete' &&
    header !== undefined &&
    header >= at &&
    header < at + count
  )
    return null;
  const range = shiftRange(filter.range, axis, at, count, operation);
  if (!range) return null;
  if (axis === 'row') return { ...filter, range };
  const columns: SheetAutoFilter['columns'] = {};
  for (const [letter, criteria] of Object.entries(filter.columns)) {
    const col = parseSelection(`${letter}1`)?.anchor.col;
    if (col === undefined) continue;
    if (operation === 'delete' && col >= at && col < at + count) continue;
    const next = col >= at ? col + (operation === 'insert' ? count : -count) : col;
    if (next <= MAX_COLUMNS - 1) columns[columnName(next)] = criteria;
  }
  return { range, columns };
}
export function changeSheetStructure(
  sheet: SheetPage,
  axis: Axis,
  at: number,
  count: number,
  operation: Operation,
): SheetPage {
  const minimum = axis === 'row' ? 1 : 0,
    limit = axis === 'row' ? MAX_ROWS : MAX_COLUMNS - 1;
  if (
    !Number.isInteger(at) ||
    !Number.isInteger(count) ||
    count < 1 ||
    at < minimum ||
    at + count - 1 > limit
  )
    throw new Error('invalid-range');
  const cells: Record<string, string> = {};
  for (const [address, raw] of Object.entries(sheet.cells)) {
    const point = parseSelection(address)!.anchor,
      coordinate = point[axis];
    if (operation === 'delete' && coordinate >= at && coordinate < at + count) continue;
    const next =
      coordinate >= at ? coordinate + (operation === 'insert' ? count : -count) : coordinate;
    if (next > limit) throw new Error('occupied-edge');
    cells[cellAddress({ ...point, [axis]: next })] = shiftFormula(raw, axis, at, count, operation);
  }
  // Per-cell maps (styles, comments) move with their cells; entries in deleted lines go away.
  function shiftAddressMap<T>(map: Record<string, T>) {
    const shifted: Record<string, T> = {};
    for (const [address, value] of Object.entries(map)) {
      const point = parseSelection(address)!.anchor,
        coordinate = point[axis];
      if (operation === 'delete' && coordinate >= at && coordinate < at + count) continue;
      const next =
        coordinate >= at ? coordinate + (operation === 'insert' ? count : -count) : coordinate;
      if (next > limit) throw new Error('occupied-edge');
      shifted[cellAddress({ ...point, [axis]: next })] = value;
    }
    return shifted;
  }
  const styles = shiftAddressMap(sheet.styles ?? {});
  const comments = shiftAddressMap(sheet.comments ?? {});
  const validations = (sheet.validations ?? []).flatMap((validation) => {
    const range = shiftRange(validation.range, axis, at, count, operation);
    return range ? [{ ...validation, range }] : [];
  });
  const autoFilter =
    sheet.autoFilter && shiftAutoFilter(sheet.autoFilter, axis, at, count, operation);
  const dimensions = axis === 'row' ? sheet.rowHeights : sheet.columnWidths;
  const shifted: Record<string, number> = {};
  for (const [key, value] of Object.entries(dimensions ?? {})) {
    const coordinate = Number(key);
    if (operation === 'delete' && coordinate >= at && coordinate < at + count) continue;
    const next =
      coordinate >= at ? coordinate + (operation === 'insert' ? count : -count) : coordinate;
    if (next <= limit) shifted[String(next)] = value;
  }
  const next: SheetPage = {
    ...sheet,
    cells,
    ...(sheet.styles ? { styles } : {}),
    ...(sheet.comments ? { comments } : {}),
    ...(sheet.validations ? { validations } : {}),
    ...(axis === 'row' && sheet.frozenRows !== undefined
      ? {
          frozenRows: shiftFrozenBoundary(sheet.frozenRows, at - 1, count, operation, MAX_ROWS - 1),
        }
      : {}),
    ...(axis === 'col' && sheet.frozenColumns !== undefined
      ? {
          frozenColumns: shiftFrozenBoundary(
            sheet.frozenColumns,
            at,
            count,
            operation,
            MAX_COLUMNS - 1,
          ),
        }
      : {}),
    ...(dimensions ? { [axis === 'row' ? 'rowHeights' : 'columnWidths']: shifted } : {}),
  };
  if (autoFilter) next.autoFilter = autoFilter;
  else delete next.autoFilter;
  return next;
}
export function validSheetName(name: string, sheets: SheetPage[], ownId?: string) {
  return (
    !!name.trim() &&
    name.length <= 31 &&
    !/[\\/*?:\[\]]/.test(name) &&
    !sheets.some((s) => s.id !== ownId && s.name.toLowerCase() === name.trim().toLowerCase())
  );
}
