import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Copy,
  Trash2,
  Play,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { SlideContent, Slide } from '../../shared/documents';
export default function SlideEditor({
  content,
  onChange,
}: {
  content: SlideContent;
  onChange: (content: SlideContent) => void;
}) {
  const [index, setIndex] = useState(0),
    [presenting, setPresenting] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById('editor-header-tabs');
    setHeaderTarget(el);
  }, []);
  const slide = content.slides[index] ?? content.slides[0];
  useEffect(() => {
    if (!presenting) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresenting(false);
      if (['ArrowRight', ' ', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        setIndex((i) => Math.min(content.slides.length - 1, i + 1));
      }
      if (['ArrowLeft', 'ArrowUp'].includes(event.key)) setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [presenting, content.slides.length]);
  function update(patch: Partial<Slide>) {
    onChange({
      ...content,
      slides: content.slides.map((s) => (s.id === slide.id ? { ...s, ...patch } : s)),
    });
  }
  function add(copy = false) {
    const slides = [...content.slides];
    slides.splice(
      index + 1,
      0,
      copy
        ? { ...slide, id: crypto.randomUUID() }
        : {
            id: crypto.randomUUID(),
            title: '新的好想法',
            body: '写下你的内容',
            notes: '',
            theme: slide.theme,
          },
    );
    onChange({ ...content, slides });
    setIndex(index + 1);
  }
  function move(delta: number) {
    const slides = [...content.slides];
    [slides[index], slides[index + delta]] = [slides[index + delta], slides[index]];
    onChange({ ...content, slides });
    setIndex(index + delta);
  }
  const preview = (
    <div className={`slide-surface ${slide.theme}`}>
      <span className="slide-accent" />
      <h1>{slide.title}</h1>
      <p>{slide.body}</p>
      <span className="slide-page-number">{String(index + 1).padStart(2, '0')}</span>
    </div>
  );
  if (presenting)
    return (
      <div className="presentation" role="dialog" aria-modal="true" aria-label="幻灯片放映">
        <button
          autoFocus
          className="presentation-close"
          aria-label="退出放映"
          onClick={() => setPresenting(false)}
        >
          <X size={22} />
        </button>
        <div className="presentation-stage">
          <div className="presentation-frame">{preview}</div>
        </div>
        <div className="presentation-controls">
          <button aria-label="上一页" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            <ChevronLeft />
          </button>
          <span>
            {index + 1} / {content.slides.length}
          </span>
          <button
            aria-label="下一页"
            disabled={index === content.slides.length - 1}
            onClick={() => setIndex(index + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    );

  const tools = (
    <div className="header-ribbon-tabs slide-header-tabs">
      <button
        type="button"
        className="header-tab-btn"
        disabled={content.slides.length >= 100}
        onClick={() => add()}
      >
        <Plus size={15} />
        <span>新建幻灯片</span>
      </button>
      <button
        type="button"
        className="header-tab-btn"
        disabled={content.slides.length >= 100}
        onClick={() => add(true)}
      >
        <Copy size={15} />
        <span>复制</span>
      </button>
      <button
        type="button"
        className="header-tab-btn"
        disabled={index === 0}
        aria-label="幻灯片上移"
        onClick={() => move(-1)}
      >
        <ArrowUp size={15} />
      </button>
      <button
        type="button"
        className="header-tab-btn"
        disabled={index === content.slides.length - 1}
        aria-label="幻灯片下移"
        onClick={() => move(1)}
      >
        <ArrowDown size={15} />
      </button>
      <button
        type="button"
        className="header-tab-btn"
        disabled={content.slides.length === 1}
        onClick={() => {
          onChange({ ...content, slides: content.slides.filter((s) => s.id !== slide.id) });
          setIndex(Math.max(0, index - 1));
        }}
      >
        <Trash2 size={15} />
        <span>删除</span>
      </button>
      <span style={{ width: 1, height: 16, background: '#dce4d5', margin: '0 2px' }} />
      <button
        type="button"
        className="header-tab-btn play-button"
        onClick={() => setPresenting(true)}
      >
        <Play size={15} />
        <span>开始放映</span>
      </button>
    </div>
  );

  return (
    <div className="slides-editor">
      {headerTarget ? (
        createPortal(tools, headerTarget)
      ) : (
        <div className="editor-toolbar">{tools}</div>
      )}
      <div className="slides-body">
        <aside className="slide-thumbnails" aria-label="幻灯片列表">
          {content.slides.map((item, i) => (
            <button
              key={item.id}
              className={index === i ? 'active' : ''}
              aria-label={`第 ${i + 1} 页 ${item.title}`}
              onClick={() => setIndex(i)}
            >
              <span>{i + 1}</span>
              <div className={`slide-thumbnail ${item.theme}`}>
                <strong>{item.title || '未命名'}</strong>
                <i />
              </div>
            </button>
          ))}
        </aside>
        <div className="slide-stage">
          {preview}
          <label className="slide-notes">
            演讲者备注
            <textarea
              aria-label="演讲者备注"
              value={slide.notes}
              maxLength={10_000}
              placeholder="记录演讲时想说的话…"
              onChange={(e) => update({ notes: e.target.value })}
            />
          </label>
        </div>
        <aside className="slide-inspector">
          <h3>幻灯片内容</h3>
          <label>
            标题
            <textarea
              aria-label="幻灯片标题"
              value={slide.title}
              maxLength={500}
              rows={3}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <label>
            正文
            <textarea
              aria-label="幻灯片正文"
              value={slide.body}
              maxLength={10_000}
              rows={8}
              onChange={(e) => update({ body: e.target.value })}
            />
          </label>
          <label>主题配色</label>
          <div className="theme-options">
            {(['forest', 'paper', 'midnight'] as const).map((theme, i) => (
              <button
                key={theme}
                className={`theme-swatch ${theme} ${slide.theme === theme ? 'active' : ''}`}
                aria-label={['森绿主题', '纸白主题', '午夜主题'][i]}
                aria-pressed={slide.theme === theme}
                onClick={() => update({ theme })}
              >
                Aa
              </button>
            ))}
          </div>
          <p className="muted">内容实时保存。导出 PPTX 后可在 Office 或 WPS 中继续编辑。</p>
        </aside>
      </div>
      <div className="editor-statusbar">
        <span>
          幻灯片 {index + 1} / {content.slides.length}
        </span>
        <span>宽屏 16:9</span>
      </div>
    </div>
  );
}
