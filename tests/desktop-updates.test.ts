import { test } from 'node:test';
import assert from 'node:assert/strict';
import release from '../cloud/desktop-release.json';
import { newerVersion, readUpdateManifest, selectUpdate } from '../desktop/updates';

test('update comparison orders numeric release components and never downgrades', () => {
  assert.equal(newerVersion('0.10.0', '0.9.9'), true);
  assert.equal(newerVersion('1.0.0', '0.99.99'), true);
  assert.equal(newerVersion('0.1.0', '0.1.0'), false);
  assert.equal(newerVersion('0.1.0', '0.2.0'), false);
  for (const invalid of ['01.2.3', '1.2', '1.2.3-beta', '1.2.3/evil']) {
    assert.throws(() => newerVersion(invalid, '0.1.0'));
  }
});

test('update selection matches each platform and architecture with official paths', () => {
  for (const platform of ['darwin', 'win32']) {
    for (const arch of ['arm64', 'x64']) {
      const update = selectUpdate(release, '0.0.9', platform, arch);
      assert.equal(update.available, true);
      assert.equal(
        update.url,
        `https://wpx.youdroid.top/downloads/desktop/0.1.0/ZhuoleDocs-0.1.0-${platform === 'darwin' ? 'mac' : 'win'}-${arch}.${platform === 'darwin' ? 'dmg' : 'exe'}`,
      );
    }
  }
  assert.equal(selectUpdate(release, '0.1.0', 'darwin', 'arm64').available, false);
  assert.throws(() => selectUpdate(release, '0.1.0', 'linux', 'x64'));
  for (const patch of [
    { path: 'https://evil.example/installer' },
    { path: '/downloads/desktop/0.1.0/../evil' },
    { filename: 'other.dmg' },
    { signed: false },
    { sha256: 'invalid' },
  ]) {
    const input = structuredClone(release);
    Object.assign(input.artifacts[0], patch);
    assert.throws(() => selectUpdate(input, '0.0.1', 'darwin', 'arm64'));
  }
  assert.throws(() =>
    selectUpdate(
      { ...release, artifacts: [release.artifacts[0], release.artifacts[0]] },
      '0.0.1',
      'darwin',
      'arm64',
    ),
  );
});

test('update manifest reading rejects failed, malformed and oversized responses', async () => {
  assert.deepEqual(await readUpdateManifest(Response.json(release)), release);
  await assert.rejects(readUpdateManifest(new Response('', { status: 503 })));
  await assert.rejects(readUpdateManifest(new Response('<html>error</html>')));
  await assert.rejects(readUpdateManifest(new Response(' '.repeat(32_769))));
});
