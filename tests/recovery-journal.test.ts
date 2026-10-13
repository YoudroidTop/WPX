import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RecoveryJournal, type RecoveryIntent } from '../cloud/recovery-journal';
import type { SqlDatabase, SqlValue } from '../cloud/documents';

function open(path = ':memory:') {
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
  const journal = new RecoveryJournal(sql, (fn) => {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  return { db, journal };
}
const expected = { sha256: 'a'.repeat(64), count: 3, usedBytes: 1200, trashed: 1 };
const intent: RecoveryIntent = {
  id: 'recovery-1',
  accountId: 'fixture-account',
  objectId: 'fixture-object',
  approvalReference: 'fixture-approval',
  codeVersion: 'fixture-code',
  schemaVersion: '1',
  targetBookmark: 'target',
  beforeBookmark: 'before',
  highWaterMark: 12,
  expected,
  before: { ...expected, sha256: 'b'.repeat(64), count: 2 },
};

test('recovery journal survives database reopen at every phase and retains the original undo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhuole-recovery-journal-'));
  const path = join(dir, 'journal.sqlite');
  let f = open(path);
  const reopen = () => {
    f.db.close();
    f = open(path);
  };
  try {
    f.journal.begin(intent);
    reopen();
    assert.equal(f.journal.get(intent.id).phase, 'prepared');
    f.journal.startScheduling(intent.id);
    reopen();
    assert.equal(f.journal.get(intent.id).phase, 'scheduling');
    assert.throws(() => f.journal.startScheduling(intent.id), /already started/);
    f.journal.recordScheduled(intent.id, 'original-undo');
    reopen();
    assert.equal(f.journal.get(intent.id).undoBookmark, 'original-undo');
    f.journal.recordRestored(intent.id);
    reopen();
    assert.equal(f.journal.get(intent.id).phase, 'restored');
    f.journal.recordVerified(intent.id, expected, 13);
    reopen();
    assert.equal(f.journal.get(intent.id).verifiedRevision, 13);
    f.journal.complete(intent.id);
    reopen();
    assert.equal(f.journal.get(intent.id).phase, 'complete');
    assert.equal(f.journal.get(intent.id).undoBookmark, 'original-undo');
    assert.throws(() => f.journal.recordScheduled(intent.id, 'replacement'), /cannot be replaced/);
    assert.deepEqual(f.journal.begin(intent), f.journal.get(intent.id));
  } finally {
    f.db.close();
    rmSync(dir, { recursive: true });
  }
});

test('identity and active recovery ownership cannot change on a retry', () => {
  const { db, journal } = open();
  try {
    const first = journal.begin(intent);
    assert.deepEqual(journal.begin({ ...intent }), first);
    for (const key of [
      'accountId',
      'objectId',
      'targetBookmark',
      'approvalReference',
      'codeVersion',
    ] as const)
      assert.throws(() => journal.begin({ ...intent, [key]: 'changed' }), /cannot be changed/);
    assert.throws(() => journal.begin({ ...intent, id: 'competing' }), /unfinished/);
    assert.deepEqual(journal.get(intent.id), first);
  } finally {
    db.close();
  }
});

test('missing undo, skipped phases and mismatched verification fail closed', () => {
  const { db, journal } = open();
  try {
    journal.begin(intent);
    assert.throws(() => journal.complete(intent.id));
    assert.throws(() => journal.recordRestored(intent.id));
    assert.throws(() => journal.recordScheduled(intent.id, 'undo'));
    journal.startScheduling(intent.id);
    assert.throws(() => journal.recordRestored(intent.id));
    journal.recordScheduled(intent.id, 'undo');
    journal.recordRestored(intent.id);
    assert.throws(() => journal.recordVerified(intent.id, { ...expected, usedBytes: 0 }, 13));
    for (const revision of [12, -1, NaN, Number.MAX_SAFE_INTEGER])
      assert.throws(() => journal.recordVerified(intent.id, expected, revision));
    assert.equal(journal.get(intent.id).phase, 'restored');
    journal.recordVerified(intent.id, expected, 13);
    assert.deepEqual(journal.recordVerified(intent.id, expected, 13), journal.get(intent.id));
    journal.complete(intent.id);
    assert.equal(
      journal.begin({ ...intent, id: 'undo-operation', targetBookmark: 'undo' }).phase,
      'prepared',
    );
    assert.equal(journal.get(intent.id).undoBookmark, 'undo');
  } finally {
    db.close();
  }
});
