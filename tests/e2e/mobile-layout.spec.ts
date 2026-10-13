import { test, expect } from '@playwright/test';

test('native mobile chrome keeps three editors usable across phone and tablet sizes', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => document.documentElement.classList.add('native-mobile'));
  await page.getByRole('button', { name: '创建免费账号' }).click();
  await page.getByLabel('怎么称呼你').fill('移动创作者');
  await page.getByLabel('邮箱地址').fill(`mobile-layout-${crypto.randomUUID()}@example.com`);
  await page.getByLabel('密码', { exact: true }).fill('mobile-test-password');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  const sizes = [
    { width: 360, height: 780 },
    { width: 430, height: 930 },
    { width: 780, height: 360 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ];
  for (const [kind, name] of [
    ['word', '新建文字文档 落笔'],
    ['sheet', '新建电子表格 用数据'],
    ['slide', '新建演示文稿 把好想法'],
  ]) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.locator('.editor-shell')).toBeVisible();
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expect(page.getByRole('button', { name: '返回工作空间' })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      const back = await page.getByRole('button', { name: '返回工作空间' }).boundingBox();
      expect(back!.width).toBeGreaterThanOrEqual(44);
      expect(back!.height).toBeGreaterThanOrEqual(44);
      const content = await page
        .locator(`.${kind === 'slide' ? 'slides' : kind}-editor`)
        .boundingBox();
      expect(content!.height).toBeGreaterThan(70);
    }
    await page.setViewportSize(sizes[0]);
    await page.screenshot({ path: `test-results/mobile-${kind}-360.png` });
    await page.getByRole('button', { name: '返回工作空间' }).click();
  }
});
