import { useSheetFillHandle } from './useSheetFillHandle';
import { copySheetRange, fillSheetRange } from '../../shared/sheet-fill';
import {
  SHEET_CLIPBOARD_TYPE,
  encodeSheetClipboard,
  decodeSheetClipboard,
} from '../../shared/sheet-clipboard';
import { frozenOffsets } from '../../shared/sheet-view';
import type { CSSProperties } from 'react';
import SheetRibbon from './sheet/SheetRibbon';
import { fontStack } from './sheet/SheetFontDropdown';
import { CommentBubble, CommentModal } from './sheet/SheetComments';
import { invalidMessage, ListPopover, ValidationModal } from './sheet/SheetValidation';
import { FilterMenu } from './sheet/SheetFilter';
import {
  createAutoFilter,
  filterBounds,
  filterColumnValues,
  filteredRows,
  removeAutoFilter,
  setColumnFilter,
} from '../../shared/sheet-filter';
import {
  applyValidation,
  clearValidation,
  invalidCells,
  isValidValue,
  validationAt,
} from '../../shared/sheet-validation';
import {
  ChartModal,
  FindReplaceModal,
  InsertFeatureModal,
  RemoveDuplicatesModal,
  TextToColumnsModal,
  type InsertPayload,
} from './sheet/SheetModals';
import type {
  RibbonTab,
  ViewSettings,
  InsertDialogType,
  ChartKind,
  DataToolType,
} from './sheet/types';
import {
  formatSelection,
  formatCellValue,
  applyBorderSelection,
  replaceSelectionStyle,
} from '../../shared/sheet-format';
import {
  autoSumRange,
  dataRange,
  parseDelimitedText,
  setCellComment,
  sortSheetRows,
} from '../../shared/sheet-data';
import {
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import { Plus, FunctionSquare, ChevronDown, Filter } from 'lucide-react';
import {
  columnName,
  MAX_CELL_LENGTH,
  MAX_COLUMNS,
  MAX_ROWS,
  type SheetCellStyle,
  type SheetContent,
} from '../../shared/documents';
import { createCalculator } from '../../shared/formulas';
import { Modal } from './ui';
import { changeSheetStructure, validSheetName } from '../../shared/sheet-structure';
import { pasteSheetCells } from '../../shared/sheet-paste';
import {
  cellAddress,
  selectionBounds,
  selectionLabel,
  parseSelection,
  inSelection,
  clearSelection,
  copySelection,
  selectionCells,
  selectionStats,
  type CellPoint,
  type SheetSelection,
} from '../../shared/sheet-selection';
export default function SheetEditor({
  content,
  onChange: onCommit,
}: {
  content: SheetContent;
  onChange: (content: SheetContent) => void;
}) {
  const [sheetId, setSheetId] = useState(content.sheets[0].id),
    [selection, setSelection] = useState<SheetSelection>({
      anchor: { row: 1, col: 0 },
      focus: { row: 1, col: 0 },
    }),
    [editing, setEditing] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(100),
    [colCount, setColCount] = useState(26);
  const history = useRef<{ undo: SheetContent[]; redo: SheetContent[] }>({ undo: [], redo: [] });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [sheetAction, setSheetAction] = useState<'rename' | 'delete' | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [columnWidth, setColumnWidth] = useState('120'),
    [rowHeight, setRowHeight] = useState('29');
  const [currentTab, setCurrentTab] = useState<RibbonTab>('home');
  const [viewSettings, setViewSettings] = useState<ViewSettings>({
    eyeCare: false,
    highlightRowCol: false,
    showGridlines: true,
    showHeadings: true,
    zebraStripe: false,
    zoom: 100,
  });
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [insertModalType, setInsertModalType] = useState<InsertDialogType | null>(null);
  const [chartKind, setChartKind] = useState<ChartKind | null>(null);
  const [dataTool, setDataTool] = useState<DataToolType | null>(null);
  // Style captured by the format painter; non-null while painter mode is armed.
  const [painterStyle, setPainterStyle] = useState<SheetCellStyle | null>(null);
  const [recalcVersion, setRecalcVersion] = useState(0);
  const [commentEditor, setCommentEditor] = useState<string | null>(null);
  const [hoverComment, setHoverComment] = useState<string | null>(null);
  const [validationDialog, setValidationDialog] = useState<'list' | 'number' | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [filterMenu, setFilterMenu] = useState<number | null>(null);
  const closeFilterMenu = useCallback(() => setFilterMenu(null), []);
  const closeList = useCallback(() => setListOpen(false), []);
  function onChange(next: SheetContent) {
    history.current.undo.push(content);
    if (history.current.undo.length > 100) history.current.undo.shift();
    history.current.redo = [];
    setHistoryVersion((v) => v + 1);
    onCommit(next);
  }
  function travel(direction: 'undo' | 'redo') {
    const next = history.current[direction].pop();
    if (!next) return;
    history.current[direction === 'undo' ? 'redo' : 'undo'].push(content);
    setHistoryVersion((v) => v + 1);
    setEditing(null);
    onCommit(next);
  }
  const drag = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  const [addressInput, setAddressInput] = useState<string | null>(null);
  const selected = cellAddress(selection.anchor);
  const sourceBounds = selectionBounds(selection);
  const resetSelection = () =>
    setSelection({ anchor: { row: 1, col: 0 }, focus: { row: 1, col: 0 } });
  const applyPainterRef = useRef<() => void>(() => {});
  useEffect(() => {
    const stop = () => {
      const dragged = drag.current;
      drag.current = false;
      if (dragged) applyPainterRef.current();
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);
  const [pasteError, setPasteError] = useState('');
  const [resize, setResize] = useState<{
    axis: 'row' | 'col';
    index: number;
    start: number;
    value: number;
    preview: number;
  } | null>(null);
  const widthOf = (col: number) =>
    resize?.axis === 'col' && resize.index === col
      ? resize.preview
      : (sheet.columnWidths?.[col] ?? 120);
  const heightOf = (row: number) =>
    resize?.axis === 'row' && resize.index === row
      ? resize.preview
      : (sheet.rowHeights?.[row] ?? 29);
  function resizeValue(event: PointerEvent<HTMLButtonElement>) {
    if (!resize) return 0;
    const delta = (resize.axis === 'row' ? event.clientY : event.clientX) - resize.start;
    return Math.round(
      Math.max(
        resize.axis === 'row' ? 24 : 48,
        Math.min(resize.axis === 'row' ? 300 : 600, resize.value + delta),
      ),
    );
  }
  function resizeHandle(axis: 'row' | 'col', index: number) {
    return (
      <button
        className={`sheet-resize-handle resize-${axis}`}
        aria-label={axis === 'row' ? `调整第 ${index} 行高` : `调整 ${columnName(index)} 列宽`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          const value = axis === 'row' ? heightOf(index) : widthOf(index);
          setResize({
            axis,
            index,
            start: axis === 'row' ? event.clientY : event.clientX,
            value,
            preview: value,
          });
        }}
        onPointerMove={(event) => {
          if (resize) setResize({ ...resize, preview: resizeValue(event) });
        }}
        onPointerUp={(event) => {
          if (!resize) return;
          const key = resize.axis === 'row' ? 'rowHeights' : 'columnWidths';
          const value = resizeValue(event);
          onChange({
            ...content,
            sheets: content.sheets.map((s) =>
              s.id === sheet.id ? { ...s, [key]: { ...s[key], [resize.index]: value } } : s,
            ),
          });
          setResize(null);
        }}
        onPointerCancel={() => setResize(null)}
        onClick={(event) => event.stopPropagation()}
      />
    );
  }

  const sheet = content.sheets.find((s) => s.id === sheetId) ?? content.sheets[0];
  // recalcVersion forces volatile functions such as NOW()/TODAY() to re-evaluate.
  const calculate = useMemo(
    () => createCalculator(sheet.cells),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet.cells, recalcVersion],
  );
  const fillHandle = useSheetFillHandle({
    sheet,
    selection,
    grid,
    onApply: (next, target) => {
      onChange({ ...content, sheets: content.sheets.map((s) => (s.id === sheet.id ? next : s)) });
      setSelection(target);
      setEditing(null);
      setPasteError('');
    },
    onError: () => setPasteError('填充超出工作表、数值或单元格长度上限，原表格未修改。'),
  });
  const headerWidth = viewSettings.showHeadings ? 44 : 0,
    headerHeight = viewSettings.showHeadings ? 29 : 0;
  const visualSelection = fillHandle.preview ?? selection;
  const bounds = selectionBounds(visualSelection);
  useEffect(() => {
    setColumnWidth(String(sheet.columnWidths?.[selection.anchor.col] ?? 120));
    setRowHeight(String(sheet.rowHeights?.[selection.anchor.row] ?? 29));
  }, [sheet.id, sheet.columnWidths, sheet.rowHeights, selection.anchor.col, selection.anchor.row]);

  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    function adaptViewport() {
      if (!el) return;
      const clientWidth = el.clientWidth;
      const clientHeight = el.clientHeight;
      if (clientWidth <= 0 || clientHeight <= 0) return;

      let accWidth = headerWidth;
      let neededCols = 0;
      while (accWidth < clientWidth && neededCols < MAX_COLUMNS) {
        accWidth += widthOf(neededCols);
        neededCols++;
      }
      const targetCols = Math.min(MAX_COLUMNS, Math.max(26, neededCols + 2));
      setColCount((prev) => Math.max(prev, targetCols));

      let accHeight = headerHeight;
      let neededRows = 0;
      while (accHeight < clientHeight && neededRows < MAX_ROWS) {
        accHeight += heightOf(neededRows + 1);
        neededRows++;
      }
      const targetRows = Math.min(MAX_ROWS, Math.max(100, neededRows + 30));
      setRowCount((prev) => Math.max(prev, targetRows));
    }

    adaptViewport();
    const observer = new ResizeObserver(() => {
      adaptViewport();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sheet.id, sheet.columnWidths, sheet.rowHeights, viewSettings.showHeadings]);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const bottomRemaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    const rightRemaining = el.scrollWidth - el.scrollLeft - el.clientWidth;

    if (bottomRemaining < 300) {
      setRowCount((prev) => (prev < MAX_ROWS ? Math.min(MAX_ROWS, prev + 50) : prev));
    }
    if (rightRemaining < 300) {
      setColCount((prev) => (prev < MAX_COLUMNS ? Math.min(MAX_COLUMNS, prev + 5) : prev));
    }
  }

  const usedRows = Math.max(
    1,
    ...Object.keys({ ...sheet.cells, ...sheet.styles }).map((address) =>
      Number(address.match(/\d+/)?.[0] || 1),
    ),
  );
  const usedCols = Math.max(
    1,
    ...Object.keys({ ...sheet.cells, ...sheet.styles }).map((address) =>
      [...address.replace(/\d/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
    ),
  );
  const rows = Math.max(rowCount, usedRows, (sheet.frozenRows ?? 0) + 1),
    columns = Math.max(colCount, usedCols, (sheet.frozenColumns ?? 0) + 1);
  const frozenRows = sheet.frozenRows ?? 0,
    frozenColumns = sheet.frozenColumns ?? 0;
  const rowOffsets = frozenOffsets(frozenRows, headerHeight, (index) => heightOf(index + 1));
  const columnOffsets = frozenOffsets(frozenColumns, headerWidth, widthOf);
  function frozenCellStyle(row: number, col: number): CSSProperties {
    const fixedRow = row <= frozenRows,
      fixedColumn = col < frozenColumns;
    if (!fixedRow && !fixedColumn) return {};
    return {
      position: 'sticky',
      top: fixedRow ? rowOffsets.offsets[row - 1] : undefined,
      left: fixedColumn ? columnOffsets.offsets[col] : undefined,
      zIndex: fixedRow && fixedColumn ? 5 : fixedRow ? 4 : 3,
      backgroundColor:
        inSelection(visualSelection, { row, col }) && selected !== cellAddress({ row, col })
          ? '#e7f1eb'
          : 'var(--sheet-cell-bg, white)',
    };
  }
  function freeze(mode: string) {
    const frozenRows =
      mode === 'first-row' ? 1 : mode === 'selection' ? selection.anchor.row - 1 : 0;
    const frozenColumns =
      mode === 'first-column' ? 1 : mode === 'selection' ? selection.anchor.col : 0;
    onChange({
      ...content,
      sheets: content.sheets.map((s) =>
        s.id === sheet.id ? { ...s, frozenRows, frozenColumns } : s,
      ),
    });
    setEditing(null);
    grid.current?.scrollTo({ top: 0, left: 0 });
  }
  function setCell(address: string, value: string) {
    setPasteError('');
    const cells = { ...sheet.cells };
    if (value) cells[address] = value;
    else delete cells[address];
    onChange({
      ...content,
      sheets: content.sheets.map((s) => (s.id === sheet.id ? { ...s, cells } : s)),
    });
  }
  const stats = useMemo(() => selectionStats(sheet.cells, selection), [sheet.cells, selection]);
  const invalid = useMemo(() => invalidCells(sheet, calculate), [sheet, calculate]);
  const anchorValidation = validationAt(sheet.validations, selection.anchor);
  const anchorList = anchorValidation?.rule.type === 'list' ? anchorValidation.rule.options : null;
  const filterArea = useMemo(() => filterBounds(sheet), [sheet]);
  const hiddenRows = useMemo(() => filteredRows(sheet, calculate), [sheet, calculate]);
  const filteredColumns = new Set(
    Object.entries(sheet.autoFilter?.columns ?? {})
      .filter(([, column]) => column.hidden.length)
      .map(([letter]) => letter),
  );

  function toggleAutoFilter() {
    setFilterMenu(null);
    if (sheet.autoFilter) {
      replaceSheet(removeAutoFilter(sheet));
      setPasteError('');
      return;
    }
    const next = createAutoFilter(sheet, selection);
    if (!next) {
      setPasteError('请先选中包含表头和至少一行数据的区域。');
      return;
    }
    setPasteError('');
    setEditing(null);
    replaceSheet(next);
  }

  // Data validation runs when an edit commits (the cell leaves edit mode), comparing with
  // the value from before the edit started; per-keystroke checks would block typing.
  const preEditCells = useRef(sheet.cells);
  const previousEditing = useRef<string | null>(null);
  function enforceValidation(address: string, original: string) {
    const value = sheet.cells[address] ?? '';
    if (value === original) return;
    const point = parseSelection(address)?.anchor;
    const validation = point && validationAt(sheet.validations, point);
    if (!validation || isValidValue(validation.rule, calculate(address))) return;
    if (validation.mode === 'stop') {
      setCell(address, original);
      setPasteError(`${invalidMessage(validation, value)}已恢复原值。`);
    } else setPasteError(`警告：${invalidMessage(validation, value)}`);
  }
  useEffect(() => {
    const was = previousEditing.current;
    previousEditing.current = editing;
    if (was && was !== editing) enforceValidation(was, preEditCells.current[was] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  // Declared after the check above so the snapshot still holds pre-edit values when it runs.
  useEffect(() => {
    if (!editing) preEditCells.current = sheet.cells;
  });
  const formulaBarOriginal = useRef<string | null>(null);
  function applyCells(cells: Record<string, string>) {
    onChange({
      ...content,
      sheets: content.sheets.map((s) => (s.id === sheet.id ? { ...s, cells } : s)),
    });
  }
  function select(point: CellPoint, extend = false) {
    setEditing(null);
    setSelection((previous) => ({ anchor: extend ? previous.anchor : point, focus: point }));
  }
  function focusCell(point: CellPoint) {
    requestAnimationFrame(() => {
      const target = grid.current?.querySelector<HTMLInputElement>(`#cell-${cellAddress(point)}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
  function keyboard(event: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (event.nativeEvent.isComposing) return;
    if (event.keyCode === 229 || event.key === 'Process') {
      if (!editing) {
        setEditing(cellAddress(selection.anchor));
        setSelection({ anchor: selection.anchor, focus: selection.anchor });
      }
      return;
    }
    const command = event.ctrlKey || event.metaKey;
    if (!editing && event.altKey && event.key === 'ArrowDown' && anchorList) {
      event.preventDefault();
      setListOpen(true);
      return;
    }
    if (command && !editing && ['d', 'r'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      fill(event.key.toLowerCase() === 'd' ? 'down' : 'right');
      return;
    }
    if (command && event.key.toLowerCase() === 'z' && !editing) {
      event.preventDefault();
      travel(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (command && event.key.toLowerCase() === 'a' && !editing) {
      event.preventDefault();
      setSelection({ anchor: { row: 1, col: 0 }, focus: { row: MAX_ROWS, col: MAX_COLUMNS - 1 } });
      return;
    }
    if (!editing && ['Backspace', 'Delete'].includes(event.key)) {
      event.preventDefault();
      applyCells(clearSelection(sheet.cells, selection));
      return;
    }
    if (event.key === 'Escape') {
      setEditing(null);
      setPainterStyle(null);
      return;
    }
    if (!editing && event.key === 'F2' && event.shiftKey) {
      event.preventDefault();
      setCommentEditor(cellAddress(selection.anchor));
      return;
    }
    if (!editing && event.key === 'F2') {
      event.preventDefault();
      setEditing(cellAddress(selection.anchor));
      return;
    }
    if (!editing && !command && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      const address = cellAddress(selection.anchor);
      setSelection({ anchor: selection.anchor, focus: selection.anchor });
      setEditing(address);
      setCell(address, event.key);
      focusCell(selection.anchor);
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (editing && event.key !== 'Enter' && event.key !== 'Tab') return;
    if (event.key === 'Enter' || event.key === 'Tab' || arrows[event.key]) {
      event.preventDefault();
      const [dr, dc] =
        arrows[event.key] ??
        (event.key === 'Enter' ? [event.shiftKey ? -1 : 1, 0] : [0, event.shiftKey ? -1 : 1]);
      const origin = !editing ? selection.focus : { row, col };
      const point = {
        row: Math.max(1, Math.min(rows, origin.row + dr)),
        col: Math.max(0, Math.min(columns - 1, origin.col + dc)),
      };
      // Rows hidden by the filter are skipped; stay put if only hidden rows lie ahead.
      while (dr && hiddenRows.has(point.row)) {
        const next = point.row + Math.sign(dr);
        if (next < 1 || next > rows) {
          point.row = origin.row;
          break;
        }
        point.row = next;
      }
      select(point, event.shiftKey && !!arrows[event.key]);
      focusCell(point);
    }
  }
  function fill(direction: 'down' | 'right') {
    if (direction === 'down' ? bounds.top === bounds.bottom : bounds.left === bounds.right) return;
    try {
      const next = fillSheetRange(sheet, selection, direction);
      onChange({ ...content, sheets: content.sheets.map((s) => (s.id === sheet.id ? next : s)) });
      setEditing(null);
      setPasteError('');
    } catch {
      setPasteError('填充后公式超过单元格长度上限，原表格未修改。');
    }
  }
  function paste(event: React.ClipboardEvent<HTMLInputElement>, row: number, col: number) {
    if (!editing) {
      const copied = decodeSheetClipboard(event.clipboardData.getData(SHEET_CLIPBOARD_TYPE));
      if (copied) {
        event.preventDefault();
        try {
          const next = copySheetRange(copied.sheet, copied.selection, sheet, {
            row: bounds.top,
            col: bounds.left,
          });
          onChange({
            ...content,
            sheets: content.sheets.map((s) => (s.id === sheet.id ? next : s)),
          });
          setPasteError('');
        } catch {
          setPasteError('粘贴超出工作表或单元格长度上限，原表格未修改。');
        }
        return;
      }
    }
    const text = event.clipboardData.getData('text/plain');
    if (editing && !/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    const result = pasteSheetCells(
      sheet.cells,
      text,
      editing ? row : bounds.top,
      editing ? col : bounds.left,
    );
    if (!result.ok) {
      const messages = {
        rows: '粘贴内容超出 500 行上限，请减少行数或选择更靠上的单元格。原表格未修改。',
        columns: '粘贴内容超出 52 列上限，请减少列数或选择更靠左的单元格。原表格未修改。',
        'cell-length': '粘贴内容中有单元格超过 10000 字符，请缩短后重试。原表格未修改。',
      };
      setPasteError(messages[result.reason]);
      return;
    }
    setPasteError('');
    onChange({
      ...content,
      sheets: content.sheets.map((s) => (s.id === sheet.id ? { ...s, cells: result.cells } : s)),
    });
  }
  function structure(axis: 'row' | 'col', operation: 'insert' | 'delete') {
    try {
      const next = changeSheetStructure(
        sheet,
        axis,
        axis === 'row' ? bounds.top : bounds.left,
        axis === 'row' ? bounds.bottom - bounds.top + 1 : bounds.right - bounds.left + 1,
        operation,
      );
      onChange({ ...content, sheets: content.sheets.map((s) => (s.id === sheet.id ? next : s)) });
      setEditing(null);
      setPasteError('');
    } catch {
      setPasteError('无法插入：末尾已有内容，移动后会超出工作表边界。请先移动或清理末尾内容。');
    }
  }
  function sizeSelection(axis: 'row' | 'col') {
    const value = Number(axis === 'row' ? rowHeight : columnWidth);
    if (
      !Number.isFinite(value) ||
      value < (axis === 'row' ? 24 : 48) ||
      value > (axis === 'row' ? 300 : 600)
    ) {
      setPasteError(axis === 'row' ? '行高应为 24–300 像素。' : '列宽应为 48–600 像素。');
      return;
    }
    const key = axis === 'row' ? 'rowHeights' : 'columnWidths';
    const sizes = { ...sheet[key] };
    for (
      let i = axis === 'row' ? bounds.top : bounds.left;
      i <= (axis === 'row' ? bounds.bottom : bounds.right);
      i++
    )
      sizes[i] = value;
    onChange({
      ...content,
      sheets: content.sheets.map((s) => (s.id === sheet.id ? { ...s, [key]: sizes } : s)),
    });
    setPasteError('');
  }
  function duplicateSheet() {
    let n = 1,
      name = `${sheet.name.slice(0, 24)} (${n})`;
    while (!validSheetName(name, content.sheets)) name = `${sheet.name.slice(0, 24)} (${++n})`;
    const duplicate = { ...structuredClone(sheet), id: crypto.randomUUID(), name };
    onChange({ ...content, sheets: [...content.sheets, duplicate] });
    setSheetId(duplicate.id);
    resetSelection();
  }
  function addSheet() {
    const id = crypto.randomUUID();
    let n = content.sheets.length + 1;
    while (content.sheets.some((s) => s.name === `工作表 ${n}`)) n++;
    onChange({ ...content, sheets: [...content.sheets, { id, name: `工作表 ${n}`, cells: {} }] });
    setSheetId(id);
    resetSelection();
    setPasteError('');
  }

  function replaceSheet(next: SheetContent['sheets'][number]) {
    onChange({ ...content, sheets: content.sheets.map((s) => (s.id === sheet.id ? next : s)) });
  }

  function handleSort(
    direction: 'asc' | 'desc',
    sortCol = selection.anchor.col,
    fromFilter = false,
  ) {
    const anchor = selection.anchor;
    // Inside a filter area, sort the filter's data rows and keep its header in place.
    const range =
      filterArea &&
      (fromFilter || (anchor.row >= filterArea.top && anchor.row <= filterArea.bottom)) &&
      sortCol >= filterArea.left &&
      sortCol <= filterArea.right
        ? { bounds: filterArea, hasHeader: true }
        : dataRange(sheet.cells, selection);
    if (!range) {
      setPasteError('请先选中需要排序的数据区域。');
      return;
    }
    setPasteError('');
    setEditing(null);
    replaceSheet(
      sortSheetRows(sheet, range.bounds, direction, {
        sortCol,
        hasHeader: range.hasHeader,
      }),
    );
  }

  // Functions that aggregate a range; the rest get an empty argument list to fill in.
  const RANGE_FUNCTIONS = new Set(['SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'MAX', 'MIN', 'MEDIAN']);
  const NO_ARG_FUNCTIONS = new Set(['TODAY', 'NOW']);

  function editFormula(point: CellPoint, formula: string, caret: number) {
    const address = cellAddress(point);
    setSelection({ anchor: point, focus: point });
    setCell(address, formula);
    setEditing(address);
    requestAnimationFrame(() => {
      const input = grid.current?.querySelector<HTMLInputElement>(`#cell-${address}`);
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(caret, caret);
      input?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function handleInsertFormula(formulaName: string) {
    if (!formulaName) return;
    const b = selectionBounds(selection);
    const anchor = selection.anchor;
    if (NO_ARG_FUNCTIONS.has(formulaName)) {
      setCell(cellAddress(anchor), `=${formulaName}()`);
      return;
    }
    if (!RANGE_FUNCTIONS.has(formulaName)) {
      const formula = `=${formulaName}()`;
      editFormula(anchor, formula, formula.length - 1);
      return;
    }
    const isRange = b.top !== b.bottom || b.left !== b.right;
    if (!isRange) {
      const range = autoSumRange(calculate, anchor);
      const formula = `=${formulaName}(${range ?? ''})`;
      editFormula(anchor, formula, range ? formula.length : formula.length - 1);
      return;
    }
    // Like WPS/Excel: a selected range gets one result per column in the row below it,
    // so the formula never references its own cell.
    const used = dataRange(sheet.cells, selection)?.bounds;
    const bottom = used ? Math.min(b.bottom, used.bottom) : b.bottom;
    const right = used ? Math.min(b.right, used.right) : b.right;
    const targetRow = bottom + 1;
    if (targetRow > MAX_ROWS) {
      setPasteError('选区下方已没有空行，无法放置计算结果。');
      return;
    }
    const cells = { ...sheet.cells };
    for (let col = b.left; col <= right; col++)
      cells[cellAddress({ row: targetRow, col })] =
        `=${formulaName}(${columnName(col)}${b.top}:${columnName(col)}${bottom})`;
    applyCells(cells);
    setPasteError('');
    setRowCount((count) => Math.max(count, targetRow));
    select({ row: targetRow, col: b.left });
    focusCell({ row: targetRow, col: b.left });
  }

  function handleInsertConfirm(payload: InsertPayload) {
    const addr = cellAddress(selection.anchor);
    if (payload.kind === 'import') {
      const rows = parseDelimitedText(payload.text);
      // Sanitize tabs/newlines inside quoted fields so the TSV round-trip stays rectangular.
      const tsv = rows
        .map((row) => row.map((v) => v.replace(/[\t\r\n]+/g, ' ')).join('\t'))
        .join('\n');
      const result = pasteSheetCells(sheet.cells, tsv, selection.anchor.row, selection.anchor.col);
      if (!result.ok) {
        setPasteError('导入内容超出工作表或单元格长度上限，原表格未修改。');
        return;
      }
      setPasteError('');
      applyCells(result.cells);
      return;
    }
    const current = sheet.cells[addr] ?? '';
    const text =
      payload.mode === 'append'
        ? current + payload.text
        : payload.mode === 'prefix'
          ? payload.text + current
          : payload.text;
    setCell(addr, text.slice(0, MAX_CELL_LENGTH));
  }

  function toggleFormatPainter() {
    if (painterStyle) setPainterStyle(null);
    else setPainterStyle({ ...(sheet.styles?.[selected] ?? {}) });
  }

  // Called by the window pointerup listener (via ref) once a cell click or drag completes.
  // The paint itself runs in an effect so it sees the final selection of the drag.
  const [paintPending, setPaintPending] = useState(false);
  applyPainterRef.current = () => {
    if (painterStyle) setPaintPending(true);
  };
  useEffect(() => {
    if (!paintPending) return;
    setPaintPending(false);
    if (!painterStyle) return;
    replaceSheet(replaceSelectionStyle(sheet, selection, painterStyle));
    setPainterStyle(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintPending]);
  useEffect(() => {
    if (!painterStyle) return;
    // Focus usually sits on the painter button, so cell-level Esc handling won't see it.
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setPainterStyle(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [painterStyle]);

  function handleTextToNumber() {
    const cellsToUpdate: Record<string, string> = { ...sheet.cells };
    let changed = false;
    for (const addr of selectionCells(selection)) {
      const val = sheet.cells[addr];
      if (!val) continue;
      const trimmed = val.trim();
      const num = Number(trimmed);
      if (!Number.isNaN(num) && trimmed !== '') {
        cellsToUpdate[addr] = String(num);
        changed = true;
      }
    }
    if (changed) {
      applyCells(cellsToUpdate);
    }
  }

  function handleRecalculate() {
    setRecalcVersion((v) => v + 1);
  }

  const usedColors = useMemo(() => {
    const set = new Set<string>();
    if (sheet.styles) {
      for (const style of Object.values(sheet.styles)) {
        if (style.color) set.add(style.color.toLowerCase());
      }
    }
    return Array.from(set);
  }, [sheet.styles]);

  const usedFills = useMemo(() => {
    const set = new Set<string>();
    if (sheet.styles) {
      for (const style of Object.values(sheet.styles)) {
        if (style.fill) set.add(style.fill.toLowerCase());
      }
    }
    return Array.from(set);
  }, [sheet.styles]);

  return (
    <div className="sheet-editor" data-history-version={historyVersion}>
      <SheetRibbon
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        currentStyle={sheet.styles?.[selected] ?? {}}
        onStyleChange={(patch) =>
          onChange({
            ...content,
            sheets: content.sheets.map((s) =>
              s.id === sheet.id ? formatSelection(s, selection, patch) : s,
            ),
          })
        }
        onApplyBorder={(borderType) =>
          onChange({
            ...content,
            sheets: content.sheets.map((s) =>
              s.id === sheet.id ? applyBorderSelection(s, selection, borderType) : s,
            ),
          })
        }
        usedColors={usedColors}
        usedFills={usedFills}
        onClearContent={() => applyCells(clearSelection(sheet.cells, selection))}
        formatPainterActive={!!painterStyle}
        onToggleFormatPainter={toggleFormatPainter}
        onOpenChart={setChartKind}
        onOpenDataTool={(type) => {
          if (type === 'duplicates' && hiddenRows.size) {
            setPasteError('筛选隐藏了部分行，请先清除筛选条件再删除重复项。');
            return;
          }
          setDataTool(type);
        }}
        onClearFormat={() =>
          onChange({
            ...content,
            sheets: content.sheets.map((s) => {
              if (s.id !== sheet.id) return s;
              const styles = { ...s.styles };
              for (const address of selectionCells(selection)) delete styles[address];
              return { ...s, styles };
            }),
          })
        }
        canUndo={history.current.undo.length > 0}
        canRedo={history.current.redo.length > 0}
        onUndo={() => travel('undo')}
        onRedo={() => travel('redo')}
        onFill={fill}
        canFillDown={bounds.top !== bounds.bottom}
        canFillRight={bounds.left !== bounds.right}
        onStructure={structure}
        columnWidth={columnWidth}
        onColumnWidthChange={setColumnWidth}
        onApplyColumnWidth={() => sizeSelection('col')}
        rowHeight={rowHeight}
        onRowHeightChange={setRowHeight}
        onApplyRowHeight={() => sizeSelection('row')}
        frozenRows={frozenRows}
        frozenColumns={frozenColumns}
        onFreeze={freeze}
        canFreezeSelection={!(selection.anchor.row === 1 && selection.anchor.col === 0)}
        onSort={handleSort}
        onInsertFormula={handleInsertFormula}
        viewSettings={viewSettings}
        onViewSettingsChange={(patch) => setViewSettings((prev) => ({ ...prev, ...patch }))}
        onAddRows={() => setRowCount(Math.min(MAX_ROWS, rows + 50))}
        onAddCols={() => setColCount(Math.min(MAX_COLUMNS, columns + 5))}
        canAddRows={rows < MAX_ROWS}
        canAddCols={columns < MAX_COLUMNS}
        onOpenFindReplace={() => setFindReplaceOpen(true)}
        onOpenInsertDialog={(type) =>
          type === 'comment'
            ? setCommentEditor(selected)
            : type === 'dropdown'
              ? setValidationDialog('list')
              : type === 'validation'
                ? setValidationDialog('number')
                : type === 'filter'
                  ? toggleAutoFilter()
                  : setInsertModalType(type)
        }
        onTextToNumber={handleTextToNumber}
        onRecalculate={handleRecalculate}
      />
      <div className="formula-bar">
        <input
          className="cell-address"
          aria-label="选区地址"
          value={addressInput ?? selectionLabel(selection)}
          onChange={(event) => setAddressInput(event.target.value)}
          onBlur={() => setAddressInput(null)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const next = parseSelection(addressInput ?? selectionLabel(selection));
            if (!next) {
              setPasteError('请输入有效区域，例如 A1:C10（最多 AZ500）。');
              return;
            }
            setSelection(next);
            setEditing(null);
            setAddressInput(null);
            setPasteError('');
            const b = selectionBounds(next);
            setRowCount(Math.max(rowCount, b.bottom));
            setColCount(Math.max(colCount, b.right + 1));
            focusCell(next.anchor);
          }}
        />
        <FunctionSquare size={17} />
        <input
          aria-label="公式栏"
          value={sheet.cells[selected] ?? ''}
          placeholder="输入文字、数字或公式，如 =SUM(A1:A10)"
          maxLength={MAX_CELL_LENGTH}
          onChange={(event) => setCell(selected, event.target.value)}
          onFocus={() => {
            formulaBarOriginal.current = sheet.cells[selected] ?? '';
          }}
          onBlur={() => {
            if (formulaBarOriginal.current !== null)
              enforceValidation(selected, formulaBarOriginal.current);
            formulaBarOriginal.current = null;
          }}
        />
      </div>
      {pasteError && (
        <div className="save-error" role="alert">
          {pasteError}
        </div>
      )}
      <div
        className={`sheet-scroll ${painterStyle ? 'format-painter' : ''} ${viewSettings.eyeCare ? 'eye-care' : ''} ${!viewSettings.showGridlines ? 'hide-gridlines' : ''} ${viewSettings.zebraStripe ? 'zebra-stripe' : ''}`}
        style={{ scrollPaddingTop: rowOffsets.size, scrollPaddingLeft: columnOffsets.size }}
        ref={grid}
        onScroll={handleScroll}
        onPointerLeave={() => setHoverComment(null)}
        onCopy={(event) => {
          if (editing) return;
          event.preventDefault();
          event.clipboardData.setData('text/plain', copySelection(sheet.cells, selection));
          event.clipboardData.setData(SHEET_CLIPBOARD_TYPE, encodeSheetClipboard(sheet, selection));
        }}
        onCut={(event) => {
          if (editing) return;
          event.preventDefault();
          event.clipboardData.setData('text/plain', copySelection(sheet.cells, selection));
          applyCells(clearSelection(sheet.cells, selection));
        }}
      >
        <table
          className="spreadsheet"
          style={{
            zoom: viewSettings.zoom !== 100 ? `${viewSettings.zoom}%` : undefined,
          }}
        >
          <colgroup>
            {viewSettings.showHeadings && <col style={{ width: 44 }} />}
            {Array.from({ length: columns }, (_, col) => (
              <col key={col} style={{ width: widthOf(col) }} />
            ))}
          </colgroup>
          {viewSettings.showHeadings && (
            <thead>
              <tr>
                <th className="row-number">
                  <button
                    aria-label="选择全部单元格"
                    onClick={() => {
                      setEditing(null);
                      setSelection({
                        anchor: { row: 1, col: 0 },
                        focus: { row: MAX_ROWS, col: MAX_COLUMNS - 1 },
                      });
                      focusCell({ row: 1, col: 0 });
                    }}
                  >
                    ◢
                  </button>
                </th>
                {Array.from({ length: columns }, (_, col) => (
                  <th
                    key={col}
                    style={
                      col < frozenColumns
                        ? { position: 'sticky', left: columnOffsets.offsets[col], zIndex: 1 }
                        : undefined
                    }
                    className={col >= bounds.left && col <= bounds.right ? 'selected-heading' : ''}
                  >
                    <button
                      aria-label={`选择 ${columnName(col)} 列`}
                      onClick={(event) => {
                        setEditing(null);
                        setSelection({
                          anchor: { row: 1, col: event.shiftKey ? selection.anchor.col : col },
                          focus: { row: MAX_ROWS, col },
                        });
                        focusCell({ row: 1, col });
                      }}
                    >
                      {columnName(col)}
                    </button>
                    {resizeHandle('col', col)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {Array.from({ length: rows }, (_, index) => {
              const row = index + 1;
              if (hiddenRows.has(row)) return null;
              return (
                <tr key={row} style={{ height: heightOf(row) }}>
                  {viewSettings.showHeadings && (
                    <th
                      style={{
                        top: row <= frozenRows ? rowOffsets.offsets[row - 1] : undefined,
                        zIndex: row <= frozenRows ? 6 : 2,
                      }}
                      className={`row-number ${row >= bounds.top && row <= bounds.bottom ? 'selected-heading' : ''} ${hiddenRows.size && filterArea && row > filterArea.top && row <= filterArea.bottom ? 'filtered-heading' : ''}`}
                    >
                      <button
                        aria-label={`选择第 ${row} 行`}
                        onClick={(event) => {
                          setEditing(null);
                          setSelection({
                            anchor: { row: event.shiftKey ? selection.anchor.row : row, col: 0 },
                            focus: { row, col: MAX_COLUMNS - 1 },
                          });
                          focusCell({ row, col: 0 });
                        }}
                      >
                        {row}
                      </button>
                      {resizeHandle('row', row)}
                    </th>
                  )}
                  {Array.from({ length: columns }, (_, col) => {
                    const address = `${columnName(col)}${row}`,
                      value = calculate(address),
                      style = sheet.styles?.[address],
                      rightStyle =
                        col < columns - 1
                          ? sheet.styles?.[`${columnName(col + 1)}${row}`]
                          : undefined,
                      downStyle =
                        row < rows ? sheet.styles?.[`${columnName(col)}${row + 1}`] : undefined,
                      hasRight = Boolean(
                        style?.border ||
                          style?.borderRight ||
                          rightStyle?.border ||
                          rightStyle?.borderLeft,
                      ),
                      hasBottom = Boolean(
                        style?.border ||
                          style?.borderBottom ||
                          downStyle?.border ||
                          downStyle?.borderTop,
                      ),
                      hasTop = row === 1 && Boolean(style?.border || style?.borderTop),
                      hasLeft = col === 0 && Boolean(style?.border || style?.borderLeft),
                      isFilterHeader =
                        !!filterArea &&
                        row === filterArea.top &&
                        col >= filterArea.left &&
                        col <= filterArea.right,
                      isCrosshair =
                        viewSettings.highlightRowCol &&
                        (row === selection.anchor.row || col === selection.anchor.col);
                    return (
                      <td
                        key={address}
                        data-cell={address}
                        className={`${selected === address ? 'selected-cell' : ''} ${sheet.comments?.[address] ? 'has-comment' : ''} ${isFilterHeader ? 'has-filter' : ''} ${inSelection(visualSelection, { row, col }) ? 'range-cell' : ''} ${typeof value === 'string' && value.startsWith('#') ? 'cell-error' : ''} ${invalid.has(address) ? 'cell-invalid' : ''} ${isCrosshair ? 'highlight-crosshair' : ''}`}
                        data-range={
                          inSelection(visualSelection, { row, col }) ? 'selected' : undefined
                        }
                        style={{
                          ...frozenCellStyle(row, col),
                          borderRightColor: hasRight ? '#53645c' : undefined,
                          borderBottomColor: hasBottom ? '#53645c' : undefined,
                          borderTop: hasTop ? '1px solid #53645c' : undefined,
                          borderLeft: hasLeft ? '1px solid #53645c' : undefined,
                          backgroundColor: style?.fill,
                          ...(inSelection(visualSelection, { row, col })
                            ? {
                                boxShadow:
                                  [
                                    row === bounds.top && 'inset 0 1px var(--green)',
                                    row === bounds.bottom && 'inset 0 -1px var(--green)',
                                    col === bounds.left && 'inset 1px 0 var(--green)',
                                    col === bounds.right && 'inset -1px 0 var(--green)',
                                  ]
                                    .filter(Boolean)
                                    .join(', ') || undefined,
                              }
                            : {}),
                        }}
                        onPointerDown={(event) => {
                          if (event.button !== 0 || editing === address) return;
                          if (event.pointerType === 'touch') {
                            select({ row, col }, event.shiftKey);
                            setEditing(address);
                            return;
                          }
                          event.preventDefault();
                          drag.current = true;
                          select({ row, col }, event.shiftKey);
                          focusCell({ row, col });
                        }}
                        onPointerEnter={(event) => {
                          // Bails out without re-rendering when the value is unchanged.
                          setHoverComment(sheet.comments?.[address] ? address : null);
                          if (!drag.current || event.buttons !== 1) return;
                          setSelection((previous) => ({ ...previous, focus: { row, col } }));
                        }}
                        onDoubleClick={() => {
                          select({ row, col });
                          setEditing(address);
                          focusCell({ row, col });
                        }}
                      >
                        <input
                          id={`cell-${address}`}
                          aria-label={address}
                          style={{
                            fontWeight: style?.bold ? 700 : undefined,
                            fontStyle: style?.italic ? 'italic' : undefined,
                            textDecoration: style?.underline ? 'underline' : undefined,
                            color: style?.color,
                            backgroundColor: style?.fill,
                            backgroundImage:
                              inSelection(visualSelection, { row, col }) && selected !== address
                                ? 'linear-gradient(#1b784d22, #1b784d22)'
                                : undefined,
                            textAlign: style?.align,
                            fontFamily: fontStack(style?.fontFamily),
                            fontSize: style?.fontSize ? `${style.fontSize}pt` : undefined,
                            boxShadow:
                              [
                                ...(inSelection(visualSelection, { row, col })
                                  ? [
                                      row === bounds.top && 'inset 0 2px var(--green)',
                                      row === bounds.bottom && 'inset 0 -2px var(--green)',
                                      col === bounds.left && 'inset 2px 0 var(--green)',
                                      col === bounds.right && 'inset -2px 0 var(--green)',
                                    ]
                                  : []),
                                row === frozenRows && 'inset 0 -2px #8b9d92',
                                col === frozenColumns - 1 && 'inset -2px 0 #8b9d92',
                              ]
                                .filter(Boolean)
                                .join(', ') || undefined,
                            width: widthOf(col) - 1,
                            height: heightOf(row) - 1,
                          }}
                          maxLength={MAX_CELL_LENGTH}
                          value={
                            editing === address
                              ? (sheet.cells[address] ?? '')
                              : viewSettings.hideZeros && value === 0
                                ? ''
                                : formatCellValue(value, style)
                          }
                          onFocus={() => {
                            select({ row, col });
                          }}
                          onCompositionStart={() => {
                            select({ row, col });
                            setEditing(address);
                          }}
                          onBlur={() => setEditing(null)}
                          onChange={(event) => {
                            setEditing(address);
                            setCell(address, event.target.value);
                          }}
                          onKeyDown={(event) => keyboard(event, row, col)}
                          onPaste={(event) => paste(event, row, col)}
                        />
                        {isFilterHeader && (
                          <button
                            className={`sheet-filter-trigger ${filteredColumns.has(columnName(col)) ? 'active' : ''}`}
                            aria-label={`筛选 ${columnName(col)} 列`}
                            aria-expanded={filterMenu === col}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditing(null);
                              setFilterMenu((open) => (open === col ? null : col));
                            }}
                          >
                            {filteredColumns.has(columnName(col)) ? (
                              <Filter size={11} />
                            ) : (
                              <ChevronDown size={12} />
                            )}
                          </button>
                        )}
                        {!editing && anchorList && selected === address && !isFilterHeader && (
                          <button
                            className="sheet-list-trigger"
                            aria-label="打开下拉选项 (Alt+↓)"
                            aria-expanded={listOpen}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              setListOpen((open) => !open);
                            }}
                          >
                            ▾
                          </button>
                        )}
                        {!editing && row === sourceBounds.bottom && col === sourceBounds.right && (
                          <button
                            className="sheet-fill-handle"
                            aria-label="拖动填充选区"
                            title="拖动以复制公式或延续数字序列，Esc 取消"
                            {...fillHandle.handleProps}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sheet-tabs">
        <button
          className="icon-button"
          aria-label="添加工作表"
          disabled={content.sheets.length >= 20}
          onClick={addSheet}
        >
          <Plus size={17} />
        </button>
        {content.sheets.map((s) => (
          <button
            key={s.id}
            className={s.id === sheet.id ? 'active' : ''}
            onClick={() => {
              setSheetId(s.id);
              resetSelection();
              setEditing(null);
              setPasteError('');
            }}
          >
            {s.name}
          </button>
        ))}
        <span className="toolbar-spacer" />
        <span className="sheet-size">
          {rows} 行 × {columns} 列
        </span>
      </div>
      {sheetAction && (
        <Modal
          title={sheetAction === 'rename' ? '重命名工作表' : '删除工作表'}
          onClose={() => setSheetAction(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (sheetAction === 'rename') {
                if (!validSheetName(sheetName, content.sheets, sheet.id)) {
                  setPasteError('工作表名称不能为空、重复或包含 \ / * ? : [ ]，最多 31 字符。');
                  return;
                }
                onChange({
                  ...content,
                  sheets: content.sheets.map((s) =>
                    s.id === sheet.id ? { ...s, name: sheetName.trim() } : s,
                  ),
                });
              } else {
                if (content.sheets.length <= 1) return;
                const sheets = content.sheets.filter((s) => s.id !== sheet.id);
                onChange({ ...content, sheets });
                setSheetId(sheets[0].id);
                resetSelection();
              }
              setSheetAction(null);
              setPasteError('');
            }}
          >
            {sheetAction === 'rename' ? (
              <label>
                工作表名称
                <input
                  autoFocus
                  aria-label="工作表名称"
                  maxLength={31}
                  value={sheetName}
                  onChange={(event) => setSheetName(event.target.value)}
                />
              </label>
            ) : (
              <p>将删除“{sheet.name}”及其中的内容，可通过撤销恢复。</p>
            )}
            {pasteError && <p role="alert">{pasteError}</p>}
            <div className="modal-buttons">
              <button className="secondary" type="button" onClick={() => setSheetAction(null)}>
                取消
              </button>
              <button className="primary" type="submit">
                {sheetAction === 'rename' ? '保存名称' : '确认删除工作表'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {findReplaceOpen && (
        <FindReplaceModal
          cells={sheet.cells}
          current={selection.anchor}
          onClose={() => setFindReplaceOpen(false)}
          onSelectCell={(pt) => {
            select(pt);
            focusCell(pt);
          }}
          onReplace={(updatedCells) => {
            onChange({
              ...content,
              sheets: content.sheets.map((s) =>
                s.id === sheet.id ? { ...s, cells: updatedCells } : s,
              ),
            });
          }}
        />
      )}
      {insertModalType && (
        <InsertFeatureModal
          type={insertModalType}
          targetValue={sheet.cells[selected] ?? ''}
          onClose={() => setInsertModalType(null)}
          onConfirm={handleInsertConfirm}
        />
      )}
      {listOpen && anchorList && !editing && (
        <ListPopover
          address={selected}
          options={anchorList}
          value={sheet.cells[selected] ?? ''}
          grid={grid}
          onClose={closeList}
          onPick={(option) => {
            setCell(selected, option);
            setListOpen(false);
            focusCell(selection.anchor);
          }}
        />
      )}
      {validationDialog && (
        <ValidationModal
          rangeLabel={selectionLabel(selection)}
          current={anchorValidation}
          initialType={validationDialog === 'list' ? 'list' : 'number'}
          onClose={() => {
            setValidationDialog(null);
            focusCell(selection.anchor);
          }}
          onApply={(rule, mode) => {
            const next = applyValidation(sheet, selectionBounds(selection), rule, mode);
            if (!next) return '每个工作表最多 50 条有效性规则，请先清除部分规则。';
            replaceSheet(next);
            return null;
          }}
          onClear={() => replaceSheet(clearValidation(sheet, selectionBounds(selection)))}
        />
      )}
      {commentEditor && (
        <CommentModal
          address={commentEditor}
          comment={sheet.comments?.[commentEditor]}
          onClose={() => {
            setCommentEditor(null);
            focusCell(selection.anchor);
          }}
          onSave={(text) => {
            const current = sheet.comments?.[commentEditor]?.text ?? '';
            if (text.trim() !== current) replaceSheet(setCellComment(sheet, commentEditor, text));
          }}
        />
      )}
      {(() => {
        const address = hoverComment ?? (!editing && !commentEditor ? selected : null);
        const comment = address ? sheet.comments?.[address] : undefined;
        return address && comment ? (
          <CommentBubble address={address} comment={comment} grid={grid} />
        ) : null;
      })()}
      {chartKind && (
        <ChartModal
          kind={chartKind}
          sheet={sheet}
          range={dataRange(sheet.cells, selection)}
          valueAt={calculate}
          onClose={() => setChartKind(null)}
        />
      )}
      {filterMenu !== null && filterArea && (
        <FilterMenu
          key={filterMenu}
          address={cellAddress({ row: filterArea.top, col: filterMenu })}
          columnLabel={
            String(calculate(cellAddress({ row: filterArea.top, col: filterMenu }))) ||
            `${columnName(filterMenu)} 列`
          }
          values={filterColumnValues(sheet, calculate, filterMenu)}
          hidden={sheet.autoFilter?.columns[columnName(filterMenu)]?.hidden ?? []}
          grid={grid}
          onApply={(hidden) => replaceSheet(setColumnFilter(sheet, filterMenu, hidden))}
          onSort={(direction) => handleSort(direction, filterMenu, true)}
          onClose={closeFilterMenu}
        />
      )}
      {dataTool && (
        <DataToolDialog
          type={dataTool}
          sheet={sheet}
          range={dataRange(sheet.cells, selection)}
          onClose={() => setDataTool(null)}
          onApply={(next) => {
            replaceSheet(next);
            setEditing(null);
          }}
        />
      )}
      <div className="editor-statusbar">
        <span aria-live="polite">
          {selectionLabel(selection)} · {bounds.bottom - bounds.top + 1} 行 ×{' '}
          {bounds.right - bounds.left + 1} 列
        </span>
        {hiddenRows.size > 0 && filterArea && (
          <span>
            筛选：显示 {filterArea.bottom - filterArea.top - hiddenRows.size} /{' '}
            {filterArea.bottom - filterArea.top} 条
          </span>
        )}
        <span className="selection-statistics">
          计数 {stats.count}
          {stats.numericCount > 0 &&
            ` · 求和 ${Number(stats.sum.toPrecision(12))} · 平均值 ${Number(stats.average!.toPrecision(12))}`}
        </span>
        <span>最多 500 行 × 52 列 / 工作表</span>
      </div>
    </div>
  );
}

function DataToolDialog({
  type,
  ...props
}: {
  type: DataToolType;
  sheet: SheetContent['sheets'][number];
  range: ReturnType<typeof dataRange>;
  onClose: () => void;
  onApply: (next: SheetContent['sheets'][number]) => void;
}) {
  const rangeLabel = props.range
    ? selectionLabel({
        anchor: { row: props.range.bounds.top, col: props.range.bounds.left },
        focus: { row: props.range.bounds.bottom, col: props.range.bounds.right },
      })
    : '';
  return type === 'duplicates' ? (
    <RemoveDuplicatesModal {...props} rangeLabel={rangeLabel} />
  ) : (
    <TextToColumnsModal {...props} rangeLabel={rangeLabel} />
  );
}
