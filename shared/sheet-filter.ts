import { columnName, MAX_FILTER_HIDDEN_VALUES, MAX_ROWS, type SheetPage } from './documents';
import { formatCellValue } from './sheet-format';
import { cellAddress, type SheetSelection } from './sheet-selection';
import { dataRange, type SheetBounds } from './sheet-data';
import { boundsLabel, rangeBounds } from './sheet-validation';

/** Maps a cell address to its calculated value (formula results included). */
export type ValueAt = (address: string) => string | number;

/** The text a filter matches on: what the cell shows, trimmed. Blanks are ''. */
export function filterKey(sheet: SheetPage, valueAt: ValueAt, address: string): string {
  return String(formatCellValue(valueAt(address), sheet.styles?.[address])).trim();
}

/**
 * The live filter area: the stored range plus any rows appended directly beneath it, so new
 * data typed under a filtered table is covered like in Excel.
 */
export function filterBounds(sheet: SheetPage): SheetBounds | null {
  const filter = sheet.autoFilter;
  const bounds = filter && rangeBounds(filter.range);
  if (!bounds) return null;
  const rowHasData = (row: number) => {
    for (let col = bounds.left; col <= bounds.right; col++)
      if (sheet.cells[cellAddress({ row, col })]) return true;
    return false;
  };
  let bottom = bounds.bottom;
  while (bottom < MAX_ROWS && rowHasData(bottom + 1)) bottom++;
  return { ...bounds, bottom };
}

/** Data rows (below the header) hidden because a column filter excludes their value. */
export function filteredRows(sheet: SheetPage, valueAt: ValueAt): Set<number> {
  const hidden = new Set<number>();
  const bounds = filterBounds(sheet);
  if (!bounds) return hidden;
  const active = Object.entries(sheet.autoFilter!.columns).flatMap(([letter, column]) => {
    const col = rangeBounds(`${letter}1`)?.left;
    return col !== undefined && col >= bounds.left && col <= bounds.right && column.hidden.length
      ? [{ col, values: new Set(column.hidden) }]
      : [];
  });
  if (!active.length) return hidden;
  for (let row = bounds.top + 1; row <= bounds.bottom; row++)
    if (
      active.some(({ col, values }) =>
        values.has(filterKey(sheet, valueAt, cellAddress({ row, col }))),
      )
    )
      hidden.add(row);
  return hidden;
}

/**
 * Distinct values of one filter column, sorted numbers first then text, blanks last. Rows
 * hidden by *other* columns are left out so the list narrows like Excel's cascading filters.
 */
export function filterColumnValues(sheet: SheetPage, valueAt: ValueAt, col: number): string[] {
  const bounds = filterBounds(sheet);
  if (!bounds) return [];
  const others: SheetPage = {
    ...sheet,
    autoFilter: {
      ...sheet.autoFilter!,
      columns: Object.fromEntries(
        Object.entries(sheet.autoFilter!.columns).filter(([key]) => key !== columnName(col)),
      ),
    },
  };
  const hiddenByOthers = filteredRows(others, valueAt);
  const values = new Set<string>();
  for (let row = bounds.top + 1; row <= bounds.bottom; row++)
    if (!hiddenByOthers.has(row)) values.add(filterKey(sheet, valueAt, cellAddress({ row, col })));
  // Values the user unchecked stay listed even when every row holding them is hidden elsewhere.
  for (const value of sheet.autoFilter!.columns[columnName(col)]?.hidden ?? []) values.add(value);
  const numeric = (v: string) => v !== '' && Number.isFinite(Number(v));
  return [...values].sort((a, b) => {
    if (a === '' || b === '') return a === '' ? (b === '' ? 0 : 1) : -1;
    if (numeric(a) && numeric(b)) return Number(a) - Number(b);
    if (numeric(a) !== numeric(b)) return numeric(a) ? -1 : 1;
    return a.localeCompare(b, 'zh-CN');
  });
}

/** Sets which values a column hides; an empty list clears that column's criteria. */
export function setColumnFilter(sheet: SheetPage, col: number, hidden: string[]): SheetPage {
  if (!sheet.autoFilter) return sheet;
  const columns = { ...sheet.autoFilter.columns };
  const unique = [...new Set(hidden)].slice(0, MAX_FILTER_HIDDEN_VALUES);
  if (unique.length) columns[columnName(col)] = { hidden: unique };
  else delete columns[columnName(col)];
  return { ...sheet, autoFilter: { ...sheet.autoFilter, columns } };
}

/**
 * Turns on a filter for the selection. A single cell expands to its current region; the top
 * row is always the header. Returns null when there is no data to filter.
 */
export function createAutoFilter(sheet: SheetPage, selection: SheetSelection): SheetPage | null {
  const range = dataRange(sheet.cells, selection);
  if (!range || range.bounds.bottom <= range.bounds.top) return null;
  return { ...sheet, autoFilter: { range: boundsLabel(range.bounds), columns: {} } };
}

export function removeAutoFilter(sheet: SheetPage): SheetPage {
  const next = { ...sheet };
  delete next.autoFilter;
  return next;
}
