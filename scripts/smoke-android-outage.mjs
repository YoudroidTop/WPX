import { chromium, expect as baseExpect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
const expect = baseExpect.configure({ timeout: 30000 });
const adb = (...args) =>
  execFileSync(process.env.ADB || 'adb', ['-s', 'emulator-5554', ...args], {
    encoding: 'utf8',
  }).trim();
if (adb('emu', 'avd', 'name').split(/\r?\n/)[0] !== 'Zhuole_Docs_API35')
  throw new Error('Task-owned emulator required');
const installed = adb('shell', 'dumpsys', 'package', 'com.youdroid.zhuoledocs');
if (!installed.includes('versionName=0.1.1') || !installed.includes('versionCode=2 '))
  throw new Error(
    'Install mobile 0.1.1 build 2 before this regression; emulator snapshots may contain an older app.',
  );
const proxy = spawn(process.execPath, ['scripts/mobile-qa-proxy.mjs'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
let output = '';
proxy.stdout.on('data', (chunk) => {
  output += chunk;
});
proxy.stderr.on('data', (chunk) => {
  output += chunk;
});
const mode = async (value) => {
  const start = output.length;
  proxy.stdin.write(value + '\n');
  await expect.poll(() => output.slice(start)).toContain(`QA proxy ${value}.`);
};
let browser, page;
async function connect() {
  await expect
    .poll(() => adb('shell', 'cat', '/proc/net/unix'))
    .toContain('@webview_devtools_remote_');
  const pid = adb('shell', 'pidof', 'com.youdroid.zhuoledocs');
  adb('forward', 'tcp:9223', 'localabstract:webview_devtools_remote_' + pid);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
  page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url() === 'https://localhost/');
  if (!page) throw new Error('Application WebView unavailable');
  page.setDefaultTimeout(20000);
}
async function restart() {
  await browser.close();
  adb('shell', 'am', 'force-stop', 'com.youdroid.zhuoledocs');
  adb('shell', 'am', 'start', '-n', 'com.youdroid.zhuoledocs/.MainActivity');
  await connect();
}
const credentials = { email: `native-outage-${randomUUID()}@example.com`, password: randomUUID() };
try {
  await expect.poll(() => output).toContain('QA proxy ready');
  adb('reverse', 'tcp:3174', 'tcp:3174');
  adb('shell', 'am', 'start', '-n', 'com.youdroid.zhuoledocs/.MainActivity');
  await connect();
  const welcome = page.getByRole('heading', { name: '欢迎回来' });
  const previousQA = page.getByText('Native Outage QA，开启今天的好想法。', { exact: true });
  await expect(welcome.or(previousQA)).toBeVisible();
  if (await previousQA.isVisible()) {
    await page.getByRole('button', { name: '账号设置' }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
  }
  await expect(welcome).toBeVisible();
  await page.getByRole('button', { name: '云服务连接', exact: true }).click();
  await page.getByLabel('云服务地址', { exact: true }).fill('http://127.0.0.1:3174');
  await page.getByRole('button', { name: '连接云服务', exact: true }).click();
  await mode('storage-unavailable');
  await page.getByRole('button', { name: '创建免费账号' }).click();
  await page.getByLabel('怎么称呼你').fill('Native Outage QA');
  await page.getByLabel('邮箱地址').fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByText('云空间用量暂不可用', { exact: true })).toBeVisible();
  await restart();
  await expect(page.getByText('云空间用量暂不可用', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '账号设置' }).click();
  await expect(page.getByLabel('显示名称')).toHaveValue('Native Outage QA');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByLabel('邮箱地址').fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('云空间用量暂不可用', { exact: true })).toBeVisible();
  await mode('online');
  await restart();
  await expect(page.getByRole('progressbar', { name: '云空间用量' })).toBeVisible();
  await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('Native outage draft');
  await page.getByRole('textbox', { name: '文档正文' }).fill('Cloud original');
  await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
  await mode('offline');
  await page.getByRole('textbox', { name: '文档正文' }).fill('Native pending content survives 503');
  await expect(page.getByText('已保存到此设备 · 待同步')).toBeVisible();
  await mode('storage-unavailable');
  await restart();
  await expect(page.getByText('云空间用量暂不可用', { exact: true })).toBeVisible();
  await expect(page.locator('.local-draft-row')).toHaveCount(1);
  await expect(page.locator('.nav-count, .count-pill')).toHaveCount(0);
  await page.screenshot({
    path: 'releases/mobile/android-native-outage.png',
    animations: 'disabled',
  });
  await page.locator('.local-draft-row').click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    'Native pending content survives 503',
  );
  await mode('online');
  await restart();
  await page
    .getByRole('button', { name: 'Native outage draft DOCX · 文字文档', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    'Native pending content survives 503',
  );
  await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回工作空间' }).click();
  await expect(page.locator('.local-draft-row')).toHaveCount(0);
  await expect(page.getByRole('progressbar', { name: '云空间用量' })).toBeVisible();
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await page.getByRole('button', { name: '云服务连接', exact: true }).click();
  await page.getByLabel('云服务地址', { exact: true }).fill('http://127.0.0.1:3173');
  await page.getByRole('button', { name: '连接云服务', exact: true }).click();
  console.log(
    'Native Android HTTP 503 passed: registration/login cookie, process restart, account access, pending draft visibility, recovery synchronization and quota restoration.',
  );
} catch (error) {
  throw new Error(error.message);
} finally {
  await browser?.close();
  adb('reverse', '--remove', 'tcp:3174');
  if (proxy.exitCode === null) {
    proxy.stdin.end('quit\n');
    await once(proxy, 'exit');
  }
}
