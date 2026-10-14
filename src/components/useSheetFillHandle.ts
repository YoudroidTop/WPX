import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { SheetPage } from '../../shared/documents';
import { extendSheetRange, fillTarget } from '../../shared/sheet-fill';
import { parseSelection, selectionLabel, type SheetSelection } from '../../shared/sheet-selection';

export function useSheetFillHandle({
  sheet,
  selection,
  grid,
  onApply,
  onError,
}: {
  sheet: SheetPage;
  selection: SheetSelection;
  grid: RefObject<HTMLDivElement | null>;
  onApply: (sheet: SheetPage, selection: SheetSelection) => void;
  onError: () => void;
}) {
  const [preview, setPreview] = useState<SheetSelection | null>(null);
  const gesture = useRef<{
    source: SheetSelection;
    target: SheetSelection;
    x: number;
    y: number;
    pointer: number;
    element: HTMLButtonElement;
    frame: number;
  } | null>(null);
  function cancel() {
    const active = gesture.current;
    gesture.current = null;
    if (active) {
      cancelAnimationFrame(active.frame);
      if (active.element.hasPointerCapture(active.pointer))
        active.element.releasePointerCapture(active.pointer);
    }
    setPreview(null);
  }
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', cancel);
      if (gesture.current) cancelAnimationFrame(gesture.current.frame);
    };
  }, []);
  function updateTarget(scroll = false) {
    const active = gesture.current,
      container = grid.current;
    if (!active || !container) return;
    const rect = container.getBoundingClientRect();
    const dx = active.x > rect.right - 24 ? 14 : active.x < rect.left + 24 ? -14 : 0;
    const dy = active.y > rect.bottom - 24 ? 14 : active.y < rect.top + 24 ? -14 : 0;
    if (scroll && (dx || dy)) container.scrollBy(dx, dy);
    const x = Math.min(rect.right - 18, Math.max(rect.left + 46, active.x));
    const y = Math.min(rect.bottom - 18, Math.max(rect.top + 31, active.y));
    const cell = document.elementFromPoint(x, y)?.closest('td[data-cell]');
    if (cell && container.contains(cell)) {
      const point = parseSelection(cell.getAttribute('data-cell') ?? '')?.anchor;
      if (point) {
        const target = fillTarget(active.source, point);
        if (selectionLabel(target) !== selectionLabel(active.target)) {
          active.target = target;
          setPreview(target);
        }
      }
    }
  }
  function tick() {
    updateTarget(true);
    if (gesture.current) gesture.current.frame = requestAnimationFrame(tick);
  }
  return {
    preview,
    handleProps: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || !event.isPrimary || gesture.current) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {
          source: selection,
          target: selection,
          x: event.clientX,
          y: event.clientY,
          pointer: event.pointerId,
          element: event.currentTarget,
          frame: 0,
        };
        setPreview(selection);
        gesture.current.frame = requestAnimationFrame(tick);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        if (!gesture.current || gesture.current.pointer !== event.pointerId) return;
        gesture.current.x = event.clientX;
        gesture.current.y = event.clientY;
        updateTarget();
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        event.stopPropagation();
        const active = gesture.current;
        if (!active || active.pointer !== event.pointerId) return;
        active.x = event.clientX;
        active.y = event.clientY;
        updateTarget();
        cancel();
        if (selectionLabel(active.source) === selectionLabel(active.target)) return;
        try {
          onApply(extendSheetRange(sheet, active.source, active.target), active.target);
        } catch {
          onError();
        }
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
    },
  };
}
