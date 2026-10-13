import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Search,
  Plus,
  Clock3,
  Files,
  Star,
  Trash2,
  Cloud,
  ArrowUpRight,
  Upload,
  LayoutGrid,
  List,
  LogOut,
  Settings2,
  MoreHorizontal,
  ChevronRight,
  Menu,
  X,
  Download,
  RotateCcw,
  Pencil,
  Check,
  FolderOpen,
  ArrowDownWideNarrow,
} from 'lucide-react';
import { api, downloadFile } from './api';
import { RequestError } from './api';
import {
  extensions,
  formatBytes,
  kindLabels,
  MAX_IMPORT_BYTES,
  type Account,
  type CloudDocument,
  type DocumentKind,
  type DocumentSummary,
} from '../shared/documents';
import Auth from './components/Auth';
import { listDrafts, isOffline, type LocalDraft } from './cache';
import { synchronizeDrafts } from './sync';
import { nativeBridge, nativeCommand, openNativeFile } from './platform';
import Editor from './components/Editor';
import { KindIcon, Logo, Modal } from './components/ui';

type Section = 'recent' | 'all' | 'starred' | 'trash';
type Dialog =
  | { type: 'rename' | 'delete'; doc: DocumentSummary }
  | { type: 'account' }
  | { type: 'import'; file: File }
  | null;
const navigation = [
  { id: 'recent', label: '最近使用', icon: Clock3 },
  { id: 'all', label: '我的文档', icon: Files },
  { id: 'starred', label: '星标文档', icon: Star },
  { id: 'trash', label: '回收站', icon: Trash2 },
] as const;
const kindOptions: DocumentKind[] = ['word', 'sheet', 'slide'];
export default function App() {
  const [account, setAccount] = useState<Account | null>(null),
    [booting, setBooting] = useState(true);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]),
    [section, setSection] = useState<Section>('recent');
  const [filter, setFilter] = useState<DocumentKind | 'all'>('all'),
    [query, setQuery] = useState('');
  const [grid, setGrid] = useState(false),
    [sort, setSort] = useState('updated'),
    [dialog, setDialog] = useState<Dialog>(null);
  const [opened, setOpened] = useState<(CloudDocument & { fromLocalDraft?: true }) | null>(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState('');
  const [menu, setMenu] = useState<string | null>(null),
    [mobileNav, setMobileNav] = useState(false),
    [loading, setLoading] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([]);
  const refreshing = useRef(false);
  const nativeState = useRef({ account, opened, busy });
  nativeState.current = { account, opened, busy };
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (nativeBridge) {
      window.scrollTo(0, 0);
      document.querySelector('.desktop-host')?.scrollTo(0, 0);
    }
  }, [account?.id, Boolean(opened)]);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    try {
      let result = await api<{ account: Account; documents: DocumentSummary[] }>('/documents');
      if (nativeBridge && !isOffline() && !nativeState.current.opened) {
        const summary = await synchronizeDrafts();
        if (summary.saved) result = await api('/documents');
        if (summary.conflicts)
          notify(`${summary.conflicts} 份本地草稿需要处理，请打开检查或另存为副本`);
      }
      setLocalDrafts(await listDrafts());
      setAccount(result.account);
      setDocuments(result.documents);
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) {
        setAccount(null);
        setDocuments([]);
        setLocalDrafts([]);
      } else notify((error as Error).message);
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, [notify]);
  useEffect(() => {
    api<Account>('/me')
      .then((user) => {
        setAccount(user);
      })
      .catch((error) => {
        if (!(error instanceof RequestError && error.status === 401)) notify(error.message);
      })
      .finally(() => setBooting(false));
  }, [notify]);
  useEffect(() => {
    if (account?.id) void refresh();
  }, [account?.id, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(kind: DocumentKind) {
    await perform(async () => {
      const doc = await api<CloudDocument>('/documents', {
        method: 'POST',
        body: JSON.stringify({ kind, name: `未命名${kindLabels[kind]}` }),
      });
      setOpened(doc);
    });
  }
  async function open(doc: DocumentSummary) {
    if (doc.deletedAt) return;
    await perform(async () => setOpened(await api<CloudDocument>(`/documents/${doc.id}`)));
  }
  async function update(doc: DocumentSummary, patch: object) {
    await api(`/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ revision: doc.revision, ...patch }),
    });
    await refresh();
  }
  async function logout() {
    await perform(async () => {
      await api('/auth/logout', { method: 'POST' });
      setAccount(null);
      setDocuments([]);
      setLocalDrafts([]);
      setDialog(null);
    });
  }
  const actions = useRef({ create, notify });
  actions.current = { create, notify };
  useEffect(() => {
    return nativeCommand((command) => {
      const current = nativeState.current;
      if (current.opened || current.busy) return;
      if (command === 'back') {
        setDialog(null);
        setMobileNav(false);
        return;
      }
      if (!current.account) {
        if (command !== 'connection') actions.current.notify('请先登录，再打开或新建文档');
        return;
      }
      if (command.startsWith('new-')) void actions.current.create(command.slice(4) as DocumentKind);
      if (command === 'open' || command === 'pending-files')
        void openNativeFile(command === 'pending-files')
          .then((file) => {
            if (file) setDialog({ type: 'import', file });
          })
          .catch((error) => actions.current.notify(error.message));
    });
  }, []);
  useEffect(() => {
    if (!account || opened || !nativeBridge) return;
    void openNativeFile(true)
      .then((file) => {
        if (file) setDialog({ type: 'import', file });
      })
      .catch((error) => notify(error.message));
  }, [account?.id, opened, notify]);
  useEffect(() => {
    const reconnect = () => {
      if (nativeState.current.account && !nativeState.current.opened) void refresh();
    };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [refresh]);
  const visible = documents
    .filter(
      (doc) =>
        (section === 'trash' ? !!doc.deletedAt : !doc.deletedAt) &&
        (section !== 'starred' || doc.starred) &&
        (filter === 'all' || doc.kind === filter) &&
        doc.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, 'zh')
        : sort === 'size'
          ? b.size - a.size
          : b.updatedAt - a.updatedAt,
    );
  const active = documents.filter((doc) => !doc.deletedAt);
  const recent = active.slice(0, 3);
  const toastNode = toast && (
    <div className="toast" role="status">
      {toast}
      <button aria-label="关闭提示" className="icon-button" onClick={() => setToast('')}>
        <X size={15} />
      </button>
    </div>
  );
  if (booting)
    return (
      <div className="boot">
        <Logo />
        <span>正在打开你的工作空间…</span>
      </div>
    );
  if (!account)
    return (
      <>
        <Auth onLogin={setAccount} />
        {toastNode}
      </>
    );
  if (opened)
    return (
      <>
        <Editor
          initial={opened}
          localOnly={opened.fromLocalDraft}
          onClose={async () => {
            setOpened(null);
            await refresh();
          }}
          notify={notify}
        />
        {toastNode}
      </>
    );
  return (
    <div className="app-shell">
      {mobileNav && (
        <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />
      )}
      <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
        <Logo />
        <button
          className="primary sidebar-create"
          disabled={busy}
          onClick={() => void create('word')}
        >
          <Plus size={18} />
          新建文档
        </button>
        <div className="nav-label">工作空间</div>
        <nav aria-label="工作空间导航">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${section === item.id ? 'active' : ''}`}
              onClick={() => {
                setSection(item.id);
                setMobileNav(false);
                setFilter('all');
                setQuery('');
              }}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === 'all' && <span className="nav-count">{active.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage">
            <div>
              <span>
                <Cloud size={17} />
                我的云空间
              </span>
              <span>3 GB</span>
            </div>
            <progress max={account.limitBytes} value={account.usedBytes} aria-label="云空间用量" />
            <p>已使用 {formatBytes(account.usedBytes)} / 3 GB</p>
            <span className="storage-note">每一份灵感，都妥善安放。</span>
          </div>
          <button className="profile-button" onClick={() => setDialog({ type: 'account' })}>
            <span className="avatar">{account.name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{account.name}</strong>
              <small>个人工作空间</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="打开导航"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <span className="breadcrumb">
            个人空间
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === section)?.label}</strong>
          </span>
          <div className="topbar-right">
            <span className="cloud-status">
              <i />
              云端存储
            </span>
            <button
              className="icon-button"
              aria-label="账号设置"
              onClick={() => setDialog({ type: 'account' })}
            >
              <Settings2 size={19} />
            </button>
          </div>
        </header>
        <main className="dashboard">
          <section className="welcome">
            <div>
              <span className="eyebrow">YOUR SPACE TO CREATE</span>
              <h1>
                {section === 'trash'
                  ? '让空间，轻盈一点。'
                  : section === 'starred'
                    ? '重要的想法，放在眼前。'
                    : `${account.name}，开启今天的好想法。`}
              </h1>
              <p>
                {section === 'trash'
                  ? '回收站中的文档仍占用空间，永久删除后释放。'
                  : '写下灵感，理清思路，让每一次创作都自在发生。'}
              </p>
            </div>
            <button
              className="secondary upload-button"
              disabled={busy}
              onClick={() => upload.current?.click()}
            >
              <Upload size={17} />
              导入文档
            </button>
          </section>
          <input
            ref={upload}
            type="file"
            hidden
            accept=".docx,.xlsx,.pptx,.zdoc"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              if (file.size > MAX_IMPORT_BYTES) return notify('单个导入文件不能超过 10 MB');
              setDialog({ type: 'import', file });
            }}
          />
          {section !== 'trash' && (
            <section className="create-grid" aria-label="新建文档类型">
              {kindOptions.map((kind, i) => (
                <button
                  key={kind}
                  disabled={busy}
                  className={`create-card ${kind}`}
                  onClick={() => void create(kind)}
                >
                  <div>
                    <KindIcon kind={kind} />
                    <Plus size={18} className="create-plus" />
                  </div>
                  <h2>新建{kindLabels[kind]}</h2>
                  <p>
                    {
                      [
                        '落笔成章，让文字有力量',
                        '用数据，找到清晰的答案',
                        '把好想法，变成精彩呈现',
                      ][i]
                    }
                  </p>
                  <span className="card-watermark">{['W', 'X', 'P'][i]}</span>
                </button>
              ))}
            </section>
          )}
          {section === 'recent' && recent.length > 0 && !query && (
            <section className="continue-section">
              <div className="section-heading">
                <h2>
                  继续创作 <span>拾起上一次的灵感</span>
                </h2>
                <span className="quiet">最近更新</span>
              </div>
              <div className="recent-grid">
                {recent.map((doc) => (
                  <button
                    key={doc.id}
                    className="recent-card"
                    disabled={busy}
                    onClick={() => void open(doc)}
                  >
                    <div className={`document-preview ${doc.kind}`}>
                      <div className="mini-paper">
                        {doc.kind === 'word' ? (
                          <>
                            <span>{doc.name}</span>
                            <i />
                            <i />
                            <i />
                            <i />
                          </>
                        ) : doc.kind === 'sheet' ? (
                          <div className="mini-cells">
                            {Array.from({ length: 20 }, (_, i) => (
                              <i key={i} />
                            ))}
                          </div>
                        ) : (
                          <>
                            <b>{doc.name}</b>
                            <span className="mini-rule" />
                          </>
                        )}
                      </div>
                      <ArrowUpRight size={18} />
                    </div>
                    <div className="recent-meta">
                      <KindIcon kind={doc.kind} small />
                      <div>
                        <strong>{doc.name}</strong>
                        <small>{new Date(doc.updatedAt).toLocaleDateString('zh-CN')} 更新</small>
                      </div>
                      {doc.starred && <Star size={14} fill="currentColor" className="starred" />}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {localDrafts.length > 0 && (
            <section className="local-drafts">
              <div className="section-heading">
                <h2>此设备上的待同步草稿</h2>
                <span className="muted">内容保存在本机，尚未覆盖云端</span>
              </div>
              {localDrafts.map((draft) => (
                <button
                  key={draft.document.id}
                  className="local-draft-row"
                  onClick={() =>
                    setOpened({
                      ...draft.document,
                      revision: draft.baseRevision,
                      fromLocalDraft: true,
                    })
                  }
                >
                  <KindIcon kind={draft.document.kind} small />
                  <strong>{draft.document.name}</strong>
                  <span>{new Date(draft.savedAt).toLocaleString('zh-CN')}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </section>
          )}
          <section className="documents-section">
            <div className="section-heading">
              <h2>
                {section === 'trash' ? '回收站' : section === 'starred' ? '星标文档' : '我的文档'}
                <span className="count-pill">{visible.length}</span>
              </h2>
              <div className="view-toggle">
                <button
                  aria-label="列表视图"
                  aria-pressed={!grid}
                  className={!grid ? 'selected' : ''}
                  onClick={() => setGrid(false)}
                >
                  <List size={17} />
                </button>
                <button
                  aria-label="网格视图"
                  aria-pressed={grid}
                  className={grid ? 'selected' : ''}
                  onClick={() => setGrid(true)}
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
            </div>
            <div className="document-controls">
              <div className="filter-tabs" aria-label="文档类型筛选">
                {(['all', ...kindOptions] as const).map((kind) => (
                  <button
                    key={kind}
                    aria-pressed={filter === kind}
                    className={filter === kind ? 'active' : ''}
                    onClick={() => setFilter(kind)}
                  >
                    {kind === 'all' ? '全部' : kindLabels[kind]}
                  </button>
                ))}
              </div>
              <div className="search-sort">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="搜索文档"
                    placeholder="搜索你的文档"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button aria-label="清空搜索" onClick={() => setQuery('')}>
                      <X size={14} />
                    </button>
                  )}
                </label>
                <label className="sort-field">
                  <ArrowDownWideNarrow size={16} />
                  <select
                    aria-label="排序方式"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="updated">最近修改</option>
                    <option value="name">文档名称</option>
                    <option value="size">文件大小</option>
                  </select>
                </label>
              </div>
            </div>
            {loading && documents.length === 0 ? (
              <div className="empty-state">正在读取云端文档…</div>
            ) : visible.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">
                  <FolderOpen size={33} strokeWidth={1.3} />
                </span>
                <h3>
                  {query
                    ? '没有找到匹配的文档'
                    : section === 'trash'
                      ? '回收站空空的，很清爽'
                      : section === 'starred'
                        ? '把重要文档标个星吧'
                        : '第一份好想法，从这里开始'}
                </h3>
                <p>
                  {query
                    ? '试试其他关键词，或者切换文档类型。'
                    : section === 'starred'
                      ? '点击文档旁的星标，让它随时触手可及。'
                      : section === 'trash'
                        ? '移入回收站的文档会显示在这里。'
                        : '新建一份文档，或导入已有的 Office 文件。'}
                </p>
                {!query && section !== 'trash' && section !== 'starred' && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void create('word')}
                  >
                    新建第一份文档 <Plus size={15} />
                  </button>
                )}
              </div>
            ) : (
              <div className={grid ? 'file-grid' : 'file-list'}>
                {!grid && (
                  <div className="file-list-header">
                    <span>文档名称</span>
                    <span>最近修改</span>
                    <span>大小</span>
                    <span />
                  </div>
                )}
                {visible.map((doc) => (
                  <div key={doc.id} className="file-row">
                    <button
                      className="file-name"
                      disabled={busy || !!doc.deletedAt}
                      onClick={() => void open(doc)}
                    >
                      <KindIcon kind={doc.kind} small />
                      <span>
                        <strong>{doc.name}</strong>
                        <small>
                          {extensions[doc.kind].toUpperCase()} · {kindLabels[doc.kind]}
                        </small>
                      </span>
                    </button>
                    <span className="file-date">
                      {new Date(doc.updatedAt).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="file-size">{formatBytes(doc.size)}</span>
                    <div className="file-actions">
                      {!doc.deletedAt && (
                        <button
                          className={`icon-button ${doc.starred ? 'starred' : ''}`}
                          aria-label={`${doc.starred ? '取消星标' : '星标'} ${doc.name}`}
                          disabled={busy}
                          onClick={() => void perform(() => update(doc, { starred: !doc.starred }))}
                        >
                          <Star size={16} fill={doc.starred ? 'currentColor' : 'none'} />
                        </button>
                      )}
                      <button
                        className="icon-button"
                        aria-label={`更多操作 ${doc.name}`}
                        aria-expanded={menu === doc.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenu(menu === doc.id ? null : doc.id);
                        }}
                      >
                        <MoreHorizontal size={19} />
                      </button>
                      {menu === doc.id && (
                        <div className="dropdown" onClick={(e) => e.stopPropagation()}>
                          {doc.deletedAt ? (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => {
                                  setMenu(null);
                                  void perform(() => update(doc, { deleted: false }));
                                }}
                              >
                                <RotateCcw size={15} />
                                恢复文档
                              </button>
                              <button
                                className="danger"
                                onClick={() => {
                                  setMenu(null);
                                  setDialog({ type: 'delete', doc });
                                }}
                              >
                                <Trash2 size={15} />
                                永久删除
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setMenu(null);
                                  setDialog({ type: 'rename', doc });
                                }}
                              >
                                <Pencil size={15} />
                                重命名
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => {
                                  setMenu(null);
                                  void perform(async () => {
                                    await downloadFile(doc.id, doc.name, extensions[doc.kind]);
                                  });
                                }}
                              >
                                <Download size={15} />
                                下载 {extensions[doc.kind].toUpperCase()}
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => {
                                  setMenu(null);
                                  void perform(() => update(doc, { deleted: true }));
                                }}
                              >
                                <Trash2 size={15} />
                                移入回收站
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <footer className="workspace-footer">
            <span>卓乐云文档</span>
            <span>让创作，回归简单。</span>
          </footer>
        </main>
      </div>
      {dialog && (
        <Modal
          title={
            dialog.type === 'rename'
              ? '重命名文档'
              : dialog.type === 'delete'
                ? '永久删除文档'
                : dialog.type === 'import'
                  ? '导入到云空间'
                  : '账号与云空间'
          }
          onClose={() => !busy && setDialog(null)}
        >
          {dialog.type === 'rename' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get('name');
                void perform(async () => {
                  await update(dialog.doc, { name: value });
                  setDialog(null);
                });
              }}
            >
              <label>
                文档名称
                <input
                  name="name"
                  defaultValue={dialog.doc.name}
                  required
                  maxLength={100}
                  autoFocus
                />
              </label>
              <div className="modal-buttons">
                <button className="secondary" type="button" onClick={() => setDialog(null)}>
                  取消
                </button>
                <button className="primary" disabled={busy}>
                  保存
                </button>
              </div>
            </form>
          )}
          {dialog.type === 'delete' && (
            <>
              <p>
                “{dialog.doc.name}”将被永久删除，无法恢复。此操作将释放{' '}
                {formatBytes(dialog.doc.size)} 空间。
              </p>
              <div className="modal-buttons">
                <button className="secondary" onClick={() => setDialog(null)}>
                  保留文档
                </button>
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await api(`/documents/${dialog.doc.id}`, {
                        method: 'DELETE',
                        body: JSON.stringify({ revision: dialog.doc.revision }),
                      });
                      await refresh();
                      setDialog(null);
                    })
                  }
                >
                  永久删除
                </button>
              </div>
            </>
          )}
          {dialog.type === 'import' && (
            <>
              <div className="import-file">
                <Upload size={22} />
                <strong>{dialog.file.name}</strong>
                <span>{formatBytes(dialog.file.size)}</span>
              </div>
              <p>
                基础版会提取文字、单元格与公式、幻灯片文字。复杂排版、图片、图表和动画暂不保留；请保留原始
                Office 文件。
              </p>
              <p className="muted">
                卓乐备份（.zdoc）可完整恢复本系统支持的编辑内容。单文件上限 10 MB。
              </p>
              <div className="modal-buttons">
                <button className="secondary" disabled={busy} onClick={() => setDialog(null)}>
                  取消
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const doc = await api<CloudDocument>('/documents/import', {
                        method: 'POST',
                        body: dialog.file,
                        headers: {
                          'Content-Type': 'application/octet-stream',
                          'X-Filename': encodeURIComponent(dialog.file.name),
                        },
                      });
                      setDialog(null);
                      setOpened(doc);
                    })
                  }
                >
                  {busy ? '正在导入…' : '导入基础内容'}
                </button>
              </div>
            </>
          )}
          {dialog.type === 'account' && (
            <AccountSettings
              account={account}
              busy={busy}
              perform={perform}
              onUpdate={setAccount}
              onLogout={logout}
              notify={notify}
            />
          )}
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
function AccountSettings({
  account,
  busy,
  perform,
  onUpdate,
  onLogout,
  notify,
}: {
  account: Account;
  busy: boolean;
  perform: (fn: () => Promise<void>) => Promise<void>;
  onUpdate: (a: Account) => void;
  onLogout: () => Promise<void>;
  notify: (message: string) => void;
}) {
  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = Object.fromEntries(new FormData(form));
    void perform(async () => {
      await api('/me/password', { method: 'POST', body: JSON.stringify(data) });
      form.reset();
      notify('密码已修改，其他设备的登录已退出');
    });
  }
  return (
    <div className="settings-content">
      <div className="account-summary">
        <span className="avatar large">{account.name.slice(0, 1)}</span>
        <div>
          <strong>{account.email}</strong>
          <small>个人账号 · 3 GB 云空间</small>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get('name');
          void perform(async () => {
            onUpdate(await api('/me', { method: 'PATCH', body: JSON.stringify({ name }) }));
            notify('个人资料已更新');
          });
        }}
      >
        <label>
          显示名称
          <div className="inline-input">
            <input name="name" defaultValue={account.name} required maxLength={100} />
            <button className="secondary" disabled={busy}>
              <Check size={16} />
              保存
            </button>
          </div>
        </label>
      </form>
      <hr />
      <h3>修改密码</h3>
      <form onSubmit={changePassword}>
        <label>
          当前密码
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label>
          新密码
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            placeholder="至少 10 位字符"
            required
          />
        </label>
        <button className="secondary" disabled={busy}>
          更新密码
        </button>
      </form>
      <hr />
      <button className="text-button danger" disabled={busy} onClick={() => void onLogout()}>
        <LogOut size={16} />
        退出登录
      </button>
    </div>
  );
}
