import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlValue } from '../cloud/documents';
import { AccountWriteAdmission } from '../cloud/write-admission';
import { RecoveryJournal } from '../cloud/recovery-journal';
import { completeVerifiedRecovery } from '../cloud/recovery-completion';

function fixture() {
  const db = new DatabaseSync(':memory:');
  let failCompletion = false;
  const sql: SqlDatabase = {
    exec<T extends Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): T[] {
      if (
        failCompletion &&
        query.startsWith('UPDATE recovery_journal') &&
        bindings[0] === 'complete'
      )
        throw new Error('Journal completion storage failure');
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
  const gate = new AccountWriteAdmission(sql, atomic),
    journal = new RecoveryJournal(sql, atomic);
  const snapshot = { sha256: 'a'.repeat(64), count: 1, usedBytes: 100, trashed: 0 };
  gate.initialize(0);
  gate.suspend('restore');
  journal.begin({
    id: 'restore',
    accountId: 'fixture',
    objectId: 'fixture-object',
    approvalReference: 'fixture-only',
    codeVersion: 'test',
    schemaVersion: '1',
    targetBookmark: 'target',
    beforeBookmark: 'before',
    highWaterMark: 0,
    expected: snapshot,
    before: snapshot,
  });
  return {
    db,
    gate,
    journal,
    finish: () => completeVerifiedRecovery(sql, atomic, 'restore'),
    fail: (value: boolean) => {
      failCompletion = value;
    },
    verify: () => {
      journal.startScheduling('restore');
      journal.recordScheduled('restore', 'undo');
      journal.recordRestored('restore');
      journal.recordVerified('restore', snapshot, 1);
    },
  };
}

test('completion storage failure rolls back admission reopening and preserves verification', () => {
  const f = fixture();
  try {
    f.verify();
    f.fail(true);
    assert.throws(() => f.finish(), /storage failure/);
    assert.equal(f.gate.status().phase, 'suspended');
    assert.equal(f.gate.status().highWaterMark, 0);
    assert.equal(f.journal.get('restore').phase, 'verified');
    assert.throws(() => f.gate.admit(), { status: 503 });
    f.fail(false);
    assert.equal(f.finish().phase, 'complete');
    assert.equal(f.gate.status().phase, 'active');
    assert.equal(f.gate.admit().revision, 2);
  } finally {
    f.db.close();
  }
});

test('retrying a completed recovery cannot release a later suspension or pending write', () => {
  const f = fixture();
  try {
    f.verify();
    f.finish();
    const permit = f.gate.admit();
    f.gate.suspend('next-recovery');
    const before = f.gate.status();
    assert.equal(f.finish().phase, 'complete');
    assert.deepEqual(f.gate.status(), before);
    assert.equal(f.gate.status().pending, permit.token);
  } finally {
    f.db.close();
  }
});

test('an unverified journal cannot reopen writes', () => {
  const f = fixture();
  try {
    assert.throws(() => f.finish(), /must be verified/);
    assert.equal(f.gate.status().phase, 'suspended');
    assert.equal(f.journal.get('restore').phase, 'prepared');
  } finally {
    f.db.close();
  }
});
