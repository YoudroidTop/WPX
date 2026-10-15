import { cellAddress } from '../../../shared/sheet-selection';
import type { SheetBounds } from '../../../shared/sheet-data';
import type { ChartKind } from './types';

const PALETTE = ['#1b784d', '#3f8fd2', '#e0913a', '#c2524a', '#7a62c7', '#2fa3a0'];
const WIDTH = 400;
const HEIGHT = 240;
const PAD = { top: 16, right: 12, bottom: 34, left: 44 };

type Series = { name: string; values: number[] };

/**
 * Builds chart data from a range: the first column provides category labels and every
 * column that holds at least one number becomes a series.
 */
function chartData(
  range: { bounds: SheetBounds; hasHeader: boolean },
  valueAt: (address: string) => string | number,
) {
  const { bounds, hasHeader } = range;
  const firstRow = bounds.top + (hasHeader ? 1 : 0);
  const singleColumn = bounds.left === bounds.right;
  const labelCol = singleColumn ? null : bounds.left;
  const labels: string[] = [];
  // Rows without a category label (typically a totals row under the data) are left out.
  const rows: number[] = [];
  for (let row = firstRow; row <= bounds.bottom; row++) {
    const label =
      labelCol === null ? String(row) : String(valueAt(cellAddress({ row, col: labelCol })));
    if (!label.trim()) continue;
    rows.push(row);
    labels.push(label);
  }
  const series: Series[] = [];
  for (let col = singleColumn ? bounds.left : bounds.left + 1; col <= bounds.right; col++) {
    const values: number[] = [];
    let numeric = false;
    for (const row of rows) {
      const value = valueAt(cellAddress({ row, col }));
      if (typeof value === 'number') numeric = true;
      values.push(typeof value === 'number' ? value : 0);
    }
    if (!numeric) continue;
    const name = hasHeader
      ? String(valueAt(cellAddress({ row: bounds.top, col })))
      : `系列 ${series.length + 1}`;
    series.push({ name, values });
  }
  return { labels, series };
}

export default function SheetChartPreview({
  kind,
  range,
  valueAt,
}: {
  kind: ChartKind;
  range: { bounds: SheetBounds; hasHeader: boolean } | null;
  valueAt: (address: string) => string | number;
}) {
  const data = range ? chartData(range, valueAt) : null;
  if (!data || !data.series.length || !data.labels.length)
    return <p className="modal-warning">选区中没有可绘制的数值，请选中包含数字的数据区域。</p>;
  const { labels, series } = data;

  if (kind === 'pie') {
    const values = series[0].values.map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0);
    if (!total) return <p className="modal-warning">饼图需要正数数据。</p>;
    const cx = 120,
      cy = HEIGHT / 2,
      r = 95;
    let angle = -Math.PI / 2;
    return (
      <svg
        className="chart-preview"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="饼图预览"
      >
        {values.map((value, i) => {
          if (!value) return null;
          const start = angle;
          angle += (value / total) * Math.PI * 2;
          const color = PALETTE[i % PALETTE.length];
          if (value === total) return <circle key={i} cx={cx} cy={cy} r={r} fill={color} />;
          const large = angle - start > Math.PI ? 1 : 0;
          const d = `M${cx},${cy} L${cx + r * Math.cos(start)},${cy + r * Math.sin(start)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)} Z`;
          return <path key={i} d={d} fill={color} stroke="#fff" strokeWidth={1} />;
        })}
        {labels.slice(0, 10).map((label, i) => (
          <g key={i} transform={`translate(250, ${20 + i * 20})`}>
            <rect width={10} height={10} fill={PALETTE[i % PALETTE.length]} rx={2} />
            <text x={16} y={9} fontSize={11} fill="#3b4d3e">
              {label.slice(0, 12)} · {((values[i] / total) * 100).toFixed(1)}%
            </text>
          </g>
        ))}
      </svg>
    );
  }

  const all = series.flatMap((s) => s.values);
  const max = Math.max(0, ...all),
    min = Math.min(0, ...all);
  const span = max - min || 1;
  const plotW = WIDTH - PAD.left - PAD.right,
    plotH = HEIGHT - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((max - v) / span) * plotH;
  const step = plotW / labels.length;
  const ticks = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4);
  const format = (v: number) =>
    Math.abs(v) >= 10000 ? `${Number((v / 10000).toFixed(1))}万` : String(Number(v.toFixed(2)));

  return (
    <svg
      className="chart-preview"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="图表预览"
    >
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} stroke="#e4ebe1" />
          <text x={PAD.left - 6} y={y(t) + 4} fontSize={10} textAnchor="end" fill="#7c8876">
            {format(t)}
          </text>
        </g>
      ))}
      {labels.map((label, i) => (
        <text
          key={i}
          x={PAD.left + step * (i + 0.5)}
          y={HEIGHT - PAD.bottom + 16}
          fontSize={10}
          textAnchor="middle"
          fill="#5d6d60"
        >
          {label.slice(0, 6)}
        </text>
      ))}
      {kind === 'bar'
        ? series.map((s, si) => {
            const barW = (step * 0.7) / series.length;
            return s.values.map((v, i) => (
              <rect
                key={`${si}-${i}`}
                x={PAD.left + step * i + step * 0.15 + barW * si}
                y={Math.min(y(v), y(0))}
                width={Math.max(1, barW - 2)}
                height={Math.abs(y(v) - y(0))}
                fill={PALETTE[si % PALETTE.length]}
                rx={2}
              />
            ));
          })
        : series.map((s, si) => (
            <g key={si}>
              <polyline
                fill="none"
                stroke={PALETTE[si % PALETTE.length]}
                strokeWidth={2}
                points={s.values.map((v, i) => `${PAD.left + step * (i + 0.5)},${y(v)}`).join(' ')}
              />
              {s.values.map((v, i) => (
                <circle
                  key={i}
                  cx={PAD.left + step * (i + 0.5)}
                  cy={y(v)}
                  r={3}
                  fill={PALETTE[si % PALETTE.length]}
                />
              ))}
            </g>
          ))}
      {series.length > 1 &&
        series.map((s, si) => (
          <g key={si} transform={`translate(${PAD.left + si * 90}, 2)`}>
            <rect width={8} height={8} fill={PALETTE[si % PALETTE.length]} rx={2} />
            <text x={12} y={8} fontSize={10} fill="#3b4d3e">
              {s.name.slice(0, 8)}
            </text>
          </g>
        ))}
    </svg>
  );
}
