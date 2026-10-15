import type { SheetCellStyle, SheetPage } from './documents';
import {
  cellAddress,
  selectionBounds,
  selectionCells,
  type SheetSelection,
} from './sheet-selection';

export const numberFormats = {
  general: 'General',
  number: '#,##0.00',
  percent: '0.00%',
  currency: '"¥"#,##0.00',
} as const;

export function formatSelection(
  sheet: SheetPage,
  selection: SheetSelection,
  patch: SheetCellStyle | null,
): SheetPage {
  const styles = { ...sheet.styles };
  for (const address of selectionCells(selection)) {
    if (patch === null) {
      delete styles[address];
      continue;
    }
    // An undefined patch value clears that property (e.g. "auto" color, "no fill").
    const next = compactStyle({ ...styles[address], ...patch });
    if (next) styles[address] = next;
    else delete styles[address];
  }
  return { ...sheet, styles };
}

/** Replaces the whole style of every selected cell, as the format painter does. */
export function replaceSelectionStyle(
  sheet: SheetPage,
  selection: SheetSelection,
  style: SheetCellStyle,
): SheetPage {
  const next = compactStyle(style);
  const styles = { ...sheet.styles };
  for (const address of selectionCells(selection)) {
    if (next) styles[address] = { ...next };
    else delete styles[address];
  }
  return { ...sheet, styles };
}

function compactStyle(style: SheetCellStyle): SheetCellStyle | undefined {
  const entries = Object.entries(style).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as SheetCellStyle) : undefined;
}

export function applyBorderSelection(
  sheet: SheetPage,
  selection: SheetSelection,
  borderType: string,
): SheetPage {
  const bounds = selectionBounds(selection);
  const styles = { ...sheet.styles };

  for (let r = bounds.top; r <= bounds.bottom; r++) {
    for (let c = bounds.left; c <= bounds.right; c++) {
      const addr = cellAddress({ row: r, col: c });
      const current: SheetCellStyle = { ...(styles[addr] ?? {}) };

      if (borderType === 'none') {
        delete current.border;
        delete current.borderTop;
        delete current.borderBottom;
        delete current.borderLeft;
        delete current.borderRight;
      } else if (borderType === 'all') {
        current.border = true;
        delete current.borderTop;
        delete current.borderBottom;
        delete current.borderLeft;
        delete current.borderRight;
      } else if (borderType === 'outside' || borderType === 'thick-outside') {
        delete current.border;
        if (r === bounds.top) current.borderTop = true;
        else delete current.borderTop;

        if (r === bounds.bottom) current.borderBottom = true;
        else delete current.borderBottom;

        if (c === bounds.left) current.borderLeft = true;
        else delete current.borderLeft;

        if (c === bounds.right) current.borderRight = true;
        else delete current.borderRight;
      } else if (borderType === 'top') {
        if (r === bounds.top) current.borderTop = true;
      } else if (borderType === 'bottom' || borderType === 'double-bottom') {
        if (r === bounds.bottom) current.borderBottom = true;
      } else if (borderType === 'left') {
        if (c === bounds.left) current.borderLeft = true;
      } else if (borderType === 'right') {
        if (c === bounds.right) current.borderRight = true;
      }

      const hasKeys = (Object.keys(current) as (keyof SheetCellStyle)[]).some(
        (k) => current[k] !== undefined,
      );
      if (hasKeys) {
        styles[addr] = current;
      } else {
        delete styles[addr];
      }
    }
  }

  return { ...sheet, styles };
}

export function formatCellValue(value: string | number, style?: SheetCellStyle): string | number {
  if (!style?.numberFormat || style.numberFormat === 'general' || value === '') return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat('zh-CN', {
    style:
      style.numberFormat === 'percent'
        ? 'percent'
        : style.numberFormat === 'currency'
          ? 'currency'
          : 'decimal',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}
