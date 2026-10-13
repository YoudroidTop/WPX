import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const release = JSON.parse(await readFile('cloud/desktop-release.json', 'utf8'));
const mac = JSON.parse(await readFile('releases/desktop/mac-distribution-manifest.json', 'utf8'));
for (const artifact of release.artifacts) {
  assert.match(artifact.filename, /^ZhuoleDocs-[\d.]+-(mac|win)-(arm64|x64)\.(dmg|exe)$/);
  assert.equal(artifact.path, `/downloads/desktop/${release.version}/${artifact.filename}`);
  assert.equal(artifact.key, `desktop/${release.version}/${artifact.sha256}/${artifact.filename}`);
  const file = `releases/desktop/${artifact.filename}`;
  const bytes = await readFile(file);
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  if (artifact.platform === 'mac') {
    const evidence = mac.artifacts.find((entry) => entry.name === artifact.filename);
    assert.ok(
      evidence?.signatureVerified && evidence.stapledTicketValidated && evidence.gatekeeperAccepted,
    );
    assert.equal(evidence.sha256, artifact.sha256);
  }
  console.log(`Verified ${artifact.filename}`);
  if (process.argv.includes('--upload')) {
    const result = spawnSync(
      'npx',
      [
        'wrangler',
        'r2',
        'object',
        'put',
        `zhuole-desktop-releases/${artifact.key}`,
        '--remote',
        '--file',
        file,
        '--content-type',
        'application/octet-stream',
      ],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error(`Upload failed: ${artifact.filename}`);
  }
}
