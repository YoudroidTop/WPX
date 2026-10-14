import type ExcelJS from 'exceljs';
import type { SheetCellStyle } from '../shared/documents';
import { numberFormats } from '../shared/sheet-format';

export function writeCellStyle(cell: ExcelJS.Cell, style: SheetCellStyle) {
  cell.font = {
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    ...(style.color ? { color: { argb: `FF${style.color.slice(1).toUpperCase()}` } } : {}),
  };
  if (style.fill)
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${style.fill.slice(1).toUpperCase()}` },
    };
  if (style.align) cell.alignment = { horizontal: style.align };
  if (style.numberFormat) cell.numFmt = numberFormats[style.numberFormat];
  if (style.border) {
    const edge: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF53645C' } };
    cell.border = { top: edge, bottom: edge, left: edge, right: edge };
  }
}

function rgb(color?: Partial<ExcelJS.Color>) {
  const value = color?.argb;
  return value && /^(?:FF)?[0-9A-F]{6}$/i.test(value)
    ? `#${value.slice(-6).toLowerCase()}`
    : undefined;
}
export function readCellStyle(cell: ExcelJS.Cell): SheetCellStyle {
  const style: SheetCellStyle = {};
  if (cell.font?.bold) style.bold = true;
  if (cell.font?.italic) style.italic = true;
  if (cell.font?.underline) style.underline = true;
  const color = rgb(cell.font?.color);
  if (color) style.color = color;
  if (cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid') {
    const fill = rgb(cell.fill.fgColor);
    if (fill) style.fill = fill;
  }
  const align = cell.alignment?.horizontal;
  if (align === 'left' || align === 'center' || align === 'right') style.align = align;
  const format = Object.entries(numberFormats).find(([, code]) => code === cell.numFmt)?.[0];
  if (format && format !== 'general') style.numberFormat = format as SheetCellStyle['numberFormat'];
  if (
    cell.border &&
    ['top', 'bottom', 'left', 'right'].every(
      (edge) => cell.border[edge as keyof ExcelJS.Borders]?.style,
    )
  )
    style.border = true;
  return style;
}
