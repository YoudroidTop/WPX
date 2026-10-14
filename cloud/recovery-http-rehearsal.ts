import assert from 'node:assert/strict';
import { blankContent, type CloudDocument } from '../shared/documents';
import type { RecoveryRehearsal } from './recovery-rehearsal';

// Private RPC transport of HTTP Request/Response objects; generated accounts only.
export async function rehearseHttpMutations(namespace: DurableObjectNamespace<RecoveryRehearsal>) {
  const controlId = namespace.newUniqueId(),
    dataId = namespace.newUniqueId();
  const control = () => namespace.get(controlId),
    data = () => namespace.get(dataId);
  const request = (path: string, method: string, body?: unknown) =>
    new Request(`https://fixture.invalid${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-permit': 'forged', 'x-revision': '999999' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const accountId = 'generated-http-account';
  const send = (path: string, method: string, body?: unknown) =>
    control().coordinatedRequest(request(path, method, body), accountId);
  await assert.rejects(
    () => send('/api/documents', 'POST', { name: 'Blocked', kind: 'word' }),
    /not bound/,
  );
  await control().initializeHttpAccount(accountId, dataId.toString());
  await assert.rejects(
    () => control().initializeHttpAccount(accountId, namespace.newUniqueId().toString()),
    /conflicts/,
  );
  await assert.rejects(
    () => control().coordinatedRequest(request('/api/documents', 'GET'), 'another-account'),
    /not bound/,
  );
  const docs: CloudDocument[] = [];
  for (const kind of ['word', 'sheet', 'slide'] as const) {
    const response = await send('/api/documents', 'POST', { name: `HTTP ${kind}`, kind });
    assert.equal(response.status, 201);
    const doc = await response.json<CloudDocument>();
    assert.equal(doc.content.type, kind);
    assert.deepEqual(await (await data().documentResponse(doc.id)).json(), doc);
    docs.push(doc);
  }
  const listing = await send('/api/documents', 'GET');
  assert.equal(listing.status, 200);
  assert.equal((await listing.json<{ documents: unknown[] }>()).documents.length, 3);
  const usage = await (
    await send('/usage', 'GET')
  ).json<{ usedBytes: number; limitBytes: number }>();
  assert.equal(usage.usedBytes, (await data().snapshot()).usedBytes);
  assert.equal(usage.limitBytes, 3_000_000_000);
  for (const document of docs) {
    assert.deepEqual(await (await send(`/api/documents/${document.id}`, 'GET')).json(), document);
    const backup = await send(`/api/documents/${document.id}/export?format=zdoc`, 'GET');
    assert.equal(backup.status, 200);
    assert.deepEqual(await backup.json(), document.content);
    const office = await send(`/api/documents/${document.id}/export`, 'GET');
    assert.equal(office.status, 200);
    assert.ok(office.headers.get('content-disposition')?.includes('attachment'));
    assert.equal(
      Buffer.from(await office.arrayBuffer())
        .subarray(0, 2)
        .toString(),
      'PK',
    );
  }
  let doc = docs[0];
  for (const patch of [
    { name: 'Renamed' },
    { starred: true },
    { content: blankContent('word') },
    { deleted: true },
    { deleted: false },
    { deleted: true },
  ]) {
    const response = await send(`/api/documents/${doc.id}`, 'PATCH', {
      revision: doc.revision,
      ...patch,
    });
    assert.equal(response.status, 200);
    const updated = await response.json<CloudDocument>();
    assert.ok(updated.revision > doc.revision);
    assert.deepEqual(await (await data().documentResponse(doc.id)).json(), updated);
    doc = updated;
  }
  assert.equal(
    (await send(`/api/documents/${doc.id}`, 'PATCH', { revision: 1, starred: false })).status,
    409,
  );
  const deleted = await send(`/api/documents/${doc.id}`, 'DELETE', { revision: doc.revision });
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  const backup = blankContent('word');
  const imported = await control().coordinatedRequest(
    new Request('https://fixture.invalid/api/documents/import', {
      method: 'POST',
      headers: { 'x-filename': encodeURIComponent('中文.zdoc') },
      body: JSON.stringify(backup),
    }),
    accountId,
  );
  assert.equal(imported.status, 201);
  const importedDoc = await imported.json<CloudDocument>();
  assert.equal(importedDoc.name, '中文');
  assert.deepEqual(importedDoc.content, backup);
  const beforeLost = await data().snapshot();
  await assert.rejects(
    () =>
      control().coordinatedRequest(
        request('/api/documents', 'POST', { name: 'Lost response', kind: 'word' }),
        accountId,
        true,
      ),
    /Simulated response loss/,
  );
  await control().suspendMutations('http-recovery');
  assert.equal((await send('/api/documents', 'GET')).status, 200);
  assert.equal(
    (await send('/api/documents', 'POST', { name: 'Blocked', kind: 'word' })).status,
    503,
  );
  await assert.rejects(() => control().restart(), /Recovery rehearsal restart/);
  const reconciled = await control().reconcileRequest(accountId);
  assert.equal(reconciled.status, 201);
  assert.equal((await reconciled.json<CloudDocument>()).name, 'Lost response');
  assert.equal((await data().snapshot()).count, beforeLost.count + 1);
  assert.equal(await control().pendingMutation(), null);
  assert.equal((await control().admissionStatus()).phase, 'suspended');
  for (const path of [
    '/usage',
    '/api/documents',
    `/api/documents/${docs[1].id}`,
    `/api/documents/${docs[1].id}/export`,
  ])
    assert.equal((await send(path, 'GET')).status, 503);
  return {
    passed: true,
    fullDocumentResponses: true,
    readRoutes: true,
    suspendedReadsRejected: true,
    mutationRoutes: true,
    nativeImport: true,
    restartReconciled: true,
    suspensionPreserved: true,
  };
}
