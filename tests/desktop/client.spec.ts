import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeServer, isAppUrl, safeFilename } from '../../desktop/policy';
const origin = 'http://127.0.0.1:4273';
async function launch(directory: string, configured = true, files: string[] = []) {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ZHUOLE_DESKTOP_DATA: directory,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  if (configured) env.ZHUOLE_CLOUD_ORIGIN = origin;
  return electron.launch({ args: [resolve('desktop-dist'), ...files], env });
}
async function offline(app: ElectronApplication, enabled: boolean) {
  const partition = `persist:cloud-${createHash('sha256').update(origin).digest('hex')}`;
  await app.evaluate(
    ({ session }, { partition, enabled }) => {
      session
        .fromPartition(partition)
        .webRequest.onBeforeRequest(
          { urls: ['http://127.0.0.1:4273/api/*'] },
          enabled ? (_details, callback) => callback({ cancel: true }) : null,
        );
    },
    { partition, enabled },
  );
}

test('connection policy rejects unsafe origins and filenames', () => {
  expect(normalizeServer('https://docs.example.com/')).toBe('https://docs.example.com');
  expect(normalizeServer(origin)).toBe(origin);
  for (const value of [
    'http://example.com',
    'file:///tmp',
    'https://user:pass@example.com',
    'https://example.com/api',
    'https://example.com/#x',
  ])
    expect(() => normalizeServer(value)).toThrow();
  expect(isAppUrl('zhuole://evil/path')).toBe(false);
  expect(isAppUrl('zhuole://app/')).toBe(true);
  expect(safeFilename('../../private:doc')).toBe('.._.._private_doc');
});

test('native window, authentication, disk backup, offline recovery and cloud synchronization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zhuole-desktop-'));
  let app = await launch(directory);
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
    await page.getByRole('button', { name: '创建免费账号' }).click();
    await page.getByLabel('怎么称呼你').fill('桌面创作者');
    await page.getByLabel('邮箱地址').fill(`desktop-${crypto.randomUUID()}@example.com`);
    await page.getByLabel('密码', { exact: true }).fill('desktop-test-password');
    await page.getByRole('button', { name: '创建账号', exact: true }).click();
    await expect(page.getByText('桌面创作者，开启今天的好想法。')).toBeVisible();
    await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
    await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('桌面持久化验证');
    await page.getByRole('textbox', { name: '文档正文' }).fill('云端初稿');
    await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
    const backupPath = join(directory, 'native-backup.zdoc');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, backupPath);
    await page.getByRole('button', { name: '备份', exact: true }).click();
    await expect
      .poll(async () => readFile(backupPath, 'utf8').catch(() => ''))
      .toContain('云端初稿');
    await offline(app, true);
    await page.getByRole('textbox', { name: '文档正文' }).fill('断网后仍然可以续写');
    await expect(page.getByText('已保存到此设备 · 待同步')).toBeVisible();
    await page.screenshot({ path: 'test-results/desktop-offline.png', animations: 'disabled' });
    await page.getByRole('button', { name: '返回工作空间' }).click();
    await expect(page.getByText('桌面创作者，开启今天的好想法。')).toBeVisible();
    await app.close();
    app = await launch(directory);
    page = await app.firstWindow();
    await expect(page.getByText('桌面创作者，开启今天的好想法。')).toBeVisible();
    await page.getByRole('button', { name: '桌面持久化验证 DOCX · 文字文档' }).click();
    await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
      '断网后仍然可以续写',
    );
    await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回工作空间' }).click();
    await page.getByRole('button', { name: '桌面持久化验证 DOCX · 文字文档' }).click();
    await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
      '断网后仍然可以续写',
    );
    await page.getByRole('button', { name: '返回工作空间' }).click();
    await page.getByRole('button', { name: '桌面持久化验证 DOCX · 文字文档' }).click();
    await offline(app, true);
    await page.getByRole('textbox', { name: '文档正文' }).fill('离线冲突版本');
    await expect(page.getByText('已保存到此设备 · 待同步')).toBeVisible();
    await offline(app, false);
    const partition = `persist:cloud-${createHash('sha256').update(origin).digest('hex')}`;
    await app.evaluate(
      async ({ session }, { partition, origin }) => {
        const transport = session.fromPartition(partition);
        const library = await (await transport.fetch(`${origin}/api/documents`)).json();
        const doc = library.documents[0];
        await transport.fetch(`${origin}/api/documents/${doc.id}`, {
          method: 'PATCH',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: doc.revision, name: '其他设备更新' }),
        });
      },
      { partition, origin },
    );
    await page.getByRole('button', { name: '重新连接', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('文档已在其他窗口更新');
    await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText('离线冲突版本');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, backupPath);
    await page.getByRole('button', { name: '备份并返回', exact: true }).click();
    await page.locator('.local-draft-row').filter({ hasText: '桌面持久化验证' }).click();
    await expect(page.getByRole('alert')).toContainText('文档已在其他窗口更新');
    await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText('离线冲突版本');
    await page.getByRole('button', { name: '另存为云端副本', exact: true }).click();
    await expect(page.getByRole('button', { name: '其他设备更新 DOCX · 文字文档' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '桌面持久化验证 副本 DOCX · 文字文档' }),
    ).toBeVisible();
    const importPath = join(directory, 'native-open.zdoc');
    await writeFile(
      importPath,
      JSON.stringify({
        type: 'sheet',
        sheets: [{ id: 'native-sheet', name: '本地文件', cells: { A1: '来自系统打开', A2: '12' } }],
      }),
    );
    await app.evaluate(({ app }, path) => {
      app.emit('open-file', { preventDefault() {} }, path);
    }, importPath);
    await expect(page.getByRole('dialog', { name: '导入到云空间' })).toBeVisible();
    await page.getByRole('button', { name: '导入基础内容' }).click();
    await expect(page.getByRole('textbox', { name: 'A1', exact: true })).toHaveValue(
      '来自系统打开',
    );
    await page.getByRole('button', { name: '返回工作空间' }).click();
    await page.screenshot({ path: 'test-results/desktop-workspace.png', animations: 'disabled' });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('first launch validates and persists the cloud connection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zhuole-connection-'));
  const app = await launch(directory, false);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '连接你的云端工作空间' })).toBeVisible();
    await expect(page.getByLabel('云服务地址', { exact: true })).toHaveValue(
      'https://wpx.youdroid.top',
    );
    await page.getByLabel('云服务地址').fill('http://example.com');
    await page.getByRole('button', { name: '连接云服务', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('HTTPS');
    await page.getByLabel('云服务地址').fill(origin);
    await page.getByRole('button', { name: '连接云服务', exact: true }).click();
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    expect(JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')).origin).toBe(
      origin,
    );
  } finally {
    await app.close();
  }
});

test('packaged macOS application launches its bundled UI with sandboxing', async () => {
  test.skip(process.platform !== 'darwin', 'macOS artifact validation');
  const executablePath = resolve('releases/desktop/mac-arm64/卓乐文档.app/Contents/MacOS/卓乐文档');
  test.skip(!existsSync(executablePath), 'Build the macOS arm64 artifact first');
  const profile = await mkdtemp(join(tmpdir(), 'zhuole-packaged-'));
  const app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`] });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '连接你的云端工作空间' })).toBeVisible();
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile);
    expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
    await page.screenshot({ path: 'test-results/desktop-packaged.png', animations: 'disabled' });
  } finally {
    await app.close();
  }
});

test('offline cache remains isolated after changing accounts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zhuole-isolation-'));
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    async function register(name: string) {
      await page.getByRole('button', { name: '创建免费账号' }).click();
      await page.getByLabel('怎么称呼你').fill(name);
      await page.getByLabel('邮箱地址').fill(`desktop-${crypto.randomUUID()}@example.com`);
      await page.getByLabel('密码', { exact: true }).fill('desktop-test-password');
      await page.getByRole('button', { name: '创建账号', exact: true }).click();
      await expect(page.getByText(`${name}，开启今天的好想法。`)).toBeVisible();
    }
    await register('账号甲');
    await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
    await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('甲的私有文档');
    await page.getByRole('textbox', { name: '文档正文' }).fill('Private account A');
    await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回工作空间' }).click();
    await page.getByRole('button', { name: '账号设置' }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await register('账号乙');
    await expect(page.getByText('第一份好想法，从这里开始')).toBeVisible();
    await offline(app, true);
    await page.reload();
    await expect(page.getByText('账号乙，开启今天的好想法。')).toBeVisible();
    await expect(page.locator('.file-row')).toHaveCount(0);
    await expect(page.getByText('甲的私有文档', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '账号设置' }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('startup file arguments are retained until the renderer requests them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zhuole-startup-file-'));
  const path = join(directory, 'startup.zdoc');
  await writeFile(path, JSON.stringify({ type: 'word', body: { type: 'doc', content: [] } }));
  const app = await launch(directory, true, [path]);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    const file = await page.evaluate(() => window.zhuoleDesktop!.pendingFiles());
    expect(file?.name).toBe('startup.zdoc');
  } finally {
    await app.close();
  }
});
