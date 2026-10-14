import test from 'node:test';
import assert from 'node:assert/strict';
import { accountUsageResponse } from '../cloud/account-usage-response';

const account = { id: 'account-a', email: 'a@example.com', name: 'A' };
const cookie = 'zhuole_session=new-session; Path=/; HttpOnly; Secure; SameSite=Lax';
const authenticated = (status = 200) =>
  Response.json(account, { status, headers: { 'Set-Cookie': cookie } });

test('successful account usage retains existing JSON shape, status and session cookie', async () => {
  for (const status of [200, 201]) {
    const response = await accountUsageResponse(authenticated(status), account, async () =>
      Response.json({ usedBytes: 42, limitBytes: 3_000_000_000 }),
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Set-Cookie'), cookie);
    assert.deepEqual(await response.json(), {
      ...account,
      usedBytes: 42,
      limitBytes: 3_000_000_000,
    });
  }
});

test('usage rejection preserves the committed session without claiming a quota value', async () => {
  const response = await accountUsageResponse(authenticated(), account, async () =>
    Response.json(
      { error: 'Storage suspended' },
      { status: 503, headers: { 'Retry-After': '30', 'Set-Cookie': 'untrusted-storage-cookie' } },
    ),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Set-Cookie'), cookie);
  assert.equal(response.headers.get('Retry-After'), '30');
  assert.deepEqual(await response.json(), { error: 'Storage suspended' });
});

test('transport and malformed usage failures keep the newly issued session', async () => {
  for (const load of [
    async (): Promise<Response> => {
      throw new Error('Transport failed');
    },
    async () => new Response('invalid JSON'),
  ]) {
    const response = await accountUsageResponse(authenticated(), account, load);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Set-Cookie'), cookie);
    const body = await response.json();
    assert.equal(typeof body.error, 'string');
    assert.equal('usedBytes' in body, false);
  }
});

test('profile usage errors cannot acquire cookies from the document service', async () => {
  const response = await accountUsageResponse(Response.json(account), account, async () =>
    Response.json(
      { error: 'Unavailable' },
      { status: 503, headers: { 'Set-Cookie': 'untrusted' } },
    ),
  );
  assert.equal(response.headers.has('Set-Cookie'), false);
});
