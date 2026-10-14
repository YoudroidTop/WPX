import type { SheetCellStyle, SheetPage } from './documents';
import { selectionCells, type SheetSelection } from './sheet-selection';

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
    if (patch === null) delete styles[address];
    else styles[address] = { ...styles[address], ...patch };
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
