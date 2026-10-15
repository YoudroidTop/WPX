import React, { useState } from 'react';
import { Modal } from '../ui';
import { cellAddress, type CellPoint } from '../../../shared/sheet-selection';

interface FindReplaceModalProps {
  cells: Record<string, string>;
  onClose: () => void;
  onSelectCell: (point: CellPoint) => void;
  onReplace: (updatedCells: Record<string, string>) => void;
}

export function FindReplaceModal({
  cells,
  onClose,
  onSelectCell,
  onReplace,
}: FindReplaceModalProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);

  function handleFind() {
    if (!findText) return;
    const matches: string[] = [];
    for (const [addr, val] of Object.entries(cells)) {
      if (val.toLowerCase().includes(findText.toLowerCase())) {
        matches.push(addr);
      }
    }
    setMatchCount(matches.length);
    if (matches.length > 0) {
      const match = /^([A-Z]+)(\d+)$/.exec(matches[0]);
      if (match) {
        const col = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
        const row = Number(match[2]);
        onSelectCell({ row, col });
      }
    }
  }

  function handleReplaceAll() {
    if (!findText) return;
    const next = { ...cells };
    let count = 0;
    for (const [addr, val] of Object.entries(cells)) {
      if (val.includes(findText)) {
        next[addr] = val.replaceAll(findText, replaceText);
        count++;
      }
    }
    onReplace(next);
    setMatchCount(count);
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
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFind()}
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

        {matchCount !== null && (
          <p className="find-result-hint">
            {matchCount > 0 ? `找到 ${matchCount} 处匹配项` : '未找到匹配内容'}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" onClick={handleFind}>
            查找下一个
          </button>
          <button type="button" onClick={handleReplaceAll}>
            全部替换
          </button>
          <button className="button-primary" type="button" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </Modal>
  );
}

import type { InsertDialogType } from './types';

interface InsertFeatureModalProps {
  type: InsertDialogType;
  onClose: () => void;
  onConfirm: (payload: { text?: string; formula?: string; bulkCells?: Record<string, string> }) => void;
}

const COMMON_SYMBOLS = [
  '¥', '$', '€', '£', '₽', '₩', '‰', '%',
  '±', '×', '÷', '≈', '≠', '≤', '≥', '√', '∑', 'π', '∞',
  '★', '☆', '●', '○', '✓', '✕', '▲', '▼', '◆', '℃', '℉',
];

const WATERMARKS = [
  '内部绝密',
  '机密文件',
  '草稿 DRAFT',
  '仅供参考',
  '禁止外传',
  'SAMPLE 示例',
];

export function InsertFeatureModal({
  type,
  onClose,
  onConfirm,
}: InsertFeatureModalProps) {
  const [inputVal, setInputVal] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState(COMMON_SYMBOLS[0]);
  const [selectedWatermark, setSelectedWatermark] = useState(WATERMARKS[0]);

  const titles: Record<InsertDialogType, string> = {
    checkbox: '插入复选框',
    dropdown: '设置下拉列表 (数据验证)',
    link: '插入超链接',
    image: '插入图片',
    chart: '插入统计图表',
    pivot: '创建数据透视表',
    symbol: '插入特殊符号',
    textbox: '插入文本框',
    watermark: '设置工作表水印',
    qrcode: '生成二维码',
    comment: '添加批注',
    'import-csv': '导入 CSV / 文本数据',
  };

  const descriptions: Record<InsertDialogType, string> = {
    checkbox: '将在当前单元格插入复选框标记 [ ]，支持点击切换勾选。',
    dropdown: '输入可供选择的下拉选项，以逗号分隔，例如：已完成, 进行中, 待处理。',
    link: '输入网址链接，例如：https://example.com。',
    image: '输入网络图片地址 (URL) 即可在单元格中嵌入图片。',
    chart: '根据当前选中区域的数据快速生成可视化图表。',
    pivot: '基于当前表格数据区域创建动态多维交叉透视报表。',
    symbol: '选择常用货币、数学、特殊符号插入当前单元格。',
    textbox: '输入多行长文本说明，插入到当前选区。',
    watermark: '选择水印类型或自定义水印文字，提示文档状态与安全级别。',
    qrcode: '输入网址或文本内容，生成二维码嵌入单元格。',
    comment: '为当前单元格添加详细批注说明。',
    'import-csv': '粘贴逗号或制表符分隔的 CSV 纯文本，自动按行和列解析填入。',
  };

  function handleConfirm() {
    if (type === 'checkbox') {
      onConfirm({ text: '[ ]' });
    } else if (type === 'dropdown') {
      onConfirm({ text: inputVal.split(/[,，]/)[0]?.trim() || inputVal });
    } else if (type === 'link') {
      onConfirm({ text: inputVal.startsWith('http') ? inputVal : `https://${inputVal}` });
    } else if (type === 'image') {
      onConfirm({ text: inputVal ? `[图片: ${inputVal}]` : '' });
    } else if (type === 'symbol') {
      onConfirm({ text: selectedSymbol });
    } else if (type === 'textbox') {
      onConfirm({ text: inputVal || '[文本框]' });
    } else if (type === 'watermark') {
      onConfirm({ text: `[水印: ${inputVal || selectedWatermark}]` });
    } else if (type === 'qrcode') {
      onConfirm({ text: inputVal ? `[二维码: ${inputVal}]` : '[二维码]' });
    } else if (type === 'comment') {
      onConfirm({ text: inputVal ? `[批注: ${inputVal}]` : '' });
    } else if (type === 'import-csv') {
      onConfirm({ text: inputVal });
    } else {
      onConfirm({ text: `[${titles[type]}]` });
    }
    onClose();
  }

  return (
    <Modal title={titles[type]} onClose={onClose}>
      <div className="insert-feature-modal">
        <p>{descriptions[type]}</p>

        {type === 'symbol' && (
          <div className="symbol-grid-picker">
            {COMMON_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                className={`symbol-btn ${selectedSymbol === sym ? 'selected' : ''}`}
                onClick={() => setSelectedSymbol(sym)}
              >
                {sym}
              </button>
            ))}
          </div>
        )}

        {type === 'watermark' && (
          <div className="watermark-options">
            <div className="watermark-chips">
              {WATERMARKS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`watermark-chip ${selectedWatermark === w ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedWatermark(w);
                    setInputVal(w);
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
            <label style={{ marginTop: 12 }}>
              自定义水印文字
              <input
                value={inputVal}
                placeholder="输入自定义水印内容"
                onChange={(e) => setInputVal(e.target.value)}
              />
            </label>
          </div>
        )}

        {['dropdown', 'link', 'image', 'textbox', 'qrcode', 'comment'].includes(type) && (
          <label>
            {type === 'dropdown'
              ? '下拉选项'
              : type === 'link'
                ? '链接地址'
                : type === 'image'
                  ? '图片链接'
                  : type === 'textbox'
                    ? '文本内容'
                    : type === 'qrcode'
                      ? '二维码编码内容'
                      : '批注文字'}
            <input
              autoFocus
              value={inputVal}
              placeholder={
                type === 'dropdown'
                  ? '选项1, 选项2, 选项3'
                  : type === 'link'
                    ? 'https://example.com'
                    : type === 'image'
                      ? 'https://example.com/logo.png'
                      : type === 'qrcode'
                        ? 'https://example.com 或 编号'
                        : '请输入文本'
              }
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            />
          </label>
        )}

        {type === 'import-csv' && (
          <label>
            CSV 内容 (逗号或制表符分隔)
            <textarea
              autoFocus
              rows={6}
              style={{ width: '100%', padding: '8px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--border-color, #e0e0e0)' }}
              value={inputVal}
              placeholder="姓名, 部门, 销售额&#10;张三, 华东区, 15000&#10;李四, 华南区, 28000"
              onChange={(e) => setInputVal(e.target.value)}
            />
          </label>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="button-primary" type="button" onClick={handleConfirm}>
            确认插入
          </button>
        </div>
      </div>
    </Modal>
  );
}
