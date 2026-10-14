import { columnName, MAX_ROWS, MAX_COLUMNS, type SheetPage } from './documents';
import { parseSelection, cellAddress } from './sheet-selection';

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
  const dimensions = axis === 'row' ? sheet.rowHeights : sheet.columnWidths;
  const shifted: Record<string, number> = {};
  for (const [key, value] of Object.entries(dimensions ?? {})) {
    const coordinate = Number(key);
    if (operation === 'delete' && coordinate >= at && coordinate < at + count) continue;
    const next =
      coordinate >= at ? coordinate + (operation === 'insert' ? count : -count) : coordinate;
    if (next <= limit) shifted[String(next)] = value;
  }
  return {
    ...sheet,
    cells,
    ...(dimensions ? { [axis === 'row' ? 'rowHeights' : 'columnWidths']: shifted } : {}),
  };
}
export function validSheetName(name: string, sheets: SheetPage[], ownId?: string) {
  return (
    !!name.trim() &&
    name.length <= 31 &&
    !/[\\/*?:\[\]]/.test(name) &&
    !sheets.some((s) => s.id !== ownId && s.name.toLowerCase() === name.trim().toLowerCase())
  );
}
