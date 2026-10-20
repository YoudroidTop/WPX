import { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Tv,
  PenTool,
  Eraser,
  Flame,
  Clock,
  RotateCcw,
} from 'lucide-react';
import type { Slide, DrawingStroke } from './types';
import SlideCanvas from './SlideCanvas';

interface SlidePresentationProps {
  slides: Slide[];
  initialIndex: number;
  initialPresenterMode?: boolean;
  ratio: '16:9' | '4:3';
  onClose: () => void;
}

export default function SlidePresentation({
  slides,
  initialIndex,
  initialPresenterMode = false,
  ratio,
  onClose,
}: SlidePresentationProps) {
  const [index, setIndex] = useState(initialIndex);
  const [presenterMode, setPresenterMode] = useState(initialPresenterMode);
  const [laserActive, setLaserActive] = useState(false);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [penActive, setPenActive] = useState(false);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [blankMode, setBlankMode] = useState<'none' | 'black' | 'white'>('none');
  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const currentSlide = slides[index] ?? slides[0];
  const nextSlide = slides[index + 1] ?? null;

  // Presentation Timer
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  function formatTime(totalSec: number) {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Keyboard navigation & shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (blankMode !== 'none') {
          setBlankMode('none');
          return;
        }
        onClose();
      } else if (['ArrowRight', ' ', 'ArrowDown', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        setIndex((i) => Math.min(slides.length - 1, i + 1));
        setBlankMode('none');
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
        setBlankMode('none');
      } else if (e.key.toLowerCase() === 'b') {
        setBlankMode((m) => (m === 'black' ? 'none' : 'black'));
      } else if (e.key.toLowerCase() === 'w') {
        setBlankMode((m) => (m === 'white' ? 'none' : 'white'));
      } else if (e.key.toLowerCase() === 'l') {
        setLaserActive((l) => !l);
        setPenActive(false);
      } else if (e.key.toLowerCase() === 'p') {
        setPenActive((p) => !p);
        setLaserActive(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blankMode, onClose, slides.length]);

  // Mouse move for laser pointer
  function handleStageMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!laserActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setLaserPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  // Drawing handlers
  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (!penActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setStrokes((prev) => [...prev, { color: '#e11d48', size: 3, points: [{ x, y }] }]);
  }

  function handleDrawingMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!penActive || !isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStrokes((prev) => {
      const next = [...prev];
      const current = next[next.length - 1];
      if (current) {
        current.points.push({ x, y });
      }
      return next;
    });
  }

  function handleMouseUp() {
    setIsDrawing(false);
  }

  // Touch Swipe for Mobile Navigation
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (penActive) return; // Allow pen drawing without triggering slide navigation
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (penActive || !touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Must be predominantly horizontal swipe and within reasonable time
    if (deltaTime < 600 && Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0) {
        // Swipe left -> Next slide
        setIndex((i) => Math.min(slides.length - 1, i + 1));
        setBlankMode('none');
      } else {
        // Swipe right -> Previous slide
        setIndex((i) => Math.max(0, i - 1));
        setBlankMode('none');
      }
    }
  }

  // Slide transition effect class
  const transitionClass = `trans-${currentSlide.transition || 'fade'}`;

  return (
    <div
      className={`presentation ${presenterMode ? 'presenter-view-mode' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="幻灯片放映"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Blank screen overlay (B / W key) */}
      {blankMode !== 'none' && (
        <div
          className={`presentation-blank-screen ${blankMode}`}
          onClick={() => setBlankMode('none')}
        >
          <span>按任意键或点击退出{blankMode === 'black' ? '黑屏' : '白屏'}模式</span>
        </div>
      )}

      {/* Top action bar */}
      <div className="presentation-top-bar">
        <div className="presentation-info">
          <span className="presentation-timer">
            <Clock size={14} /> 演讲时长: {formatTime(seconds)}
          </span>
          <button className="timer-reset-btn" onClick={() => setSeconds(0)} title="重置计时器">
            <RotateCcw size={12} />
          </button>
        </div>

        <div className="presentation-tools">
          <button
            className={`tool-btn ${laserActive ? 'active' : ''}`}
            onClick={() => {
              setLaserActive((l) => !l);
              setPenActive(false);
            }}
            title="激光笔 (L 键)"
          >
            <Flame size={16} /> 激光笔
          </button>
          <button
            className={`tool-btn ${penActive ? 'active' : ''}`}
            onClick={() => {
              setPenActive((p) => !p);
              setLaserActive(false);
            }}
            title="画笔标注 (P 键)"
          >
            <PenTool size={16} /> 画笔
          </button>
          {strokes.length > 0 && (
            <button className="tool-btn" onClick={() => setStrokes([])} title="清除所有标注涂鸦">
              <Eraser size={16} /> 清除标注
            </button>
          )}
          <button
            className={`tool-btn ${presenterMode ? 'active' : ''}`}
            onClick={() => setPresenterMode((m) => !m)}
            title="切换演讲者双屏模式"
          >
            <Tv size={16} /> 演讲者视图
          </button>
        </div>

        <button
          className="presentation-close"
          aria-label="退出放映"
          onClick={onClose}
          title="退出放映 (Esc)"
        >
          <X size={20} />
        </button>
      </div>

      {/* Main Presentation Stage */}
      {presenterMode ? (
        /* Presenter Dual View: Main Screen + Next Preview + Notes */
        <div className="presenter-grid-stage">
          <div className="presenter-main-column">
            <div className="presenter-current-slide-frame">
              <div className={`presentation-frame ${transitionClass}`}>
                <SlideCanvas
                  slide={currentSlide}
                  pageIndex={index}
                  totalPages={slides.length}
                  ratio={ratio}
                  viewSettings={{
                    zoom: 0,
                    showGrid: false,
                    showRuler: false,
                    showNotes: false,
                    slideSorterOpen: false,
                  }}
                  selectedElementId={null}
                  onSelectElement={() => {}}
                  onUpdateSlide={() => {}}
                  onUpdateElement={() => {}}
                  onDeleteElement={() => {}}
                  isReadOnly
                />
              </div>
            </div>
            <div className="presenter-current-label">
              当前幻灯片 · 第 {index + 1} / {slides.length} 页
            </div>
          </div>

          <div className="presenter-sidebar-column">
            {/* Next Slide Preview */}
            <div className="next-slide-box">
              <div className="next-slide-header">下一页预告：</div>
              {nextSlide ? (
                <div className="next-slide-frame">
                  <SlideCanvas
                    slide={nextSlide}
                    pageIndex={index + 1}
                    totalPages={slides.length}
                    ratio={ratio}
                    viewSettings={{
                      zoom: 0,
                      showGrid: false,
                      showRuler: false,
                      showNotes: false,
                      slideSorterOpen: false,
                    }}
                    selectedElementId={null}
                    onSelectElement={() => {}}
                    onUpdateSlide={() => {}}
                    onUpdateElement={() => {}}
                    onDeleteElement={() => {}}
                    isReadOnly
                  />
                </div>
              ) : (
                <div className="no-next-slide">已经是最后一页</div>
              )}
            </div>

            {/* Speaker Notes */}
            <div className="presenter-notes-box">
              <div className="notes-header">演讲者备注：</div>
              <div className="notes-body">
                {currentSlide.notes ? (
                  <p>{currentSlide.notes}</p>
                ) : (
                  <span className="no-notes">当前页暂无演讲备注</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Fullscreen Stage */
        <div
          className="presentation-stage"
          onMouseMove={handleStageMouseMove}
          onMouseLeave={() => setLaserPos(null)}
        >
          <div className={`presentation-frame ${transitionClass}`}>
            <SlideCanvas
              slide={currentSlide}
              pageIndex={index}
              totalPages={slides.length}
              ratio={ratio}
              viewSettings={{
                zoom: 0,
                showGrid: false,
                showRuler: false,
                showNotes: false,
                slideSorterOpen: false,
              }}
              selectedElementId={null}
              onSelectElement={() => {}}
              onUpdateSlide={() => {}}
              onUpdateElement={() => {}}
              onDeleteElement={() => {}}
              isReadOnly
            />

            {/* Laser pointer dot */}
            {laserActive && laserPos && (
              <div
                className="presentation-laser-dot"
                style={{ left: laserPos.x, top: laserPos.y }}
              />
            )}

            {/* Drawing overlay */}
            <svg
              className={`presentation-draw-layer ${penActive ? 'active' : ''}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleDrawingMove}
              onMouseUp={handleMouseUp}
            >
              {strokes.map((stroke, sIdx) => {
                const pathStr = stroke.points
                  .map((p, pIdx) => `${pIdx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                  .join(' ');
                return (
                  <path
                    key={sIdx}
                    d={pathStr}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth={stroke.size}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      <div className="presentation-controls">
        <button
          aria-label="上一页"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          title="上一页 (Left Arrow)"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="presentation-page-indicator">
          {index + 1} / {slides.length}
        </span>
        <button
          aria-label="下一页"
          disabled={index === slides.length - 1}
          onClick={() => setIndex(index + 1)}
          title="下一页 (Right Arrow / Space)"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
