import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileExtensions, isAppUrl, LOCAL_URL, normalizeServer, safeFilename } from './policy';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'zhuole',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
app.setName('卓乐文档');
if (app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', resolve(app.commandLine.getSwitchValue('user-data-dir')));
}
if (!app.isPackaged && process.env.ZHUOLE_DESKTOP_DATA)
  app.setPath('userData', resolve(process.env.ZHUOLE_DESKTOP_DATA));
let window: BrowserWindow | null = null;
let cloudOrigin = '';
const pendingPaths: string[] = [];
const configPath = () => resolve(app.getPath('userData'), 'connection.json');
const assets = resolve(__dirname, '../web');
const send = (command: string) => window?.webContents.send('desktop:command', command);
const trusted = (event: IpcMainInvokeEvent) => {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !isAppUrl(event.senderFrame.url)
  )
    throw new Error('Untrusted renderer');
};
const cloudSession = () =>
  session.fromPartition(`persist:cloud-${createHash('sha256').update(cloudOrigin).digest('hex')}`);
async function selectedFile(path: string) {
  const info = await stat(path);
  if (
    !info.isFile() ||
    info.size > 10_000_000 ||
    !fileExtensions.includes(extname(path).slice(1).toLowerCase())
  )
    throw new Error('请选择不超过 10 MB 的 DOCX、XLSX、PPTX 或 ZDOC 文件');
  const bytes = await readFile(path);
  if (bytes.length > 10_000_000) throw new Error('文件超过 10 MB');
  return { name: basename(path), bytes: new Uint8Array(bytes) };
}
function errorResponse(message: string, status = 503, code = 'OFFLINE') {
  return Response.json({ error: message, code }, { status });
}
async function handleRequest(request: Request): Promise<Response> {
  if (!isAppUrl(request.url)) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    if (!cloudOrigin) return errorResponse('请先连接卓乐云文档服务');
    const headers: Record<string, string> = { Origin: cloudOrigin };
    for (const key of ['content-type', 'x-filename']) {
      const value = request.headers.get(key);
      if (value) headers[key] = value;
    }
    try {
      const bytes = ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : await request.arrayBuffer();
      if (bytes && bytes.byteLength > 10_000_000)
        return errorResponse('请求内容过大', 413, 'TOO_LARGE');
      const response = await cloudSession().fetch(`${cloudOrigin}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: bytes,
        credentials: 'include',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      const clean = new Headers(response.headers);
      for (const key of [
        'set-cookie',
        'content-encoding',
        'content-length',
        'transfer-encoding',
        'content-security-policy',
      ])
        clean.delete(key);
      clean.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers: clean });
    } catch {
      return errorResponse('暂时无法连接云服务，已打开的文档可继续编辑');
    }
  }
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  let path: string;
  try {
    path = resolve(
      assets,
      `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`,
    );
  } catch {
    return new Response('Invalid path', { status: 400 });
  }
  if (!path.startsWith(assets + sep)) return new Response('Not found', { status: 404 });
  try {
    const body = await readFile(path);
    const mime: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };
    return new Response(body, {
      headers: {
        'Content-Type': mime[extname(path)] || 'application/octet-stream',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
function createWindow() {
  window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 760,
    minHeight: 580,
    title: '卓乐文档',
    backgroundColor: '#fafbf8',
    show: false,
    webPreferences: {
      preload: resolve(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url))
      void dialog
        .showMessageBox(window!, {
          type: 'question',
          message: '在浏览器中打开链接？',
          detail: url,
          buttons: ['取消', '打开'],
          defaultId: 0,
          cancelId: 0,
        })
        .then(({ response }) => {
          if (response === 1) void shell.openExternal(url);
        });
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window!, {
      type: 'warning',
      message: '仍有尚未保存的修改',
      detail: '建议返回文档，确认本地草稿或云端保存完成后再关闭。',
      buttons: ['返回文档', '放弃未保存修改'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => {
    window = null;
  });
  void window.loadURL(LOCAL_URL);
}
function installMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: '卓乐文档',
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
      {
        label: '文件',
        submenu: [
          { label: '新建文字文档', accelerator: 'CmdOrCtrl+N', click: () => send('new-word') },
          { label: '新建电子表格', click: () => send('new-sheet') },
          { label: '新建演示文稿', click: () => send('new-slide') },
          { label: '打开本地文件…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
          { type: 'separator' },
          { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
          {
            label: '导出 Office 文件…',
            accelerator: 'CmdOrCtrl+Shift+S',
            click: () => send('export'),
          },
          { label: '保存卓乐备份…', click: () => send('backup') },
          { type: 'separator' },
          { label: '云服务连接…', click: () => send('connection') },
          { role: process.platform === 'darwin' ? 'close' : 'quit' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: '显示',
        submenu: [
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
        ],
      },
      { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
    ]),
  );
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  for (const path of process.argv.slice(1))
    if (fileExtensions.includes(extname(path).slice(1).toLowerCase())) pendingPaths.push(path);
  app.on('second-instance', (_event, argv) => {
    for (const path of argv.slice(1))
      if (fileExtensions.includes(extname(path).slice(1).toLowerCase())) pendingPaths.push(path);
    window?.show();
    window?.focus();
    send('pending-files');
  });
  app.on('open-file', (event, path) => {
    event.preventDefault();
    pendingPaths.push(path);
    send('pending-files');
  });
  void app.whenReady().then(async () => {
    try {
      const saved = JSON.parse(await readFile(configPath(), 'utf8'));
      cloudOrigin = normalizeServer(saved.origin);
    } catch {
      /* First launch has no connection yet. */
    }
    if (!app.isPackaged && process.env.ZHUOLE_CLOUD_ORIGIN)
      cloudOrigin = normalizeServer(process.env.ZHUOLE_CLOUD_ORIGIN);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle('zhuole', handleRequest);
    ipcMain.handle('desktop:clear-session', async (event) => {
      trusted(event);
      await cloudSession().clearStorageData({ storages: ['cookies'] });
    });
    ipcMain.handle('desktop:connection', (event) => {
      trusted(event);
      return { origin: cloudOrigin, version: app.getVersion(), platform: process.platform };
    });
    ipcMain.handle('desktop:connect', async (event, input) => {
      trusted(event);
      const origin = normalizeServer(input);
      const response = await session
        .fromPartition('connection-probe')
        .fetch(`${origin}/api/health`, {
          credentials: 'omit',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
      if (!response.ok || (await response.json()).service !== 'zhuole-docs')
        throw new Error('该地址不是可用的卓乐云文档服务');
      await mkdir(dirname(configPath()), { recursive: true });
      await writeFile(configPath(), JSON.stringify({ origin }), { mode: 0o600 });
      cloudOrigin = origin;
      return { origin, version: app.getVersion(), platform: process.platform };
    });
    ipcMain.handle('desktop:open-file', async (event) => {
      trusted(event);
      const result = await dialog.showOpenDialog(window!, {
        properties: ['openFile'],
        filters: [{ name: '办公文档', extensions: fileExtensions }],
      });
      return result.canceled ? null : selectedFile(result.filePaths[0]);
    });
    ipcMain.handle('desktop:pending-files', async (event) => {
      trusted(event);
      const path = pendingPaths.shift();
      return path ? selectedFile(path) : null;
    });
    ipcMain.handle('desktop:save-file', async (event, input) => {
      trusted(event);
      if (
        !input ||
        typeof input.name !== 'string' ||
        !fileExtensions.includes(input.extension) ||
        !(input.bytes instanceof Uint8Array) ||
        input.bytes.byteLength > 30_000_000
      )
        throw new Error('无效的导出内容');
      const result = await dialog.showSaveDialog(window!, {
        defaultPath: `${safeFilename(input.name)}.${input.extension}`,
        filters: [{ name: input.extension.toUpperCase(), extensions: [input.extension] }],
      });
      if (result.canceled || !result.filePath) return false;
      await writeFile(result.filePath, input.bytes);
      return true;
    });
    installMenu();
    createWindow();
    app.on('activate', () => {
      if (!window) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
