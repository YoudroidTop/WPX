import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeNativeResponse } from '../src/mobile-response';

test('native HTTP preserves JSON errors, binary Office bytes and empty responses', async () => {
  const json = decodeNativeResponse(
    {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'session=private' },
      data: { error: 'Expired' },
      url: 'https://example.com',
    },
    true,
  );
  assert.equal(json.status, 401);
  assert.deepEqual(await json.json(), { error: 'Expired' });
  assert.equal(json.headers.has('set-cookie'), false);
  const binary = decodeNativeResponse(
    {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'gzip' },
      data: 'UEsAAf8=',
      url: 'https://example.com',
    },
    true,
  );
  assert.deepEqual(new Uint8Array(await binary.arrayBuffer()), new Uint8Array([80, 75, 0, 1, 255]));
  assert.equal(binary.headers.has('content-encoding'), false);
  const text = decodeNativeResponse(
    {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
      data: 'Bad gateway',
      url: 'https://example.com',
    },
    false,
  );
  assert.equal(await text.text(), 'Bad gateway');
  const empty = decodeNativeResponse(
    { status: 204, headers: {}, data: null, url: 'https://example.com' },
    false,
  );
  assert.equal(await empty.text(), '');
});
