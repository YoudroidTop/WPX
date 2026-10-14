import { copySheetRange, fillSheetRange } from '../../shared/sheet-fill';
import {
  SHEET_CLIPBOARD_TYPE,
  encodeSheetClipboard,
  decodeSheetClipboard,
} from '../../shared/sheet-clipboard';
import { frozenOffsets } from '../../shared/sheet-view';
import type { CSSProperties } from 'react';
import SheetFormatToolbar from './SheetFormatToolbar';
import { formatSelection, formatCellValue } from '../../shared/sheet-format';
import { useMemo, useState, useRef, useEffect, type PointerEvent, type KeyboardEvent } from 'react';
import { Plus, FunctionSquare, Eraser } from 'lucide-react';
import {
  columnName,
  MAX_CELL_LENGTH,
  MAX_COLUMNS,
  MAX_ROWS,
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
  const [rowCount, setRowCount] = useState(50),
    [colCount, setColCount] = useState(12);
  const history = useRef<{ undo: SheetContent[]; redo: SheetContent[] }>({ undo: [], redo: [] });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [sheetAction, setSheetAction] = useState<'rename' | 'delete' | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [columnWidth, setColumnWidth] = useState('120'),
    [rowHeight, setRowHeight] = useState('29');
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
  const bounds = selectionBounds(selection);
  const resetSelection = () =>
    setSelection({ anchor: { row: 1, col: 0 }, focus: { row: 1, col: 0 } });
  useEffect(() => {
    const stop = () => {
      drag.current = false;
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
  const calculate = useMemo(() => createCalculator(sheet.cells), [sheet.cells]);
  useEffect(() => {
    setColumnWidth(String(sheet.columnWidths?.[selection.anchor.col] ?? 120));
    setRowHeight(String(sheet.rowHeights?.[selection.anchor.row] ?? 29));
  }, [sheet.id, sheet.columnWidths, sheet.rowHeights, selection.anchor.col, selection.anchor.row]);

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
  const rowOffsets = frozenOffsets(frozenRows, 29, (index) => heightOf(index + 1));
  const columnOffsets = frozenOffsets(frozenColumns, 44, widthOf);
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
        inSelection(selection, { row, col }) && selected !== cellAddress({ row, col })
          ? '#e7f1eb'
          : 'white',
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
  return (
    <div className="sheet-editor" data-history-version={historyVersion}>
      <div className="editor-toolbar sheet-tools">
        <span className="sheet-hint">基础公式</span>
        <code>SUM · AVERAGE · MIN · MAX · COUNT</code>
        <span className="toolbar-spacer" />
        <button
          title="清空选区内容（Delete）"
          onClick={() => applyCells(clearSelection(sheet.cells, selection))}
        >
          <Eraser size={14} />
          清空内容
        </button>
        <button
          disabled={rows >= MAX_ROWS}
          onClick={() => setRowCount(Math.min(MAX_ROWS, rows + 50))}
        >
          <Plus size={14} />
          50 行
        </button>
        <button
          disabled={columns >= MAX_COLUMNS}
          onClick={() => setColCount(Math.min(MAX_COLUMNS, columns + 5))}
        >
          <Plus size={14} />5 列
        </button>
      </div>
      <SheetFormatToolbar
        style={sheet.styles?.[selected] ?? {}}
        onChange={(patch) =>
          onChange({
            ...content,
            sheets: content.sheets.map((s) =>
              s.id === sheet.id ? formatSelection(s, selection, patch) : s,
            ),
          })
        }
      />
      <div className="editor-toolbar sheet-structure-tools">
        <button disabled={!history.current.undo.length} onClick={() => travel('undo')}>
          撤销
        </button>
        <button disabled={!history.current.redo.length} onClick={() => travel('redo')}>
          重做
        </button>
        <button
          title="将选区首行填充到下方（Ctrl / ⌘ D）"
          disabled={bounds.top === bounds.bottom}
          onClick={() => fill('down')}
        >
          向下填充
        </button>
        <button
          title="将选区首列填充到右侧（Ctrl / ⌘ R）"
          disabled={bounds.left === bounds.right}
          onClick={() => fill('right')}
        >
          向右填充
        </button>
        <select aria-label="冻结窗格" value="" onChange={(event) => freeze(event.target.value)}>
          <option value="" disabled>
            冻结窗格
          </option>
          <option value="first-row">冻结首行</option>
          <option value="first-column">冻结首列</option>
          <option
            value="selection"
            disabled={selection.anchor.row === 1 && selection.anchor.col === 0}
          >
            冻结至当前单元格
          </option>
          <option value="none" disabled={!frozenRows && !frozenColumns}>
            取消冻结
          </option>
        </select>
        {!!(frozenRows || frozenColumns) && (
          <span className="frozen-status">
            已冻结 {frozenRows} 行 · {frozenColumns} 列
          </span>
        )}
        <select
          aria-label="行列操作"
          value=""
          onChange={(event) => {
            const [axis, operation] = event.target.value.split('-');
            structure(axis as 'row' | 'col', operation as 'insert' | 'delete');
          }}
        >
          <option value="" disabled>
            插入 / 删除
          </option>
          <option value="row-insert">在选区上方插入行</option>
          <option value="row-delete">删除选中行</option>
          <option value="col-insert">在选区左侧插入列</option>
          <option value="col-delete">删除选中列</option>
        </select>
        <label>
          列宽{' '}
          <input
            aria-label="列宽"
            type="number"
            min="48"
            max="600"
            value={columnWidth}
            onChange={(event) => setColumnWidth(event.target.value)}
          />
        </label>
        <button onClick={() => sizeSelection('col')}>应用列宽</button>
        <label>
          行高{' '}
          <input
            aria-label="行高"
            type="number"
            min="24"
            max="300"
            value={rowHeight}
            onChange={(event) => setRowHeight(event.target.value)}
          />
        </label>
        <button onClick={() => sizeSelection('row')}>应用行高</button>
        <select
          aria-label="工作表管理"
          value=""
          onChange={(event) => {
            if (event.target.value === 'duplicate') duplicateSheet();
            else {
              setSheetName(sheet.name);
              setSheetAction(event.target.value as 'rename' | 'delete');
            }
          }}
        >
          <option value="" disabled>
            工作表管理
          </option>
          <option value="rename">重命名工作表</option>
          <option value="duplicate" disabled={content.sheets.length >= 20}>
            复制工作表
          </option>
          <option value="delete" disabled={content.sheets.length <= 1}>
            删除工作表
          </option>
        </select>
      </div>
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
        />
      </div>
      {pasteError && (
        <div className="save-error" role="alert">
          {pasteError}
        </div>
      )}
      <div
        className="sheet-scroll"
        style={{ scrollPaddingTop: rowOffsets.size, scrollPaddingLeft: columnOffsets.size }}
        ref={grid}
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
        <table className="spreadsheet">
          <colgroup>
            <col style={{ width: 44 }} />
            {Array.from({ length: columns }, (_, col) => (
              <col key={col} style={{ width: widthOf(col) }} />
            ))}
          </colgroup>
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
          <tbody>
            {Array.from({ length: rows }, (_, index) => {
              const row = index + 1;
              return (
                <tr key={row} style={{ height: heightOf(row) }}>
                  <th
                    style={{
                      top: row <= frozenRows ? rowOffsets.offsets[row - 1] : undefined,
                      zIndex: row <= frozenRows ? 6 : 2,
                    }}
                    className={`row-number ${row >= bounds.top && row <= bounds.bottom ? 'selected-heading' : ''}`}
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
                  {Array.from({ length: columns }, (_, col) => {
                    const address = `${columnName(col)}${row}`,
                      value = calculate(address),
                      style = sheet.styles?.[address];
                    return (
                      <td
                        key={address}
                        className={`${selected === address ? 'selected-cell' : ''} ${inSelection(selection, { row, col }) ? 'range-cell' : ''} ${typeof value === 'string' && value.startsWith('#') ? 'cell-error' : ''}`}
                        data-range={inSelection(selection, { row, col }) ? 'selected' : undefined}
                        style={{
                          ...frozenCellStyle(row, col),
                          ...(inSelection(selection, { row, col })
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
                              inSelection(selection, { row, col }) && selected !== address
                                ? 'linear-gradient(#1b784d22, #1b784d22)'
                                : undefined,
                            textAlign: style?.align,
                            boxShadow:
                              [
                                ...(inSelection(selection, { row, col })
                                  ? [
                                      row === bounds.top && 'inset 0 2px var(--green)',
                                      row === bounds.bottom && 'inset 0 -2px var(--green)',
                                      col === bounds.left && 'inset 2px 0 var(--green)',
                                      col === bounds.right && 'inset -2px 0 var(--green)',
                                    ]
                                  : []),
                                row === frozenRows && 'inset 0 -2px #8b9d92',
                                col === frozenColumns - 1 && 'inset -2px 0 #8b9d92',
                                style?.border && 'inset 0 0 0 1px #53645c',
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
                              : formatCellValue(value, style)
                          }
                          readOnly={editing !== address}
                          onCompositionStart={() => {
                            select({ row, col });
                            setEditing(address);
                          }}
                          onBlur={() => setEditing(null)}
                          onChange={(event) => setCell(address, event.target.value)}
                          onKeyDown={(event) => keyboard(event, row, col)}
                          onPaste={(event) => paste(event, row, col)}
                        />
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
            <div className="modal-actions">
              <button type="button" onClick={() => setSheetAction(null)}>
                取消
              </button>
              <button className="button-primary" type="submit">
                {sheetAction === 'rename' ? '保存名称' : '确认删除工作表'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      <div className="editor-statusbar">
        <span aria-live="polite">
          {selectionLabel(selection)} · {bounds.bottom - bounds.top + 1} 行 ×{' '}
          {bounds.right - bounds.left + 1} 列
        </span>
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
