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

interface InsertFeatureModalProps {
  type: 'checkbox' | 'dropdown' | 'link' | 'image' | 'chart' | 'pivot';
  onClose: () => void;
  onConfirm: (payload: { text?: string; formula?: string }) => void;
}

export function InsertFeatureModal({
  type,
  onClose,
  onConfirm,
}: InsertFeatureModalProps) {
  const [inputVal, setInputVal] = useState('');

  const titles: Record<string, string> = {
    checkbox: '插入复选框',
    dropdown: '设置下拉列表 (数据验证)',
    link: '插入超链接',
    image: '插入图片',
    chart: '插入统计图表',
    pivot: '创建数据透视表',
  };

  const descriptions: Record<string, string> = {
    checkbox: '将在当前单元格插入复选框标记 [ ]，支持点击切换勾选。',
    dropdown: '输入可供选择的下拉选项，以逗号分隔，例如：已完成, 进行中, 待处理。',
    link: '输入网址链接，例如：https://example.com。',
    image: '输入网络图片地址 (URL) 即可在单元格中嵌入图片。',
    chart: '根据当前选中区域的数据快速生成可视化图表。',
    pivot: '基于当前表格数据区域创建动态多维交叉透视报表。',
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
    } else {
      onConfirm({ text: `[${titles[type]}]` });
    }
    onClose();
  }

  return (
    <Modal title={titles[type]} onClose={onClose}>
      <div className="insert-feature-modal">
        <p>{descriptions[type]}</p>
        {['dropdown', 'link', 'image'].includes(type) && (
          <label>
            {type === 'dropdown' ? '下拉选项' : type === 'link' ? '链接地址' : '图片链接'}
            <input
              autoFocus
              value={inputVal}
              placeholder={
                type === 'dropdown'
                  ? '选项1, 选项2, 选项3'
                  : type === 'link'
                    ? 'https://example.com'
                    : 'https://example.com/logo.png'
              }
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
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
