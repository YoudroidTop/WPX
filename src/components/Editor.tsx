import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CloudCheck, CloudUpload, Download, Save, AlertCircle } from 'lucide-react';
import { api, downloadFile, downloadLocal } from '../api';
import { extensions, type CloudDocument, type DocumentContent } from '../../shared/documents';
import { KindIcon } from './ui';
const WordEditor = lazy(() => import('./WordEditor'));
import SheetEditor from './SheetEditor';
import SlideEditor from './SlideEditor';

export default function Editor({
  initial,
  onClose,
  notify,
}: {
  initial: CloudDocument;
  onClose: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [doc, setDoc] = useState(initial),
    [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const draft = useRef(initial),
    revision = useRef(initial.revision),
    generation = useRef(0),
    savedGeneration = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    inflight = useRef<Promise<boolean> | null>(null);
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (inflight.current) return inflight.current;
    const run = async () => {
      while (generation.current !== savedGeneration.current) {
        const current = draft.current,
          version = generation.current;
        if (!current.name.trim()) {
          setError('请输入文档名称后保存');
          setStatus('error');
          return false;
        }
        setStatus('saving');
        try {
          const saved = await api<CloudDocument>(`/documents/${current.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              revision: revision.current,
              name: current.name.trim(),
              content: current.content,
            }),
          });
          revision.current = saved.revision;
          savedGeneration.current = version;
        } catch (error) {
          setError((error as Error).message);
          setStatus('error');
          return false;
        }
      }
      setStatus('saved');
      setError('');
      return true;
    };
    const promise = run();
    inflight.current = promise;
    void promise.finally(() => {
      inflight.current = null;
    });
    return promise;
  }, []);
  function change(patch: Partial<CloudDocument>) {
    draft.current = { ...draft.current, ...patch };
    generation.current++;
    setDoc(draft.current);
    setStatus('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (generation.current !== savedGeneration.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        void flush();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', keyboard);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);
  async function close() {
    setBusy(true);
    if (await flush()) await onClose();
    setBusy(false);
  }
  async function exportFile() {
    setBusy(true);
    try {
      if (await flush()) await downloadFile(doc.id, draft.current.name, extensions[doc.kind]);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const updateContent = (content: DocumentContent) => change({ content });
  return (
    <div className={`editor-shell editor-${doc.kind}`}>
      <header className="editor-header">
        <button
          className="icon-button"
          aria-label="返回工作空间"
          disabled={busy}
          onClick={() => void close()}
        >
          <ArrowLeft size={20} />
        </button>
        <span className="editor-header-divider" />
        <KindIcon kind={doc.kind} small />
        <input
          className="document-title"
          aria-label="文档名称"
          value={doc.name}
          maxLength={100}
          onChange={(event) => change({ name: event.target.value })}
        />
        <span className={`save-status ${status}`} role="status">
          {status === 'saved' ? (
            <CloudCheck size={16} />
          ) : status === 'error' ? (
            <AlertCircle size={16} />
          ) : (
            <CloudUpload size={16} />
          )}
          <span>
            {status === 'saved'
              ? '已保存到云端'
              : status === 'saving'
                ? '正在保存…'
                : status === 'error'
                  ? '保存失败'
                  : '等待保存…'}
          </span>
        </span>
        <div className="editor-header-actions">
          <button className="secondary" onClick={() => void flush()} disabled={busy}>
            <Save size={15} />
            <span>保存</span>
          </button>
          <button
            className="secondary backup-button"
            onClick={() => downloadLocal(doc.name, draft.current.content)}
          >
            备份
          </button>
          <button className="primary" onClick={() => void exportFile()} disabled={busy}>
            <Download size={15} />
            <span>导出 {extensions[doc.kind].toUpperCase()}</span>
          </button>
        </div>
      </header>
      {error && (
        <div className="save-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}。修改仍保留在当前页面。</span>
          <button onClick={() => downloadLocal(doc.name, draft.current.content)}>
            下载本地备份
          </button>
          <button
            onClick={() => {
              downloadLocal(doc.name, draft.current.content);
              void onClose();
            }}
          >
            备份并返回
          </button>
        </div>
      )}
      <Suspense fallback={<div className="boot">正在加载编辑器…</div>}>
        {doc.content.type === 'word' ? (
          <WordEditor content={doc.content} onChange={updateContent} />
        ) : doc.content.type === 'sheet' ? (
          <SheetEditor content={doc.content} onChange={updateContent} />
        ) : (
          <SlideEditor content={doc.content} onChange={updateContent} />
        )}
      </Suspense>
    </div>
  );
}
