import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';

const origin = process.env.CLOUD_TEST_ORIGIN || 'http://127.0.0.1:8787';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(origin).hostname),
  'Integration tests require a local disposable service',
);
function client() {
  let cookie = '';
  return async (path, method = 'GET', data, options = {}) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        ...(data && { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      body: data === undefined ? undefined : options.raw ? data : JSON.stringify(data),
    });
    if (response.headers.has('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response;
  };
}
const a = client(),
  b = client();
const credentials = {
  email: `cloud-${randomUUID()}@example.com`,
  name: 'Cloud QA',
  password: 'cloud-test-password',
};
let response = await a('/api/auth/register', 'POST', credentials);
assert.equal(response.status, 201, await response.clone().text());
let account = await response.json();
assert.equal(account.limitBytes, 3_000_000_000);
assert.equal(account.usedBytes, 0);
assert.equal((await b('/api/me')).status, 401);
assert.equal(
  (await b('/api/auth/login', 'POST', { ...credentials, password: 'incorrect' })).status,
  401,
);
assert.equal(
  (
    await b('/api/auth/register', 'POST', {
      ...credentials,
      email: `other-${randomUUID()}@example.com`,
    })
  ).status,
  201,
);
assert.equal(
  (
    await a(
      '/api/documents',
      'POST',
      { kind: 'word', name: 'Blocked' },
      { headers: { Origin: 'https://other.example' } },
    )
  ).status,
  403,
);
for (const kind of ['word', 'sheet', 'slide']) {
  response = await a('/api/documents', 'POST', { kind, name: `${kind} cloud` });
  assert.equal(response.status, 201, await response.clone().text());
  let doc = await response.json();
  assert.equal((await b(`/api/documents/${doc.id}`)).status, 404);
  const updates = await Promise.all([
    a(`/api/documents/${doc.id}`, 'PATCH', { revision: 1, name: 'First' }),
    a(`/api/documents/${doc.id}`, 'PATCH', { revision: 1, name: 'Second' }),
  ]);
  assert.deepEqual(updates.map((item) => item.status).sort(), [200, 409]);
  doc = await (await a(`/api/documents/${doc.id}`)).json();
  if (kind === 'word') {
    const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    doc.content.doc.content = [
      paragraph(' Before '),
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [paragraph(' Cell & text ')] },
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'First' },
                      { type: 'hardBreak' },
                      { type: 'text', text: 'Second' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      paragraph(' After '),
    ];
    response = await a(`/api/documents/${doc.id}`, 'PATCH', {
      revision: doc.revision,
      content: doc.content,
    });
    assert.equal(response.status, 200, await response.clone().text());
    doc = await response.json();
  }
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
    response = await a(`/api/documents/${doc.id}`, 'PATCH', {
      revision: doc.revision,
      content: doc.content,
    });
    assert.equal(response.status, 200, await response.clone().text());
    doc = await response.json();
  }
  response = await a(`/api/documents/${doc.id}/export`);
  assert.equal(response.status, 200, await response.clone().text());
  const bytes = new Uint8Array(await response.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file('[Content_Types].xml'));
  const extension = { word: 'docx', sheet: 'xlsx', slide: 'pptx' }[kind];
  response = await a('/api/documents/import', 'POST', bytes, {
    raw: true,
    headers: { 'Content-Type': 'application/octet-stream', 'x-filename': `roundtrip.${extension}` },
  });
  assert.equal(response.status, 201, await response.clone().text());
  const imported = await response.json();
  assert.equal(imported.kind, kind);
  if (kind === 'word') assert.deepEqual(imported.content, doc.content);
  if (kind === 'sheet')
    assert.deepEqual(imported.content.sheets[0].cells, doc.content.sheets[0].cells);
  const before = await (await a('/api/me')).json();
  response = await a(`/api/documents/${doc.id}`, 'PATCH', {
    revision: doc.revision,
    deleted: true,
  });
  const trashed = await response.json();
  assert.equal((await (await a('/api/me')).json()).usedBytes, before.usedBytes);
  assert.equal(
    (await a(`/api/documents/${doc.id}`, 'DELETE', { revision: doc.revision })).status,
    409,
  );
  assert.equal(
    (await a(`/api/documents/${doc.id}`, 'DELETE', { revision: trashed.revision })).status,
    204,
  );
  assert.equal((await (await a('/api/me')).json()).usedBytes, before.usedBytes - doc.size);
}
const largeContent = {
  type: 'word',
  doc: {
    type: 'doc',
    content: Array.from({ length: 10 }, () => ({
      type: 'paragraph',
      content: [{ type: 'text', text: '卓'.repeat(90000) }],
    })),
  },
};
response = await a('/api/documents', 'POST', {
  kind: 'word',
  name: 'Large Unicode',
  content: largeContent,
});
assert.equal(response.status, 201, await response.clone().text());
const large = await response.json();
assert.ok(large.size > 2_000_000);
assert.deepEqual((await (await a(`/api/documents/${large.id}`)).json()).content, largeContent);
assert.equal((await a('/api/me', 'PATCH', { name: 'Updated QA' })).status, 200);
const previousSession = client();
assert.equal((await previousSession('/api/auth/login', 'POST', credentials)).status, 200);
assert.equal(
  (
    await a('/api/me/password', 'POST', {
      currentPassword: credentials.password,
      newPassword: 'new-cloud-test-password',
    })
  ).status,
  204,
);
assert.equal((await previousSession('/api/me')).status, 401);
assert.equal((await a('/api/me')).status, 200);
assert.equal((await a('/api/auth/logout', 'POST')).status, 204);
assert.equal((await a('/api/me')).status, 401);
console.log(
  'Cloud workerd integration passed: accounts, isolation, CSRF, revisions, three Office round trips, trash quota, password rotation, logout.',
);
