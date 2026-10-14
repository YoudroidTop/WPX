import type { SheetCellStyle } from '../../shared/documents';

export default function SheetFormatToolbar({
  style,
  onChange,
}: {
  style: SheetCellStyle;
  onChange: (patch: SheetCellStyle | null) => void;
}) {
  return (
    <div className="editor-toolbar sheet-format-tools" role="toolbar" aria-label="单元格格式">
      {(
        [
          ['bold', '粗体'],
          ['italic', '斜体'],
          ['underline', '下划线'],
          ['border', '边框'],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          aria-pressed={!!style[key]}
          onClick={() => onChange({ [key]: !style[key] })}
        >
          {label}
        </button>
      ))}
      <label>
        文字颜色{' '}
        <input
          type="color"
          aria-label="文字颜色"
          value={style.color ?? '#202824'}
          onInput={(e) => onChange({ color: e.currentTarget.value })}
        />
      </label>
      <label>
        填充颜色{' '}
        <input
          type="color"
          aria-label="填充颜色"
          value={style.fill ?? '#ffffff'}
          onInput={(e) => onChange({ fill: e.currentTarget.value })}
        />
      </label>
      <select
        aria-label="水平对齐"
        value={style.align ?? 'left'}
        onChange={(e) => onChange({ align: e.target.value as SheetCellStyle['align'] })}
      >
        <option value="left">左对齐</option>
        <option value="center">居中</option>
        <option value="right">右对齐</option>
      </select>
      <select
        aria-label="数字格式"
        value={style.numberFormat ?? 'general'}
        onChange={(e) =>
          onChange({ numberFormat: e.target.value as SheetCellStyle['numberFormat'] })
        }
      >
        <option value="general">常规</option>
        <option value="number">数字 · 2 位小数</option>
        <option value="percent">百分比</option>
        <option value="currency">人民币</option>
      </select>
      <button onClick={() => onChange(null)}>清除格式</button>
    </div>
  );
}
