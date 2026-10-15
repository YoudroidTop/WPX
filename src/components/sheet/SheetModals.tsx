import { useMemo, useState } from 'react';
import { Modal } from '../ui';
import type { SheetPage } from '../../../shared/documents';
import type { CellPoint } from '../../../shared/sheet-selection';
import {
  removeDuplicateRows,
  splitTextToColumns,
  SPLIT_DELIMITERS,
  type SheetBounds,
  type SplitDelimiter,
} from '../../../shared/sheet-data';
import SheetChartPreview from './SheetChartPreview';
import type { ChartKind, InsertDialogType } from './types';

function parseAddress(address: string): CellPoint | null {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) return null;
  const col = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(match[2]), col };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface FindReplaceModalProps {
  cells: Record<string, string>;
  current: CellPoint;
  onClose: () => void;
  onSelectCell: (point: CellPoint) => void;
  onReplace: (updatedCells: Record<string, string>) => void;
}

export function FindReplaceModal({
  cells,
  current,
  onClose,
  onSelectCell,
  onReplace,
}: FindReplaceModalProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  function matches() {
    const needle = findText.toLowerCase();
    return Object.entries(cells)
      .filter(([, value]) => value.toLowerCase().includes(needle))
      .map(([address]) => parseAddress(address))
      .filter((point): point is CellPoint => !!point)
      .sort((a, b) => a.row - b.row || a.col - b.col);
  }

  function handleFindNext() {
    if (!findText) return;
    const found = matches();
    if (!found.length) {
      setHint('未找到匹配内容');
      return;
    }
    // Continue after the current cell in row-major order and wrap around at the end.
    const nextIndex = found.findIndex(
      (p) => p.row > current.row || (p.row === current.row && p.col > current.col),
    );
    const index = nextIndex === -1 ? 0 : nextIndex;
    onSelectCell(found[index]);
    setHint(`第 ${index + 1} / ${found.length} 处匹配`);
  }

  function handleReplaceAll() {
    if (!findText) return;
    const pattern = new RegExp(escapeRegExp(findText), 'gi');
    const next = { ...cells };
    let count = 0;
    for (const [address, value] of Object.entries(cells)) {
      if (!pattern.test(value)) continue;
      pattern.lastIndex = 0;
      const replaced = value.replace(pattern, () => replaceText);
      if (replaced) next[address] = replaced;
      else delete next[address];
      count++;
    }
    if (count) onReplace(next);
    setHint(count ? `已替换 ${count} 个单元格` : '未找到匹配内容');
  }

  return (
    <Modal title="查找与替换" onClose={onClose}>
      <div className="find-replace-form">
        <label>
          查找内容
          <input
            autoFocus
            aria-label="查找内容"
            value={findText}
            onChange={(e) => {
              setFindText(e.target.value);
              setHint(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleFindNext()}
          />
        </label>
        <label>
          替换为
          <input
            aria-label="替换内容"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
          />
        </label>

        {hint && <p className="find-result-hint">{hint}</p>}

        <div className="modal-buttons">
          <button className="secondary" type="button" onClick={handleFindNext}>
            查找下一个
          </button>
          <button className="secondary" type="button" onClick={handleReplaceAll}>
            全部替换
          </button>
          <button className="primary" type="button" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </Modal>
  );
}

export type InsertPayload =
  | { kind: 'cell-text'; text: string; mode: 'replace' | 'append' | 'prefix' }
  | { kind: 'import'; text: string };

interface InsertFeatureModalProps {
  type: InsertDialogType;
  /** Raw content of the anchor cell, used to warn before overwriting it. */
  targetValue: string;
  onClose: () => void;
  onConfirm: (payload: InsertPayload) => void;
}

const COMMON_SYMBOLS = [
  '¥',
  '$',
  '€',
  '£',
  '₽',
  '₩',
  '‰',
  '%',
  '±',
  '×',
  '÷',
  '≈',
  '≠',
  '≤',
  '≥',
  '√',
  '∑',
  'π',
  '∞',
  '★',
  '☆',
  '●',
  '○',
  '✓',
  '✕',
  '▲',
  '▼',
  '◆',
  '℃',
  '℉',
];

const TITLES: Record<InsertDialogType, string> = {
  checkbox: '插入复选框',
  dropdown: '下拉列表',
  validation: '数据有效性',
  filter: '自动筛选',
  link: '插入超链接',
  image: '插入图片',
  pivot: '数据透视表',
  symbol: '插入特殊符号',
  textbox: '文本框',
  watermark: '水印',
  qrcode: '二维码',
  comment: '批注',
  'import-csv': '导入 CSV / 文本数据',
};

/**
 * Features that need new persisted structures (validation rules, comments, floating
 * objects, filter state…). They stay visible but never write placeholder text into cells.
 */
const UNSUPPORTED: Partial<Record<InsertDialogType, string>> = {
  filter: '自动筛选需要保存筛选条件与隐藏行',
  image: '图片需要独立的浮动对象与文件存储',
  pivot: '透视表需要生成并维护独立的汇总工作表',
  textbox: '文本框需要独立的浮动对象',
  watermark: '水印需要保存工作表级的背景设置',
  qrcode: '二维码需要独立的浮动图片对象',
};

export function InsertFeatureModal({
  type,
  targetValue,
  onClose,
  onConfirm,
}: InsertFeatureModalProps) {
  const [inputVal, setInputVal] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState(COMMON_SYMBOLS[0]);
  const unsupported = UNSUPPORTED[type];

  function handleConfirm() {
    if (type === 'checkbox') {
      onConfirm({ kind: 'cell-text', text: targetValue ? '☐ ' : '☐', mode: 'prefix' });
    } else if (type === 'symbol') {
      onConfirm({ kind: 'cell-text', text: selectedSymbol, mode: 'append' });
    } else if (type === 'link') {
      const url = inputVal.trim();
      if (!url) return;
      onConfirm({
        kind: 'cell-text',
        text: /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`,
        mode: 'replace',
      });
    } else if (type === 'import-csv') {
      if (!inputVal.trim()) return;
      onConfirm({ kind: 'import', text: inputVal });
    }
    onClose();
  }

  if (unsupported) {
    return (
      <Modal title={TITLES[type]} onClose={onClose}>
        <div className="insert-feature-modal">
          <p>
            「{TITLES[type]}」暂未开放：{unsupported}，当前版本不会修改表格内容。
          </p>
          <div className="modal-buttons">
            <button className="primary" type="button" onClick={onClose}>
              知道了
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={TITLES[type]} onClose={onClose}>
      <div className="insert-feature-modal">
        {type === 'checkbox' && <p>在当前单元格内容前插入复选框标记 ☐。</p>}
        {type === 'symbol' && (
          <>
            <p>选择符号，追加到当前单元格内容末尾。</p>
            <div className="symbol-grid-picker">
              {COMMON_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  className={`symbol-btn ${selectedSymbol === sym ? 'selected' : ''}`}
                  onClick={() => setSelectedSymbol(sym)}
                  onDoubleClick={() => {
                    onConfirm({ kind: 'cell-text', text: sym, mode: 'append' });
                    onClose();
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>
          </>
        )}
        {type === 'link' && (
          <label>
            链接地址
            <input
              autoFocus
              value={inputVal}
              placeholder="https://example.com"
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            />
          </label>
        )}
        {type === 'link' && targetValue && (
          <p className="modal-warning">当前单元格已有内容，插入后将被链接地址替换。</p>
        )}
        {type === 'import-csv' && (
          <label>
            粘贴逗号或制表符分隔的文本，将从当前单元格开始按行列填入
            <textarea
              autoFocus
              rows={6}
              className="csv-import-textarea"
              value={inputVal}
              placeholder={'姓名, 部门, 销售额\n张三, 华东区, 15000\n李四, 华南区, 28000'}
              onChange={(e) => setInputVal(e.target.value)}
            />
          </label>
        )}

        <div className="modal-buttons">
          <button className="secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" type="button" onClick={handleConfirm}>
            {type === 'import-csv' ? '导入' : '插入'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface DataToolModalProps {
  sheet: SheetPage;
  range: { bounds: SheetBounds; hasHeader: boolean } | null;
  rangeLabel: string;
  onClose: () => void;
  onApply: (next: SheetPage) => void;
}

export function RemoveDuplicatesModal({
  sheet,
  range,
  rangeLabel,
  onClose,
  onApply,
}: DataToolModalProps) {
  const [hasHeader, setHasHeader] = useState(range?.hasHeader ?? false);
  const result = useMemo(
    () => (range ? removeDuplicateRows(sheet, range.bounds, hasHeader) : null),
    [sheet, range, hasHeader],
  );
  return (
    <Modal title="删除重复项" onClose={onClose}>
      <div className="insert-feature-modal">
        {!range || !result ? (
          <p>请先选中包含数据的区域。</p>
        ) : (
          <>
            <p>检查区域 {rangeLabel} 中所有列的值完全相同的行，保留首次出现的行。</p>
            <label className="modal-checkbox">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
              />
              数据包含标题行
            </label>
            <p className="find-result-hint">
              {result.removed ? `将删除 ${result.removed} 行重复数据` : '未发现重复行'}
            </p>
          </>
        )}
        <div className="modal-buttons">
          <button className="secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            type="button"
            disabled={!result?.removed}
            onClick={() => {
              if (result?.removed) onApply(result.sheet);
              onClose();
            }}
          >
            删除重复项
          </button>
        </div>
      </div>
    </Modal>
  );
}

const DELIMITER_LABELS: Record<SplitDelimiter, string> = {
  comma: '逗号',
  tab: '制表符',
  semicolon: '分号',
  space: '空格',
};

export function TextToColumnsModal({
  sheet,
  range,
  rangeLabel,
  onClose,
  onApply,
}: DataToolModalProps) {
  const [delimiter, setDelimiter] = useState<SplitDelimiter>('comma');
  const result = useMemo(
    () => (range ? splitTextToColumns(sheet, range.bounds, delimiter) : null),
    [sheet, range, delimiter],
  );
  const changed = !!result?.split;
  return (
    <Modal title="分列" onClose={onClose}>
      <div className="insert-feature-modal">
        {!range ? (
          <p>请先选中包含数据的区域。</p>
        ) : (
          <>
            <p>将区域 {rangeLabel} 首列的文本按分隔符拆分到右侧相邻列。</p>
            <div className="split-delimiters" role="radiogroup" aria-label="分隔符">
              {(Object.keys(SPLIT_DELIMITERS) as SplitDelimiter[]).map((key) => (
                <label key={key} className="modal-checkbox">
                  <input
                    type="radio"
                    name="split-delimiter"
                    checked={delimiter === key}
                    onChange={() => setDelimiter(key)}
                  />
                  {DELIMITER_LABELS[key]}
                </label>
              ))}
            </div>
            {!result && <p className="modal-warning">拆分后将超出 52 列上限。</p>}
            {!!result?.overwritten && (
              <p className="modal-warning">
                右侧有 {result.overwritten} 个非空单元格将被覆盖，可通过撤销恢复。
              </p>
            )}
          </>
        )}
        <div className="modal-buttons">
          <button className="secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            type="button"
            disabled={!changed}
            onClick={() => {
              if (result && changed) onApply(result.sheet);
              onClose();
            }}
          >
            分列
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface ChartModalProps {
  kind: ChartKind;
  sheet: SheetPage;
  range: { bounds: SheetBounds; hasHeader: boolean } | null;
  valueAt: (address: string) => string | number;
  onClose: () => void;
}

const CHART_TITLES: Record<ChartKind, string> = { bar: '柱形图', line: '折线图', pie: '饼图' };

export function ChartModal({ kind, range, valueAt, onClose }: ChartModalProps) {
  const [current, setCurrent] = useState(kind);
  return (
    <Modal title={`图表预览 · ${CHART_TITLES[current]}`} onClose={onClose}>
      <div className="insert-feature-modal">
        <div className="chart-kind-switch" role="tablist">
          {(Object.keys(CHART_TITLES) as ChartKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={current === k}
              className={current === k ? 'active' : ''}
              onClick={() => setCurrent(k)}
            >
              {CHART_TITLES[k]}
            </button>
          ))}
        </div>
        <SheetChartPreview kind={current} range={range} valueAt={valueAt} />
        <p>预览基于当前选区数据（首列为分类，其余数值列为系列），暂不嵌入工作表。</p>
        <div className="modal-buttons">
          <button className="primary" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </Modal>
  );
}
