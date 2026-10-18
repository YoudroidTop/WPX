import {
  Trash2,
  Sliders,
  Type,
  Square,
  Image as ImageIcon,
  Table as TableIcon,
  BarChart2,
  Tv,
  Palette,
  Columns2,
  Plus,
  Minus,
} from 'lucide-react';
import type {
  Slide,
  SlideElement,
  SlideShapeElement,
  SlideTextElement,
  SlideImageElement,
  SlideTableElement,
  SlideChartElement,
  SlideLayout,
  SlideTheme,
  ShapeKind,
} from './types';
import { THEME_PRESETS, LAYOUT_PRESETS, TRANSITION_PRESETS } from './types';
import { FONT_FAMILIES } from './SlideRibbon';

interface SlideInspectorProps {
  slide: Slide;
  selectedElementId: string | null;
  onUpdateSlide: (patch: Partial<Slide>) => void;
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void;
  onDeleteElement: (id: string) => void;
  onOpenImageModal: () => void;
}

export default function SlideInspector({
  slide,
  selectedElementId,
  onUpdateSlide,
  onUpdateElement,
  onDeleteElement,
  onOpenImageModal,
}: SlideInspectorProps) {
  const selectedElem = (slide.elements as SlideElement[])?.find(
    (el) => el.id === selectedElementId,
  );

  return (
    <aside className="slide-inspector" aria-label="属性设置面板">
      {/* CASE 1: An Element is Selected */}
      {selectedElem ? (
        <div className="inspector-element-pane">
          <div className="inspector-header">
            <h3>
              {selectedElem.type === 'text' && <Type size={16} />}
              {selectedElem.type === 'shape' && <Square size={16} />}
              {selectedElem.type === 'image' && <ImageIcon size={16} />}
              {selectedElem.type === 'table' && <TableIcon size={16} />}
              {selectedElem.type === 'chart' && <BarChart2 size={16} />}
              <span>
                {selectedElem.type === 'text' && '文本框属性'}
                {selectedElem.type === 'shape' && '形状属性'}
                {selectedElem.type === 'image' && '图片属性'}
                {selectedElem.type === 'table' && '表格属性'}
                {selectedElem.type === 'chart' && '图表属性'}
              </span>
            </h3>
            <button
              className="danger-icon-btn"
              onClick={() => onDeleteElement(selectedElem.id)}
              title="删除元素 (Delete / Backspace)"
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* Text Element Properties */}
          {selectedElem.type === 'text' &&
            (() => {
              const textElem = selectedElem as SlideTextElement;
              return (
                <div className="inspector-section">
                  <label>
                    文本内容
                    <textarea
                      rows={4}
                      value={textElem.content}
                      onChange={(e) => onUpdateElement(textElem.id, { content: e.target.value })}
                    />
                  </label>
                  <label>
                    字体
                    <select
                      value={textElem.fontFamily || ''}
                      onChange={(e) => onUpdateElement(textElem.id, { fontFamily: e.target.value })}
                    >
                      {FONT_FAMILIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ flex: 1 }}>
                      字号 (px)
                      <input
                        type="number"
                        min={10}
                        max={120}
                        value={textElem.fontSize || 16}
                        onChange={(e) =>
                          onUpdateElement(textElem.id, { fontSize: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label style={{ width: 60 }}>
                      颜色
                      <input
                        type="color"
                        value={textElem.color || '#174c3b'}
                        onChange={(e) => onUpdateElement(textElem.id, { color: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              );
            })()}

          {/* Shape Element Properties */}
          {selectedElem.type === 'shape' &&
            (() => {
              const shapeElem = selectedElem as SlideShapeElement;
              return (
                <div className="inspector-section">
                  <label>
                    形状类型
                    <select
                      value={shapeElem.kind}
                      onChange={(e) =>
                        onUpdateElement(shapeElem.id, { kind: e.target.value as ShapeKind })
                      }
                    >
                      <option value="rect">矩形</option>
                      <option value="roundRect">圆角矩形</option>
                      <option value="circle">圆形</option>
                      <option value="triangle">三角形</option>
                      <option value="arrowRight">向右箭头</option>
                      <option value="star">五角星</option>
                      <option value="callout">气泡框</option>
                      <option value="line">分割线</option>
                    </select>
                  </label>
                  <label>
                    内部文本
                    <input
                      type="text"
                      value={shapeElem.text || ''}
                      placeholder="双击或在此输入文本"
                      onChange={(e) => onUpdateElement(shapeElem.id, { text: e.target.value })}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ flex: 1 }}>
                      填充颜色
                      <input
                        type="color"
                        value={shapeElem.fill || '#2f855a'}
                        onChange={(e) => onUpdateElement(shapeElem.id, { fill: e.target.value })}
                      />
                    </label>
                    <label style={{ flex: 1 }}>
                      边框颜色
                      <input
                        type="color"
                        value={shapeElem.border || '#174c3b'}
                        onChange={(e) => onUpdateElement(shapeElem.id, { border: e.target.value })}
                      />
                    </label>
                  </div>
                  <label>
                    透明度 ({Math.round((shapeElem.opacity ?? 1) * 100)}%)
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={shapeElem.opacity ?? 1}
                      onChange={(e) =>
                        onUpdateElement(shapeElem.id, { opacity: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
              );
            })()}

          {/* Image Element Properties */}
          {selectedElem.type === 'image' &&
            (() => {
              const imgElem = selectedElem as SlideImageElement;
              return (
                <div className="inspector-section">
                  <label>
                    图片链接
                    <input
                      type="url"
                      value={imgElem.src}
                      onChange={(e) => onUpdateElement(imgElem.id, { src: e.target.value })}
                    />
                  </label>
                  <button
                    className="secondary"
                    style={{ marginTop: 8, width: '100%', fontSize: 13 }}
                    onClick={onOpenImageModal}
                  >
                    更换图片…
                  </button>
                  <label style={{ marginTop: 12 }}>
                    圆角大小 ({imgElem.borderRadius || 0}px)
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={imgElem.borderRadius || 0}
                      onChange={(e) =>
                        onUpdateElement(imgElem.id, {
                          borderRadius: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              );
            })()}

          {/* Table Element Properties */}
          {selectedElem.type === 'table' &&
            (() => {
              const tblElem = selectedElem as SlideTableElement;
              return (
                <div className="inspector-section">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={tblElem.headerRow ?? true}
                      onChange={(e) => onUpdateElement(tblElem.id, { headerRow: e.target.checked })}
                    />
                    高亮首行作为表头
                  </label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      className="secondary"
                      style={{ flex: 1, fontSize: 12 }}
                      onClick={() => {
                        const cols = tblElem.cols || tblElem.data[0]?.length || 2;
                        const emptyRow = Array.from({ length: cols }, () => '新数据');
                        onUpdateElement(tblElem.id, {
                          rows: tblElem.rows + 1,
                          data: [...tblElem.data, emptyRow],
                        });
                      }}
                    >
                      <Plus size={12} /> 加一行
                    </button>
                    <button
                      className="secondary"
                      style={{ flex: 1, fontSize: 12 }}
                      disabled={tblElem.data.length <= 1}
                      onClick={() => {
                        onUpdateElement(tblElem.id, {
                          rows: Math.max(1, tblElem.rows - 1),
                          data: tblElem.data.slice(0, -1),
                        });
                      }}
                    >
                      <Minus size={12} /> 删一行
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      className="secondary"
                      style={{ flex: 1, fontSize: 12 }}
                      onClick={() => {
                        const nextData = tblElem.data.map((r) => [...r, '新列']);
                        onUpdateElement(tblElem.id, {
                          cols: tblElem.cols + 1,
                          data: nextData,
                        });
                      }}
                    >
                      <Plus size={12} /> 加一列
                    </button>
                    <button
                      className="secondary"
                      style={{ flex: 1, fontSize: 12 }}
                      disabled={(tblElem.data[0]?.length ?? 1) <= 1}
                      onClick={() => {
                        const nextData = tblElem.data.map((r) => r.slice(0, -1));
                        onUpdateElement(tblElem.id, {
                          cols: Math.max(1, tblElem.cols - 1),
                          data: nextData,
                        });
                      }}
                    >
                      <Minus size={12} /> 删一列
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* Chart Element Properties */}
          {selectedElem.type === 'chart' &&
            (() => {
              const chartElem = selectedElem as SlideChartElement;
              return (
                <div className="inspector-section">
                  <label>
                    图表类型
                    <select
                      value={chartElem.chartType}
                      onChange={(e) =>
                        onUpdateElement(chartElem.id, {
                          chartType: e.target.value as 'bar' | 'line' | 'pie',
                        })
                      }
                    >
                      <option value="bar">柱状图</option>
                      <option value="line">折线图</option>
                      <option value="pie">饼图</option>
                    </select>
                  </label>
                  <label>
                    图表标题
                    <input
                      type="text"
                      value={chartElem.title || ''}
                      onChange={(e) => onUpdateElement(chartElem.id, { title: e.target.value })}
                    />
                  </label>
                  <label>
                    类别（以逗号分隔）
                    <input
                      type="text"
                      value={chartElem.categories.join(', ')}
                      onChange={(e) =>
                        onUpdateElement(chartElem.id, {
                          categories: e.target.value
                            .split(/[,，]/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <label>
                    数据（以逗号分隔）
                    <input
                      type="text"
                      value={(chartElem.series[0]?.values ?? []).join(', ')}
                      onChange={(e) => {
                        const vals = e.target.value
                          .split(/[,，]/)
                          .map((s) => parseFloat(s.trim()))
                          .filter((n) => !isNaN(n));
                        onUpdateElement(chartElem.id, {
                          series: [{ name: '数值', values: vals }],
                        });
                      }}
                    />
                  </label>
                </div>
              );
            })()}
        </div>
      ) : (
        /* CASE 2: No Element Selected -> Slide Page Properties */
        <div className="inspector-slide-pane">
          <div className="inspector-header">
            <h3>幻灯片页面属性</h3>
          </div>

          <label>
            幻灯片版式
            <select
              value={slide.layout || 'content'}
              onChange={(e) => onUpdateSlide({ layout: e.target.value as SlideLayout })}
            >
              {LAYOUT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            幻灯片标题
            <textarea
              aria-label="幻灯片标题"
              value={slide.title}
              maxLength={500}
              rows={2}
              onChange={(e) => onUpdateSlide({ title: e.target.value })}
            />
          </label>

          <label>
            正文内容
            <textarea
              aria-label="幻灯片正文"
              value={slide.body}
              maxLength={10_000}
              rows={5}
              onChange={(e) => onUpdateSlide({ body: e.target.value })}
            />
          </label>

          {/* Conditional inputs for specific layouts */}
          {slide.layout === 'two-column' && (
            <label>
              右栏内容
              <textarea
                aria-label="右栏对比内容"
                value={slide.secondaryBody || ''}
                rows={4}
                onChange={(e) => onUpdateSlide({ secondaryBody: e.target.value })}
              />
            </label>
          )}

          {slide.layout === 'big-image' && (
            <div style={{ marginTop: 12 }}>
              <label>配图 URL</label>
              <input
                type="url"
                value={slide.imageUrl || ''}
                placeholder="https://example.com/photo.jpg"
                onChange={(e) => onUpdateSlide({ imageUrl: e.target.value })}
              />
              <button
                className="secondary"
                style={{ width: '100%', marginTop: 6, fontSize: 13 }}
                onClick={onOpenImageModal}
              >
                从图库中挑选配图
              </button>
            </div>
          )}

          <label>主题配色方案</label>
          <div className="theme-options">
            {THEME_PRESETS.map((theme) => {
              const label =
                theme.id === 'forest'
                  ? '森绿主题'
                  : theme.id === 'paper'
                    ? '纸白主题'
                    : theme.id === 'midnight'
                      ? '午夜主题'
                      : theme.name;
              return (
                <button
                  key={theme.id}
                  className={`theme-swatch ${theme.id} ${slide.theme === theme.id ? 'active' : ''}`}
                  style={{ background: theme.previewGradient || theme.bg, color: theme.text }}
                  aria-label={label}
                  aria-pressed={slide.theme === theme.id}
                  onClick={() => onUpdateSlide({ theme: theme.id })}
                  title={theme.name}
                >
                  Aa
                </button>
              );
            })}
          </div>

          <label style={{ marginTop: 16 }}>页面切换转场</label>
          <select
            value={slide.transition || 'none'}
            onChange={(e) => onUpdateSlide({ transition: e.target.value as any })}
          >
            {TRANSITION_PRESETS.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </select>

          <p className="muted" style={{ marginTop: 24 }}>
            实时自动保存。导出 PPTX 后可在 Microsoft Office 或 WPS 演示中继续编辑。
          </p>
        </div>
      )}
    </aside>
  );
}
