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
  const send = (path: string, method: string, body?: unknown) =>
    control().coordinatedRequest(request(path, method, body), dataId.toString());
  assert.equal(
    (await send('/api/documents', 'POST', { name: 'Blocked', kind: 'word' })).status,
    503,
  );
  await control().initializeAdmission();
  const docs: CloudDocument[] = [];
  for (const kind of ['word', 'sheet', 'slide'] as const) {
    const response = await send('/api/documents', 'POST', { name: `HTTP ${kind}`, kind });
    assert.equal(response.status, 201);
    const doc = await response.json<CloudDocument>();
    assert.equal(doc.content.type, kind);
    assert.deepEqual(await (await data().documentResponse(doc.id)).json(), doc);
    docs.push(doc);
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
    dataId.toString(),
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
        dataId.toString(),
        true,
      ),
    /Simulated response loss/,
  );
  await control().suspendMutations('http-recovery');
  assert.equal(
    (await send('/api/documents', 'POST', { name: 'Blocked', kind: 'word' })).status,
    503,
  );
  await assert.rejects(() => control().restart(), /Recovery rehearsal restart/);
  const reconciled = await control().reconcileRequest(dataId.toString());
  assert.equal(reconciled.status, 201);
  assert.equal((await reconciled.json<CloudDocument>()).name, 'Lost response');
  assert.equal((await data().snapshot()).count, beforeLost.count + 1);
  assert.equal(await control().pendingMutation(), null);
  assert.equal((await control().admissionStatus()).phase, 'suspended');
  return {
    passed: true,
    fullDocumentResponses: true,
    mutationRoutes: true,
    nativeImport: true,
    restartReconciled: true,
    suspensionPreserved: true,
  };
}
