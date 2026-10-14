import { columnName, MAX_COLUMNS, MAX_ROWS } from './documents';
import { createCalculator } from './formulas';

export type CellPoint = { row: number; col: number };
export type SheetSelection = { anchor: CellPoint; focus: CellPoint };
export const cellAddress = ({ row, col }: CellPoint) => `${columnName(col)}${row}`;
export function selectionBounds({ anchor, focus }: SheetSelection) {
  return {
    top: Math.min(anchor.row, focus.row),
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.col, focus.col),
    right: Math.max(anchor.col, focus.col),
  };
}
export function inSelection(selection: SheetSelection, point: CellPoint) {
  const b = selectionBounds(selection);
  return point.row >= b.top && point.row <= b.bottom && point.col >= b.left && point.col <= b.right;
}
export function selectionLabel(selection: SheetSelection) {
  const b = selectionBounds(selection);
  const start = cellAddress({ row: b.top, col: b.left });
  const end = cellAddress({ row: b.bottom, col: b.right });
  return start === end ? start : `${start}:${end}`;
}
export function parseSelection(value: string): SheetSelection | null {
  const points = value.trim().toUpperCase().split(':');
  if (points.length > 2) return null;
  const result: CellPoint[] = [];
  for (const address of points) {
    const match = /^([A-Z]+)([1-9]\d*)$/.exec(address);
    if (!match) return null;
    const col = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const row = Number(match[2]);
    if (col >= MAX_COLUMNS || row > MAX_ROWS) return null;
    result.push({ row, col });
  }
  return { anchor: result[0], focus: result[1] ?? result[0] };
}
export function selectionCells(selection: SheetSelection) {
  const b = selectionBounds(selection),
    addresses: string[] = [];
  for (let r = b.top; r <= b.bottom; r++)
    for (let c = b.left; c <= b.right; c++) addresses.push(cellAddress({ row: r, col: c }));
  return addresses;
}
export function clearSelection(cells: Record<string, string>, selection: SheetSelection) {
  const next = { ...cells };
  for (const address of selectionCells(selection)) delete next[address];
  return next;
}
export function copySelection(cells: Record<string, string>, selection: SheetSelection) {
  const b = selectionBounds(selection),
    lines: string[] = [];
  for (let r = b.top; r <= b.bottom; r++) {
    const values: string[] = [];
    for (let c = b.left; c <= b.right; c++)
      values.push(cells[cellAddress({ row: r, col: c })] ?? '');
    lines.push(values.join('\t'));
  }
  return lines.join('\n');
}
export function selectionStats(cells: Record<string, string>, selection: SheetSelection) {
  const calculate = createCalculator(cells);
  let count = 0,
    numericCount = 0,
    sum = 0;
  for (const address of selectionCells(selection)) {
    if (cells[address]) count++;
    const value = calculate(address);
    if (typeof value === 'number') {
      numericCount++;
      sum += value;
    }
  }
  return { count, numericCount, sum, average: numericCount ? sum / numericCount : null };
}
