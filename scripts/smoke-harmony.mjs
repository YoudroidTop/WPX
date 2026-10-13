import { chromium, expect as baseExpect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const expect = baseExpect.configure({ timeout: 30000 });
const origin = 'https://wpx.youdroid.top';
const credentials = { email: `harmony-${randomUUID()}@example.com`, password: randomUUID() };
const apiPattern = '**/api/**';
const blockApi = (route) => route.abort('internetdisconnected');
// Attach only to the forwarded debug ArkWeb belonging to the installed application.
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224', { noDefaults: true });
const page = browser
  .contexts()[0]
  .pages()
  .find((value) => value.url() === origin + '/');
if (!page) throw new Error('Zhuole Harmony debug page unavailable');
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const saved = () =>
  expect(page.getByText('已保存到云端', { exact: true })).toBeVisible({ timeout: 20000 });
const back = async () => {
  await page.getByRole('button', { name: '返回工作空间' }).click();
  await expect(page.getByText('YOUR SPACE TO CREATE')).toBeVisible();
};
try {
  await page.reload();
  expect(await page.evaluate(() => Boolean(window.ZhuoleHarmony))).toBe(true);
  const qaGreeting = page.getByText(/^(鸿蒙验收|鸿蒙隔离验收)，开启今天的好想法。$/);
  await expect(qaGreeting.or(page.getByRole('button', { name: '创建免费账号' }))).toBeVisible();
  if (await qaGreeting.isVisible()) {
    await page.getByRole('button', { name: '账号设置' }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
  }
  await page.getByRole('button', { name: '创建免费账号' }).click();
  await page.getByLabel('怎么称呼你').fill('鸿蒙验收');
  await page.getByLabel('邮箱地址').fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByText('鸿蒙验收，开启今天的好想法。')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('Harmony Word QA');
  await page.getByRole('textbox', { name: '文档正文' }).fill('卓乐云文档公网保存验证。');
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
    .fill('Harmony presentation QA');
  await saved();
  await page.getByRole('button', { name: '开始放映' }).click();
  await expect(page.getByRole('dialog', { name: '幻灯片放映' })).toBeVisible();
  await page.getByRole('button', { name: '退出放映', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '幻灯片放映' })).toBeHidden();
  await back();
  await page.reload();
  await page.getByRole('button', { name: 'Harmony Word QA DOCX · 文字文档' }).click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    '卓乐云文档公网保存验证。',
  );
  await back();
  await mkdir('releases/harmony', { recursive: true });
  await expect(page.locator('.file-row')).toHaveCount(3);
  await page.screenshot({
    path: 'releases/harmony/device-workspace.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
  await page.route(apiPattern, blockApi);
  await page.reload();
  await expect(page.getByText('鸿蒙验收，开启今天的好想法。')).toBeVisible();
  await page.getByRole('button', { name: 'Harmony Word QA DOCX · 文字文档' }).click();
  await page.getByRole('textbox', { name: '文档正文' }).fill('Harmony offline draft persists.');
  await expect(page.getByText('已保存到此设备 · 待同步')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Harmony Word QA DOCX · 文字文档' }).click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    'Harmony offline draft persists.',
  );
  await page.unroute(apiPattern, blockApi);
  await page.getByRole('button', { name: '重新连接', exact: true }).click();
  await saved();
  const persisted = await page.evaluate(async () => {
    const list = await (await fetch('/api/documents')).json();
    const word = list.documents.find((doc) => doc.name === 'Harmony Word QA');
    return (await (await fetch(`/api/documents/${word.id}`)).json()).content;
  });
  expect(JSON.stringify(persisted)).toContain('Harmony offline draft persists.');
  await back();
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '创建免费账号' }).click();
  await page.getByLabel('怎么称呼你').fill('鸿蒙隔离验收');
  await page.getByLabel('邮箱地址').fill(`harmony-isolation-${randomUUID()}@example.com`);
  await page.getByLabel('密码', { exact: true }).fill(randomUUID());
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByText('第一份好想法，从这里开始')).toBeVisible();
  await page.route(apiPattern, blockApi);
  await page.reload();
  await expect(page.getByText('鸿蒙隔离验收，开启今天的好想法。')).toBeVisible();
  await expect(page.getByText('第一份好想法，从这里开始')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Harmony Word QA DOCX · 文字文档' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await page.unroute(apiPattern, blockApi);
  await page.getByLabel('邮箱地址').fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Harmony Word QA DOCX · 文字文档' })).toBeVisible();
  expect(errors).toEqual([]);
  // Only this generated account's test documents are removed.
  const cleanup = await page.evaluate(async () => {
    const listing = await fetch('/api/documents');
    const documents = (await listing.json()).documents;
    const results = [];
    for (const doc of documents) {
      const trash = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: doc.revision, deleted: true }),
      });
      const revision = (await trash.json()).revision;
      const removed = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision }),
      });
      results.push([trash.status, removed.status]);
    }
    return results;
  });
  expect(cleanup).toEqual([
    [200, 204],
    [200, 204],
    [200, 204],
  ]);
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  console.log(
    'Harmony physical-device ArkWeb passed: registration, Word persistence, sheet formula, slide presentation, reload, offline draft persistence and sync, account isolation, offline logout and recovery. Test documents removed.',
  );
} catch (error) {
  // Avoid Playwright snapshots containing generated registration passwords in logs.
  console.error(String(error.message).split('Call log:')[0]);
  process.exitCode = 1;
} finally {
  await page.unroute(apiPattern, blockApi);
  await browser.close();
}
