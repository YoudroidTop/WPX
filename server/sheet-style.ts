import type ExcelJS from 'exceljs';
import { MAX_COMMENT_LENGTH, type SheetCellStyle } from '../shared/documents';
import { numberFormats } from '../shared/sheet-format';

export function writeCellStyle(cell: ExcelJS.Cell, style: SheetCellStyle) {
  cell.font = {
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    ...(style.fontFamily ? { name: style.fontFamily } : {}),
    ...(style.fontSize ? { size: style.fontSize } : {}),
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
  const hasTop = style.border || style.borderTop;
  const hasBottom = style.border || style.borderBottom;
  const hasLeft = style.border || style.borderLeft;
  const hasRight = style.border || style.borderRight;
  if (hasTop || hasBottom || hasLeft || hasRight) {
    const edge: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF53645C' } };
    cell.border = {
      top: hasTop ? edge : undefined,
      bottom: hasBottom ? edge : undefined,
      left: hasLeft ? edge : undefined,
      right: hasRight ? edge : undefined,
    };
  }
}

const DEFAULT_FONT_NAMES = new Set(['Calibri', '等线', 'DengXian']);

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
  // Skip workbook default fonts so plain imported cells stay unstyled.
  const fontName = cell.font?.name?.trim();
  if (fontName && fontName.length <= 64 && !DEFAULT_FONT_NAMES.has(fontName))
    style.fontFamily = fontName;
  const fontSize = cell.font?.size;
  if (typeof fontSize === 'number' && fontSize >= 6 && fontSize <= 96 && fontSize !== 11)
    style.fontSize = fontSize;
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
  if (cell.border) {
    const hasTop = Boolean(cell.border.top?.style);
    const hasBottom = Boolean(cell.border.bottom?.style);
    const hasLeft = Boolean(cell.border.left?.style);
    const hasRight = Boolean(cell.border.right?.style);
    if (hasTop && hasBottom && hasLeft && hasRight) {
      style.border = true;
    } else {
      if (hasTop) style.borderTop = true;
      if (hasBottom) style.borderBottom = true;
      if (hasLeft) style.borderLeft = true;
      if (hasRight) style.borderRight = true;
    }
  }
  return style;
}

/** Flattens an XLSX note (plain or rich text) into comment text within the length cap. */
export function readCellNote(cell: ExcelJS.Cell): string | undefined {
  const note = cell.note as string | ExcelJS.Comment | undefined;
  const text =
    typeof note === 'string'
      ? note
      : (note?.texts ?? []).map((part) => part.text ?? '').join('');
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, MAX_COMMENT_LENGTH) : undefined;
}
