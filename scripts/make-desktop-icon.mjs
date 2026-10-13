import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>body{margin:0;background:transparent}</style>${await readFile('desktop/assets/icon.svg', 'utf8')}`,
  );
  await page.screenshot({ path: 'desktop/assets/icon.png', omitBackground: true });
} finally {
  await browser.close();
}
