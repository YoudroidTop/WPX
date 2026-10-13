import { cp, mkdir, readdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const source = resolve('dist');
const resources = resolve('harmony/entry/src/main/resources/rawfile');
const target = resolve(resources, 'web');
// Only the generated bundled web directory is replaced.
await rm(target, { recursive: true, force: true });
await mkdir(resources, { recursive: true });
await cp(source, target, { recursive: true });
async function entries(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await entries(resolve(directory, entry.name), path)));
    else result.push(path);
  }
  return result;
}
await writeFile(resolve(resources, 'web-manifest.json'), JSON.stringify(await entries(source)));
