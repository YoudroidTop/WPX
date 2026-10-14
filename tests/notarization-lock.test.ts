import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const script = resolve('scripts/notarize-mac.mjs');

test('notarization serializes record access and releases its lock after failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zhuole-notary-lock-'));
  const children: ReturnType<typeof spawn>[] = [];
  try {
    await mkdir(join(root, 'releases/desktop'), { recursive: true });
    await mkdir(join(root, 'bin'));
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.1.4' }));
    await writeFile(
      join(root, 'asc.env'),
      'ASC_API_KEY_PATH=fake.p8\nASC_KEY_ID=test\nASC_ISSUER_ID=test\n',
    );
    const records = join(root, 'releases/desktop/notarization.json');
    await writeFile(records, JSON.stringify([{ id: 'existing-job', status: 'In Progress' }]));
    await writeFile(
      join(root, 'bin/xcrun'),
      `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync('calls', process.argv.slice(2, 5).join(' ') + '\\n');
fs.writeFileSync('started', '1');
const timer = setInterval(() => {
  if (!fs.existsSync('release')) return;
  clearInterval(timer);
  if (fs.existsSync('fail')) { process.stderr.write('fixture failure'); process.exitCode = 1; }
  else process.stdout.write(JSON.stringify({ status: 'Accepted' }));
}, 20);
`,
      { mode: 0o700 },
    );
    const launch = () => {
      const child = spawn(process.execPath, [script, 'asc.env', '--status'], {
        cwd: root,
        env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH },
        timeout: 10000,
      });
      children.push(child);
      let output = '';
      child.stdout.on('data', (data) => {
        output += data;
      });
      child.stderr.on('data', (data) => {
        output += data;
      });
      return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, output }));
      });
    };
    const first = launch();
    for (let i = 0; i < 100; i++) {
      try {
        await access(join(root, 'started'));
        break;
      } catch {
        await delay(20);
      }
    }
    await access(join(root, 'started'));
    const second = await launch();
    assert.notEqual(second.code, 0);
    assert.match(second.output, /Another notarization operation holds/);
    assert.equal((await readFile(join(root, 'calls'), 'utf8')).trim().split('\n').length, 1);
    await writeFile(join(root, 'release'), '1');
    assert.equal((await first).code, 0);
    assert.equal(JSON.parse(await readFile(records, 'utf8'))[0].status, 'Accepted');
    await assert.rejects(access(join(root, 'releases/desktop/notarization.lock')));
    await writeFile(join(root, 'fail'), '1');
    assert.notEqual((await launch()).code, 0);
    await assert.rejects(access(join(root, 'releases/desktop/notarization.lock')));
    assert.equal(JSON.parse(await readFile(records, 'utf8'))[0].status, 'Accepted');
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    await rm(root, { recursive: true, force: true });
  }
});
