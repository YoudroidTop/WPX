import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const origin = 'https://wpx.youdroid.top';
const expected = JSON.parse(await readFile('cloud/desktop-release.json', 'utf8'));
async function get(path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(300000),
  });
  assert.ok(response.ok, `Unexpected HTTP ${response.status}: ${path}`);
  return response;
}
const manifest = await (await get('/api/releases/desktop')).json();
assert.deepEqual(manifest, {
  version: expected.version,
  artifacts: expected.artifacts.map(({ key, ...artifact }) => artifact),
});
const results = [];
for (const artifact of manifest.artifacts) {
  const head = await get(artifact.path, { method: 'HEAD' });
  assert.equal(Number(head.headers.get('content-length')), artifact.bytes);
  assert.equal(head.headers.get('x-checksum-sha256'), artifact.sha256);
  const local = await readFile(`releases/desktop/${artifact.filename}`);
  for (const [range, offset] of [
    ['bytes=0-31', 0],
    ['bytes=-32', artifact.bytes - 32],
  ]) {
    const response = await get(artifact.path, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(
      response.headers.get('content-range'),
      `bytes ${offset}-${offset + 31}/${artifact.bytes}`,
    );
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      local.subarray(offset, offset + 32),
    );
  }
  const response = await get(artifact.path);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  assert.equal(bytes, artifact.bytes);
  const sha256 = hash.digest('hex');
  assert.equal(sha256, artifact.sha256);
  results.push({ filename: artifact.filename, bytes, sha256, head: true, ranges: true });
  console.log(`Verified public download: ${artifact.filename}`);
}
await writeFile(
  'releases/cloudflare/desktop-download-readback.json',
  JSON.stringify(
    {
      passed: true,
      origin,
      checkedAt: new Date().toISOString(),
      version: manifest.version,
      results,
    },
    null,
    2,
  ) + '\n',
);
