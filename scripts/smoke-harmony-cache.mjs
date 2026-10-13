import { chromium, expect as baseExpect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const expect = baseExpect.configure({ timeout: 30000 });
const credentials = JSON.parse(readFileSync('releases/harmony/file-qa-credentials.json', 'utf8'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224', { noDefaults: true });
const page = browser
  .contexts()[0]
  .pages()
  .find((page) => page.url() === 'https://wpx.youdroid.top/');
if (!page) throw new Error('Zhuole debug page unavailable');
const names = ['Draft', 'Synced'].map((kind) => `Cache ${kind} ${randomUUID().slice(0, 8)}`);
const offline = (route) => route.abort('internetdisconnected');
try {
  if (await page.getByRole('heading', { name: '欢迎回来' }).isVisible()) {
    await page.getByLabel('邮箱地址').fill(credentials.email);
    await page.getByLabel('密码', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
  }
  await expect(page.getByText('文件验收，开启今天的好想法。')).toBeVisible();
  expect(await page.evaluate(async () => (await (await fetch('/api/me')).json()).email)).toBe(
    credentials.email,
  );
  for (const name of names) {
    await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
    await page.getByRole('textbox', { name: '文档名称', exact: true }).fill(name);
    await page.getByRole('textbox', { name: '文档正文' }).fill(`Cloud ${name}`);
    await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回工作空间' }).click();
  }
  await page.getByRole('button', { name: `${names[0]} DOCX · 文字文档`, exact: true }).click();
  await page.route('**/api/**', offline);
  await page.getByRole('textbox', { name: '文档正文' }).fill('Protected pending draft');
  await expect(page.getByText('已保存到此设备 · 待同步')).toBeVisible();
  await page.getByRole('button', { name: '返回工作空间' }).click();
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByRole('button', { name: '清理已同步缓存', exact: true }).click();
  await page.getByRole('button', { name: '确认清理缓存', exact: true }).click();
  await expect(page.getByText(/已清理 [1-9]\d* 份文档缓存，未同步草稿已保留/)).toBeVisible();
  await page.screenshot({ path: 'releases/harmony/cache-cleanup.png' });
  await page.reload();
  await page.locator('.local-draft-row').filter({ hasText: names[0] }).click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    'Protected pending draft',
  );
  await page.getByRole('button', { name: '返回工作空间' }).click();
  await page.getByRole('button', { name: `${names[1]} DOCX · 文字文档`, exact: true }).click();
  await expect(page.getByText('云服务暂不可用；尚未缓存的文档需要联网打开')).toBeVisible();
  await page.unroute('**/api/**', offline);
  await page.getByRole('button', { name: `${names[1]} DOCX · 文字文档`, exact: true }).click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(`Cloud ${names[1]}`);
  console.log('Harmony cache cleanup, offline pending-draft recovery and cloud redownload passed.');
} catch (error) {
  console.error(String(error.message).split('Call log:')[0]);
  process.exitCode = 1;
} finally {
  try {
    await page.unroute('**/api/**', offline);
    await page.reload();
    await expect(page.getByText('文件验收，开启今天的好想法。')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async (name) => {
          const listing = await (await fetch('/api/documents')).json();
          const doc = listing.documents.find((value) => value.name === name);
          if (!doc) return '';
          return JSON.stringify((await (await fetch(`/api/documents/${doc.id}`)).json()).content);
        }, names[0]),
      )
      .toContain('Protected pending draft');
    await expect(page.locator('.local-draft-row')).toHaveCount(0);
    await page.evaluate(
      async ({ email, names }) => {
        const account = await (await fetch('/api/me')).json();
        if (account.email !== email) throw new Error('QA account changed; cleanup skipped');
        const listing = await (await fetch('/api/documents')).json();
        for (const doc of listing.documents.filter((doc) => names.includes(doc.name))) {
          const trash = await fetch(`/api/documents/${doc.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revision: doc.revision, deleted: true }),
          });
          if (!trash.ok) throw new Error('QA trash failed');
          const removed = await fetch(`/api/documents/${doc.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revision: (await trash.json()).revision }),
          });
          if (removed.status !== 204) throw new Error('QA cleanup failed');
        }
      },
      { email: credentials.email, names },
    );
    await page.getByRole('button', { name: '账号设置' }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  } catch (error) {
    console.error('QA cleanup failed: ' + String(error.message).split('Call log:')[0]);
    process.exitCode = 1;
  }
  await browser.close();
}
