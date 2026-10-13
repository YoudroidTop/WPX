import { useEffect, useState, type ReactNode } from 'react';
import { Cloud, Link2 } from 'lucide-react';
import { clientAccount, configureClientCache, isOffline, setOffline } from '../cache';
import { nativeCommand, type DesktopConnection } from '../platform';
import { Logo, Modal } from './ui';
export default function DesktopHost({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<DesktopConnection | null>(null),
    [loading, setLoading] = useState(Boolean(window.zhuoleDesktop)),
    [settings, setSettings] = useState(false),
    [offline, setOfflineState] = useState(false);
  useEffect(() => {
    if (!window.zhuoleDesktop) return;
    void window.zhuoleDesktop
      .getConnection()
      .then((value) => {
        configureClientCache(value.origin);
        setConnection(value);
      })
      .finally(() => setLoading(false));
    const unlisten = nativeCommand((command) => {
      if (command === 'connection') setSettings(true);
    });
    const update = () => setOfflineState(isOffline());
    window.addEventListener('zhuole-connectivity', update);
    return () => {
      unlisten();
      window.removeEventListener('zhuole-connectivity', update);
    };
  }, []);
  if (!window.zhuoleDesktop) return children;
  if (loading)
    return (
      <div className="boot">
        <Logo />
        <span>正在打开卓乐文档…</span>
      </div>
    );
  function connected(value: DesktopConnection) {
    configureClientCache(value.origin);
    setConnection(value);
    setOffline(false);
    setSettings(false);
  }
  if (!connection?.origin)
    return (
      <div className="desktop-connect">
        <Logo />
        <ConnectionForm onConnected={connected} />
        <p className="muted">桌面客户端与 Web 使用同一账号和 3 GB 云空间。</p>
      </div>
    );
  return (
    <div key={connection.origin} className="desktop-host">
      {offline && (
        <div className="offline-strip">
          <Cloud size={15} />
          <span>离线模式 · 已缓存的文档可继续编辑，草稿保存在此设备</span>
          <button onClick={() => window.dispatchEvent(new Event('online'))}>重新连接</button>
        </div>
      )}
      {children}
      {settings && (
        <Modal title="云服务连接" onClose={() => setSettings(false)}>
          <p className="muted">
            当前服务：{connection.origin}
            <br />
            卓乐文档 {connection.version}
          </p>
          <ConnectionForm current={connection.origin} onConnected={connected} />
        </Modal>
      )}
    </div>
  );
}
function ConnectionForm({
  current = '',
  onConnected,
}: {
  current?: string;
  onConnected: (connection: DesktopConnection) => void;
}) {
  const [origin, setOrigin] = useState(current),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="connection-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        if (clientAccount()) {
          setError('请先退出当前账号，再切换云服务；本地草稿会按账号分别保留。');
          return;
        }
        setBusy(true);
        try {
          onConnected(await window.zhuoleDesktop!.connect(origin));
        } catch (error) {
          setError(
            (error as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ''),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>连接你的云端工作空间</h2>
      <p>输入已部署的卓乐云文档地址，登录后即可在桌面继续创作。</p>
      <label>
        云服务地址
        <input
          type="url"
          value={origin}
          placeholder="https://docs.example.com"
          required
          onChange={(event) => setOrigin(event.target.value)}
        />
      </label>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        <Link2 size={16} />
        {busy ? '正在验证服务…' : '连接云服务'}
      </button>
      <p className="muted">本机调试可使用 http://127.0.0.1:3173</p>
    </form>
  );
}
