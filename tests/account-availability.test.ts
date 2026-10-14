import test from 'node:test';
import assert from 'node:assert/strict';
import { accountDuringStorageFailure } from '../shared/account-availability';
const account = {
  id: 'ac52f69a-5151-4d22-bc1f-710727d352ea',
  email: 'qa@example.com',
  name: 'QA',
  usedBytes: null,
  limitBytes: 3_000_000_000,
};
const body = { code: 'ACCOUNT_STORAGE_UNAVAILABLE', account };
test('only explicit authenticated storage failures recover account state', () => {
  for (const path of ['/auth/register', '/auth/login', '/me'])
    assert.deepEqual(accountDuringStorageFailure(path, 503, body), account);
  for (const path of ['/documents', '/me/password', '/auth/logout'])
    assert.equal(accountDuringStorageFailure(path, 503, body), null);
  for (const status of [200, 400, 401, 403, 429])
    assert.equal(accountDuringStorageFailure('/me', status, body), null);
  for (const invalid of [
    {},
    { error: 'Offline' },
    { ...body, code: 'OFFLINE' },
    { ...body, account: { ...account, usedBytes: 0 } },
    { ...body, account: { ...account, id: 'other' } },
  ])
    assert.equal(accountDuringStorageFailure('/me', 503, invalid), null);
});
