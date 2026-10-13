import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} failed: ${result.stderr || result.stdout}`);
  return `${result.stdout}\n${result.stderr}`;
}
async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const artifacts = [];
for (const arch of ['arm64', 'x64']) {
  for (const extension of ['dmg', 'zip']) {
    const name = `ZhuoleDocs-${version}-mac-${arch}${extension === 'zip' ? '-stapled' : ''}.${extension}`;
    const path = join('releases/desktop', name);
    const before = await hash(path);
    let app;
    let temporary;
    try {
      if (extension === 'zip') {
        temporary = await mkdtemp(join(tmpdir(), 'zhuole-distribution-'));
        run('ditto', ['-x', '-k', path, temporary]);
        app = join(temporary, '卓乐文档.app');
        const details = run('codesign', ['-dv', '--verbose=4', app]);
        assert.match(details, /^TeamIdentifier=Y4MB2B6UD3$/m);
        assert.match(details, /^Authority=Developer ID Application:/m);
        assert.match(details, /flags=.*\(.*runtime.*\)/);
        assert.equal(
          run('lipo', ['-archs', join(app, 'Contents/MacOS/卓乐文档')]).trim(),
          arch === 'x64' ? 'x86_64' : 'arm64',
        );
        run('codesign', ['--verify', '--deep', '--strict', app]);
        run('xcrun', ['stapler', 'validate', app]);
        assert.match(
          run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]),
          /source=Notarized Developer ID/,
        );
      } else {
        const details = run('codesign', ['-dv', '--verbose=4', path]);
        assert.match(details, /^TeamIdentifier=Y4MB2B6UD3$/m);
        assert.match(details, /^Authority=Developer ID Application:/m);
        run('codesign', ['--verify', '--strict', path]);
        run('xcrun', ['stapler', 'validate', path]);
        assert.match(
          run('spctl', [
            '--assess',
            '--type',
            'open',
            '--context',
            'context:primary-signature',
            '--verbose=2',
            path,
          ]),
          /source=Notarized Developer ID/,
        );
      }
      assert.equal(await hash(path), before, 'Artifact changed during verification');
      artifacts.push({
        name,
        architecture: arch,
        bytes: (await stat(path)).size,
        sha256: before,
        signatureVerified: true,
        stapledTicketValidated: true,
        gatekeeperAccepted: true,
      });
      console.log(`Verified notarized ${arch} ${extension}`);
    } finally {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    }
  }
}
await writeFile(
  'releases/desktop/mac-distribution-manifest.json',
  JSON.stringify({ version, verifiedAt: new Date().toISOString(), artifacts }, null, 2) + '\n',
);
await writeFile(
  'releases/desktop/MAC-SHA256SUMS',
  artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join('\n') + '\n',
);
