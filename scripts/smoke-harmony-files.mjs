import { randomUUID } from 'node:crypto';
import { chromium, expect as baseExpect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const runId = randomUUID().slice(0, 8);
const expect = baseExpect.configure({ timeout: 30000 });
const hdc = (...args) =>
  execFileSync(process.env.HDC, ['-t', process.env.HARMONY_DEVICE, ...args], { encoding: 'utf8' });
if (!process.env.HDC || !process.env.HARMONY_DEVICE)
  throw new Error('HDC and HARMONY_DEVICE required');
// This explicit fixture file belongs to the account prepared for native picker QA.
const credentials = JSON.parse(readFileSync('releases/harmony/file-qa-credentials.json', 'utf8'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224', { noDefaults: true });
const page = browser
  .contexts()[0]
  .pages()
  .find((value) => value.url() === 'https://wpx.youdroid.top/');
if (!page) throw new Error('Zhuole debug WebView unavailable');
page.setDefaultTimeout(30000);
function layout() {
  hdc('shell', 'uitest', 'dumpLayout', '-p', '/data/local/tmp/zhuole-file-qa.json');
  hdc(
    'file',
    'recv',
    '/data/local/tmp/zhuole-file-qa.json',
    'releases/harmony/file-qa-layout.json',
  );
  const nodes = [];
  const walk = (node) => {
    if (node.attributes) nodes.push(node.attributes);
    for (const child of node.children || []) walk(child);
  };
  walk(JSON.parse(readFileSync('releases/harmony/file-qa-layout.json', 'utf8')));
  return nodes;
}
function click(node) {
  if (!node || node.enabled !== 'true') throw new Error('Native picker target unavailable');
  const [left, top, right, bottom] = node.bounds.match(/\d+/g).map(Number);
  hdc(
    'shell',
    'uitest',
    'uiInput',
    'click',
    String(Math.round((left + right) / 2)),
    String(Math.round((top + bottom) / 2)),
  );
}
function nativeText(nodes, text) {
  return nodes.find((node) => node.type === 'Text' && node.text === text);
}
async function roundTrip(extension, verify) {
  const name = `Harmony Picker ${extension.toUpperCase()} ${runId}`;
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill(name);
  await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `导出 ${extension.toUpperCase()}`, exact: true }).click();
  let nodes;
  await expect
    .poll(() => {
      nodes = layout();
      return nodes.some(
        (node) => node.type === 'TextInput' && node.text === `${name}.${extension}`,
      );
    })
    .toBe(true);
  // The observed system save sheet exposes an unlabeled top-right confirmation button.
  const title = nodes.find((node) => node.type === 'Text' && node.text.startsWith('将文件保存至'));
  if (!title) throw new Error('Unexpected native save sheet');
  const titleTop = Number(title.bounds.match(/\d+/g)[1]);
  const buttons = nodes.filter(
    (node) =>
      node.type === 'Button' &&
      node.clickable === 'true' &&
      Number(node.bounds.match(/\d+/g)[3]) < titleTop,
  );
  buttons.sort((a, b) => Number(b.bounds.match(/\d+/g)[0]) - Number(a.bounds.match(/\d+/g)[0]));
  click(buttons[0]);
  await expect(
    page.getByRole('button', { name: `导出 ${extension.toUpperCase()}`, exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '返回工作空间' }).click();
  await page.getByRole('button', { name: '导入文档', exact: true }).click();
  nodes = layout();
  if (!nativeText(nodes, `${name}.${extension}`)) {
    click(nativeText(nodes, 'Download'));
    nodes = layout();
  }
  click(nativeText(nodes, `${name}.${extension}`));
  nodes = layout();
  click(nativeText(nodes, '完成'));
  await expect(page.getByRole('dialog', { name: '导入到云空间' })).toContainText(
    `${name}.${extension}`,
  );
  await page.getByRole('button', { name: '导入基础内容', exact: true }).click();
  await verify();
  await page.screenshot({ path: `releases/harmony/native-${extension}-roundtrip.png` });
  await page.getByRole('button', { name: '返回工作空间' }).click();
  console.log(`${extension.toUpperCase()} native save and picker reimport passed.`);
}
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
  await page.getByRole('textbox', { name: '文档正文' }).fill('Harmony native file round trip.');
  await roundTrip('docx', async () => {
    await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
      'Harmony native file round trip.',
    );
  });
  await page.getByRole('button', { name: /新建电子表格 用数据/ }).click();
  await page.getByRole('textbox', { name: 'A1', exact: true }).fill('120');
  await page.getByRole('textbox', { name: 'A2', exact: true }).fill('80');
  await page.getByRole('textbox', { name: 'B1', exact: true }).fill('=SUM(A1:A2)');
  await page.getByRole('textbox', { name: 'C1', exact: true }).click();
  await roundTrip('xlsx', async () => {
    await expect(page.getByRole('textbox', { name: 'B1', exact: true })).toHaveValue('200');
  });
  await page.getByRole('button', { name: /新建演示文稿 把好/ }).click();
  await page
    .getByRole('textbox', { name: '幻灯片标题', exact: true })
    .fill('Harmony native presentation round trip');
  await roundTrip('pptx', async () => {
    await expect(page.getByRole('textbox', { name: '幻灯片标题', exact: true })).toHaveValue(
      'Harmony native presentation round trip',
    );
  });
  const result = await page.evaluate(async () => {
    const listing = await (await fetch('/api/documents')).json();
    const results = [];
    for (const doc of listing.documents) {
      const trash = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: doc.revision, deleted: true }),
      });
      const body = await trash.json();
      const removed = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: body.revision }),
      });
      results.push([trash.status, removed.status]);
    }
    return results;
  });
  expect(result.length).toBeGreaterThanOrEqual(6);
  for (const status of result) expect(status).toEqual([200, 204]);
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  writeFileSync(
    'releases/harmony/file-qa-result.json',
    JSON.stringify({ passed: true, cloudDocumentsRemoved: result.length }),
  );
} catch (error) {
  console.error(String(error.message).split('Call log:')[0]);
  process.exitCode = 1;
} finally {
  await browser.close();
}
