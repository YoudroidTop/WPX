import { chromium } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>body{margin:0;background:#fffdf4}svg{width:100vw;height:100vh}</style>${await readFile('desktop/assets/icon.svg', 'utf8')}`,
  );
  await page.screenshot({
    path: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  });
  for (const [density, size] of Object.entries({
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192,
  })) {
    await page.setViewportSize({ width: size, height: size });
    for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground'])
      await page.screenshot({ path: `android/app/src/main/res/mipmap-${density}/${name}.png` });
  }
  const splashPaths = (await readdir('ios/App/App/Assets.xcassets/Splash.imageset'))
    .filter((name) => name.endsWith('.png'))
    .map((name) => `ios/App/App/Assets.xcassets/Splash.imageset/${name}`);
  for (const directory of await readdir('android/app/src/main/res')) {
    if (directory.startsWith('drawable')) {
      const path = `android/app/src/main/res/${directory}/splash.png`;
      try {
        await readFile(path);
        splashPaths.push(path);
      } catch {}
    }
  }
  for (const path of splashPaths) {
    const png = await readFile(path);
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<style>body{margin:0;background:#fffdf4;display:grid;place-items:center;height:100vh}svg{width:20vmin;height:20vmin}</style>${await readFile('desktop/assets/icon.svg', 'utf8')}`,
    );
    await page.screenshot({ path });
  }
} finally {
  await browser.close();
}
