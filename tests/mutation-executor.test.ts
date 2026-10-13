import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountDocuments, type SqlDatabase, type SqlValue } from '../cloud/documents';
import { AccountMutationExecutor } from '../cloud/mutation-executor';
import { AccountWriteAdmission } from '../cloud/write-admission';
import { blankContent } from '../shared/documents';

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
const create = { kind: 'create' as const, name: 'Receipt QA', content: blankContent('word') };

test('lost creation response replays its receipt without duplicate documents or quota', () => {
  const d = database();
  try {
    let executor = new AccountMutationExecutor(d.sql, d.atomic);
    const permit = { token: 'create-1', revision: 10 };
    const first = executor.execute(permit, create);
    executor = new AccountMutationExecutor(d.sql, d.atomic);
    assert.deepEqual(executor.execute(permit, create), first);
    const store = new AccountDocuments(d.sql, d.atomic);
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0].revision, 10);
    assert.equal(store.used(), Buffer.byteLength(JSON.stringify(create.content)));
    assert.throws(
      () => executor.execute(permit, { ...create, name: 'Different' }),
      /different input/,
    );
    assert.throws(() => executor.execute({ ...permit, token: 'other' }, create), /obsolete/);
  } finally {
    d.db.close();
  }
});

test('update, trash and removal receipts replay, while replaced receipts cannot execute again', () => {
  const d = database();
  try {
    const executor = new AccountMutationExecutor(d.sql, d.atomic);
    const first = executor.execute({ token: 'one', revision: 1 }, create);
    assert.ok('document' in first.result);
    const id = first.result.document.id;
    const update = {
      kind: 'update' as const,
      id,
      revision: 1,
      patch: { name: 'Renamed', deleted: true },
    };
    const receipt = executor.execute({ token: 'two', revision: 4 }, update);
    assert.deepEqual(executor.execute({ token: 'two', revision: 4 }, update), receipt);
    const remove = { kind: 'remove' as const, id, revision: 4 };
    const removed = executor.execute({ token: 'three', revision: 8 }, remove);
    assert.deepEqual(executor.execute({ token: 'three', revision: 8 }, remove), removed);
    assert.throws(() => executor.execute({ token: 'one', revision: 1 }, create), /obsolete/);
    assert.equal(new AccountDocuments(d.sql, d.atomic).used(), 0);
    assert.equal(d.db.prepare('SELECT COUNT(*) AS n FROM mutation_receipt').get()!.n, 1);
  } finally {
    d.db.close();
  }
});

test('known rejection is durable and consumes its reserved revision without changing documents', () => {
  const d = database();
  try {
    const executor = new AccountMutationExecutor(d.sql, d.atomic, 1);
    const permit = { token: 'quota-rejected', revision: 3 };
    const rejected = executor.execute(permit, create);
    assert.ok('error' in rejected.result);
    assert.equal(rejected.result.error.status, 413);
    assert.deepEqual(
      new AccountMutationExecutor(d.sql, d.atomic).execute(permit, create),
      rejected,
    );
    assert.equal(new AccountDocuments(d.sql, d.atomic).list().length, 0);
    assert.throws(() => executor.execute({ token: 'old', revision: 2 }, create), /obsolete/);
  } finally {
    d.db.close();
  }
});

test('receipt failure rolls back document writes and leaves admission draining until reconciliation', () => {
  const d = database(),
    c = database();
  try {
    const gate = new AccountWriteAdmission(c.sql, c.atomic);
    const permit = gate.admit();
    gate.suspend('restore');
    const executor = new AccountMutationExecutor(d.sql, d.atomic);
    d.failReceipt(true);
    assert.throws(() => executor.execute(permit, create), /Receipt storage unavailable/);
    const store = new AccountDocuments(d.sql, d.atomic);
    assert.equal(store.list().length, 0);
    assert.equal(store.used(), 0);
    assert.equal(gate.status().phase, 'draining');
    assert.throws(() => gate.requireDrained('restore'));
    d.failReceipt(false);
    const outcome = executor.execute(permit, create);
    gate.complete(outcome);
    assert.equal(gate.requireDrained('restore'), 1);
    assert.equal(store.list().length, 1);
  } finally {
    d.db.close();
    c.db.close();
  }
});

test('a receipt behind restored document revisions cannot be replayed as a current outcome', () => {
  const d = database();
  try {
    const executor = new AccountMutationExecutor(d.sql, d.atomic);
    const permit = { token: 'before-recovery', revision: 1 };
    executor.execute(permit, create);
    const store = new AccountDocuments(d.sql, d.atomic);
    store.advanceRevisionsPast(10);
    const restored = store.list();
    assert.throws(() => executor.execute(permit, create), /obsolete/);
    assert.deepEqual(store.list(), restored);
  } finally {
    d.db.close();
  }
});
