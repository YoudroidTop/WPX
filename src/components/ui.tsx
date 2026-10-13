import { useEffect, useRef, type ReactNode } from 'react';
import { FileText, Table2, Presentation, X } from 'lucide-react';
import type { DocumentKind } from '../../shared/documents';
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-symbol">
        z<span>·</span>
      </span>
      {!compact && (
        <span>
          卓乐<span className="brand-light">云文档</span>
        </span>
      )}
    </div>
  );
}
export function KindIcon({ kind, small = false }: { kind: DocumentKind; small?: boolean }) {
  const Icon = { word: FileText, sheet: Table2, slide: Presentation }[kind];
  return (
    <span className={`kind-icon ${kind} ${small ? 'small' : ''}`}>
      <Icon size={small ? 18 : 25} strokeWidth={1.7} />
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
