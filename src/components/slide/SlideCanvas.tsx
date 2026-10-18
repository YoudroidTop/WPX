import { useState, useRef, useEffect } from 'react';
import type {
  Slide,
  SlideElement,
  SlideShapeElement,
  SlideTextElement,
  SlideImageElement,
  SlideTableElement,
  SlideChartElement,
  SlideViewSettings,
} from './types';
import { THEME_PRESETS } from './types';
import {
  Target,
  TrendingUp,
  Zap,
  Award,
  Briefcase,
  Layers,
  Cpu,
  Globe,
  Users,
  FileText,
  Sparkles,
  Check,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ size: number }>> = {
  Target,
  TrendingUp,
  Zap,
  Award,
  Briefcase,
  Layers,
  Cpu,
  Globe,
  Users,
  FileText,
  Sparkles,
  Check,
};

interface SlideCanvasProps {
  slide: Slide;
  pageIndex: number;
  totalPages: number;
  ratio: '16:9' | '4:3';
  viewSettings: SlideViewSettings;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateSlide: (patch: Partial<Slide>) => void;
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void;
  onDeleteElement: (id: string) => void;
  isReadOnly?: boolean;
}

export default function SlideCanvas({
  slide,
  pageIndex,
  totalPages,
  ratio,
  viewSettings,
  selectedElementId,
  onSelectElement,
  onUpdateSlide,
  onUpdateElement,
  onDeleteElement,
  isReadOnly = false,
}: SlideCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    elementId: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    initW: number;
    initH: number;
    handle?: string; // 'tl', 'tr', 'bl', 'br', 'tm', 'bm', 'ml', 'mr', or 'move'
  } | null>(null);

  // Background styling
  const themeObj = THEME_PRESETS.find((t) => t.id === slide.theme) ?? THEME_PRESETS[0];
  const bgStyle: React.CSSProperties = {
    aspectRatio: ratio === '16:9' ? '16 / 9' : '4 / 3',
  };

  if (slide.background?.type === 'gradient') {
    const angle = slide.background.gradientAngle ?? 135;
    const end = slide.background.gradientEnd ?? '#ffffff';
    bgStyle.background = `linear-gradient(${angle}deg, ${slide.background.color} 0%, ${end} 100%)`;
  } else if (slide.background?.type === 'color') {
    bgStyle.backgroundColor = slide.background.color;
  }

  // Handle Drag / Resize Mouse Events
  useEffect(() => {
    if (!dragState) return;

    function handleMouseMove(e: MouseEvent) {
      if (!dragState || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaXPercent = ((e.clientX - dragState.startX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - dragState.startY) / rect.height) * 100;

      if (dragState.handle === 'move') {
        const nextX = Math.max(0, Math.min(95, dragState.initX + deltaXPercent));
        const nextY = Math.max(0, Math.min(95, dragState.initY + deltaYPercent));
        onUpdateElement(dragState.elementId, {
          x: Math.round(nextX * 10) / 10,
          y: Math.round(nextY * 10) / 10,
        });
      } else if (dragState.handle) {
        let newX = dragState.initX;
        let newY = dragState.initY;
        let newW = dragState.initW;
        let newH = dragState.initH;

        if (dragState.handle.includes('r')) newW = Math.max(5, dragState.initW + deltaXPercent);
        if (dragState.handle.includes('b')) newH = Math.max(4, dragState.initH + deltaYPercent);
        if (dragState.handle.includes('l')) {
          const w = Math.max(5, dragState.initW - deltaXPercent);
          newX = dragState.initX + (dragState.initW - w);
          newW = w;
        }
        if (dragState.handle.includes('t')) {
          const h = Math.max(4, dragState.initH - deltaYPercent);
          newY = dragState.initY + (dragState.initH - h);
          newH = h;
        }

        onUpdateElement(dragState.elementId, {
          x: Math.round(newX * 10) / 10,
          y: Math.round(newY * 10) / 10,
          width: Math.round(newW * 10) / 10,
          height: Math.round(newH * 10) / 10,
        });
      }
    }

    function handleMouseUp() {
      setDragState(null);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, onUpdateElement]);

  // Keyboard navigation / deletion for selected element
  useEffect(() => {
    if (!selectedElementId || isReadOnly) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!selectedElementId) return;
      const elemId: string = selectedElementId;
      if (['TEXTAREA', 'INPUT'].includes((e.target as HTMLElement).tagName)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteElement(elemId);
      } else if (e.key === 'Escape') {
        onSelectElement(null);
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 3 : 0.8;
        const elem = (slide.elements as SlideElement[])?.find((el) => el.id === elemId);
        if (!elem) return;

        let { x, y } = elem;
        if (e.key === 'ArrowUp') y = Math.max(0, y - step);
        if (e.key === 'ArrowDown') y = Math.min(95, y + step);
        if (e.key === 'ArrowLeft') x = Math.max(0, x - step);
        if (e.key === 'ArrowRight') x = Math.min(95, x + step);

        onUpdateElement(elemId, {
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
        });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedElementId,
    isReadOnly,
    onDeleteElement,
    onSelectElement,
    onUpdateElement,
    slide.elements,
  ]);

  // Render Layout Structure
  const layout = slide.layout || 'content';

  function renderLayoutBody() {
    switch (layout) {
      case 'title':
        return (
          <div className="layout-body-title">
            <span className="slide-accent" />
            <h1
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateSlide({ title: e.currentTarget.innerText })}
              className="slide-title-editable"
            >
              {slide.title || '从一个好想法开始'}
            </h1>
            <p
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateSlide({ body: e.currentTarget.innerText })}
              className="slide-subtitle-editable"
            >
              {slide.body || '在这里写下你的主旨副标'}
            </p>
          </div>
        );

      case 'two-column':
        return (
          <div className="layout-body-two-column">
            <h1
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateSlide({ title: e.currentTarget.innerText })}
              className="slide-heading-editable"
            >
              {slide.title}
            </h1>
            <div className="two-columns-wrap">
              <div
                className="column-card"
                contentEditable={!isReadOnly}
                suppressContentEditableWarning
                onBlur={(e) => onUpdateSlide({ body: e.currentTarget.innerText })}
              >
                {slide.body || '左侧对比要点与核心阐述…'}
              </div>
              <div
                className="column-card"
                contentEditable={!isReadOnly}
                suppressContentEditableWarning
                onBlur={(e) => onUpdateSlide({ secondaryBody: e.currentTarget.innerText })}
              >
                {slide.secondaryBody || '右侧方案与对比分析…'}
              </div>
            </div>
          </div>
        );

      case 'three-card': {
        const cards =
          slide.cardItems && slide.cardItems.length >= 3
            ? slide.cardItems
            : [
                { title: '卓越性能', desc: '毫秒级响应，轻量极速', icon: 'Zap' },
                { title: '稳固可靠', desc: '云端同步与本地双重备份', icon: 'Award' },
                { title: '智能协作', desc: '跨平台全格式 Office 兼容', icon: 'Layers' },
              ];

        return (
          <div className="layout-body-three-card">
            <h1
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateSlide({ title: e.currentTarget.innerText })}
              className="slide-heading-editable"
            >
              {slide.title}
            </h1>
            <div className="three-cards-wrap">
              {cards.map((c, i) => {
                const IconC = ICON_MAP[c.icon || 'Sparkles'] || Sparkles;
                return (
                  <div key={i} className="feature-card">
                    <div className="feature-card-icon">
                      <IconC size={22} />
                    </div>
                    <strong
                      contentEditable={!isReadOnly}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const newCards = [...cards];
                        newCards[i] = { ...newCards[i], title: e.currentTarget.innerText };
                        onUpdateSlide({ cardItems: newCards });
                      }}
                    >
                      {c.title}
                    </strong>
                    <p
                      contentEditable={!isReadOnly}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const newCards = [...cards];
                        newCards[i] = { ...newCards[i], desc: e.currentTarget.innerText };
                        onUpdateSlide({ cardItems: newCards });
                      }}
                    >
                      {c.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      case 'timeline': {
        const steps =
          slide.cardItems && slide.cardItems.length >= 4
            ? slide.cardItems
            : [
                { title: '需求定义', desc: '确立核心功能对标' },
                { title: '架构搭建', desc: '设计多标签与元素' },
                { title: '细节雕琢', desc: '完善交互与放映' },
                { title: '全面交付', desc: '测试通过稳定发布' },
              ];

        return (
          <div className="layout-body-timeline">
            <h1
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateSlide({ title: e.currentTarget.innerText })}
              className="slide-heading-editable"
            >
              {slide.title}
            </h1>
            <div className="timeline-horizontal">
              <div className="timeline-line" />
              {steps.map((st, i) => (
                <div key={i} className="timeline-step">
                  <div className="timeline-node">{i + 1}</div>
                  <strong
                    contentEditable={!isReadOnly}
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newSteps = [...steps];
                      newSteps[i] = { ...newSteps[i], title: e.currentTarget.innerText };
                      onUpdateSlide({ cardItems: newSteps });
                    }}
                  >
                    {st.title}
                  </strong>
                  <span
                    contentEditable={!isReadOnly}
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newSteps = [...steps];
                      newSteps[i] = { ...newSteps[i], desc: e.currentTarget.innerText };
                      onUpdateSlide({ cardItems: newSteps });
                    }}
                  >
                    {st.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'big-image':
        return (
          <div className="layout-body-big-image">
            <div className="image-left-content">
              <h1
                contentEditable={!isReadOnly}
                suppressContentEditableWarning
                onBlur={(e) => onUpdateSlide({ title: e.currentTarget.innerText })}
                className="slide-heading-editable"
              >
                {slide.title}
              </h1>
              <p
                contentEditable={!isReadOnly}
                suppressContentEditableWarning
                onBlur={(e) => onUpdateSlide({ body: e.currentTarget.innerText })}
                className="slide-body-editable"
              >
                {slide.body ||
                  '在此阐述关键方案或项目细节，配合右侧直观生动的图示展现，达到极佳的宣讲效果。'}
              </p>
            </div>
            <div className="image-right-frame">
              {slide.imageUrl ? (
                <img src={slide.imageUrl} alt="Slide illustration" />
              ) : (
                <div className="image-placeholder">
                  <FileText size={36} opacity={0.4} />
                  <span>可在设计或右侧面板设置配图</span>
                </div>
              )}
            </div>
          </div>
        );

      case 'quote':
        return (
          <div className="layout-body-quote">
            <span className="quote-mark">“</span>
            <blockquote
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateSlide({ body: e.currentTarget.innerText })}
            >
              {slide.body ||
                '在瞬息万变的技术浪潮中，精益求精的工匠精神与清晰严密的架构始终是构建伟大产品的基石。'}
            </blockquote>
            <cite
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateSlide({ title: e.currentTarget.innerText })}
            >
              —— {slide.title || '核心主讲人'}
            </cite>
          </div>
        );

      case 'blank':
        return <div className="layout-body-blank" />;

      case 'content':
      default:
        return (
          <div className="layout-body-content">
            <span className="slide-accent" />
            <h1
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateSlide({ title: e.currentTarget.innerText })}
              className="slide-heading-editable"
            >
              {slide.title}
            </h1>
            <p
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateSlide({ body: e.currentTarget.innerText })}
              className="slide-body-editable"
            >
              {slide.body}
            </p>
          </div>
        );
    }
  }

  // Render individual slide freeform element
  function renderElement(elem: SlideElement) {
    const isSelected = selectedElementId === elem.id && !isReadOnly;

    let content: React.ReactNode = null;
    if (elem.type === 'text') {
      const textElem = elem as SlideTextElement;
      content = (
        <div
          className="slide-elem-text"
          style={{
            fontSize: textElem.fontSize ? `${textElem.fontSize}px` : undefined,
            fontFamily: textElem.fontFamily,
            color: textElem.color,
            fontWeight: textElem.bold ? 700 : 400,
            fontStyle: textElem.italic ? 'italic' : 'normal',
            textDecoration: [
              textElem.underline ? 'underline' : '',
              textElem.strike ? 'line-through' : '',
            ]
              .filter(Boolean)
              .join(' '),
            textAlign: textElem.align || 'left',
            backgroundColor: textElem.fill,
          }}
          contentEditable={!isReadOnly}
          suppressContentEditableWarning
          onBlur={(e) => onUpdateElement(elem.id, { content: e.currentTarget.innerText })}
        >
          {textElem.content}
        </div>
      );
    } else if (elem.type === 'shape') {
      const shapeElem = elem as SlideShapeElement;
      content = (
        <div
          className={`slide-elem-shape shape-${shapeElem.kind}`}
          style={{
            backgroundColor: shapeElem.fill || '#2f855a',
            borderColor: shapeElem.border,
            borderWidth: shapeElem.borderWidth ? `${shapeElem.borderWidth}px` : undefined,
            borderStyle: shapeElem.border ? 'solid' : 'none',
            color: shapeElem.textColor || '#ffffff',
            opacity: shapeElem.opacity ?? 1,
          }}
        >
          {shapeElem.text && (
            <span
              contentEditable={!isReadOnly}
              suppressContentEditableWarning
              onBlur={(e) => onUpdateElement(elem.id, { text: e.currentTarget.innerText })}
            >
              {shapeElem.text}
            </span>
          )}
        </div>
      );
    } else if (elem.type === 'image') {
      const imgElem = elem as SlideImageElement;
      content = (
        <img
          src={imgElem.src}
          alt={imgElem.alt || ''}
          className="slide-elem-image"
          style={{
            borderRadius: imgElem.borderRadius ? `${imgElem.borderRadius}px` : undefined,
            borderColor: imgElem.border,
          }}
          draggable={false}
        />
      );
    } else if (elem.type === 'table') {
      const tblElem = elem as SlideTableElement;
      content = (
        <table className="slide-elem-table">
          <tbody>
            {tblElem.data.map((row, r) => (
              <tr key={r} className={r === 0 && tblElem.headerRow ? 'table-header-row' : ''}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    contentEditable={!isReadOnly}
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const nextData = tblElem.data.map((rowArr) => [...rowArr]);
                      nextData[r][c] = e.currentTarget.innerText;
                      onUpdateElement(elem.id, { data: nextData });
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    } else if (elem.type === 'chart') {
      const chartElem = elem as SlideChartElement;
      const maxVal = Math.max(...(chartElem.series[0]?.values ?? [100]), 1);

      content = (
        <div className="slide-elem-chart">
          {chartElem.title && <div className="chart-title">{chartElem.title}</div>}
          {chartElem.chartType === 'bar' && (
            <div className="chart-bars-wrap">
              {chartElem.categories.map((cat, i) => {
                const val = chartElem.series[0]?.values[i] ?? 0;
                const pct = Math.min(100, (val / maxVal) * 100);
                return (
                  <div key={i} className="bar-col">
                    <div className="bar-fill-track">
                      <div className="bar-fill" style={{ height: `${pct}%` }} />
                    </div>
                    <span className="bar-label">{cat}</span>
                    <small className="bar-val">{val}</small>
                  </div>
                );
              })}
            </div>
          )}

          {chartElem.chartType === 'line' && (
            <div className="chart-line-wrap">
              <svg viewBox="0 0 300 150" className="chart-svg">
                {(() => {
                  const pts = chartElem.categories.map((_, i) => {
                    const val = chartElem.series[0]?.values[i] ?? 0;
                    const x = 30 + i * (240 / Math.max(1, chartElem.categories.length - 1));
                    const y = 130 - (val / maxVal) * 100;
                    return `${x},${y}`;
                  });
                  return (
                    <>
                      <polyline
                        fill="none"
                        stroke="#2f855a"
                        strokeWidth="3"
                        points={pts.join(' ')}
                      />
                      {pts.map((pt, idx) => {
                        const [cx, cy] = pt.split(',');
                        return <circle key={idx} cx={cx} cy={cy} r="4" fill="#2f855a" />;
                      })}
                    </>
                  );
                })()}
              </svg>
            </div>
          )}

          {chartElem.chartType === 'pie' && (
            <div className="chart-pie-wrap">
              <div className="pie-legend">
                {chartElem.categories.map((cat, i) => (
                  <div key={i} className="pie-legend-item">
                    <span
                      className="legend-dot"
                      style={{
                        backgroundColor: ['#2f855a', '#3b82f6', '#d97706', '#881337', '#7c3aed'][
                          i % 5
                        ],
                      }}
                    />
                    <span>
                      {cat}: {chartElem.series[0]?.values[i] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={elem.id}
        className={`slide-element-box ${isSelected ? 'selected' : ''}`}
        style={{
          left: `${elem.x}%`,
          top: `${elem.y}%`,
          width: `${elem.width}%`,
          height: `${elem.height}%`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectElement(elem.id);
        }}
        onMouseDown={(e) => {
          if (isReadOnly || (e.target as HTMLElement).tagName === 'INPUT') return;
          // Start moving
          setDragState({
            elementId: elem.id,
            startX: e.clientX,
            startY: e.clientY,
            initX: elem.x,
            initY: elem.y,
            initW: elem.width,
            initH: elem.height,
            handle: 'move',
          });
        }}
      >
        {content}

        {/* 8-point Resize handles when selected */}
        {isSelected && (
          <div className="resize-handles-layer">
            {['tl', 'tr', 'bl', 'br', 'tm', 'bm', 'ml', 'mr'].map((h) => (
              <span
                key={h}
                className={`resize-handle handle-${h}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragState({
                    elementId: elem.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    initX: elem.x,
                    initY: elem.y,
                    initW: elem.width,
                    initH: elem.height,
                    handle: h,
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const zoomScale = viewSettings.zoom > 0 ? viewSettings.zoom : 1;

  return (
    <div
      className="slide-canvas-viewport"
      onClick={() => onSelectElement(null)}
      style={{
        transform: zoomScale !== 1 ? `scale(${zoomScale})` : undefined,
        transformOrigin: 'center center',
      }}
    >
      <div
        ref={containerRef}
        className={`slide-surface ${slide.theme} layout-${layout} ${viewSettings.showGrid ? 'grid-overlay' : ''}`}
        style={bgStyle}
      >
        {/* Render Layout Body */}
        {renderLayoutBody()}

        {/* Render Freeform Rich Elements */}
        {(slide.elements as SlideElement[])?.map(renderElement)}

        {/* Page Number */}
        <span className="slide-page-number">{String(pageIndex + 1).padStart(2, '0')}</span>
      </div>
    </div>
  );
}
