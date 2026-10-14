import { contentSchema, MAX_CONTENT_BYTES, type SheetPage } from './documents';
import {
  parseSelection,
  selectionCells,
  selectionLabel,
  type SheetSelection,
} from './sheet-selection';

export const SHEET_CLIPBOARD_TYPE = 'application/x-zhuole-sheet';

export function encodeSheetClipboard(sheet: SheetPage, selection: SheetSelection) {
  const snapshot: SheetPage = { id: 'clipboard', name: 'Clipboard', cells: {}, styles: {} };
  for (const address of selectionCells(selection)) {
    if (sheet.cells[address] !== undefined) snapshot.cells[address] = sheet.cells[address];
    if (sheet.styles?.[address]) snapshot.styles![address] = sheet.styles[address];
  }
  return JSON.stringify({ version: 1, range: selectionLabel(selection), sheet: snapshot });
}

export function decodeSheetClipboard(
  serialized: string,
): { sheet: SheetPage; selection: SheetSelection } | null {
  if (!serialized || serialized.length > MAX_CONTENT_BYTES) return null;
  try {
    const payload = JSON.parse(serialized);
    if (payload.version !== 1 || typeof payload.range !== 'string') return null;
    const selection = parseSelection(payload.range);
    if (!selection) return null;
    const parsed = contentSchema.safeParse({ type: 'sheet', sheets: [payload.sheet] });
    if (!parsed.success || parsed.data.type !== 'sheet') return null;
    return { sheet: parsed.data.sheets[0], selection };
  } catch {
    return null;
  }
}
