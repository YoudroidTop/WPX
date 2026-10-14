import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const origin = 'https://wpx.youdroid.top';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SMOKE_PROXY ? { proxy: { server: process.env.SMOKE_PROXY } } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const saved = () =>
  expect(page.getByText('已保存到云端', { exact: true })).toBeVisible({ timeout: 20000 });
const back = async () => {
  await page.getByRole('button', { name: '返回工作空间' }).click();
  await expect(page.getByText('YOUR SPACE TO CREATE')).toBeVisible();
};
try {
  await page.goto(origin);
  await page.getByRole('button', { name: '创建免费账号' }).click();
  await page.getByLabel('怎么称呼你').fill('公网验收');
  await page.getByLabel('邮箱地址').fill(`browser-${randomUUID()}@example.com`);
  await page.getByLabel('密码', { exact: true }).fill(randomUUID());
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByText('公网验收，开启今天的好想法。')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('Live Word QA');
  await page.getByRole('textbox', { name: '文档正文' }).fill('卓乐云文档公网保存验证。');
  await saved();
  await back();
  await page.getByRole('button', { name: /新建电子表格 用数据/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('Live Sheet IME QA');
  const imeCell = page.getByRole('textbox', { name: 'D2', exact: true });
  await imeCell.fill('ni');
  // Check event interception separately from native OS candidate selection.
  for (const key of ['Enter', 'ArrowDown', 'ArrowUp', 'Tab']) {
    const intercepted = await imeCell.evaluate((input, key) => {
      const event = new KeyboardEvent('keydown', {
        key,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    }, key);
    expect(intercepted).toBe(false);
    await expect(imeCell).toBeFocused();
  }
  await imeCell.fill('你好');
  await imeCell.press('Enter');
  await expect(page.getByRole('textbox', { name: 'D3', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'A1', exact: true }).fill('120');
  await page.getByRole('textbox', { name: 'A2', exact: true }).fill('80');
  await page.getByRole('textbox', { name: 'B1', exact: true }).fill('=SUM(A1:A2)');
  await page.getByRole('textbox', { name: 'C1', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'B1', exact: true })).toHaveValue('200');
  await saved();
  for (const [value, reason] of [
    [Array(501).fill('replace').join('\n'), '500 行'],
    [Array(53).fill('replace').join('\t'), '52 列'],
    [`replace\t${'x'.repeat(10001)}`, '10000 字符'],
  ]) {
    await page.getByRole('textbox', { name: 'A1', exact: true }).evaluate((input, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      input.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      );
    }, value);
    await expect(page.getByRole('alert')).toContainText(reason);
    await expect(page.getByRole('textbox', { name: 'A1', exact: true })).toHaveValue('120');
    await expect(page.getByRole('textbox', { name: 'B1', exact: true })).toHaveValue('200');
  }
  await back();
  await page.getByRole('button', { name: /新建演示文稿 把好/ }).click();
  await page.getByRole('textbox', { name: '幻灯片标题', exact: true }).fill('Live presentation QA');
  await saved();
  await page.getByRole('button', { name: '开始放映' }).click();
  await expect(page.getByRole('dialog', { name: '幻灯片放映' })).toBeVisible();
  await page.keyboard.press('Escape');
  await back();
  await page.reload();
  await page.getByRole('button', { name: 'Live Word QA DOCX · 文字文档' }).click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    '卓乐云文档公网保存验证。',
  );
  await back();
  await page.getByRole('button', { name: 'Live Sheet IME QA XLSX · 电子表格' }).click();
  await expect(imeCell).toHaveValue('你好');
  await expect(page.getByRole('textbox', { name: 'B1', exact: true })).toHaveValue('200');
  await back();
  await mkdir('releases/cloudflare', { recursive: true });
  await expect(page.locator('.file-row')).toHaveCount(3);
  await page.screenshot({
    path: 'releases/cloudflare/live-workspace.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
  // Only this generated account's test documents are removed.
  const listing = await page.request.get(`${origin}/api/documents`);
  expect(listing.status()).toBe(200);
  for (const doc of (await listing.json()).documents) {
    const trash = await page.request.patch(`${origin}/api/documents/${doc.id}`, {
      headers: { Origin: origin },
      data: { revision: doc.revision, deleted: true },
    });
    expect(trash.status()).toBe(200);
    const removed = await page.request.delete(`${origin}/api/documents/${doc.id}`, {
      headers: { Origin: origin },
      data: { revision: (await trash.json()).revision },
    });
    expect(removed.status()).toBe(204);
  }
  if (process.env.SMOKE_STORAGE_OUTAGE === '1') {
    // Browser-only injection: production storage and other accounts are untouched.
    await page.route('**/api/me', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.fulfill({
        response,
        status: 503,
        json: {
          error: 'Storage unavailable during browser smoke',
          code: 'ACCOUNT_STORAGE_UNAVAILABLE',
          account: { ...(await response.json()), usedBytes: null },
        },
      });
    });
    await page.route('**/api/documents', (route) =>
      route.fulfill({ status: 503, json: { error: 'Storage unavailable during browser smoke' } }),
    );
    await page.reload();
    await expect(page.getByText('云空间用量暂不可用', { exact: true })).toBeVisible();
    await expect(page.getByText('云空间暂时不可用', { exact: true })).toBeVisible();
    await expect(page.locator('.nav-count, .count-pill')).toHaveCount(0);
    await expect(page.getByRole('progressbar', { name: '云空间用量' })).toHaveCount(0);
    await page.screenshot({
      path: 'releases/cloudflare/live-storage-unavailable.png',
      fullPage: true,
      animations: 'disabled',
    });
    console.log('Deployed browser bundle passed browser-injected storage outage UI checks.');
  }
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  console.log(
    'Production browser passed: registration, Word persistence, sheet formula and IME event/persistence regression, slide presentation, reload, logout. Test documents removed.',
  );
} finally {
  await browser.close();
}
