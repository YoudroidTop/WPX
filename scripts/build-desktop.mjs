import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const root = JSON.parse(readFileSync('package.json', 'utf8'));
await mkdir('desktop-dist/app', { recursive: true });
await build({
  entryPoints: ['desktop/main.ts'],
  outfile: 'desktop-dist/app/main.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  external: ['electron'],
  format: 'cjs',
});
await build({
  entryPoints: ['desktop/preload.ts'],
  outfile: 'desktop-dist/app/preload.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  external: ['electron'],
  format: 'cjs',
});
await rm('desktop-dist/web', { recursive: true, force: true });
await cp('dist', 'desktop-dist/web', { recursive: true });
await writeFile(
  'desktop-dist/package.json',
  JSON.stringify(
    {
      name: 'zhuole-docs-desktop',
      productName: '卓乐文档',
      version: root.version,
      description: 'Zhuole Docs desktop office suite',
      author: 'youdroid',
      main: 'app/main.cjs',
    },
    null,
    2,
  ),
);
