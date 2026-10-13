import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 45000 });
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const adb = (...args) =>
  execFileSync(process.env.ADB || 'adb', ['-s', 'emulator-5554', ...args], {
    encoding: 'utf8',
  }).trim();
if (adb('shell', 'getprop', 'ro.kernel.qemu') !== '1') throw new Error('Emulator required');
if (adb('emu', 'avd', 'name').split(/\r?\n/)[0] !== 'Zhuole_Docs_API35')
  throw new Error('Task-owned Zhuole_Docs_API35 emulator required');

// Connect only to the task-owned debug WebView forwarded by adb.
const initialPid = adb('shell', 'pidof', 'com.youdroid.zhuoledocs');
adb('forward', 'tcp:9223', 'localabstract:webview_devtools_remote_' + initialPid);
let browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
let page = browser
  .contexts()[0]
  .pages()
  .find((page) => page.url() === 'https://localhost/');
if (!page) throw new Error('Zhuole debug WebView unavailable');
page.setDefaultTimeout(20000);
async function restart() {
  await browser.close();
  adb('shell', 'am', 'force-stop', 'com.youdroid.zhuoledocs');
  adb('shell', 'am', 'start', '-n', 'com.youdroid.zhuoledocs/.MainActivity');
  let socket = '';
  for (let attempt = 0; attempt < 40; attempt++) {
    let pid = '';
    try {
      pid = adb('shell', 'pidof', 'com.youdroid.zhuoledocs');
    } catch {
      /* The process may not exist immediately after launch. */
    }
    const sockets = adb('shell', 'cat', '/proc/net/unix');
    if (pid && sockets.includes('@webview_devtools_remote_' + pid)) {
      socket = 'webview_devtools_remote_' + pid;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!socket) throw new Error('Restarted WebView did not become ready');
  adb('forward', 'tcp:9223', 'localabstract:' + socket);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
  page = browser
    .contexts()[0]
    .pages()
    .find((page) => page.url() === 'https://localhost/');
  if (!page) throw new Error('Restarted app page unavailable');
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
}
const credentials = {
  email: `android-${randomUUID()}@example.com`,
  password: randomUUID(),
  name: 'Android QA',
};
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const saved = () =>
  expect(page.getByText('已保存到云端', { exact: true })).toBeVisible({ timeout: 20000 });
const back = async () => {
  await page.getByRole('button', { name: '返回工作空间' }).click();
  await expect(page.getByText('YOUR SPACE TO CREATE')).toBeVisible();
};
try {
  await expect(
    page
      .getByText('Android QA，开启今天的好想法。')
      .or(page.getByRole('button', { name: '创建免费账号' }))
      .or(page.getByLabel('云服务地址', { exact: true }))
      .first(),
  ).toBeVisible({ timeout: 30000 });
  if (await page.getByText('Android QA，开启今天的好想法。').isVisible()) {
    await page.getByRole('button', { name: '账号设置' }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
  }
  if (await page.getByLabel('云服务地址', { exact: true }).isVisible()) {
    await expect(page.getByLabel('云服务地址', { exact: true })).toHaveValue(
      'https://wpx.youdroid.top',
    );
    await page.getByLabel('云服务地址', { exact: true }).fill('http://127.0.0.1:3173');
    await page.getByRole('button', { name: '连接云服务', exact: true }).click();
  }
  await page.getByRole('button', { name: '创建免费账号' }).click();
  await page.getByLabel('怎么称呼你').fill(credentials.name);
  await page.getByLabel('邮箱地址').fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByText('Android QA，开启今天的好想法。')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('Android Word QA');
  await page.getByRole('textbox', { name: '文档正文' }).fill('Saved through Android native HTTP.');
  await saved();
  await back();
  await page.getByRole('button', { name: /新建电子表格 用数据/ }).click();
  await page.getByRole('textbox', { name: 'A1', exact: true }).fill('120');
  await page.getByRole('textbox', { name: 'A2', exact: true }).fill('80');
  await page.getByRole('textbox', { name: 'B1', exact: true }).fill('=SUM(A1:A2)');
  await page.getByRole('textbox', { name: 'C1', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'B1', exact: true })).toHaveValue('200');
  await saved();
  await back();
  await page.getByRole('button', { name: /新建演示文稿 把好/ }).click();
  await page
    .getByRole('textbox', { name: '幻灯片标题', exact: true })
    .fill('Android presentation QA');
  await saved();
  await page.getByRole('button', { name: '开始放映' }).click();
  await expect(page.getByRole('dialog', { name: '幻灯片放映' })).toBeVisible();
  await page.keyboard.press('Escape');
  await back();
  await page.reload();
  await expect(page.getByText('Android QA，开启今天的好想法。')).toBeVisible();
  await page.getByRole('button', { name: 'Android Word QA DOCX · 文字文档' }).click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    'Saved through Android native HTTP.',
  );
  await mkdir('releases/mobile', { recursive: true });
  await page.screenshot({ path: 'releases/mobile/android-word.png', animations: 'disabled' });
  const login = await fetch('http://127.0.0.1:3173/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:3173', 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const list = await (
    await fetch('http://127.0.0.1:3173/api/documents', { headers: { Cookie: cookie } })
  ).json();
  expect(list.documents).toHaveLength(3);
  const models = await Promise.all(
    list.documents.map(async (doc) =>
      (
        await fetch(`http://127.0.0.1:3173/api/documents/${doc.id}`, {
          headers: { Cookie: cookie },
        })
      ).json(),
    ),
  );
  expect(JSON.stringify(models.find((doc) => doc.kind === 'word').content)).toContain(
    'Saved through Android native HTTP.',
  );
  expect(models.find((doc) => doc.kind === 'sheet').content.sheets[0].cells.B1).toBe('=SUM(A1:A2)');
  expect(models.find((doc) => doc.kind === 'slide').content.slides[0].title).toBe(
    'Android presentation QA',
  );
  await fetch('http://127.0.0.1:3173/api/auth/logout', {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:3173', Cookie: cookie },
  });
  adb('reverse', '--remove', 'tcp:3173');
  await restart();
  await expect(page.getByText('Android QA，开启今天的好想法。')).toBeVisible();
  await page.getByRole('button', { name: 'Android Word QA DOCX · 文字文档' }).click();
  await page
    .getByRole('textbox', { name: '文档正文' })
    .fill('Android offline draft survives restart.');
  await expect(page.getByText('已保存到此设备 · 待同步')).toBeVisible({ timeout: 20000 });
  await restart();
  await expect(page.getByText('Android QA，开启今天的好想法。')).toBeVisible();
  await page.getByRole('button', { name: 'Android Word QA DOCX · 文字文档' }).click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    'Android offline draft survives restart.',
  );
  adb('reverse', 'tcp:3173', 'tcp:3173');
  await page.getByRole('button', { name: '重新连接', exact: true }).click();
  await saved();
  await back();
  await page.getByRole('button', { name: 'Android Word QA DOCX · 文字文档' }).click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    'Android offline draft survives restart.',
  );
  await saved();
  await back();
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    'Android WebView/native HTTP passed: register, Word/sheet/slide editing, save, reload, slideshow, independent server readback, offline process restart and reconnect, logout.',
  );
} finally {
  adb('reverse', 'tcp:3173', 'tcp:3173');
  await browser.close();
}
