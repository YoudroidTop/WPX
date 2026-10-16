import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Store } from '../server/store';
import { createApp } from '../server/app';

async function setup() {
  const store = new Store(':memory:');
  const server = createApp({ store, authLimit: 100, staticDir: '/does-not-exist' }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (
    path: string,
    method = 'GET',
    body?: object,
    cookie = '',
    origin = 'http://localhost:5173',
  ) =>
    fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
  async function register(email: string) {
    const res = await request('/auth/register', 'POST', {
      email,
      name: 'Test',
      password: 'strong-test-password',
    });
    assert.equal(res.status, 201);
    return res.headers.get('set-cookie')!.split(';')[0];
  }
  const close = async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    store.db.close();
  };
  return { store, request, register, close };
}

test('folders support hierarchical creation, document assignment, moving, renaming, and lifecycle', async () => {
  const ctx = await setup();
  try {
    const alice = await ctx.register('alice@example.com');
    const bob = await ctx.register('bob@example.com');

    // 1. Create root folder
    const createRes = await ctx.request('/folders', 'POST', { name: '工作资料' }, alice);
    assert.equal(createRes.status, 201);
    const rootFolder = await createRes.json();
    assert.equal(rootFolder.name, '工作资料');
    assert.equal(rootFolder.parentId, null);

    // 2. Create subfolder inside root folder
    const subRes = await ctx.request(
      '/folders',
      'POST',
      { name: '2026计划', parentId: rootFolder.id },
      alice,
    );
    assert.equal(subRes.status, 201);
    const subFolder = await subRes.json();
    assert.equal(subFolder.name, '2026计划');
    assert.equal(subFolder.parentId, rootFolder.id);

    // 3. Create document in subfolder
    const docRes = await ctx.request(
      '/documents',
      'POST',
      { kind: 'word', name: 'Q1规划', folderId: subFolder.id },
      alice,
    );
    assert.equal(docRes.status, 201);
    const doc = await docRes.json();
    assert.equal(doc.folderId, subFolder.id);

    // 4. GET /api/documents returns documents and folders
    const listRes = await ctx.request('/documents', 'GET', undefined, alice);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.folders.length, 2);
    assert.equal(listData.documents.length, 1);
    assert.equal(listData.documents[0].folderId, subFolder.id);

    // 5. Move document to root (folderId: null)
    const moveDocRes = await ctx.request(
      `/documents/${doc.id}`,
      'PATCH',
      { revision: doc.revision, folderId: null },
      alice,
    );
    assert.equal(moveDocRes.status, 200);
    const movedDoc = await moveDocRes.json();
    assert.equal(movedDoc.folderId, null);

    // Move document to rootFolder
    const moveDocBack = await ctx.request(
      `/documents/${doc.id}`,
      'PATCH',
      { revision: movedDoc.revision, folderId: rootFolder.id },
      alice,
    );
    assert.equal(moveDocBack.status, 200);
    assert.equal((await moveDocBack.json()).folderId, rootFolder.id);

    // 6. Rename folder
    const renameRes = await ctx.request(
      `/folders/${subFolder.id}`,
      'PATCH',
      { name: '2026年度战略' },
      alice,
    );
    assert.equal(renameRes.status, 200);
    assert.equal((await renameRes.json()).name, '2026年度战略');

    // 7. Prevent moving folder into self or child folder
    const moveSelf = await ctx.request(
      `/folders/${rootFolder.id}`,
      'PATCH',
      { parentId: rootFolder.id },
      alice,
    );
    assert.equal(moveSelf.status, 400);

    const moveChild = await ctx.request(
      `/folders/${rootFolder.id}`,
      'PATCH',
      { parentId: subFolder.id },
      alice,
    );
    assert.equal(moveChild.status, 400);

    // 8. Accounts isolation
    const bobList = await ctx.request('/folders', 'GET', undefined, bob);
    assert.equal(bobList.status, 200);
    assert.equal((await bobList.json()).length, 0);

    const bobPatch = await ctx.request(
      `/folders/${rootFolder.id}`,
      'PATCH',
      { name: 'Hacked' },
      bob,
    );
    assert.equal(bobPatch.status, 404);

    // 9. Trash & restore folder lifecycle
    const trashRes = await ctx.request(
      `/folders/${subFolder.id}`,
      'PATCH',
      { deleted: true },
      alice,
    );
    assert.equal(trashRes.status, 200);
    const trashed = await trashRes.json();
    assert.notEqual(trashed.deletedAt, null);

    // Permanent delete requires trash first
    const deleteDirect = await ctx.request(`/folders/${rootFolder.id}`, 'DELETE', undefined, alice);
    assert.equal(deleteDirect.status, 409);

    // Permanent delete trashed folder
    const deletePerm = await ctx.request(`/folders/${subFolder.id}`, 'DELETE', undefined, alice);
    assert.equal(deletePerm.status, 204);

    // Verify subFolder is gone
    const afterDelete = await ctx.request('/folders', 'GET', undefined, alice);
    const remaining = await afterDelete.json();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, rootFolder.id);
  } finally {
    await ctx.close();
  }
});
