import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountWriteAdmission } from '../cloud/write-admission';
import type { SqlDatabase, SqlValue } from '../cloud/documents';
import { CoordinatedReads } from '../cloud/coordinated-reads';

function fixture(path = ':memory:', initialize = true) {
  const db = new DatabaseSync(path);
  const sql: SqlDatabase = {
    exec<T extends Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): T[] {
      return db
        .prepare(query)
        .all(
          ...bindings.map((value) =>
            value instanceof ArrayBuffer ? new Uint8Array(value) : value,
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
  if (initialize) new AccountWriteAdmission(sql, atomic).initialize(0);
  return { db, open: () => new AccountWriteAdmission(sql, atomic) };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('active and draining reads retain status, headers and bytes; blocked states never call storage', async () => {
  const f = fixture(':memory:', false);
  try {
    const gate = f.open(),
      reader = new CoordinatedReads(gate);
    let loads = 0;
    const load = async () => {
      loads++;
      return new Response('中文正文', {
        headers: {
          'content-type': 'text/plain',
          'content-disposition': 'attachment; filename=test.txt',
        },
      });
    };
    await assert.rejects(() => reader.response(load), { status: 503 });
    assert.equal(loads, 0);
    gate.initialize(0);
    const response = await reader.response(load);
    assert.equal(await response.text(), '中文正文');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename=test.txt');
    const permit = gate.admit();
    gate.suspend('restore');
    assert.equal(await (await reader.response(load)).text(), '中文正文');
    gate.complete(permit);
    await assert.rejects(() => reader.response(load), { status: 503 });
    assert.equal(loads, 2);
  } finally {
    f.db.close();
  }
});

test('slow reads started before suspension cannot return after restore and resume', async () => {
  const f = fixture();
  try {
    const gate = f.open(),
      reader = new CoordinatedReads(gate);
    const waiting = deferred();
    const result = reader.response(async () => {
      await waiting.promise;
      return Response.json({ old: true });
    });
    gate.suspend('restore');
    gate.resumeAfterVerification('restore', 10);
    waiting.resolve();
    await assert.rejects(() => result, { status: 503 });
    const permit = gate.admit();
    const commit = deferred();
    const duringWrite = new CoordinatedReads(gate).response(async () => {
      await commit.promise;
      return new Response('before commit');
    });
    gate.complete(permit);
    commit.resolve();
    await assert.rejects(() => duringWrite, { status: 503 });
    assert.equal(gate.status().phase, 'active');
  } finally {
    f.db.close();
  }
});

test('a streaming export is fenced until its body finishes, including draining completion', async () => {
  const f = fixture();
  try {
    const gate = f.open();
    const permit = gate.admit();
    gate.suspend('restore');
    const reader = new CoordinatedReads(gate);
    const started = deferred(),
      finish = deferred();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('Export start'));
        started.resolve();
        await finish.promise;
        controller.enqueue(new TextEncoder().encode('Export end'));
        controller.close();
      },
    });
    const result = reader.response(async () => new Response(stream));
    await started.promise;
    gate.complete(permit);
    finish.resolve();
    await assert.rejects(() => result, { status: 503 });
    assert.equal(gate.requireDrained('restore'), permit.revision);
  } finally {
    f.db.close();
  }
});

test('concurrent revision changes reject stale read responses without blocking another account', async () => {
  const a = fixture(),
    b = fixture();
  try {
    const gate = a.open(),
      wait = deferred();
    const result = new CoordinatedReads(gate).response(async () => {
      await wait.promise;
      return new Response('old');
    });
    gate.complete(gate.admit());
    wait.resolve();
    await assert.rejects(() => result, { status: 503 });
    const other = await new CoordinatedReads(b.open()).response(
      async () => new Response(null, { status: 204 }),
    );
    assert.equal(other.status, 204);
    assert.equal(await other.text(), '');
    assert.equal(gate.status().pending, null);
  } finally {
    a.db.close();
    b.db.close();
  }
});
