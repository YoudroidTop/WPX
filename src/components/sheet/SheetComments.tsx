import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { MAX_COMMENT_LENGTH, type SheetComment } from '../../../shared/documents';
import { Modal } from '../ui';

interface CommentModalProps {
  address: string;
  comment?: SheetComment;
  onClose: () => void;
  onSave: (text: string) => void;
}

/** Creates, edits or (by saving empty text / deleting) removes the comment of one cell. */
export function CommentModal({ address, comment, onClose, onSave }: CommentModalProps) {
  const [text, setText] = useState(comment?.text ?? '');
  return (
    <Modal title={comment ? `编辑批注 · ${address}` : `添加批注 · ${address}`} onClose={onClose}>
      <div className="insert-feature-modal">
        <label>
          批注内容
          <textarea
            autoFocus
            rows={5}
            className="csv-import-textarea"
            aria-label="批注内容"
            maxLength={MAX_COMMENT_LENGTH}
            value={text}
            placeholder="输入批注说明"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                onSave(text);
                onClose();
              }
            }}
          />
        </label>
        <p className="find-result-hint">
          {text.length} / {MAX_COMMENT_LENGTH}
        </p>
        <div className="modal-buttons">
          {comment && (
            <button
              className="secondary"
              type="button"
              onClick={() => {
                onSave('');
                onClose();
              }}
            >
              删除批注
            </button>
          )}
          <button className="secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => {
              onSave(text);
              onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface CommentBubbleProps {
  address: string;
  comment: SheetComment;
  grid: RefObject<HTMLDivElement | null>;
}

/**
 * Shows a comment next to its cell. Rendered into <body> with fixed positioning because
 * the grid's scroll container would otherwise clip it.
 */
export function CommentBubble({ address, comment, grid }: CommentBubbleProps) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const cell = grid.current?.querySelector<HTMLElement>(`td[data-cell="${address}"]`);
      const viewport = grid.current?.getBoundingClientRect();
      if (!cell || !viewport) return setPosition(null);
      const rect = cell.getBoundingClientRect();
      const visible =
        rect.right > viewport.left &&
        rect.left < viewport.right &&
        rect.bottom > viewport.top &&
        rect.top < viewport.bottom;
      if (!visible) return setPosition(null);
      const width = 240;
      const left =
        rect.right + 8 + width > window.innerWidth ? rect.left - width - 8 : rect.right + 8;
      setPosition({ left: Math.max(8, left), top: Math.max(8, rect.top) });
    }
    measure();
    const el = grid.current;
    el?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [address, comment, grid]);

  // Re-measure after layout-affecting changes such as zoom or row resizing.
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const observer = new ResizeObserver(() => el.dispatchEvent(new Event('scroll')));
    observer.observe(el);
    return () => observer.disconnect();
  }, [grid]);

  if (!position) return null;
  return createPortal(
    <div
      className="sheet-comment-bubble"
      role="note"
      aria-label={`${address} 的批注`}
      style={{ left: position.left, top: position.top }}
    >
      {comment.author && <strong>{comment.author}</strong>}
      <p>{comment.text}</p>
    </div>,
    document.body,
  );
}
