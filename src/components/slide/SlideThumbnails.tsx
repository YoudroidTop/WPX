import { useState } from 'react';
import { Plus, Copy, Trash2, ArrowUp, ArrowDown, ChevronDown, MoreVertical } from 'lucide-react';
import type { Slide, SlideLayout } from './types';
import { THEME_PRESETS, LAYOUT_PRESETS } from './types';
import { LayoutPickerDropdown } from './SlideModals';

interface SlideThumbnailsProps {
  slides: Slide[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  onAddSlide: (layout?: SlideLayout) => void;
  onDuplicateSlide: (index: number) => void;
  onMoveSlide: (index: number, delta: number) => void;
  onDeleteSlide: (index: number) => void;
  onChangeLayout: (index: number, layout: SlideLayout) => void;
}

export default function SlideThumbnails({
  slides,
  currentIndex,
  onSelectIndex,
  onAddSlide,
  onDuplicateSlide,
  onMoveSlide,
  onDeleteSlide,
  onChangeLayout,
}: SlideThumbnailsProps) {
  const [layoutDropdownOpen, setLayoutDropdownOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);

  return (
    <aside
      className="slide-thumbnails"
      aria-label="幻灯片列表"
      onClick={() => setContextMenu(null)}
    >
      {/* Top Add Slide Button with Layout Dropdown */}
      <div className="thumbnails-top-bar">
        <button
          type="button"
          className="thumbnail-add-btn"
          disabled={slides.length >= 100}
          onClick={() => setLayoutDropdownOpen((v) => !v)}
          title="新建幻灯片"
        >
          <Plus size={15} />
          <span>新建页面</span>
          <ChevronDown size={12} />
        </button>

        {layoutDropdownOpen && (
          <LayoutPickerDropdown
            onSelect={(l) => {
              onAddSlide(l);
              setLayoutDropdownOpen(false);
            }}
            onClose={() => setLayoutDropdownOpen(false)}
          />
        )}
      </div>

      {/* Slide Thumbnail List */}
      <div className="thumbnails-scroll-list">
        {slides.map((item, i) => {
          const isActive = currentIndex === i;
          const themeObj = THEME_PRESETS.find((t) => t.id === item.theme) ?? THEME_PRESETS[0];

          let bg = themeObj.bg;
          if (item.background?.type === 'gradient') {
            bg = `linear-gradient(${item.background.gradientAngle || 135}deg, ${item.background.color}, ${item.background.gradientEnd || '#ffffff'})`;
          } else if (item.background?.type === 'color') {
            bg = item.background.color;
          }

          return (
            <div
              key={item.id}
              className={`thumbnail-row ${isActive ? 'active' : ''}`}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ index: i, x: e.clientX, y: e.clientY });
              }}
            >
              <button
                type="button"
                className="thumbnail-card-btn"
                aria-label={`第 ${i + 1} 页 ${item.title}`}
                onClick={() => onSelectIndex(i)}
              >
                <span className="thumbnail-index">{i + 1}</span>
                <div className="slide-thumbnail" style={{ background: bg, color: themeObj.text }}>
                  <strong className="thumb-title">{item.title || '未命名'}</strong>
                  <span className="thumb-snippet">{item.body ? item.body.slice(0, 30) : ''}</span>
                  {item.elements && item.elements.length > 0 && (
                    <span className="thumb-tag">{item.elements.length} 元素</span>
                  )}
                </div>
              </button>

              {/* Hover Quick Actions */}
              <div className="thumbnail-hover-actions">
                <button
                  className="thumb-mini-btn"
                  title="复制"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicateSlide(i);
                  }}
                >
                  <Copy size={11} />
                </button>
                <button
                  className="thumb-mini-btn danger"
                  disabled={slides.length <= 1}
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSlide(i);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right Click Context Menu */}
      {contextMenu && (
        <div
          className="slide-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              onAddSlide();
              setContextMenu(null);
            }}
          >
            <Plus size={13} /> 新建幻灯片
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              onDuplicateSlide(contextMenu.index);
              setContextMenu(null);
            }}
          >
            <Copy size={13} /> 复制幻灯片
          </button>
          <button
            className="context-menu-item"
            disabled={contextMenu.index === 0}
            onClick={() => {
              onMoveSlide(contextMenu.index, -1);
              setContextMenu(null);
            }}
          >
            <ArrowUp size={13} /> 上移一层
          </button>
          <button
            className="context-menu-item"
            disabled={contextMenu.index === slides.length - 1}
            onClick={() => {
              onMoveSlide(contextMenu.index, 1);
              setContextMenu(null);
            }}
          >
            <ArrowDown size={13} /> 下移一层
          </button>
          <hr className="context-menu-divider" />
          <div className="context-menu-submenu-title">更改版式：</div>
          <div className="context-submenu-grid">
            {LAYOUT_PRESETS.map((lp) => (
              <button
                key={lp.id}
                className="context-layout-btn"
                onClick={() => {
                  onChangeLayout(contextMenu.index, lp.id);
                  setContextMenu(null);
                }}
              >
                {lp.name}
              </button>
            ))}
          </div>
          <hr className="context-menu-divider" />
          <button
            className="context-menu-item danger"
            disabled={slides.length <= 1}
            onClick={() => {
              onDeleteSlide(contextMenu.index);
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} /> 删除幻灯片
          </button>
        </div>
      )}
    </aside>
  );
}
