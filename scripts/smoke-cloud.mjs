import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

const origin = 'https://wpx.youdroid.top';
let cookie = '';
async function request(path, method = 'GET', data, authenticated = true) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (response.headers.has('set-cookie')) {
    const value = response.headers.get('set-cookie');
    assert.match(value, /HttpOnly/i);
    assert.match(value, /Secure/i);
    cookie = value.split(';')[0];
  }
  return response;
}
const health = await request('/api/health');
assert.equal(health.status, 200);
assert.equal((await health.json()).service, 'zhuole-docs');
assert.equal((await request('/api/me', 'GET', undefined, false)).status, 401);
const accountResponse = await request('/api/auth/register', 'POST', {
  email: `deployment-${randomUUID()}@example.com`,
  name: 'Deployment smoke',
  password: randomBytes(24).toString('base64url'),
});
assert.equal(accountResponse.status, 201, await accountResponse.clone().text());
const account = await accountResponse.json();
assert.equal(account.limitBytes, 3_000_000_000);
assert.equal(account.usedBytes, 0);
for (const kind of ['word', 'sheet', 'slide']) {
  const created = await request('/api/documents', 'POST', { kind, name: `Deployment ${kind}` });
  assert.equal(created.status, 201, await created.clone().text());
  let doc = await created.json();
  if (kind === 'sheet') {
    doc.content.sheets[0].cells = {
      A1: '00123',
      A2: '9007199254740993',
      A3: '1.00',
      A4: ' 120 ',
      B1: '120',
      B2: '80',
      C1: '=SUM(B1:B2)',
    };
    const saved = await request(`/api/documents/${doc.id}`, 'PATCH', {
      revision: doc.revision,
      content: doc.content,
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    doc = await saved.json();
  }
  assert.equal((await request(`/api/documents/${doc.id}`, 'GET', undefined, false)).status, 401);
  const exported = await request(`/api/documents/${doc.id}/export`);
  assert.equal(exported.status, 200, await exported.clone().text());
  const bytes = new Uint8Array(await exported.arrayBuffer());
  assert.ok((await JSZip.loadAsync(bytes)).file('[Content_Types].xml'));
  if (kind === 'sheet') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const sheet = workbook.worksheets[0];
    for (const address of ['A1', 'A2', 'A3', 'A4'])
      assert.equal(sheet.getCell(address).value, doc.content.sheets[0].cells[address]);
    assert.equal(sheet.getCell('B1').value, 120);
    assert.equal(sheet.getCell('C1').formula, 'SUM(B1:B2)');
    assert.equal(sheet.getCell('C1').result, 200);
  }
  const update = await request(`/api/documents/${doc.id}`, 'PATCH', {
    revision: doc.revision,
    name: 'Updated smoke document',
  });
  assert.equal(update.status, 200);
  const updated = await update.json();
  assert.equal(
    (await request(`/api/documents/${doc.id}`, 'PATCH', { revision: doc.revision, name: 'Stale' }))
      .status,
    409,
  );
  const trash = await request(`/api/documents/${doc.id}`, 'PATCH', {
    revision: updated.revision,
    deleted: true,
  });
  assert.equal(trash.status, 200);
  const trashed = await trash.json();
  assert.equal(
    (await request(`/api/documents/${doc.id}`, 'DELETE', { revision: trashed.revision })).status,
    204,
  );
  console.log(
    `${kind}: create, private access, Office export (${bytes.length} bytes), update, stale-write rejection, cleanup passed`,
  );
}
assert.equal((await (await request('/api/me')).json()).usedBytes, 0);
assert.equal((await request('/api/auth/logout', 'POST')).status, 204);
assert.equal((await request('/api/me')).status, 401);
console.log(
  'Production smoke passed. Only a generated test account remains; its test documents and session were removed.',
);
