import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountDocuments, type SqlDatabase, type SqlValue } from '../cloud/documents';
import { AccountMutationExecutor } from '../cloud/mutation-executor';
import { AccountWriteAdmission } from '../cloud/write-admission';
import { blankContent } from '../shared/documents';

import { AccountMutationDispatch } from '../cloud/mutation-dispatch';
import { CoordinatedMutations, type MutationFlight } from '../cloud/coordinated-mutations';

function database() {
  const db = new DatabaseSync(':memory:');
  let failReceipt = false;
  const sql: SqlDatabase = {
    exec<T extends Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): T[] {
      if (failReceipt && query.startsWith('INSERT OR REPLACE INTO mutation_receipt'))
        throw new Error('Receipt storage unavailable');
      return db
        .prepare(query)
        .all(
          ...bindings.map((value) =>
            value instanceof ArrayBuffer ? new Uint8Array(value) : value,
          ),
        )
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              value instanceof Uint8Array ? value.slice().buffer : value,
            ]),
          ),
        ) as T[];
    },
  };
  const atomic = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  return {
    db,
    sql,
    atomic,
    failReceipt: (value: boolean) => {
      failReceipt = value;
    },
  };
}

function fixture() {
  const c = database(),
    d = database();
  const gate = new AccountWriteAdmission(c.sql, c.atomic);
  gate.initialize(0);
  const dispatch = new AccountMutationDispatch(c.sql, c.atomic);
  const executor = new AccountMutationExecutor(d.sql, d.atomic);
  const documents = new AccountDocuments(d.sql, d.atomic);
  const transport = {
    execute: async (pending: NonNullable<ReturnType<typeof dispatch.pending>>) =>
      executor.execute(pending.permit, pending.command),
    read: async (id: string) => documents.get(id),
  };
  const flight: MutationFlight = {};
  return {
    gate,
    dispatch,
    transport,
    flight,
    documents,
    adapter: new CoordinatedMutations(dispatch, transport, flight),
    close: () => {
      c.db.close();
      d.db.close();
    },
  };
}
const request = (path: string, method: string, data?: unknown) =>
  new Request('https://fixture.test' + path, {
    method,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
const createRequest = () => request('/api/documents', 'POST', { name: 'HTTP QA', kind: 'word' });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('coordinated responses preserve full-document create/update and empty deletion contracts', async () => {
  const f = fixture();
  try {
    const created = (await f.adapter.handle(createRequest()))!;
    assert.equal(created.status, 201);
    let doc = await created.json();
    assert.deepEqual(doc.content, blankContent('word'));
    for (const patch of [
      { name: 'Renamed' },
      { starred: true },
      { deleted: true },
      { deleted: false },
      { deleted: true },
    ]) {
      const updated = (await f.adapter.handle(
        request(`/api/documents/${doc.id}`, 'PATCH', { revision: doc.revision, ...patch }),
      ))!;
      assert.equal(updated.status, 200);
      const next = await updated.json();
      assert.deepEqual(next, f.documents.get(doc.id));
      assert.ok(next.revision > doc.revision);
      doc = next;
    }
    const removed = (await f.adapter.handle(
      request(`/api/documents/${doc.id}`, 'DELETE', { revision: doc.revision }),
    ))!;
    assert.equal(removed.status, 204);
    assert.equal(await removed.text(), '');
    assert.equal(f.documents.used(), 0);
    assert.equal(f.dispatch.pending(), null);
    assert.equal(await f.adapter.handle(request('/api/documents', 'GET')), null);
  } finally {
    f.close();
  }
});

test('request and concurrent reconciliation share execution and independently readable responses', async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred();
  let executions = 0;
  const execute = f.transport.execute;
  f.transport.execute = async (pending) => {
    executions++;
    const receipt = await execute(pending);
    entered.resolve();
    await release.promise;
    return receipt;
  };
  try {
    const initial = f.adapter.handle(createRequest());
    await entered.promise;
    const otherAdapter = new CoordinatedMutations(f.dispatch, f.transport, f.flight);
    const recovered = otherAdapter.reconcile();
    const duplicate = f.adapter.reconcile();
    f.gate.suspend('concurrent-restore');
    assert.throws(() => f.gate.requireDrained('concurrent-restore'));
    release.resolve();
    const responses = await Promise.all([initial, recovered, duplicate]);
    assert.equal(executions, 1);
    const bodies = await Promise.all(responses.map((response) => response!.json()));
    assert.deepEqual(bodies[0], bodies[1]);
    assert.deepEqual(bodies[1], bodies[2]);
    assert.equal(f.documents.list().length, 1);
    assert.equal(f.dispatch.pending(), null);
    assert.equal(f.gate.status().phase, 'suspended');
    assert.equal(f.gate.requireDrained('concurrent-restore'), bodies[0].revision);
  } finally {
    release.resolve();
    f.close();
  }
});

test('shared response loss preserves the command and releases the flight for a later retry', async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred();
  const execute = f.transport.execute;
  let executions = 0;
  f.transport.execute = async (pending) => {
    executions++;
    await execute(pending);
    entered.resolve();
    await release.promise;
    throw new Error('Lost concurrent response');
  };
  try {
    const initial = f.adapter.handle(createRequest());
    await entered.promise;
    const pending = f.dispatch.pending();
    const retry = f.adapter.reconcile();
    const settled = Promise.allSettled([initial, retry]);
    release.resolve();
    const failures = await settled;
    assert.equal(executions, 1);
    for (const result of failures) {
      assert.equal(result.status, 'rejected');
      if (result.status === 'rejected') assert.match(result.reason.message, /Lost concurrent/);
    }
    assert.deepEqual(f.dispatch.pending(), pending);
    f.transport.execute = execute;
    assert.equal((await f.adapter.reconcile())!.status, 201);
    assert.equal(f.documents.list().length, 1);
    assert.equal(f.dispatch.pending(), null);
    assert.equal((await f.adapter.handle(createRequest()))!.status, 201);
    assert.equal(f.documents.list().length, 2);
  } finally {
    release.resolve();
    f.close();
  }
});

test('committed response loss and readback failure keep commands pending until exact reconciliation', async () => {
  const f = fixture();
  try {
    const execute = f.transport.execute;
    f.transport.execute = async (pending) => {
      await execute(pending);
      throw new Error('Lost response');
    };
    await assert.rejects(() => f.adapter.handle(createRequest()), /Lost response/);
    const pending = f.dispatch.pending();
    assert.ok(pending);
    await assert.rejects(() => f.adapter.handle(createRequest()), { status: 503 });
    assert.equal(f.documents.list().length, 1);
    f.gate.suspend('restore');
    assert.throws(() => f.gate.requireDrained('restore'));
    f.transport.execute = execute;
    const read = f.transport.read;
    f.transport.read = async () => {
      throw new Error('Read unavailable');
    };
    await assert.rejects(() => f.adapter.reconcile(), /Read unavailable/);
    assert.deepEqual(f.dispatch.pending(), pending);
    f.transport.read = async (id) => ({ ...(await read(id)), revision: 900 });
    await assert.rejects(() => f.adapter.reconcile(), /does not match receipt/);
    assert.deepEqual(f.dispatch.pending(), pending);
    f.transport.read = read;
    const response = (await f.adapter.reconcile())!;
    assert.equal(response.status, 201);
    assert.equal(f.documents.list().length, 1);
    assert.equal(f.gate.requireDrained('restore'), pending.permit.revision);
    assert.equal(await f.adapter.reconcile(), null);
  } finally {
    f.close();
  }
});

test('mismatched executor receipts do not acknowledge pending work', async () => {
  const f = fixture();
  try {
    const execute = f.transport.execute;
    f.transport.execute = async (pending) => ({ ...(await execute(pending)), token: 'wrong' });
    await assert.rejects(
      () => f.adapter.handle(createRequest()),
      /does not match dispatched permit/,
    );
    assert.ok(f.dispatch.pending());
    f.transport.execute = execute;
    assert.equal((await f.adapter.reconcile())!.status, 201);
    assert.equal(f.dispatch.pending(), null);
  } finally {
    f.close();
  }
});

test('known revision conflicts return their original error and release admission', async () => {
  const f = fixture();
  try {
    const created = await (await f.adapter.handle(createRequest()))!.json();
    const response = (await f.adapter.handle(
      request(`/api/documents/${created.id}`, 'PATCH', {
        revision: created.revision + 100,
        name: 'Stale',
      }),
    ))!;
    assert.equal(response.status, 409);
    assert.equal(typeof (await response.json()).error, 'string');
    assert.equal(f.dispatch.pending(), null);
    assert.deepEqual(f.documents.get(created.id), created);
  } finally {
    f.close();
  }
});
