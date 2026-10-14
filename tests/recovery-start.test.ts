import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlValue } from '../cloud/documents';
import { AccountWriteAdmission } from '../cloud/write-admission';
import { RecoveryJournal } from '../cloud/recovery-journal';
import { startDrainedRecovery } from '../cloud/recovery-start';
import { CoordinatorTarget } from '../cloud/coordinator-target';

function fixture(ceiling = 0, binding: [string, string] | null = ['fixture', 'a'.repeat(64)]) {
  const db = new DatabaseSync(':memory:');
  let fail = false;
  const sql: SqlDatabase = {
    exec<T extends Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): T[] {
      if (fail && query.startsWith('UPDATE recovery_journal')) throw new Error('Storage failure');
      return db
        .prepare(query)
        .all(...bindings.map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v))) as T[];
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
  const gate = new AccountWriteAdmission(sql, atomic);
  const journal = new RecoveryJournal(sql, atomic);
  if (binding) new CoordinatorTarget(sql, atomic).bind(...binding);
  gate.initialize(0);
  const snapshot = { sha256: 'a'.repeat(64), count: 0, usedBytes: 0, trashed: 0 };
  journal.begin({
    id: 'restore',
    accountId: 'fixture',
    objectId: 'a'.repeat(64),
    approvalReference: 'fixture',
    codeVersion: 'test',
    schemaVersion: '1',
    targetBookmark: 'target',
    beforeBookmark: 'before',
    highWaterMark: ceiling,
    expected: snapshot,
    before: snapshot,
  });
  return {
    db,
    gate,
    journal,
    start: () => startDrainedRecovery(sql, atomic, 'restore'),
    fail: (value: boolean) => {
      fail = value;
    },
  };
}

test('scheduling requires the matching recovery to own fully drained admission', () => {
  const f = fixture(1);
  try {
    assert.throws(f.start, /not drained/);
    const permit = f.gate.admit();
    f.gate.suspend('restore');
    assert.throws(f.start, /not drained/);
    assert.equal(f.journal.get('restore').phase, 'prepared');
    assert.equal(f.gate.status().pending, permit.token);
    f.gate.complete(permit);
    assert.equal(f.start().phase, 'scheduling');
    assert.throws(f.start, /already started/);
    assert.equal(f.gate.status().phase, 'suspended');
  } finally {
    f.db.close();
  }
  const other = fixture();
  try {
    other.gate.suspend('other-operation');
    assert.throws(other.start, /not drained/);
    assert.equal(other.journal.get('restore').phase, 'prepared');
  } finally {
    other.db.close();
  }
});

test('a changed historical ceiling invalidates prepared scheduling evidence', () => {
  const f = fixture();
  try {
    f.gate.suspend('restore');
    f.gate.registerHistoricalCeiling('restore', 7);
    assert.throws(f.start, /ceiling changed/);
    assert.equal(f.journal.get('restore').phase, 'prepared');
    assert.equal(f.gate.status().highWaterMark, 7);
    assert.equal(f.gate.status().phase, 'suspended');
  } finally {
    f.db.close();
  }
});

test('storage failure leaves scheduling unstarted and admission suspended', () => {
  const f = fixture();
  try {
    f.gate.suspend('restore');
    f.fail(true);
    assert.throws(f.start, /Storage failure/);
    assert.equal(f.journal.get('restore').phase, 'prepared');
    assert.equal(f.gate.status().phase, 'suspended');
    f.fail(false);
    assert.equal(f.start().phase, 'scheduling');
  } finally {
    f.db.close();
  }
});

test('unbound and mismatched account targets cannot start recovery even when drained', () => {
  for (const binding of [null, ['other-account', 'a'.repeat(64)], ['fixture', 'b'.repeat(64)]] as (
    [string, string] | null
  )[]) {
    const f = fixture(0, binding);
    try {
      f.gate.suspend('restore');
      assert.throws(f.start, /not bound|does not match/);
      assert.equal(f.journal.get('restore').phase, 'prepared');
      assert.equal(f.journal.get('restore').undoBookmark, null);
      assert.equal(f.gate.status().phase, 'suspended');
      assert.equal(f.gate.status().highWaterMark, 0);
    } finally {
      f.db.close();
    }
  }
});
