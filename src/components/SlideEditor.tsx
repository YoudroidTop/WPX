import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  SlideContent,
  Slide,
  SlideLayout,
  SlideTheme,
  SlideTransition,
} from '../../shared/documents';
import type { SlideRibbonTab, SlideViewSettings, SlideElement, ShapeKind } from './slide/types';
import SlideRibbon from './slide/SlideRibbon';
import SlideThumbnails from './slide/SlideThumbnails';
import SlideCanvas from './slide/SlideCanvas';
import SlideInspector from './slide/SlideInspector';
import SlideSorter from './slide/SlideSorter';
import SlidePresentation from './slide/SlidePresentation';
import { ImageModal, TableModal, ChartModal, IconPickerModal } from './slide/SlideModals';
import { Play, Grid, Eye } from 'lucide-react';

export default function SlideEditor({
  content,
  onChange,
}: {
  content: SlideContent;
  onChange: (content: SlideContent) => void;
}) {
  const [index, setIndex] = useState(0);
  const [currentTab, setCurrentTab] = useState<SlideRibbonTab>('home');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Undo / Redo history
  const [history, setHistory] = useState<SlideContent[]>([content]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false);

  // Modals state
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [iconModalOpen, setIconModalOpen] = useState(false);

  // Format painter state
  const [formatPainterActive, setFormatPainterActive] = useState(false);
  const copiedStyleRef = useRef<Record<string, unknown> | null>(null);

  // View settings
  const [viewSettings, setViewSettings] = useState<SlideViewSettings>({
    zoom: 0,
    showGrid: false,
    showRuler: false,
    showNotes: true,
    slideSorterOpen: false,
  });

  // Presentation state
  const [presentationState, setPresentationState] = useState<{
    isOpen: boolean;
    startIndex: number;
    presenterMode: boolean;
  }>({
    isOpen: false,
    startIndex: 0,
    presenterMode: false,
  });

  // Safe slide accessor
  const slide = content.slides[index] ?? content.slides[0];

  // Helper to commit changes and record history
  const commitChange = useCallback(
    (newContent: SlideContent) => {
      onChange(newContent);
      if (!isUndoRedoRef.current) {
        setHistory((prev) => {
          const truncated = prev.slice(0, historyIndex + 1);
          return [...truncated, newContent].slice(-50); // Keep last 50 edits
        });
        setHistoryIndex((prev) => Math.min(prev + 1, 49));
      }
    },
    [onChange, historyIndex],
  );

  // Undo / Redo operations
  function handleUndo() {
    if (historyIndex > 0) {
      isUndoRedoRef.current = true;
      const prevContent = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      onChange(prevContent);
      if (index >= prevContent.slides.length) {
        setIndex(prevContent.slides.length - 1);
      }
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 50);
    }
  }

  function handleRedo() {
    if (historyIndex < history.length - 1) {
      isUndoRedoRef.current = true;
      const nextContent = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      onChange(nextContent);
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 50);
    }
  }

  // Global hotkeys (Ctrl+Z, Ctrl+Y, F5, etc.)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F5') {
        e.preventDefault();
        setPresentationState({
          isOpen: true,
          startIndex: e.shiftKey ? index : 0,
          presenterMode: false,
        });
        return;
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        !['TEXTAREA', 'INPUT'].includes((e.target as HTMLElement).tagName)
      ) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index, historyIndex, history]);

  // Update current slide
  function updateSlide(patch: Partial<Slide>) {
    const updated = content.slides.map((s) => (s.id === slide.id ? { ...s, ...patch } : s));
    commitChange({ ...content, slides: updated });
  }

  // Update specific slide by index
  function updateSlideByIndex(targetIndex: number, patch: Partial<Slide>) {
    const updated = content.slides.map((s, i) => (i === targetIndex ? { ...s, ...patch } : s));
    commitChange({ ...content, slides: updated });
  }

  // Add new slide
  function addSlide(layout: SlideLayout = 'content', copy = false) {
    if (content.slides.length >= 100) return;
    const slides = [...content.slides];
    const newSlide: Slide = copy
      ? {
          ...slide,
          id: crypto.randomUUID(),
          title: `${slide.title} (副本)`,
          elements: slide.elements ? JSON.parse(JSON.stringify(slide.elements)) : undefined,
        }
      : {
          id: crypto.randomUUID(),
          title: layout === 'title' ? '从一个好想法开始' : '新主题与核心观点',
          body: layout === 'title' ? '在这里写下演讲副标题' : '写下详尽的内容要点…',
          notes: '',
          theme: slide.theme,
          layout,
        };

    slides.splice(index + 1, 0, newSlide);
    commitChange({ ...content, slides });
    setIndex(index + 1);
    setSelectedElementId(null);
  }

  // Delete slide
  function deleteSlide(targetIndex = index) {
    if (content.slides.length <= 1) return;
    const target = content.slides[targetIndex];
    const nextSlides = content.slides.filter((s) => s.id !== target.id);
    commitChange({ ...content, slides: nextSlides });
    setIndex(
      Math.max(0, Math.min(nextSlides.length - 1, targetIndex === index ? index - 1 : index)),
    );
    setSelectedElementId(null);
  }

  // Move slide
  function moveSlide(targetIndex: number, delta: number) {
    const nextIndex = targetIndex + delta;
    if (nextIndex < 0 || nextIndex >= content.slides.length) return;
    const slides = [...content.slides];
    [slides[targetIndex], slides[nextIndex]] = [slides[nextIndex], slides[targetIndex]];
    commitChange({ ...content, slides });
    setIndex(nextIndex);
  }

  // Element CRUD
  function addElement(element: SlideElement) {
    const currentElements = (slide.elements as SlideElement[]) || [];
    const nextElements = [...currentElements, element];
    updateSlide({ elements: nextElements });
    setSelectedElementId(element.id);
  }

  function updateElement(elemId: string, patch: Partial<SlideElement>) {
    const currentElements = (slide.elements as SlideElement[]) || [];
    const nextElements = currentElements.map((el) =>
      el.id === elemId ? ({ ...el, ...patch } as SlideElement) : el,
    );
    updateSlide({ elements: nextElements });
  }

  function deleteElement(elemId: string) {
    const currentElements = (slide.elements as SlideElement[]) || [];
    const nextElements = currentElements.filter((el) => el.id !== elemId);
    updateSlide({ elements: nextElements });
    if (selectedElementId === elemId) setSelectedElementId(null);
  }

  // Layer arrangement
  function handleArrange(action: 'front' | 'back' | 'forward' | 'backward') {
    if (!selectedElementId) return;
    const currentElements = [...((slide.elements as SlideElement[]) || [])];
    const elemIndex = currentElements.findIndex((el) => el.id === selectedElementId);
    if (elemIndex === -1) return;

    const [target] = currentElements.splice(elemIndex, 1);
    if (action === 'front') {
      currentElements.push(target);
    } else if (action === 'back') {
      currentElements.unshift(target);
    } else if (action === 'forward') {
      currentElements.splice(Math.min(currentElements.length, elemIndex + 1), 0, target);
    } else if (action === 'backward') {
      currentElements.splice(Math.max(0, elemIndex - 1), 0, target);
    }
    updateSlide({ elements: currentElements });
  }

  // Insert Text Box
  function handleInsertTextBox(mode: 'horizontal' | 'vertical' | 'metric' = 'horizontal') {
    if (mode === 'metric') {
      addElement({
        id: crypto.randomUUID(),
        type: 'text',
        content: '99.9%',
        x: 35,
        y: 40,
        width: 30,
        height: 18,
        fontSize: 48,
        bold: true,
        align: 'center',
        color: '#2f855a',
      });
    } else {
      addElement({
        id: crypto.randomUUID(),
        type: 'text',
        content: '点击输入文本',
        x: 30,
        y: 40,
        width: 40,
        height: 15,
        fontSize: 22,
        align: 'left',
      });
    }
  }

  // Insert Shape
  function handleInsertShape(kind: ShapeKind) {
    addElement({
      id: crypto.randomUUID(),
      type: 'shape',
      kind,
      x: 38,
      y: 35,
      width: 24,
      height: 22,
      fill: '#2f855a',
      textColor: '#ffffff',
      text: kind === 'callout' ? '要点' : '',
    });
  }

  // Insert Smart Card Modules
  function handleInsertCardModule(type: 'timeline' | 'cards' | 'quote') {
    if (type === 'timeline') {
      updateSlide({ layout: 'timeline' });
    } else if (type === 'cards') {
      updateSlide({ layout: 'three-card' });
    } else if (type === 'quote') {
      updateSlide({ layout: 'quote' });
    }
  }

  // Format painter toggle
  function handleToggleFormatPainter() {
    if (formatPainterActive) {
      setFormatPainterActive(false);
      copiedStyleRef.current = null;
    } else {
      setFormatPainterActive(true);
      // Copy current element or slide style
      const selectedElem = (slide.elements as SlideElement[])?.find(
        (el) => el.id === selectedElementId,
      );
      if (selectedElem) {
        copiedStyleRef.current = { ...selectedElem };
      }
    }
  }

  // Global theme application
  function handleApplyThemeToAll() {
    const updated = content.slides.map((s) => ({
      ...s,
      theme: slide.theme,
      background: slide.background,
    }));
    commitChange({ ...content, slides: updated });
  }

  // Global transition application
  function handleApplyTransitionToAll() {
    const updated = content.slides.map((s) => ({
      ...s,
      transition: slide.transition,
    }));
    commitChange({ ...content, slides: updated });
  }

  // Custom Background
  function handleCustomBackground(color: string, gradientEnd?: string) {
    updateSlide({
      background: gradientEnd
        ? { type: 'gradient', color, gradientEnd, gradientAngle: 135 }
        : { type: 'color', color },
    });
  }

  // Active element style attributes for ribbon
  const activeElem = (slide.elements as SlideElement[])?.find((el) => el.id === selectedElementId);
  const activeTextElem = activeElem?.type === 'text' ? (activeElem as any) : null;

  return (
    <div className="slides-editor">
      {/* Top WPS-Style Ribbon Toolbar */}
      <SlideRibbon
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onAddSlide={addSlide}
        onDuplicateSlide={() => addSlide(undefined, true)}
        onMoveSlide={(delta) => moveSlide(index, delta)}
        onDeleteSlide={() => deleteSlide(index)}
        canMoveUp={index > 0}
        canMoveDown={index < content.slides.length - 1}
        canDelete={content.slides.length > 1}
        canAdd={content.slides.length < 100}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        formatPainterActive={formatPainterActive}
        onToggleFormatPainter={handleToggleFormatPainter}
        activeFontFamily={activeTextElem?.fontFamily || ''}
        onFontFamilyChange={(font) => {
          if (selectedElementId) updateElement(selectedElementId, { fontFamily: font } as any);
        }}
        activeFontSize={activeTextElem?.fontSize || 22}
        onFontSizeChange={(size) => {
          if (selectedElementId) updateElement(selectedElementId, { fontSize: size } as any);
        }}
        onStepFontSize={(delta) => {
          if (selectedElementId && activeTextElem) {
            const nextSize = Math.max(10, Math.min(100, (activeTextElem.fontSize || 22) + delta));
            updateElement(selectedElementId, { fontSize: nextSize } as any);
          }
        }}
        activeBold={!!activeTextElem?.bold}
        onToggleBold={() => {
          if (selectedElementId && activeTextElem) {
            updateElement(selectedElementId, { bold: !activeTextElem.bold } as any);
          }
        }}
        activeItalic={!!activeTextElem?.italic}
        onToggleItalic={() => {
          if (selectedElementId && activeTextElem) {
            updateElement(selectedElementId, { italic: !activeTextElem.italic } as any);
          }
        }}
        activeUnderline={!!activeTextElem?.underline}
        onToggleUnderline={() => {
          if (selectedElementId && activeTextElem) {
            updateElement(selectedElementId, { underline: !activeTextElem.underline } as any);
          }
        }}
        activeStrike={!!activeTextElem?.strike}
        onToggleStrike={() => {
          if (selectedElementId && activeTextElem) {
            updateElement(selectedElementId, { strike: !activeTextElem.strike } as any);
          }
        }}
        activeColor={activeTextElem?.color || '#174c3b'}
        onColorChange={(color) => {
          if (selectedElementId) updateElement(selectedElementId, { color } as any);
        }}
        activeAlign={activeTextElem?.align || 'left'}
        onAlignChange={(align) => {
          if (selectedElementId) updateElement(selectedElementId, { align } as any);
        }}
        onLineSpacing={() => {}}
        onArrange={handleArrange}
        onInsertTextBox={handleInsertTextBox}
        onInsertShape={handleInsertShape}
        onOpenImageModal={() => setImageModalOpen(true)}
        onOpenTableModal={() => setTableModalOpen(true)}
        onOpenChartModal={() => setChartModalOpen(true)}
        onOpenIconModal={() => setIconModalOpen(true)}
        onInsertCardModule={handleInsertCardModule}
        ratio={content.ratio || '16:9'}
        onRatioChange={(ratio) => commitChange({ ...content, ratio })}
        currentTheme={slide.theme}
        onThemeChange={(theme) => updateSlide({ theme })}
        currentLayout={slide.layout}
        onLayoutChange={(layout) => updateSlide({ layout })}
        onApplyThemeToAll={handleApplyThemeToAll}
        onCustomBackground={handleCustomBackground}
        currentTransition={slide.transition || 'none'}
        onTransitionChange={(transition) => updateSlide({ transition })}
        onApplyTransitionToAll={handleApplyTransitionToAll}
        viewSettings={viewSettings}
        onViewSettingsChange={(patch) => setViewSettings((prev) => ({ ...prev, ...patch }))}
        onStartPresentation={(fromBeginning, presenterMode = false) => {
          setPresentationState({
            isOpen: true,
            startIndex: fromBeginning ? 0 : index,
            presenterMode,
          });
        }}
      />

      {/* Main Slides Body */}
      {viewSettings.slideSorterOpen ? (
        /* Slide Sorter Grid View */
        <SlideSorter
          slides={content.slides}
          currentIndex={index}
          onSelectSlide={setIndex}
          onAddSlide={addSlide}
          onDuplicateSlide={(i) => addSlide(undefined, true)}
          onMoveSlide={moveSlide}
          onDeleteSlide={deleteSlide}
          onClose={() => setViewSettings((prev) => ({ ...prev, slideSorterOpen: false }))}
        />
      ) : (
        /* Normal Editing Workspace */
        <div className="slides-body">
          {/* Left Thumbnails Sidebar */}
          <SlideThumbnails
            slides={content.slides}
            currentIndex={index}
            onSelectIndex={(i) => {
              setIndex(i);
              setSelectedElementId(null);
            }}
            onAddSlide={addSlide}
            onDuplicateSlide={(i) => addSlide(undefined, true)}
            onMoveSlide={moveSlide}
            onDeleteSlide={deleteSlide}
            onChangeLayout={(i, layout) => updateSlideByIndex(i, { layout })}
          />

          {/* Central Interactive Slide Stage */}
          <div className="slide-stage" onClick={() => setSelectedElementId(null)}>
            <SlideCanvas
              slide={slide}
              pageIndex={index}
              totalPages={content.slides.length}
              ratio={content.ratio || '16:9'}
              viewSettings={viewSettings}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              onUpdateSlide={updateSlide}
              onUpdateElement={updateElement}
              onDeleteElement={deleteElement}
            />

            {/* Optional Speaker Notes Box */}
            {viewSettings.showNotes && (
              <label className="slide-notes">
                演讲者备注
                <textarea
                  aria-label="演讲者备注"
                  value={slide.notes}
                  maxLength={10_000}
                  placeholder="记录演示放映时想说的话（放映时可在演讲者视图中呈现）…"
                  onChange={(e) => updateSlide({ notes: e.target.value })}
                />
              </label>
            )}
          </div>

          {/* Right Contextual Property Inspector */}
          <SlideInspector
            slide={slide}
            selectedElementId={selectedElementId}
            onUpdateSlide={updateSlide}
            onUpdateElement={updateElement}
            onDeleteElement={deleteElement}
            onOpenImageModal={() => setImageModalOpen(true)}
          />
        </div>
      )}

      {/* Status Bar */}
      <div className="editor-statusbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>
            幻灯片 {index + 1} / {content.slides.length}
          </span>
          <span>
            版式：
            {slide.layout
              ? slide.layout === 'title'
                ? '封面'
                : slide.layout === 'two-column'
                  ? '双栏'
                  : slide.layout === 'three-card'
                    ? '三列卡片'
                    : slide.layout === 'timeline'
                      ? '时间线'
                      : slide.layout === 'big-image'
                        ? '图文'
                        : slide.layout === 'quote'
                          ? '金句'
                          : slide.layout === 'blank'
                            ? '空白'
                            : '标准正文'
              : '标准正文'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="statusbar-toggle-btn"
            onClick={() =>
              setViewSettings((prev) => ({
                ...prev,
                slideSorterOpen: !prev.slideSorterOpen,
              }))
            }
            title="切换幻灯片大网格浏览视图"
          >
            <Grid size={14} />
            <span>{viewSettings.slideSorterOpen ? '返回普通视图' : '幻灯片浏览'}</span>
          </button>
          <span>{content.ratio === '4:3' ? '标屏 4:3' : '宽屏 16:9'}</span>
          <button
            className="statusbar-play-btn"
            onClick={() =>
              setPresentationState({
                isOpen: true,
                startIndex: index,
                presenterMode: false,
              })
            }
            title="开始幻灯片放映 (F5)"
          >
            <Play size={13} />
            <span>开始放映</span>
          </button>
        </div>
      </div>

      {/* Modals */}
      <ImageModal
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        onConfirm={(url) => {
          if (slide.layout === 'big-image') {
            updateSlide({ imageUrl: url });
          } else {
            addElement({
              id: crypto.randomUUID(),
              type: 'image',
              src: url,
              x: 30,
              y: 25,
              width: 40,
              height: 45,
              borderRadius: 6,
            });
          }
        }}
      />

      <TableModal
        isOpen={tableModalOpen}
        onClose={() => setTableModalOpen(false)}
        onConfirm={(rows, cols) => {
          const sampleData = Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) =>
              r === 0 ? `列标题 ${c + 1}` : `数据 ${r}-${c + 1}`,
            ),
          );
          addElement({
            id: crypto.randomUUID(),
            type: 'table',
            rows,
            cols,
            data: sampleData,
            headerRow: true,
            x: 20,
            y: 30,
            width: 60,
            height: 35,
          });
        }}
      />

      <ChartModal
        isOpen={chartModalOpen}
        onClose={() => setChartModalOpen(false)}
        onConfirm={(chartType, title, categories, values) => {
          addElement({
            id: crypto.randomUUID(),
            type: 'chart',
            chartType,
            title,
            categories,
            series: [{ name: '数值', values }],
            x: 25,
            y: 25,
            width: 50,
            height: 48,
          });
        }}
      />

      <IconPickerModal
        isOpen={iconModalOpen}
        onClose={() => setIconModalOpen(false)}
        onSelect={(iconName) => {
          addElement({
            id: crypto.randomUUID(),
            type: 'shape',
            kind: 'circle',
            fill: '#eaf1e9',
            textColor: '#174c3b',
            text: '★',
            x: 45,
            y: 40,
            width: 12,
            height: 18,
          });
        }}
      />

      {/* Fullscreen Presentation System */}
      {presentationState.isOpen && (
        <SlidePresentation
          slides={content.slides}
          initialIndex={presentationState.startIndex}
          initialPresenterMode={presentationState.presenterMode}
          ratio={content.ratio || '16:9'}
          onClose={() => setPresentationState((prev) => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>
  );
}
