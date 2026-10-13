import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CloudCheck, CloudUpload, Download, Save, AlertCircle } from 'lucide-react';
import { api, downloadFile, downloadLocal, RequestError } from '../api';
import { extensions, type CloudDocument, type DocumentContent } from '../../shared/documents';
import { KindIcon } from './ui';
import { draftScope, persistDraft, readDraft, removeDraft, type LocalDraft } from '../cache';
import { isNative, nativeCommand } from '../platform';
const WordEditor = lazy(() => import('./WordEditor'));
import SheetEditor from './SheetEditor';
import SlideEditor from './SlideEditor';

function EditorSession({
  initial,
  onClose,
  notify,
  recovered,
}: {
  recovered?: LocalDraft;
  initial: CloudDocument;
  onClose: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [doc, setDoc] = useState(initial),
    [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'local'>(
      recovered ? 'dirty' : 'saved',
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const draft = useRef(initial),
    revision = useRef(initial.revision),
    generation = useRef(recovered ? 1 : 0),
    savedGeneration = useRef(0);
  const localScope = useRef(draftScope());
  const pendingLocal = useRef<{ snapshot: LocalDraft; version: number } | null>(null);
  const writingLocal = useRef(false);
  const persistedGeneration = useRef(recovered ? 1 : 0),
    snapshotToken = useRef(recovered?.token ?? crypto.randomUUID()),
    pendingWrite = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    inflight = useRef<Promise<boolean> | null>(null);
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (inflight.current) return inflight.current;
    const run = async () => {
      while (generation.current !== savedGeneration.current) {
        const current = draft.current,
          version = generation.current,
          token = snapshotToken.current;
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
          await pendingWrite.current.catch(() => {});
          await removeDraft(current.id, token, localScope.current).catch(() => {});
        } catch (error) {
          if (isNative && error instanceof RequestError && error.status === 0) {
            try {
              await pendingWrite.current;
              if (persistedGeneration.current === generation.current) {
                setStatus('local');
                setError('');
                return true;
              }
            } catch {
              /* Keep the editor open if durable local persistence failed. */
            }
          }
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
    const version = generation.current,
      token = crypto.randomUUID();
    snapshotToken.current = token;
    const snapshot = {
      document: draft.current,
      baseRevision: revision.current,
      savedAt: Date.now(),
      token,
    };
    if (isNative) {
      pendingLocal.current = { snapshot, version };
      if (!writingLocal.current) {
        writingLocal.current = true;
        pendingWrite.current = (async () => {
          while (pendingLocal.current) {
            const latest = pendingLocal.current;
            pendingLocal.current = null;
            await persistDraft(latest.snapshot, localScope.current);
            persistedGeneration.current = latest.version;
          }
        })().finally(() => {
          writingLocal.current = false;
        });
      }
    }
    void pendingWrite.current.catch(() => {
      setError('本地草稿保存失败，请联网保存或下载备份');
    });
    setDoc(draft.current);
    setStatus('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        generation.current !== savedGeneration.current &&
        (!isNative || generation.current !== persistedGeneration.current)
      ) {
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
  useEffect(() => {
    if (recovered) void flush();
    const online = () => {
      void flush();
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [flush]);
  const commands = useRef({
    flush,
    close,
    exportFile,
    backup: () => downloadLocal(doc.name, draft.current.content),
  });
  commands.current = {
    flush,
    close,
    exportFile,
    backup: () => downloadLocal(doc.name, draft.current.content),
  };
  useEffect(
    () =>
      nativeCommand((command) => {
        if (command === 'back') void commands.current.close();
        if (command === 'save') void commands.current.flush();
        if (command === 'export') void commands.current.exportFile();
        if (command === 'backup')
          void commands.current.backup().catch((error) => notify(error.message));
        if (command.startsWith('new-') || command === 'open')
          notify('请先返回工作空间，再打开或新建其他文档');
      }),
    [notify],
  );
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
              : status === 'local'
                ? '已保存到此设备 · 待同步'
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
            onClick={() =>
              void downloadLocal(doc.name, draft.current.content).catch((error) =>
                notify(error.message),
              )
            }
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
          <button
            onClick={() =>
              void downloadLocal(doc.name, draft.current.content).catch((error) =>
                notify(error.message),
              )
            }
          >
            下载本地备份
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const snapshot = draft.current,
                  token = snapshotToken.current,
                  version = generation.current;
                await pendingWrite.current.catch(() => {});
                await api('/documents', {
                  method: 'POST',
                  body: JSON.stringify({
                    kind: doc.kind,
                    name: `${snapshot.name.slice(0, 94)} 副本`,
                    content: snapshot.content,
                  }),
                });
                await removeDraft(doc.id, token, localScope.current);
                notify('本地修改已保存为新的云端副本');
                if (generation.current === version) await onClose();
              } catch (error) {
                notify((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            另存为云端副本
          </button>
          <button
            onClick={async () => {
              try {
                const version = generation.current;
                if (
                  (await downloadLocal(doc.name, draft.current.content)) &&
                  generation.current === version
                )
                  await onClose();
              } catch (error) {
                notify((error as Error).message);
              }
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

export default function Editor(props: {
  localOnly?: boolean;
  initial: CloudDocument;
  onClose: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [state, setState] = useState<{ document: CloudDocument; recovered?: LocalDraft } | null>(
    null,
  );
  useEffect(() => {
    let disposed = false;
    void readDraft(props.initial.id)
      .then(async (recovered) => {
        if (
          recovered &&
          !props.localOnly &&
          JSON.stringify(recovered.document.content) === JSON.stringify(props.initial.content) &&
          recovered.document.name === props.initial.name
        ) {
          await removeDraft(props.initial.id, recovered.token);
          recovered = undefined;
        }
        if (!disposed)
          setState({
            document: recovered
              ? { ...recovered.document, revision: recovered.baseRevision }
              : props.initial,
            recovered,
          });
      })
      .catch(() => {
        if (!disposed) setState({ document: props.initial });
      });
    return () => {
      disposed = true;
    };
  }, [props.initial, props.localOnly]);
  return state ? (
    <EditorSession {...props} initial={state.document} recovered={state.recovered} />
  ) : (
    <div className="boot">正在恢复文档…</div>
  );
}
