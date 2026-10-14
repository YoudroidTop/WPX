import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlValue } from '../cloud/documents';
import { AccountWriteAdmission } from '../cloud/write-admission';
import { RecoveryJournal } from '../cloud/recovery-journal';
import { startDrainedRecovery } from '../cloud/recovery-start';
import { verifyBoundRecovery } from '../cloud/recovery-verification';
import type { VerificationRequest, VerificationReceipt } from '../cloud/recovery-verifier';
import { CoordinatorTarget } from '../cloud/coordinator-target';
import { scheduleBoundRecovery, type RecoveryTransport } from '../cloud/recovery-scheduler';

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
    verify: (
      verify: (objectId: string, request: VerificationRequest) => Promise<VerificationReceipt>,
    ) => verifyBoundRecovery(sql, atomic, 'restore', { verify }),
    start: () => startDrainedRecovery(sql, atomic, 'restore'),
    schedule: (transport: RecoveryTransport) =>
      scheduleBoundRecovery(sql, atomic, 'restore', transport),
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

test('bound scheduling derives both transport arguments from the journal and refuses concurrent replay', async () => {
  const f = fixture();
  let release!: (undo: string) => void;
  const calls: string[][] = [];
  const transport = {
    schedule: (object: string, bookmark: string) => {
      calls.push([object, bookmark]);
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    },
  };
  try {
    f.gate.suspend('restore');
    const first = f.schedule(transport);
    assert.equal(f.journal.get('restore').phase, 'scheduling');
    await assert.rejects(() => f.schedule(transport), /already started/);
    release('original-undo');
    assert.equal((await first).undoBookmark, 'original-undo');
    await assert.rejects(() => f.schedule(transport), /already started/);
    assert.deepEqual(calls, [['a'.repeat(64), 'target']]);
    assert.equal(f.gate.status().phase, 'suspended');
  } finally {
    f.db.close();
  }
});

test('ambiguous transport or receipt persistence failure never schedules twice', async () => {
  for (const failure of ['transport', 'persistence']) {
    const f = fixture();
    let calls = 0;
    const transport = {
      schedule: async () => {
        calls++;
        if (failure === 'transport') throw new Error('Reply lost');
        f.fail(true);
        return 'undo';
      },
    };
    try {
      f.gate.suspend('restore');
      await assert.rejects(() => f.schedule(transport), /Reply lost|Storage failure/);
      f.fail(false);
      assert.equal(f.journal.get('restore').phase, 'scheduling');
      assert.equal(f.journal.get('restore').undoBookmark, null);
      assert.equal(f.gate.status().phase, 'suspended');
      await assert.rejects(() => f.schedule(transport), /already started/);
      assert.equal(calls, 1);
    } finally {
      f.db.close();
    }
  }
});

test('an invalid binding rejects before the restore transport is called', async () => {
  const f = fixture(0, ['fixture', 'b'.repeat(64)]);
  let calls = 0;
  try {
    f.gate.suspend('restore');
    await assert.rejects(
      () =>
        f.schedule({
          schedule: async () => {
            calls++;
            return 'undo';
          },
        }),
      /does not match/,
    );
    assert.equal(calls, 0);
    assert.equal(f.journal.get('restore').phase, 'prepared');
  } finally {
    f.db.close();
  }
});

test('bound verification validates receipt identity and rechecks admission after transport', async () => {
  const f = fixture();
  try {
    f.gate.suspend('restore');
    f.start();
    f.journal.recordScheduled('restore', 'undo');
    f.journal.recordRestored('restore');
    await assert.rejects(
      () => f.verify(async (_id, request) => ({ ...request, operation: 'wrong', revision: 1 })),
      /identity mismatch/,
    );
    assert.equal(f.journal.get('restore').phase, 'restored');
    await assert.rejects(
      () =>
        f.verify(async (_id, request) => {
          f.gate.registerHistoricalCeiling('restore', 2);
          return { ...request, revision: 1 };
        }),
      /ceiling changed/,
    );
    assert.equal(f.journal.get('restore').phase, 'restored');
    assert.equal(f.gate.status().phase, 'suspended');
  } finally {
    f.db.close();
  }
});

test('bound verification reads its own target and retries verified results without I/O', async () => {
  const f = fixture();
  let calls = 0;
  try {
    f.gate.suspend('restore');
    f.start();
    f.journal.recordScheduled('restore', 'undo');
    f.journal.recordRestored('restore');
    const transport = async (id: string, request: VerificationRequest) => {
      calls++;
      assert.equal(id, 'a'.repeat(64));
      assert.equal(request.operation, 'restore');
      return { ...request, revision: 1 };
    };
    assert.equal((await f.verify(transport)).phase, 'verified');
    assert.equal((await f.verify(transport)).phase, 'verified');
    assert.equal(calls, 1);
    assert.equal(f.gate.status().phase, 'suspended');
  } finally {
    f.db.close();
  }
});
