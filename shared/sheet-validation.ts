import {
  MAX_SHEET_VALIDATIONS,
  type SheetPage,
  type SheetValidation,
  type SheetValidationRule,
} from './documents';
import { parseSelection, selectionBounds, selectionLabel, type CellPoint } from './sheet-selection';
import type { SheetBounds } from './sheet-data';

export function rangeBounds(range: string): SheetBounds | null {
  const selection = parseSelection(range);
  return selection ? selectionBounds(selection) : null;
}

export function boundsLabel(bounds: SheetBounds) {
  return selectionLabel({
    anchor: { row: bounds.top, col: bounds.left },
    focus: { row: bounds.bottom, col: bounds.right },
  });
}

const contains = (b: SheetBounds, p: CellPoint) =>
  p.row >= b.top && p.row <= b.bottom && p.col >= b.left && p.col <= b.right;

/** The rule governing a cell. Ranges never overlap after add/clear, but the last one wins anyway. */
export function validationAt(
  validations: SheetValidation[] | undefined,
  point: CellPoint,
): SheetValidation | undefined {
  if (!validations) return undefined;
  for (let i = validations.length - 1; i >= 0; i--) {
    const bounds = rangeBounds(validations[i].range);
    if (bounds && contains(bounds, point)) return validations[i];
  }
  return undefined;
}

/**
 * Checks one value against a rule. `value` is the calculated value (formula result), and
 * blanks always pass, matching Excel's default "ignore blank".
 */
export function isValidValue(rule: SheetValidationRule, value: string | number): boolean {
  const text = String(value).trim();
  if (text === '') return true;
  if (rule.type === 'list') return rule.options.some((option) => option.trim() === text);
  if (rule.type === 'textLength') {
    const length = String(value).length;
    return (
      (rule.min === undefined || length >= rule.min) &&
      (rule.max === undefined || length <= rule.max)
    );
  }
  const number = typeof value === 'number' ? value : Number(text);
  if (!Number.isFinite(number)) return false;
  if (rule.integer && !Number.isInteger(number)) return false;
  return (
    (rule.min === undefined || number >= rule.min) && (rule.max === undefined || number <= rule.max)
  );
}

export function describeRule(rule: SheetValidationRule): string {
  if (rule.type === 'list') return `从列表中选择：${rule.options.join('、')}`;
  const unit = rule.type === 'textLength' ? '文本长度' : rule.integer ? '整数' : '数值';
  if (rule.min !== undefined && rule.max !== undefined)
    return `${unit}需介于 ${rule.min} 与 ${rule.max} 之间`;
  if (rule.min !== undefined) return `${unit}需不小于 ${rule.min}`;
  if (rule.max !== undefined) return `${unit}需不大于 ${rule.max}`;
  return rule.type === 'number' ? `请输入${unit}` : '任意长度文本';
}

/** Rectangle difference: the parts of `outer` not covered by `hole` (0–4 rectangles). */
function subtract(outer: SheetBounds, hole: SheetBounds): SheetBounds[] {
  const top = Math.max(outer.top, hole.top),
    bottom = Math.min(outer.bottom, hole.bottom),
    left = Math.max(outer.left, hole.left),
    right = Math.min(outer.right, hole.right);
  if (top > bottom || left > right) return [outer];
  const pieces: SheetBounds[] = [];
  if (outer.top < top) pieces.push({ ...outer, bottom: top - 1 });
  if (bottom < outer.bottom) pieces.push({ ...outer, top: bottom + 1 });
  if (outer.left < left) pieces.push({ top, bottom, left: outer.left, right: left - 1 });
  if (right < outer.right) pieces.push({ top, bottom, left: right + 1, right: outer.right });
  return pieces;
}

function carve(validations: SheetValidation[], hole: SheetBounds): SheetValidation[] {
  const next: SheetValidation[] = [];
  for (const validation of validations) {
    const bounds = rangeBounds(validation.range);
    if (!bounds) continue;
    const pieces = subtract(bounds, hole);
    if (pieces.length === 1 && pieces[0] === bounds) next.push(validation);
    else
      pieces.forEach((piece, index) =>
        next.push({ ...validation, id: `${validation.id}-${index}`, range: boundsLabel(piece) }),
      );
  }
  return next;
}

/** Removes validation from a rectangle, splitting rules that only partly overlap it. */
export function clearValidation(sheet: SheetPage, bounds: SheetBounds): SheetPage {
  const validations = carve(sheet.validations ?? [], bounds);
  return { ...sheet, validations };
}

/**
 * Applies a rule to a rectangle, replacing whatever covered it before so ranges never
 * overlap. Returns null when the sheet would exceed the rule cap.
 */
export function applyValidation(
  sheet: SheetPage,
  bounds: SheetBounds,
  rule: SheetValidationRule,
  mode: SheetValidation['mode'],
  id: string = crypto.randomUUID(),
): SheetPage | null {
  const validations = [
    ...carve(sheet.validations ?? [], bounds),
    { id, range: boundsLabel(bounds), rule, mode },
  ];
  if (validations.length > MAX_SHEET_VALIDATIONS) return null;
  return { ...sheet, validations };
}

/** Cells whose current (calculated) value breaks the rule that covers them. */
export function invalidCells(
  sheet: SheetPage,
  valueAt: (address: string) => string | number,
): Set<string> {
  const invalid = new Set<string>();
  if (!sheet.validations?.length) return invalid;
  for (const address of Object.keys(sheet.cells)) {
    const point = parseSelection(address)?.anchor;
    const validation = point && validationAt(sheet.validations, point);
    if (validation && !isValidValue(validation.rule, valueAt(address))) invalid.add(address);
  }
  return invalid;
}

/** Parses free-form list input (one per line or comma separated) into unique options. */
export function parseListOptions(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\n,，;；]/)) {
    const option = part.trim();
    if (option) seen.add(option);
  }
  return [...seen];
}
