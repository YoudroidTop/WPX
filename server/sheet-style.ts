import type ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import {
  columnName,
  MAX_CELL_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_LIST_OPTIONS,
  MAX_SHEET_VALIDATIONS,
  type SheetCellStyle,
  type SheetValidation,
  type SheetValidationRule,
} from '../shared/documents';
import { parseSelection, type CellPoint } from '../shared/sheet-selection';
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

type WorksheetValidations = {
  add(address: string, validation: ExcelJS.DataValidation): void;
  model: Record<string, ExcelJS.DataValidation | undefined>;
};
// `dataValidations` exists at runtime but is missing from the ExcelJS typings.
const validationsOf = (ws: ExcelJS.Worksheet) =>
  (ws as unknown as { dataValidations: WorksheetValidations }).dataValidations;

function boundsFormulae(min?: number, max?: number) {
  if (min !== undefined && max !== undefined)
    return { operator: 'between' as const, formulae: [min, max] };
  if (min !== undefined) return { operator: 'greaterThanOrEqual' as const, formulae: [min] };
  if (max !== undefined) return { operator: 'lessThanOrEqual' as const, formulae: [max] };
  return null;
}

export function writeValidations(ws: ExcelJS.Worksheet, validations: SheetValidation[]) {
  for (const validation of validations) {
    const { rule } = validation;
    const common = {
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: validation.mode === 'stop' ? 'stop' : 'warning',
    };
    if (rule.type === 'list') {
      validationsOf(ws).add(validation.range, {
        ...common,
        type: 'list',
        formulae: [`"${rule.options.join(',')}"`],
      });
      continue;
    }
    const limits = boundsFormulae(rule.min, rule.max);
    if (!limits && rule.type === 'textLength') continue;
    validationsOf(ws).add(validation.range, {
      ...common,
      type: rule.type === 'textLength' ? 'textLength' : rule.integer ? 'whole' : 'decimal',
      // Excel needs an operator; "any number" is expressed as an unbounded range.
      ...(limits ?? { operator: 'between', formulae: [-1e307, 1e307] }),
    });
  }
}

function readRule(validation: ExcelJS.DataValidation): SheetValidationRule | null {
  const numbers = (validation.formulae ?? []).map(Number);
  const limits = (): { min?: number; max?: number } | null => {
    const [first, second] = numbers;
    if (!Number.isFinite(first)) return null;
    switch (validation.operator ?? 'between') {
      case 'between':
        return Number.isFinite(second)
          ? {
              ...(first > -1e306 ? { min: first } : {}),
              ...(second < 1e306 ? { max: second } : {}),
            }
          : null;
      case 'greaterThanOrEqual':
        return { min: first };
      case 'lessThanOrEqual':
        return { max: first };
      case 'equal':
        return { min: first, max: first };
      default:
        return null;
    }
  };
  if (validation.type === 'list') {
    const source = String(validation.formulae?.[0] ?? '');
    // Only inline lists ("a,b,c") are supported; range references such as $A$1:$A$5 are skipped.
    if (!/^".*"$/.test(source)) return null;
    const options = [...new Set(source.slice(1, -1).split(',').map((o) => o.trim()))]
      .filter((o) => o && o.length <= 64)
      .slice(0, MAX_LIST_OPTIONS);
    return options.length ? { type: 'list', options } : null;
  }
  if (validation.type === 'whole' || validation.type === 'decimal') {
    const range = limits();
    return range ? { type: 'number', ...range, ...(validation.type === 'whole' ? { integer: true } : {}) } : null;
  }
  if (validation.type === 'textLength') {
    const range = limits();
    return range && Object.values(range).every((v) => Number.isInteger(v) && v >= 0 && v <= MAX_CELL_LENGTH)
      ? { type: 'textLength', ...range }
      : null;
  }
  return null;
}

/**
 * ExcelJS expands validations to one entry per cell on load. Regroup identical rules into
 * column runs, then merge neighbouring columns with the same run into rectangles.
 */
export function readValidations(ws: ExcelJS.Worksheet): SheetValidation[] {
  const groups = new Map<string, { validation: ExcelJS.DataValidation; cells: CellPoint[] }>();
  for (const [address, validation] of Object.entries(validationsOf(ws).model ?? {})) {
    const point = validation && parseSelection(address)?.anchor;
    if (!point || !validation) continue;
    const key = JSON.stringify(validation);
    const group = groups.get(key) ?? { validation, cells: [] };
    group.cells.push(point);
    groups.set(key, group);
  }
  const result: SheetValidation[] = [];
  for (const { validation, cells } of groups.values()) {
    const rule = readRule(validation);
    if (!rule) continue;
    const runs: { top: number; bottom: number; left: number; right: number }[] = [];
    const byColumn = new Map<number, number[]>();
    for (const { row, col } of cells) byColumn.set(col, [...(byColumn.get(col) ?? []), row]);
    for (const [col, rows] of [...byColumn].sort((a, b) => a[0] - b[0])) {
      rows.sort((a, b) => a - b);
      let start = rows[0];
      for (let i = 1; i <= rows.length; i++) {
        if (i < rows.length && rows[i] === rows[i - 1] + 1) continue;
        const run = { top: start, bottom: rows[i - 1], left: col, right: col };
        const neighbour = runs.find(
          (r) => r.right === col - 1 && r.top === run.top && r.bottom === run.bottom,
        );
        if (neighbour) neighbour.right = col;
        else runs.push(run);
        start = rows[i];
      }
    }
    for (const run of runs) {
      if (result.length >= MAX_SHEET_VALIDATIONS) return result;
      const from = `${columnName(run.left)}${run.top}`,
        to = `${columnName(run.right)}${run.bottom}`;
      result.push({
        id: randomUUID(),
        range: from === to ? from : `${from}:${to}`,
        rule,
        mode: validation.errorStyle === 'stop' || !validation.errorStyle ? 'stop' : 'warning',
      });
    }
  }
  return result;
}
