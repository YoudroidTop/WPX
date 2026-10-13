import { useMemo, useState, type KeyboardEvent } from 'react';
import { Plus, FunctionSquare, Trash2 } from 'lucide-react';
import {
  columnName,
  MAX_CELL_LENGTH,
  MAX_COLUMNS,
  MAX_ROWS,
  type SheetContent,
} from '../../shared/documents';
import { createCalculator } from '../../shared/formulas';
import { pasteSheetCells } from '../../shared/sheet-paste';
export default function SheetEditor({
  content,
  onChange,
}: {
  content: SheetContent;
  onChange: (content: SheetContent) => void;
}) {
  const [sheetId, setSheetId] = useState(content.sheets[0].id),
    [selected, setSelected] = useState('A1'),
    [editing, setEditing] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(50),
    [colCount, setColCount] = useState(12);
  const [pasteError, setPasteError] = useState('');
  const sheet = content.sheets.find((s) => s.id === sheetId) ?? content.sheets[0];
  const calculate = useMemo(() => createCalculator(sheet.cells), [sheet.cells]);
  const usedRows = Math.max(
    1,
    ...Object.keys(sheet.cells).map((address) => Number(address.match(/\d+/)?.[0] || 1)),
  );
  const usedCols = Math.max(
    1,
    ...Object.keys(sheet.cells).map((address) =>
      [...address.replace(/\d/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
    ),
  );
  const rows = Math.max(rowCount, usedRows),
    columns = Math.max(colCount, usedCols);
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
  function keyboard(event: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (event.nativeEvent.isComposing) return;
    if (
      event.key === 'Enter' ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Tab'
    ) {
      event.preventDefault();
      setEditing(null);
      const r = Math.max(
        1,
        Math.min(
          rows,
          row +
            (event.key === 'Enter' || event.key === 'ArrowDown'
              ? 1
              : event.key === 'ArrowUp'
                ? -1
                : 0),
        ),
      );
      const c = Math.max(
        0,
        Math.min(columns - 1, col + (event.key === 'Tab' ? (event.shiftKey ? -1 : 1) : 0)),
      );
      const address = `${columnName(c)}${r}`;
      setSelected(address);
      document.getElementById(`cell-${address}`)?.focus();
    }
  }
  function paste(event: React.ClipboardEvent<HTMLInputElement>, row: number, col: number) {
    const text = event.clipboardData.getData('text/plain');
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    const result = pasteSheetCells(sheet.cells, text, row, col);
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
  function addSheet() {
    const id = crypto.randomUUID();
    let n = content.sheets.length + 1;
    while (content.sheets.some((s) => s.name === `工作表 ${n}`)) n++;
    onChange({ ...content, sheets: [...content.sheets, { id, name: `工作表 ${n}`, cells: {} }] });
    setSheetId(id);
    setSelected('A1');
    setPasteError('');
  }
  return (
    <div className="sheet-editor">
      <div className="editor-toolbar sheet-tools">
        <span className="sheet-hint">基础公式</span>
        <code>SUM · AVERAGE · MIN · MAX · COUNT</code>
        <span className="toolbar-spacer" />
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
      <div className="formula-bar">
        <span className="cell-address">{selected}</span>
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
      <div className="sheet-scroll">
        <table className="spreadsheet">
          <thead>
            <tr>
              <th className="row-number" />
              {Array.from({ length: columns }, (_, col) => (
                <th key={col}>{columnName(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, index) => {
              const row = index + 1;
              return (
                <tr key={row}>
                  <th className="row-number">{row}</th>
                  {Array.from({ length: columns }, (_, col) => {
                    const address = `${columnName(col)}${row}`,
                      value = calculate(address);
                    return (
                      <td
                        key={address}
                        className={`${selected === address ? 'selected-cell' : ''} ${typeof value === 'string' && value.startsWith('#') ? 'cell-error' : ''}`}
                      >
                        <input
                          id={`cell-${address}`}
                          aria-label={address}
                          maxLength={MAX_CELL_LENGTH}
                          value={editing === address ? (sheet.cells[address] ?? '') : value}
                          onFocus={() => {
                            setSelected(address);
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
              setSelected('A1');
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
      <div className="editor-statusbar">
        <span>支持单元格引用、四则运算与区域函数</span>
        <span>最多 500 行 × 52 列 / 工作表</span>
      </div>
    </div>
  );
}
