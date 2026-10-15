import {
  columnName,
  MAX_COLUMNS,
  MAX_ROWS,
  type SheetCellStyle,
  type SheetComment,
  type SheetPage,
} from './documents';
import {
  cellAddress,
  selectionBounds,
  type CellPoint,
  type SheetSelection,
} from './sheet-selection';

export type SheetBounds = { top: number; bottom: number; left: number; right: number };

function parseAddress(address: string): CellPoint | null {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) return null;
  const col = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(match[2]), col };
}

const isNumeric = (value: string) => value.trim() !== '' && Number.isFinite(Number(value));

/** Clamps a selection (e.g. whole columns or select-all) to the cells that actually hold data. */
export function clampToUsed(
  cells: Record<string, string>,
  bounds: SheetBounds,
): SheetBounds | null {
  let bottom = 0,
    right = -1;
  for (const [address, value] of Object.entries(cells)) {
    if (!value) continue;
    const point = parseAddress(address);
    if (!point) continue;
    if (
      point.row >= bounds.top &&
      point.row <= bounds.bottom &&
      point.col >= bounds.left &&
      point.col <= bounds.right
    ) {
      bottom = Math.max(bottom, point.row);
      right = Math.max(right, point.col);
    }
  }
  if (!bottom) return null;
  return { top: bounds.top, left: bounds.left, bottom, right };
}

/** The contiguous non-empty block around a cell, like Excel's "current region" (Ctrl+A). */
export function currentRegion(cells: Record<string, string>, point: CellPoint): SheetBounds | null {
  const filled = (row: number, col: number) =>
    row >= 1 && col >= 0 && !!cells[cellAddress({ row, col })];
  if (!filled(point.row, point.col)) return null;
  const region = { top: point.row, bottom: point.row, left: point.col, right: point.col };
  const rowHasData = (row: number) => {
    for (let c = region.left - 1; c <= region.right + 1; c++) if (filled(row, c)) return true;
    return false;
  };
  const colHasData = (col: number) => {
    for (let r = region.top - 1; r <= region.bottom + 1; r++) if (filled(r, col)) return true;
    return false;
  };
  let grew = true;
  while (grew) {
    grew = false;
    if (region.top > 1 && rowHasData(region.top - 1)) (region.top--, (grew = true));
    if (region.bottom < MAX_ROWS && rowHasData(region.bottom + 1)) (region.bottom++, (grew = true));
    if (region.left > 0 && colHasData(region.left - 1)) (region.left--, (grew = true));
    if (region.right < MAX_COLUMNS - 1 && colHasData(region.right + 1))
      (region.right++, (grew = true));
  }
  return region;
}

/**
 * Guesses whether the first row is a header: every cell is non-numeric text, and at least
 * one column switches to numbers below it.
 */
export function detectHeaderRow(cells: Record<string, string>, bounds: SheetBounds): boolean {
  if (bounds.bottom <= bounds.top) return false;
  let numericBelowTextHeader = false;
  for (let c = bounds.left; c <= bounds.right; c++) {
    const head = cells[cellAddress({ row: bounds.top, col: c })] ?? '';
    if (!head || isNumeric(head) || head.startsWith('=')) return false;
    for (let r = bounds.top + 1; r <= bounds.bottom; r++)
      if (isNumeric(cells[cellAddress({ row: r, col: c })] ?? '')) numericBelowTextHeader = true;
  }
  return numericBelowTextHeader;
}

/**
 * Resolves the rows a data command should act on. A single cell expands to its current
 * region with header detection; a range is clamped to its used part and taken as-is.
 */
export function dataRange(
  cells: Record<string, string>,
  selection: SheetSelection,
): { bounds: SheetBounds; hasHeader: boolean } | null {
  const raw = selectionBounds(selection);
  if (raw.top === raw.bottom && raw.left === raw.right) {
    const region = currentRegion(cells, selection.anchor);
    return region ? { bounds: region, hasHeader: detectHeaderRow(cells, region) } : null;
  }
  const bounds = clampToUsed(cells, raw);
  return bounds ? { bounds, hasHeader: false } : null;
}

function compareValues(a: string, b: string, direction: 'asc' | 'desc') {
  const valA = a.trim(),
    valB = b.trim();
  if (valA === '' && valB === '') return 0;
  if (valA === '') return 1;
  if (valB === '') return -1;
  const cmp =
    isNumeric(valA) && isNumeric(valB)
      ? Number(valA) - Number(valB)
      : valA.localeCompare(valB, 'zh-CN');
  return direction === 'asc' ? cmp : -cmp;
}

type RowSnapshot = {
  cells: Record<number, string>;
  styles: Record<number, SheetCellStyle>;
  comments: Record<number, SheetComment>;
  height?: number;
};

function snapshotRow(sheet: SheetPage, row: number, bounds: SheetBounds): RowSnapshot {
  const snapshot: RowSnapshot = {
    cells: {},
    styles: {},
    comments: {},
    height: sheet.rowHeights?.[row],
  };
  for (let c = bounds.left; c <= bounds.right; c++) {
    const address = cellAddress({ row, col: c });
    if (sheet.cells[address]) snapshot.cells[c] = sheet.cells[address];
    if (sheet.styles?.[address]) snapshot.styles[c] = sheet.styles[address];
    if (sheet.comments?.[address]) snapshot.comments[c] = sheet.comments[address];
  }
  return snapshot;
}

/** Rewrites the rows of `bounds` (from `startRow`) with the given snapshots; extra rows are cleared. */
function writeRows(
  sheet: SheetPage,
  bounds: SheetBounds,
  startRow: number,
  rows: RowSnapshot[],
  moveHeights: boolean,
): SheetPage {
  const cells = { ...sheet.cells };
  const styles = { ...sheet.styles };
  const comments = { ...sheet.comments };
  const rowHeights = { ...sheet.rowHeights };
  for (let row = startRow; row <= bounds.bottom; row++) {
    const snapshot = rows[row - startRow];
    for (let c = bounds.left; c <= bounds.right; c++) {
      const address = cellAddress({ row, col: c });
      const value = snapshot?.cells[c];
      const style = snapshot?.styles[c];
      if (value) cells[address] = value;
      else delete cells[address];
      if (style) styles[address] = style;
      else delete styles[address];
      const comment = snapshot?.comments[c];
      if (comment) comments[address] = comment;
      else delete comments[address];
    }
    if (moveHeights) {
      if (snapshot?.height) rowHeights[row] = snapshot.height;
      else delete rowHeights[row];
    }
  }
  return {
    ...sheet,
    cells,
    styles,
    ...(sheet.comments ? { comments } : {}),
    ...(moveHeights ? { rowHeights } : {}),
  };
}

/**
 * Sorts whole rows of a range by one column. Values, styles and (for full-width rows) row
 * heights move together so formatting stays attached to its data.
 */
export function sortSheetRows(
  sheet: SheetPage,
  bounds: SheetBounds,
  direction: 'asc' | 'desc',
  options: { sortCol?: number; hasHeader?: boolean } = {},
): SheetPage {
  const startRow = bounds.top + (options.hasHeader ? 1 : 0);
  if (startRow >= bounds.bottom) return sheet;
  const sortCol =
    options.sortCol !== undefined &&
    options.sortCol >= bounds.left &&
    options.sortCol <= bounds.right
      ? options.sortCol
      : bounds.left;
  const rows: RowSnapshot[] = [];
  for (let row = startRow; row <= bounds.bottom; row++) rows.push(snapshotRow(sheet, row, bounds));
  rows.sort((a, b) => compareValues(a.cells[sortCol] ?? '', b.cells[sortCol] ?? '', direction));
  return writeRows(sheet, bounds, startRow, rows, false);
}

/** Removes rows whose values duplicate an earlier row in the range and compacts the rest upward. */
export function removeDuplicateRows(
  sheet: SheetPage,
  bounds: SheetBounds,
  hasHeader: boolean,
): { sheet: SheetPage; removed: number } {
  const startRow = bounds.top + (hasHeader ? 1 : 0);
  const seen = new Set<string>();
  const kept: RowSnapshot[] = [];
  let removed = 0;
  for (let row = startRow; row <= bounds.bottom; row++) {
    const snapshot = snapshotRow(sheet, row, bounds);
    const key = JSON.stringify(
      Array.from({ length: bounds.right - bounds.left + 1 }, (_, i) =>
        (snapshot.cells[bounds.left + i] ?? '').trim(),
      ),
    );
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    kept.push(snapshot);
  }
  if (!removed) return { sheet, removed };
  return { sheet: writeRows(sheet, bounds, startRow, kept, false), removed };
}

export const SPLIT_DELIMITERS = {
  comma: /[,，]/,
  tab: /\t/,
  semicolon: /[;；]/,
  space: /\s+/,
} as const;
export type SplitDelimiter = keyof typeof SPLIT_DELIMITERS;

/**
 * Splits each value of the range's first column into adjacent columns (Excel "Text to
 * Columns"). Returns null when the result would exceed the sheet width.
 */
export function splitTextToColumns(
  sheet: SheetPage,
  bounds: SheetBounds,
  delimiter: SplitDelimiter,
): { sheet: SheetPage; split: number; overwritten: number } | null {
  const cells = { ...sheet.cells };
  let overwritten = 0,
    split = 0;
  for (let row = bounds.top; row <= bounds.bottom; row++) {
    const source = sheet.cells[cellAddress({ row, col: bounds.left })];
    if (!source || source.startsWith('=')) continue;
    const parts = source.split(SPLIT_DELIMITERS[delimiter]).map((part) => part.trim());
    if (parts.length < 2) continue;
    if (bounds.left + parts.length > MAX_COLUMNS) return null;
    split++;
    parts.forEach((part, index) => {
      const address = cellAddress({ row, col: bounds.left + index });
      if (index > 0 && sheet.cells[address]) overwritten++;
      if (part) cells[address] = part;
      else delete cells[address];
    });
  }
  return { sheet: split ? { ...sheet, cells } : sheet, split, overwritten };
}

/**
 * Picks the range AutoSum should cover for a single target cell: the contiguous numeric
 * block directly above it, otherwise directly to its left. Never includes the target itself.
 */
export function autoSumRange(
  valueAt: (address: string) => string | number,
  target: CellPoint,
): string | null {
  const numberAt = (row: number, col: number) =>
    typeof valueAt(cellAddress({ row, col })) === 'number';
  let top = target.row;
  while (top > 1 && numberAt(top - 1, target.col)) top--;
  if (top < target.row)
    return `${columnName(target.col)}${top}:${columnName(target.col)}${target.row - 1}`;
  let left = target.col;
  while (left > 0 && numberAt(target.row, left - 1)) left--;
  if (left < target.col)
    return `${columnName(left)}${target.row}:${columnName(target.col - 1)}${target.row}`;
  return null;
}

/** Parses CSV / TSV text with quoted fields; values are trimmed unless quoted. */
export function parseDelimitedText(text: string): string[][] {
  const delimiter = text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    wasQuoted = false;
  const pushField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = '';
    wasQuoted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') ((field += '"'), i++);
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.trim() === '') {
      quoted = true;
      wasQuoted = true;
      field = '';
    } else if (ch === delimiter || ch === '，') {
      if (ch === '，' && delimiter === '\t') field += ch;
      else pushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushField();
      rows.push(row);
      row = [];
    } else field += ch;
  }
  pushField();
  rows.push(row);
  while (rows.length && rows[rows.length - 1].every((value) => value === '')) rows.pop();
  return rows;
}

/** Sets, replaces or (with blank text) removes a cell comment. */
export function setCellComment(
  sheet: SheetPage,
  address: string,
  text: string,
  now = Date.now(),
): SheetPage {
  const comments = { ...sheet.comments };
  const trimmed = text.trim();
  if (trimmed) comments[address] = { ...comments[address], text: trimmed, updatedAt: now };
  else delete comments[address];
  return { ...sheet, comments };
}
