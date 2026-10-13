import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { blankContent } from '../shared/documents';

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
test('accounts isolate documents and enforce revision, trash and deletion lifecycle', async () => {
  const ctx = await setup();
  try {
    const alice = await ctx.register('alice@example.com'),
      bob = await ctx.register('bob@example.com');
    assert.equal((await ctx.request('/documents')).status, 401);
    const created = await ctx.request(
      '/documents',
      'POST',
      { kind: 'word', name: 'Private' },
      alice,
    );
    assert.equal(created.status, 201);
    const doc = await created.json();
    for (const method of ['GET', 'PATCH', 'DELETE'])
      assert.equal(
        (
          await ctx.request(
            `/documents/${doc.id}`,
            method,
            method === 'GET' ? undefined : { revision: 1, name: 'Stolen' },
            bob,
          )
        ).status,
        404,
      );
    assert.equal(
      (await ctx.request(`/documents/${doc.id}/export`, 'GET', undefined, bob)).status,
      404,
    );
    assert.equal(
      (await ctx.request('/documents', 'GET', undefined, bob).then((r) => r.json())).documents
        .length,
      0,
    );
    assert.equal(
      (await ctx.request(`/documents/${doc.id}`, 'DELETE', { revision: 1 }, alice)).status,
      409,
    );
    const updated = await ctx
      .request(`/documents/${doc.id}`, 'PATCH', { revision: 1, name: 'Changed' }, alice)
      .then((r) => r.json());
    assert.equal(updated.revision, 2);
    assert.equal(
      (await ctx.request(`/documents/${doc.id}`, 'PATCH', { revision: 1, name: 'Stale' }, alice))
        .status,
      409,
    );
    const trashed = await ctx
      .request(`/documents/${doc.id}`, 'PATCH', { revision: 2, deleted: true }, alice)
      .then((r) => r.json());
    assert.ok(trashed.deletedAt);
    assert.equal(
      (
        await ctx.request(
          `/documents/${doc.id}`,
          'PATCH',
          { revision: 3, content: blankContent('word') },
          alice,
        )
      ).status,
      409,
    );
    assert.equal(
      (await ctx.request(`/documents/${doc.id}`, 'PATCH', { revision: 3, deleted: false }, alice))
        .status,
      200,
    );
    assert.equal(
      (await ctx.request(`/documents/${doc.id}`, 'PATCH', { revision: 4, deleted: true }, alice))
        .status,
      200,
    );
    assert.equal(
      (await ctx.request(`/documents/${doc.id}`, 'DELETE', { revision: 5 }, alice)).status,
      204,
    );
    assert.equal(
      (await ctx.request('/me', 'GET', undefined, alice).then((r) => r.json())).usedBytes,
      0,
    );
  } finally {
    await ctx.close();
  }
});
test('CSRF, credential hashing, login, password rotation and logout', async () => {
  const ctx = await setup();
  try {
    const cookie = await ctx.register('user@example.com');
    const stored = ctx.store.db.prepare('SELECT password_hash FROM users').get()!;
    assert.notEqual(stored.password_hash, 'strong-test-password');
    assert.equal(
      (await ctx.request('/auth/login', 'POST', { email: 'user@example.com', password: 'wrong' }))
        .status,
      401,
    );
    const second = await ctx.request('/auth/login', 'POST', {
      email: 'user@example.com',
      password: 'strong-test-password',
    });
    assert.equal(second.status, 200);
    const secondCookie = second.headers.get('set-cookie')!.split(';')[0];
    assert.equal(
      (
        await ctx.request(
          '/documents',
          'POST',
          { kind: 'word', name: 'No' },
          cookie,
          'https://evil.example',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await ctx.request(
          '/me/password',
          'POST',
          { currentPassword: 'wrong', newPassword: 'replacement-password' },
          cookie,
        )
      ).status,
      400,
    );
    const changed = await ctx.request(
      '/me/password',
      'POST',
      { currentPassword: 'strong-test-password', newPassword: 'replacement-password' },
      cookie,
    );
    assert.equal(changed.status, 204);
    const newCookie = changed.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await ctx.request('/me', 'GET', undefined, cookie)).status, 401);
    assert.equal((await ctx.request('/me', 'GET', undefined, secondCookie)).status, 401);
    assert.equal((await ctx.request('/me', 'GET', undefined, newCookie)).status, 200);
    await ctx.request('/auth/logout', 'POST', {}, newCookie);
    assert.equal((await ctx.request('/me', 'GET', undefined, newCookie)).status, 401);
  } finally {
    await ctx.close();
  }
});
test('API rejects invalid models and concurrent writes preserve one winner', async () => {
  const ctx = await setup();
  try {
    const cookie = await ctx.register('writer@example.com');
    assert.equal(
      (
        await ctx.request(
          '/documents',
          'POST',
          { kind: 'word', name: 'Bad', content: blankContent('sheet') },
          cookie,
        )
      ).status,
      400,
    );
    const doc = await ctx
      .request('/documents', 'POST', { kind: 'word', name: 'Shared' }, cookie)
      .then((r) => r.json());
    const writes = await Promise.all(
      ['One', 'Two'].map((name) =>
        ctx.request(`/documents/${doc.id}`, 'PATCH', { revision: 1, name }, cookie),
      ),
    );
    assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
  } finally {
    await ctx.close();
  }
});
