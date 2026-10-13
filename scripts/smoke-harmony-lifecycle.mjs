import { chromium, expect as baseExpect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const expect = baseExpect.configure({ timeout: 30000 });
if (!process.env.HDC || !process.env.HARMONY_DEVICE)
  throw new Error('HDC and HARMONY_DEVICE required');
const hdc = (...args) =>
  execFileSync(process.env.HDC, ['-t', process.env.HARMONY_DEVICE, ...args], { encoding: 'utf8' });
const credentials = JSON.parse(readFileSync('releases/harmony/file-qa-credentials.json', 'utf8'));
let browser = await chromium.connectOverCDP('http://127.0.0.1:9224', { noDefaults: true });
let page = browser
  .contexts()[0]
  .pages()
  .find((value) => value.url() === 'https://wpx.youdroid.top/');
if (!page) throw new Error('Zhuole debug page unavailable');
const apiPattern = '**/api/**';
const offline = (route) => route.abort('internetdisconnected');
const restartProcess = process.env.HARMONY_RESTART_QA === '1';
const draftText = restartProcess
  ? 'Process restart preserved this draft.'
  : 'Foreground lifecycle synchronized this draft.';
const processId = () =>
  hdc('shell', 'ps', '-ef')
    .split(/\r?\n/)
    .find((line) => line.trim().endsWith(' com.youdroid.zhuoledocs'))
    ?.trim()
    .split(/\s+/)[1] || '';
const name = `Harmony Lifecycle ${randomUUID().slice(0, 8)}`;
try {
  if (await page.getByRole('heading', { name: '欢迎回来' }).isVisible()) {
    await page.getByLabel('邮箱地址').fill(credentials.email);
    await page.getByLabel('密码', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByText('文件验收，开启今天的好想法。')).toBeVisible();
  }
  const account = await page.evaluate(async () => (await fetch('/api/me')).json());
  expect(account.email).toBe(credentials.email);
  if (await page.getByRole('button', { name: '返回工作空间' }).isVisible())
    await page.getByRole('button', { name: '返回工作空间' }).click();
  await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill(name);
  await page.getByRole('textbox', { name: '文档正文' }).fill('Before background');
  await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
  await page.route(apiPattern, offline);
  await page.getByRole('textbox', { name: '文档正文' }).fill(draftText);
  await expect(page.getByText('已保存到此设备 · 待同步')).toBeVisible();
  if (restartProcess) {
    const previousPid = processId();
    if (!previousPid) throw new Error('Application process unavailable');
    hdc('shell', 'aa', 'force-stop', 'com.youdroid.zhuoledocs');
    await browser.close();
    await expect.poll(processId).toBe('');
    const output = hdc(
      'shell',
      'aa',
      'start',
      '-a',
      'EntryAbility',
      '-b',
      'com.youdroid.zhuoledocs',
    );
    if (!output.includes('start ability successfully'))
      throw new Error('Device must be unlocked to restart');
    let nextPid = '';
    await expect
      .poll(() => {
        nextPid = processId();
        return Boolean(
          nextPid &&
          nextPid !== previousPid &&
          hdc('shell', 'cat', '/proc/net/unix').includes('@webview_devtools_remote_' + nextPid),
        );
      })
      .toBe(true);
    hdc('fport', 'rm', 'tcp:9224', 'localabstract:webview_devtools_remote_' + previousPid);
    hdc('fport', 'tcp:9224', 'localabstract:webview_devtools_remote_' + nextPid);
    browser = await chromium.connectOverCDP('http://127.0.0.1:9224', { noDefaults: true });
    page = browser
      .contexts()[0]
      .pages()
      .find((value) => value.url() === 'https://wpx.youdroid.top/');
    if (!page) throw new Error('Restarted editor unavailable');
    await expect(page.getByText('文件验收，开启今天的好想法。')).toBeVisible();
    await page.getByRole('button', { name: name + ' DOCX · 文字文档', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(draftText);
  } else {
    hdc('shell', 'uitest', 'uiInput', 'keyEvent', 'Home');
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
    await page.unroute(apiPattern, offline);
    const output = hdc(
      'shell',
      'aa',
      'start',
      '-a',
      'EntryAbility',
      '-b',
      'com.youdroid.zhuoledocs',
    );
    if (!output.includes('start ability successfully'))
      throw new Error('Device must be unlocked to resume');
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  }
  await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
  const content = await page.evaluate(async (name) => {
    const listing = await (await fetch('/api/documents')).json();
    const doc = listing.documents.find((doc) => doc.name === name);
    return (await (await fetch(`/api/documents/${doc.id}`)).json()).content;
  }, name);
  expect(JSON.stringify(content)).toContain(draftText);
  console.log(
    restartProcess
      ? 'Harmony process termination, new process, session recovery and pending-draft synchronization passed.'
      : 'Harmony native background/foreground automatically synchronized the offline draft.',
  );
} catch (error) {
  console.error(String(error.message).split('Call log:')[0]);
  process.exitCode = 1;
} finally {
  await page.unroute(apiPattern, offline);
  // Remove only the uniquely named test document from the verified dedicated account.
  await page.evaluate(
    async ({ name, email }) => {
      const account = await (await fetch('/api/me')).json();
      if (account.email !== email) throw new Error('QA account changed; cleanup skipped');
      const listing = await (await fetch('/api/documents')).json();
      const doc = listing.documents.find((doc) => doc.name === name);
      if (!doc) return;
      const trash = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: doc.revision, deleted: true }),
      });
      if (!trash.ok) throw new Error('QA trash failed');
      const revision = (await trash.json()).revision;
      const removed = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision }),
      });
      if (removed.status !== 204) throw new Error('QA cleanup failed');
    },
    { name, email: credentials.email },
  );
  await page.reload();
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await browser.close();
}
