import { Plus, Copy, Trash2, ArrowUp, ArrowDown, Eye, X } from 'lucide-react';
import type { Slide, SlideLayout } from './types';
import { THEME_PRESETS } from './types';

interface SlideSorterProps {
  slides: Slide[];
  currentIndex: number;
  onSelectSlide: (index: number) => void;
  onAddSlide: (layout?: SlideLayout) => void;
  onDuplicateSlide: (index: number) => void;
  onMoveSlide: (index: number, delta: number) => void;
  onDeleteSlide: (index: number) => void;
  onClose: () => void;
}

export default function SlideSorter({
  slides,
  currentIndex,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onMoveSlide,
  onDeleteSlide,
  onClose,
}: SlideSorterProps) {
  return (
    <div className="slide-sorter-container" role="dialog" aria-label="幻灯片浏览大视图">
      <div className="slide-sorter-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2>幻灯片浏览</h2>
          <span className="sorter-badge">共 {slides.length} 页</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="secondary"
            onClick={() => onAddSlide()}
            disabled={slides.length >= 100}
          >
            <Plus size={15} />
            <span>新建幻灯片</span>
          </button>
          <button className="primary" onClick={onClose}>
            <Eye size={15} />
            <span>返回普通视图</span>
          </button>
        </div>
      </div>

      <div className="slide-sorter-grid">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          const themeObj = THEME_PRESETS.find((t) => t.id === slide.theme) ?? THEME_PRESETS[0];

          let bg = themeObj.bg;
          if (slide.background?.type === 'gradient') {
            bg = `linear-gradient(${slide.background.gradientAngle || 135}deg, ${slide.background.color}, ${slide.background.gradientEnd || '#ffffff'})`;
          } else if (slide.background?.type === 'color') {
            bg = slide.background.color;
          }

          return (
            <div
              key={slide.id}
              className={`sorter-card ${isActive ? 'active' : ''}`}
              onClick={() => onSelectSlide(index)}
              onDoubleClick={() => {
                onSelectSlide(index);
                onClose();
              }}
            >
              <div className="sorter-card-preview" style={{ background: bg, color: themeObj.text }}>
                <span className="mini-page-num">{String(index + 1).padStart(2, '0')}</span>
                <strong className="mini-title">{slide.title || '未命名幻灯片'}</strong>
                <p className="mini-body">{slide.body || '无正文'}</p>
                {slide.elements && slide.elements.length > 0 && (
                  <span className="mini-elements-badge">{slide.elements.length} 个元素</span>
                )}
              </div>

              <div className="sorter-card-footer">
                <span className="sorter-card-number">第 {index + 1} 页</span>
                <div className="sorter-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-action-btn"
                    disabled={index === 0}
                    onClick={() => onMoveSlide(index, -1)}
                    title="前移"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="icon-action-btn"
                    disabled={index === slides.length - 1}
                    onClick={() => onMoveSlide(index, 1)}
                    title="后移"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    className="icon-action-btn"
                    onClick={() => onDuplicateSlide(index)}
                    title="复制"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="icon-action-btn danger"
                    disabled={slides.length <= 1}
                    onClick={() => onDeleteSlide(index)}
                    title="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
