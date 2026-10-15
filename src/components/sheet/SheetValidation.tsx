import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  MAX_LIST_OPTIONS,
  type SheetValidation,
  type SheetValidationRule,
} from '../../../shared/documents';
import { describeRule, parseListOptions } from '../../../shared/sheet-validation';
import { Modal } from '../ui';

type RuleType = SheetValidationRule['type'];

interface ValidationModalProps {
  rangeLabel: string;
  /** Rule covering the anchor cell, used to prefill the form. */
  current?: SheetValidation;
  initialType: RuleType;
  onClose: () => void;
  onApply: (rule: SheetValidationRule, mode: SheetValidation['mode']) => string | null;
  onClear: () => void;
}

const optionalNumber = (text: string) => (text.trim() === '' ? undefined : Number(text));

export function ValidationModal({
  rangeLabel,
  current,
  initialType,
  onClose,
  onApply,
  onClear,
}: ValidationModalProps) {
  const rule = current?.rule;
  const [type, setType] = useState<RuleType>(rule?.type ?? initialType);
  const [optionsText, setOptionsText] = useState(
    rule?.type === 'list' ? rule.options.join('\n') : '',
  );
  const [min, setMin] = useState(
    rule && rule.type !== 'list' && rule.min !== undefined ? String(rule.min) : '',
  );
  const [max, setMax] = useState(
    rule && rule.type !== 'list' && rule.max !== undefined ? String(rule.max) : '',
  );
  const [integer, setInteger] = useState(rule?.type === 'number' ? !!rule.integer : false);
  const [mode, setMode] = useState<SheetValidation['mode']>(current?.mode ?? 'stop');
  const [error, setError] = useState('');

  function build(): SheetValidationRule | string {
    if (type === 'list') {
      const options = parseListOptions(optionsText);
      if (!options.length) return '请至少输入一个选项。';
      if (options.length > MAX_LIST_OPTIONS) return `最多 ${MAX_LIST_OPTIONS} 个选项。`;
      if (options.some((o) => o.length > 64)) return '单个选项不能超过 64 个字符。';
      if (options.join(',').length > 255) return '选项总长度不能超过 255 个字符。';
      return { type: 'list', options };
    }
    const low = optionalNumber(min),
      high = optionalNumber(max);
    if ([low, high].some((v) => v !== undefined && !Number.isFinite(v)))
      return '最小值和最大值必须是数字。';
    if (low !== undefined && high !== undefined && low > high) return '最小值不能大于最大值。';
    if (type === 'textLength') {
      if ([low, high].some((v) => v !== undefined && (!Number.isInteger(v) || v < 0)))
        return '文本长度必须是非负整数。';
      if (low === undefined && high === undefined) return '请至少填写最小或最大长度。';
      return {
        type,
        ...(low !== undefined ? { min: low } : {}),
        ...(high !== undefined ? { max: high } : {}),
      };
    }
    return {
      type,
      ...(low !== undefined ? { min: low } : {}),
      ...(high !== undefined ? { max: high } : {}),
      ...(integer ? { integer: true } : {}),
    };
  }

  function submit() {
    const result = build();
    if (typeof result === 'string') return setError(result);
    const failure = onApply(result, mode);
    if (failure) return setError(failure);
    onClose();
  }

  return (
    <Modal title={`数据有效性 · ${rangeLabel}`} onClose={onClose}>
      <div className="insert-feature-modal">
        <label>
          允许
          <select
            aria-label="有效性类型"
            value={type}
            onChange={(e) => setType(e.target.value as RuleType)}
          >
            <option value="list">序列（下拉列表）</option>
            <option value="number">数值</option>
            <option value="textLength">文本长度</option>
          </select>
        </label>
        {type === 'list' ? (
          <label>
            选项（每行一个，或用逗号分隔）
            <textarea
              autoFocus
              rows={5}
              className="csv-import-textarea"
              aria-label="下拉选项"
              value={optionsText}
              placeholder={'已完成\n进行中\n待处理'}
              onChange={(e) => setOptionsText(e.target.value)}
            />
          </label>
        ) : (
          <div className="validation-bounds">
            <label>
              {type === 'textLength' ? '最小长度' : '最小值'}
              <input
                aria-label="最小值"
                inputMode="decimal"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </label>
            <label>
              {type === 'textLength' ? '最大长度' : '最大值'}
              <input
                aria-label="最大值"
                inputMode="decimal"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </label>
            {type === 'number' && (
              <label className="modal-checkbox">
                <input
                  type="checkbox"
                  checked={integer}
                  onChange={(e) => setInteger(e.target.checked)}
                />
                仅限整数
              </label>
            )}
          </div>
        )}
        <div className="split-delimiters" role="radiogroup" aria-label="出错时">
          <label className="modal-checkbox">
            <input
              type="radio"
              name="validation-mode"
              checked={mode === 'stop'}
              onChange={() => setMode('stop')}
            />
            拒绝无效输入
          </label>
          <label className="modal-checkbox">
            <input
              type="radio"
              name="validation-mode"
              checked={mode === 'warning'}
              onChange={() => setMode('warning')}
            />
            仅提示警告
          </label>
        </div>
        {error && <p className="modal-warning">{error}</p>}
        <div className="modal-buttons">
          {current && (
            <button
              className="secondary"
              type="button"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              清除有效性
            </button>
          )}
          <button className="secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" type="button" onClick={submit}>
            确定
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function invalidMessage(validation: SheetValidation, value: string) {
  return `「${value}」不符合数据有效性：${describeRule(validation.rule)}。`;
}

interface ListPopoverProps {
  address: string;
  options: string[];
  value: string;
  grid: RefObject<HTMLDivElement | null>;
  onPick: (option: string) => void;
  onClose: () => void;
}

/** Option list for a dropdown cell, positioned under the cell outside the scroll container. */
export function ListPopover({ address, options, value, grid, onPick, onClose }: ListPopoverProps) {
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );
  const [active, setActive] = useState(Math.max(0, options.indexOf(value)));
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const cell = grid.current?.querySelector<HTMLElement>(`td[data-cell="${address}"]`);
    if (!cell) return onClose();
    const rect = cell.getBoundingClientRect();
    const height = Math.min(240, options.length * 30 + 8);
    const top = rect.bottom + height > window.innerHeight ? rect.top - height : rect.bottom;
    setPosition({ left: rect.left, top, width: Math.max(rect.width, 140) });
    ref.current?.focus();
    const close = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const el = grid.current;
    window.addEventListener('pointerdown', close, true);
    el?.addEventListener('scroll', onClose, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', close, true);
      el?.removeEventListener('scroll', onClose);
    };
  }, [address, options, grid, onClose]);

  if (!position) return null;
  return createPortal(
    <div
      ref={ref}
      className="sheet-list-popover"
      role="listbox"
      tabIndex={-1}
      aria-label={`${address} 下拉选项`}
      style={position}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') setActive((i) => Math.min(options.length - 1, i + 1));
        else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
        else if (e.key === 'Enter') onPick(options[active]);
        else if (e.key === 'Escape') onClose();
        else return;
        e.preventDefault();
      }}
    >
      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          role="option"
          aria-selected={option === value}
          className={index === active ? 'active' : ''}
          onPointerEnter={() => setActive(index)}
          onClick={() => onPick(option)}
        >
          {option}
        </button>
      ))}
    </div>,
    document.body,
  );
}
