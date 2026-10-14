import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountDocuments, type SqlDatabase, type SqlValue } from '../cloud/documents';
import { AccountMutationExecutor } from '../cloud/mutation-executor';
import { AccountWriteAdmission } from '../cloud/write-admission';
import { blankContent } from '../shared/documents';

import { AccountMutationDispatch } from '../cloud/mutation-dispatch';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function database(path = ':memory:') {
  const db = new DatabaseSync(path);
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

test('lost response survives coordinator reopen and replays the persisted command exactly', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zhuole-dispatch-'));
  const path = join(directory, 'control.sqlite');
  let c = database(path);
  const d = database();
  try {
    new AccountWriteAdmission(c.sql, c.atomic).initialize(0);
    let dispatch = new AccountMutationDispatch(c.sql, c.atomic);
    const command = {
      kind: 'create' as const,
      name: 'Dispatch QA',
      content: blankContent('sheet'),
    };
    const pending = dispatch.enqueue(command);
    command.name = 'Changed after enqueue';
    assert.equal(dispatch.pending()!.command.kind, 'create');
    const executor = new AccountMutationExecutor(d.sql, d.atomic);
    const lost = executor.execute(pending.permit, pending.command);
    new AccountWriteAdmission(c.sql, c.atomic).suspend('restore');
    c.db.close();
    c = database(path);
    dispatch = new AccountMutationDispatch(c.sql, c.atomic);
    assert.deepEqual(dispatch.pending(), pending);
    const replay = executor.execute(dispatch.pending()!.permit, dispatch.pending()!.command);
    assert.deepEqual(replay, lost);
    assert.equal(new AccountDocuments(d.sql, d.atomic).list().length, 1);
    assert.equal(new AccountDocuments(d.sql, d.atomic).list()[0].name, 'Dispatch QA');
    assert.throws(() => dispatch.acknowledge({ ...replay, token: 'wrong' }));
    assert.deepEqual(dispatch.pending(), pending);
    dispatch.acknowledge(replay);
    assert.equal(dispatch.pending(), null);
    assert.equal(new AccountWriteAdmission(c.sql, c.atomic).requireDrained('restore'), 1);
  } finally {
    c.db.close();
    d.db.close();
    rmSync(directory, { recursive: true });
  }
});

test('command and acknowledgement storage failures roll back admission atomically', () => {
  const c = database(),
    d = database();
  try {
    const gate = new AccountWriteAdmission(c.sql, c.atomic);
    gate.initialize(0);
    const dispatch = new AccountMutationDispatch(c.sql, c.atomic);
    c.db.exec(`CREATE TRIGGER fail_enqueue BEFORE INSERT ON mutation_dispatch
      BEGIN SELECT RAISE(ABORT, 'Command storage failed'); END`);
    const command = { kind: 'create' as const, name: 'Atomic QA', content: blankContent('word') };
    assert.throws(() => dispatch.enqueue(command), /Command storage failed/);
    assert.equal(gate.status().highWaterMark, 0);
    assert.equal(dispatch.pending(), null);
    c.db.exec('DROP TRIGGER fail_enqueue');
    const pending = dispatch.enqueue(command);
    const receipt = new AccountMutationExecutor(d.sql, d.atomic).execute(
      pending.permit,
      pending.command,
    );
    c.db.exec(`CREATE TRIGGER fail_ack BEFORE DELETE ON mutation_dispatch
      BEGIN SELECT RAISE(ABORT, 'Acknowledgement storage failed'); END`);
    assert.throws(() => dispatch.acknowledge(receipt), /Acknowledgement storage failed/);
    assert.equal(gate.status().pending, pending.permit.token);
    assert.deepEqual(dispatch.pending(), pending);
    c.db.exec('DROP TRIGGER fail_ack');
    dispatch.acknowledge(receipt);
    assert.equal(gate.status().pending, null);
    assert.equal(dispatch.pending(), null);
  } finally {
    c.db.close();
    d.db.close();
  }
});

test('late parsed imports and uninitialized dispatch cannot bypass admission', () => {
  const c = database();
  try {
    const gate = new AccountWriteAdmission(c.sql, c.atomic);
    const dispatch = new AccountMutationDispatch(c.sql, c.atomic);
    const command = { kind: 'create' as const, name: 'Import QA', content: blankContent('word') };
    assert.throws(() => dispatch.enqueue(command), { status: 503 });
    gate.initialize(0);
    gate.suspend('restore');
    assert.throws(() => dispatch.enqueue(command), { status: 503 });
    assert.equal(dispatch.pending(), null);
    assert.equal(gate.requireDrained('restore'), 0);
  } finally {
    c.db.close();
  }
});

test('durable rejection is acknowledged while unknown executor failure stays pending', () => {
  const c = database(),
    d = database();
  try {
    new AccountWriteAdmission(c.sql, c.atomic).initialize(0);
    const dispatch = new AccountMutationDispatch(c.sql, c.atomic);
    const pending = dispatch.enqueue({
      kind: 'create',
      name: 'Quota QA',
      content: blankContent('word'),
    });
    d.failReceipt(true);
    assert.throws(() =>
      new AccountMutationExecutor(d.sql, d.atomic, 1).execute(pending.permit, pending.command),
    );
    assert.deepEqual(dispatch.pending(), pending);
    d.failReceipt(false);
    const rejected = new AccountMutationExecutor(d.sql, d.atomic, 1).execute(
      pending.permit,
      pending.command,
    );
    assert.ok('error' in rejected.result);
    dispatch.acknowledge(rejected);
    assert.equal(dispatch.pending(), null);
  } finally {
    c.db.close();
    d.db.close();
  }
});

test('large Unicode commands use bounded rows and preserve exact content', () => {
  const c = database();
  try {
    new AccountWriteAdmission(c.sql, c.atomic).initialize(0);
    const dispatch = new AccountMutationDispatch(c.sql, c.atomic);
    const command = { kind: 'create' as const, name: 'Large QA', content: blankContent('word') };
    assert.equal(command.content.type, 'word');
    if (command.content.type !== 'word') throw new Error('Unexpected fixture');
    command.content.doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '中文📝'.repeat(240_000) }] }],
    };
    c.db.exec(`CREATE TRIGGER fail_chunk BEFORE INSERT ON mutation_dispatch_chunks
      WHEN NEW.sequence=1 BEGIN SELECT RAISE(ABORT, 'Chunk storage failed'); END`);
    assert.throws(() => dispatch.enqueue(command), /Chunk storage failed/);
    assert.equal(dispatch.pending(), null);
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM mutation_dispatch_chunks').get()!.n, 0);
    c.db.exec('DROP TRIGGER fail_chunk');
    dispatch.enqueue(command);
    assert.deepEqual(dispatch.pending()!.command, command);
    const rows = c.db.prepare('SELECT content FROM mutation_dispatch_chunks').all();
    assert.ok(rows.length > 1);
    for (const row of rows) assert.ok(Buffer.byteLength(row.content as string) <= 400_000);
  } finally {
    c.db.close();
  }
});
