import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const origin = 'https://wpx.youdroid.top';
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
  await page.getByRole('button', { name: '创建免费账号' }).click();
  await page.getByLabel('怎么称呼你').fill('鸿蒙验收');
  await page.getByLabel('邮箱地址').fill(`harmony-${randomUUID()}@example.com`);
  await page.getByLabel('密码', { exact: true }).fill(randomUUID());
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
  await page.keyboard.press('Escape');
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
    'Harmony physical-device ArkWeb passed: registration, Word persistence, sheet formula, slide presentation, reload, logout. Test documents removed.',
  );
} finally {
  await browser.close();
}
