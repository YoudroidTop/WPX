import { columnName, MAX_CELL_LENGTH, MAX_COLUMNS, MAX_ROWS } from './documents';

type PasteResult =
  | { ok: true; cells: Record<string, string> }
  | { ok: false; reason: 'rows' | 'columns' | 'cell-length' };

// Validate the entire rectangle before changing any existing cell.
export function pasteSheetCells(
  existing: Record<string, string>,
  text: string,
  row: number,
  column: number,
): PasteResult {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  if (row < 1 || row + lines.length - 1 > MAX_ROWS) return { ok: false, reason: 'rows' };
  const values = lines.map((line) => line.split('\t'));
  if (column < 0 || values.some((line) => column + line.length > MAX_COLUMNS))
    return { ok: false, reason: 'columns' };
  if (values.some((line) => line.some((value) => value.length > MAX_CELL_LENGTH)))
    return { ok: false, reason: 'cell-length' };
  const cells = { ...existing };
  values.forEach((line, r) =>
    line.forEach((value, c) => {
      const address = `${columnName(column + c)}${row + r}`;
      if (value) cells[address] = value;
      else delete cells[address];
    }),
  );
  return { ok: true, cells };
}
