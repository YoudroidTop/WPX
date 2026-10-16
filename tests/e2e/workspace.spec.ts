import { test, expect, type Page } from '@playwright/test';
async function register(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '创建免费账号' }).first().click();
  await page.getByLabel('怎么称呼你').fill('林间');
  await page.getByLabel('邮箱地址').fill(`qa-${crypto.randomUUID()}@example.com`);
  await page.getByLabel('密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByText('林间，开启今天的好想法。')).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.getByText('已保存到云端', { exact: true })).toBeVisible();
}
async function back(page: Page) {
  await page.getByRole('button', { name: '返回工作空间' }).click();
  await expect(page.getByText('YOUR SPACE TO CREATE')).toBeVisible();
}

test('spreadsheet preserves IME composition focus and saves committed text', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: /新建电子表格 用数据/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('IME regression');
  const cell = (address: string) => page.getByRole('textbox', { name: address, exact: true });
  await cell('B2').fill('ni');
  // Synthetic events isolate application interception; native IME acceptance is separate.
  for (const key of ['Enter', 'ArrowDown', 'ArrowUp', 'Tab']) {
    const intercepted = await cell('B2').evaluate((input, key) => {
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
    await expect(cell('B2')).toBeFocused();
    await expect(cell('B2')).toHaveValue('ni');
  }
  await cell('B2').fill('你好');
  await cell('B2').press('Enter');
  await expect(cell('B3')).toBeFocused();
  await cell('B3').press('ArrowUp');
  await expect(cell('B2')).toBeFocused();
  await cell('B2').press('Tab');
  await expect(cell('C2')).toBeFocused();
  await saved(page);
  await back(page);
  await page.reload();
  await page.getByRole('button', { name: 'IME regression XLSX · 电子表格' }).click();
  await expect(cell('B2')).toHaveValue('你好');
  await expect(cell('B3')).toHaveValue('');
});

test('spreadsheet rejects oversized clipboard rectangles and preserves saved contents', async ({
  page,
}) => {
  await register(page);
  await page.getByRole('button', { name: /新建电子表格 用数据/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('Paste boundaries');
  const cell = (address: string) => page.getByRole('textbox', { name: address, exact: true });
  await cell('A1').fill('keep');
  await cell('B1').fill('original');
  await saved(page);
  async function paste(text: string) {
    await cell('A1').focus();
    await cell('A1').evaluate((input, value) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', value);
      input.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      );
    }, text);
  }
  for (const [text, reason] of [
    [Array(501).fill('replace').join('\n'), '500 行'],
    [Array(53).fill('replace').join('\t'), '52 列'],
    [`replace\t${'x'.repeat(10001)}`, '10000 字符'],
  ]) {
    await paste(text);
    await expect(page.getByRole('alert')).toContainText(reason);
    await expect(cell('A1')).toHaveValue('keep');
    await expect(cell('B1')).toHaveValue('original');
  }
  await back(page);
  await page.reload();
  await page.getByRole('button', { name: 'Paste boundaries XLSX · 电子表格' }).click();
  await expect(cell('A1')).toHaveValue('keep');
  await expect(cell('B1')).toHaveValue('original');
  await paste('120\t\r\n80\t=SUM(A1:A2)\r\n');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await cell('C1').click();
  await expect(cell('A1')).toHaveValue('120');
  await expect(cell('B1')).toHaveValue('');
  await expect(cell('B2')).toHaveValue('200');
  await saved(page);
});

test('three editors persist content, export Office files, and manage the cloud library', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await register(page);
  await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('新一季的灵感计划');
  const body = page.getByRole('textbox', { name: '文档正文' });
  await body.fill('把每一个好想法变成现实。');
  await body.press('Enter');
  await body.pressSequentially('A thoughtful beginning.');
  await saved(page);
  await page.screenshot({
    path: 'test-results/word-editor.png',
    fullPage: true,
    animations: 'disabled',
  });
  const docx = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 DOCX' }).click();
  expect((await docx).suggestedFilename()).toBe('新一季的灵感计划.docx');
  await back(page);
  await page.getByRole('button', { name: /新建电子表格 用数据/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('十月工作计划');
  await page.getByRole('textbox', { name: 'A1', exact: true }).dblclick();
  await page.getByRole('textbox', { name: 'A1', exact: true }).fill('120');
  await page.getByRole('textbox', { name: 'A2', exact: true }).dblclick();
  await page.getByRole('textbox', { name: 'A2', exact: true }).fill('80');
  await page.getByRole('textbox', { name: 'B1', exact: true }).dblclick();
  await page.getByRole('textbox', { name: 'B1', exact: true }).fill('=SUM(A1:A2)');
  await page.getByRole('textbox', { name: 'C1', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'B1', exact: true })).toHaveValue('200');
  await saved(page);
  await page.screenshot({
    path: 'test-results/sheet-editor.png',
    fullPage: true,
    animations: 'disabled',
  });
  const xlsx = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 XLSX' }).click();
  expect((await xlsx).suggestedFilename()).toBe('十月工作计划.xlsx');
  await back(page);
  await page.getByRole('button', { name: /新建演示文稿 把好/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('让好想法被看见');
  await page.getByRole('textbox', { name: '幻灯片标题', exact: true }).fill('让好想法，被看见。');
  await page
    .getByRole('textbox', { name: '幻灯片正文', exact: true })
    .fill('从灵感到行动\n卓乐文档 · 秋日创作提案');
  await page.getByRole('button', { name: '新建幻灯片', exact: true }).click();
  await page.getByRole('textbox', { name: '幻灯片标题', exact: true }).fill('下一步，开始创造');
  await page.getByRole('button', { name: '午夜主题' }).click();
  await saved(page);
  await page.screenshot({
    path: 'test-results/slide-editor.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '开始放映' }).click();
  await expect(page.getByRole('dialog', { name: '幻灯片放映' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('heading', { name: '让好想法，被看见。' })).toBeVisible();
  await page.keyboard.press('Escape');
  const pptx = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 PPTX' }).click();
  expect((await pptx).suggestedFilename()).toBe('让好想法被看见.pptx');
  await back(page);
  await page.reload();
  await expect(page.getByText('林间，开启今天的好想法。')).toBeVisible();
  await page.getByRole('button', { name: '星标 新一季的灵感计划', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '取消星标 新一季的灵感计划', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/workspace-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '新一季的灵感计划 DOCX · 文字文档' }).click();
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText(
    '把每一个好想法变成现实。',
  );
  await back(page);
  await page.getByRole('textbox', { name: '搜索文档' }).fill('十月');
  await expect(page.locator('.file-row')).toHaveCount(1);
  await page.getByRole('button', { name: '更多操作 十月工作计划' }).click();
  await page.getByRole('button', { name: '移入回收站' }).click();
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await expect(page.locator('.file-row')).toHaveCount(1);
  await page.getByRole('button', { name: '更多操作 十月工作计划' }).click();
  await page.getByRole('button', { name: '恢复文档' }).click();
  await expect(page.getByText('回收站空空的，很清爽')).toBeVisible();
  await page.getByRole('button', { name: '最近使用', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/workspace-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('conflict keeps local draft and exposes a downloadable backup', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
  const response = await page.request.get('/api/documents');
  const data = await response.json();
  const doc = data.documents[0];
  const remoteUpdate = await page.request.patch(`/api/documents/${doc.id}`, {
    headers: { Origin: new URL(page.url()).origin },
    data: { revision: doc.revision, name: 'Other window' },
  });
  expect(remoteUpdate.status()).toBe(200);
  await page.getByRole('textbox', { name: '文档正文' }).fill('Local unsaved idea');
  await expect(page.getByRole('alert')).toContainText('文档已在其他窗口更新');
  await expect(page.getByRole('textbox', { name: '文档正文' })).toContainText('Local unsaved idea');
  const backup = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载本地备份' }).click();
  expect((await backup).suggestedFilename()).toMatch(/\.zdoc$/);
});

test('mobile login is usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'test-results/login-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'test-results/login-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('native import, rich-text tables, profile changes and sign-out work end to end', async ({
  page,
}) => {
  await register(page);
  await page.locator('input[type=file]').setInputFiles({
    name: '原生备份.zdoc',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        type: 'word',
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '完整保留的文字', marks: [{ type: 'bold' }] }],
            },
          ],
        },
      }),
    ),
  });
  await expect(page.getByRole('dialog', { name: '导入到云空间' })).toBeVisible();
  await page.getByRole('button', { name: '导入基础内容' }).click();
  await expect(page.getByRole('textbox', { name: '文档名称', exact: true })).toHaveValue(
    '原生备份',
  );
  await expect(page.locator('.tiptap strong')).toHaveText('完整保留的文字');
  await page.getByRole('textbox', { name: '文档正文' }).click();
  await page.getByRole('button', { name: '插入表格', exact: true }).click();
  await expect(page.locator('.tiptap table')).toBeVisible();
  await saved(page);
  await back(page);
  await page.getByRole('button', { name: '原生备份 DOCX · 文字文档' }).click();
  await expect(page.locator('.tiptap table')).toBeVisible();
  await back(page);
  await page.getByRole('button', { name: '更多操作 原生备份' }).click();
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('可恢复的办公文档');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '可恢复的办公文档 DOCX · 文字文档' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '账号设置' }).click();
  await page.getByLabel('显示名称').fill('创作者');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('创作者，开启今天的好想法。')).toBeVisible();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
});

test('Word table text survives DOCX download and browser import', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: /新建文字文档 落笔/ }).click();
  await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('Table roundtrip');
  await page.getByRole('textbox', { name: '文档正文' }).fill('Before table');
  await page.getByRole('button', { name: '插入表格', exact: true }).click();
  const firstCell = page.locator('.tiptap table tr').first().locator('th, td').first();
  await firstCell.click();
  await page.keyboard.type('First line');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Second line');
  await saved(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 DOCX' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const { readFile } = await import('node:fs/promises');
  await back(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'Imported table.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await readFile(path!),
  });
  await page.getByRole('button', { name: '导入基础内容' }).click();
  await expect(page.locator('.tiptap table')).toBeVisible();
  await expect(firstCell).toContainText('First line');
  await expect(firstCell).toContainText('Second line');
  await expect(firstCell.locator('br')).toHaveCount(1);
  await expect(page.locator('.tiptap')).toContainText('Before table');
  await page.screenshot({ path: 'test-results/word-table-roundtrip.png' });
});

test('PPTX download and import preserve blank title, notes and selected theme', async ({
  page,
}) => {
  await register(page);
  await page.getByRole('button', { name: /新建演示文稿 把好/ }).click();
  await page.getByRole('textbox', { name: '幻灯片标题', exact: true }).fill('');
  await page.getByRole('textbox', { name: '幻灯片正文', exact: true }).fill(' First\nSecond ');
  await page.getByRole('textbox', { name: '演讲者备注', exact: true }).fill(' Note one\nNote two ');
  await page.getByRole('button', { name: '午夜主题' }).click();
  await saved(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 PPTX' }).click();
  const path = await (await downloadPromise).path();
  expect(path).toBeTruthy();
  const { readFile } = await import('node:fs/promises');
  await back(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'Imported presentation.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: await readFile(path!),
  });
  await page.getByRole('button', { name: '导入基础内容' }).click();
  await expect(page.getByRole('textbox', { name: '幻灯片标题', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '幻灯片正文', exact: true })).toHaveValue(
    ' First\nSecond ',
  );
  await expect(page.getByRole('textbox', { name: '演讲者备注', exact: true })).toHaveValue(
    ' Note one\nNote two ',
  );
  await expect(page.getByRole('button', { name: '午夜主题' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: 'test-results/presentation-roundtrip.png' });
});

test('authenticated storage outage keeps account settings available and never displays zero usage', async ({
  page,
}) => {
  const unavailable = async (route: import('@playwright/test').Route) => {
    const response = await route.fetch();
    const account = await response.json();
    await route.fulfill({
      response,
      status: 503,
      json: {
        error: 'Storage suspended',
        code: 'ACCOUNT_STORAGE_UNAVAILABLE',
        account: { ...account, usedBytes: null },
      },
    });
  };
  await page.route('**/api/auth/register', unavailable);
  await page.route('**/api/me', unavailable);
  await page.route('**/api/documents', (route) =>
    route.fulfill({ status: 503, json: { error: 'Storage suspended' } }),
  );
  await register(page);
  await expect(page.getByText('云空间用量暂不可用', { exact: true })).toBeVisible();
  await expect(page.getByText('云空间暂时不可用', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '云空间用量' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('云空间用量暂不可用', { exact: true })).toBeVisible();
  await expect(page.getByText('云空间暂时不可用', { exact: true })).toBeVisible();
  await expect(page.locator('.nav-count')).toHaveCount(0);
  await expect(page.locator('.count-pill')).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/web/storage-unavailable.png',
    animations: 'disabled',
  });
  await page.locator('.profile-button').click();
  await expect(page.getByLabel('显示名称')).toBeVisible();
  await page.getByLabel('显示名称').fill('恢复期间改名');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('个人资料已更新', { exact: true })).toBeVisible();
  await page.getByLabel('当前密码', { exact: true }).fill('browser-test-password');
  await page.getByLabel('新密码', { exact: true }).fill('outage-updated-password');
  await page.getByRole('button', { name: '更新密码', exact: true }).click();
  await expect(page.getByText('密码已修改，其他设备的登录已退出', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
});
