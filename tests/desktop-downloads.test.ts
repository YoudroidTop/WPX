import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopDownload } from '../cloud/desktop-downloads';
import release from '../cloud/desktop-release.json';
import history from '../cloud/desktop-release-history.json';

const artifact = release.artifacts[0];
const request = (headers = {}, method = 'GET', path = artifact.path) =>
  new Request(`https://wpx.youdroid.top${path}`, { headers, method });

test('previously published desktop download paths remain available', async () => {
  for (const previous of history.flatMap((entry) => entry.artifacts)) {
    const response = await desktopDownload(request({}, 'HEAD', previous.path), {
      head: async (key) => {
        assert.equal(key, previous.key);
        return { size: previous.bytes };
      },
      get: async () => {
        throw new Error('HEAD must not read a body');
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-checksum-sha256'), previous.sha256);
  }
});

test('desktop manifest exposes public metadata without storage keys', async () => {
  const response = await desktopDownload(request({}, 'GET', '/api/releases/desktop'));
  const body = await response.json();
  assert.equal(body.version, release.version);
  assert.equal(body.artifacts.length, 4);
  assert.ok(body.artifacts.every((entry: object) => !('key' in entry)));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('desktop downloads enforce allowlist, methods and object availability', async () => {
  assert.equal((await desktopDownload(request({}, 'POST'))).status, 405);
  assert.equal((await desktopDownload(request({}, 'GET', '/downloads/desktop/other'))).status, 404);
  assert.equal((await desktopDownload(request())).status, 503);
  const bucket = { head: async () => null, get: async () => null };
  assert.equal((await desktopDownload(request(), bucket)).status, 503);
  assert.equal((await desktopDownload(request({}, 'HEAD'), bucket)).status, 503);
});

test('desktop download ranges stream selected bytes and HEAD never fetches a body', async () => {
  let selected: { offset: number; length: number } | undefined;
  let gets = 0;
  const bucket = {
    head: async () => ({ size: artifact.bytes }),
    get: async (key: string, options?: { range: { offset: number; length: number } }) => {
      assert.equal(key, artifact.key);
      gets++;
      selected = options?.range;
      return { size: artifact.bytes, body: new Response('sample').body! };
    },
  };
  for (const [range, offset, length] of [
    ['bytes=10-15', 10, 6],
    ['bytes=-6', artifact.bytes - 6, 6],
    [`bytes=${artifact.bytes - 6}-`, artifact.bytes - 6, 6],
  ] as const) {
    const response = await desktopDownload(request({ Range: range }), bucket);
    assert.equal(response.status, 206);
    assert.deepEqual(selected, { offset, length });
    assert.equal(
      response.headers.get('content-range'),
      `bytes ${offset}-${offset + length - 1}/${artifact.bytes}`,
    );
    assert.equal(response.headers.get('content-length'), String(length));
    assert.equal(await response.text(), 'sample');
  }
  const head = await desktopDownload(request({ Range: 'bytes=0-5' }, 'HEAD'), bucket);
  assert.equal(head.status, 200);
  assert.equal(gets, 3);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), String(artifact.bytes));
  assert.equal(head.headers.get('x-checksum-sha256'), artifact.sha256);
  for (const range of [
    'bytes=',
    'bytes=-0',
    'bytes=4-3',
    `bytes=${artifact.bytes}-`,
    'bytes=0-1,4-5',
  ]) {
    assert.equal((await desktopDownload(request({ Range: range }), bucket)).status, 416);
  }
  assert.equal(gets, 3);
  assert.equal(
    (await desktopDownload(request({ Range: 'bytes=0-5', 'If-Range': 'old' }), bucket)).status,
    200,
  );
  assert.equal(selected, undefined);
});
