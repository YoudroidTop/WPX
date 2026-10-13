import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { unstable_DevEnv as DevEnv } from 'wrangler';

// Use Node's --use-env-proxy when the network requires an existing HTTP(S) proxy.
// Wrangler preview authorization stays in memory and is sent only to its own host.
const environment = new DevEnv();
let timer;
const preview = new Promise((resolve, reject) => {
  timer = setTimeout(() => reject(new Error('Preview startup timed out')), 60_000);
  environment.once('reloadComplete', ({ proxyData }) => resolve(proxyData));
});
try {
  const [, data] = await Promise.all([
    environment.startWorker({
      config: 'wrangler.recovery-driver.jsonc',
      dev: { remote: true, server: { hostname: '127.0.0.1', port: 8791 } },
    }),
    preview,
  ]);
  clearTimeout(timer);
  const { protocol, hostname, port } = data.userWorkerUrl;
  assert.equal(protocol, 'https:');
  assert.ok(hostname.endsWith('.workers.dev') || hostname.endsWith('.cloudflareworkers.com'));
  assert.equal(port, '443');
  const origin = `https://${hostname}`;
  const probe = await fetch(origin + '/', {
    headers: data.headers,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(probe.status, 404, 'Preview must reach the isolated driver');
  console.log('Isolated preview transport passed.');
  const response = await fetch(origin + '/rehearse', {
    method: 'POST',
    headers: data.headers,
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(
    response.status,
    200,
    `Recovery rehearsal did not return success: ${response.status === 200 ? '' : (await response.text()).slice(0, 2000)}`,
  );
  const result = await response.json();
  assert.equal(result.passed, true);
  assert.deepEqual(result.restored, result.before);
  assert.deepEqual(result.undone, result.changed);
  assert.deepEqual(result.revisionFencing, {
    restored: { rejected: 3, highWaterMark: 2, nextRevision: 3 },
    undone: { rejected: 2, highWaterMark: 3, nextRevision: 4 },
  });
  const { dataObjectId, coordinatorObjectId, ...coordination } = result.coordination;
  assert.match(dataObjectId, /^[a-f0-9]{64}$/);
  assert.match(coordinatorObjectId, /^[a-f0-9]{64}$/);
  assert.notEqual(dataObjectId, coordinatorObjectId);
  assert.deepEqual(coordination, {
    passed: true,
    responseLossReconciled: true,
    duplicateCreatePrevented: true,
    coordinatorRestartPreservedPending: true,
    coordinatorUnaffectedByRestore: true,
    staleAfterRestoreRejected: true,
    freshWriteRevision: 4,
    staleAfterUndoRejected: true,
    finalHighWaterMark: 5,
    journalSurvivedRestart: true,
    originalUndoPreserved: true,
  });
  await mkdir('releases/cloudflare', { recursive: true });
  await writeFile('releases/cloudflare/recovery-result.json', JSON.stringify(result, null, 2));
  console.log('Remote recovery and undo passed; evidence saved without preview credentials.');
} finally {
  clearTimeout(timer);
  await environment.teardown();
}
