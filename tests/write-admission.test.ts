import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountWriteAdmission } from '../cloud/write-admission';
import type { SqlDatabase, SqlValue } from '../cloud/documents';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

test('suspension drains an admitted write and survives coordinator reconstruction', () => {
  const f = fixture();
  try {
    let gate = f.open();
    const permit = gate.admit();
    gate.suspend('restore-1');
    gate = f.open();
    assert.equal(gate.status().phase, 'draining');
    assert.throws(() => gate.admit(), { status: 503 });
    assert.throws(() => gate.requireDrained('restore-1'));
    assert.throws(() => gate.resumeAfterVerification('restore-1', 2));
    gate.complete(permit);
    gate = f.open();
    assert.equal(gate.status().phase, 'suspended');
    assert.equal(gate.requireDrained('restore-1'), 1);
    assert.throws(() => gate.admit(), { status: 503 });
    gate.resumeAfterVerification('restore-1', 2);
    assert.equal(f.open().admit().revision, 3);
  } finally {
    f.db.close();
  }
});

test('uncertain writes cannot expire, overlap, or be completed by a stale receipt', () => {
  const f = fixture();
  try {
    const gate = f.open();
    const first = gate.admit();
    assert.throws(() => f.open().admit(), { status: 503 });
    assert.throws(() => gate.complete({ ...first, revision: first.revision + 1 }));
    gate.complete(first);
    const second = gate.admit();
    assert.throws(() => gate.complete(first));
    assert.equal(gate.status().pending, second.token);
    assert.equal(second.revision, first.revision + 1);
  } finally {
    f.db.close();
  }
});

test('recovery ownership and revision floor survive repeated suspension and undo', () => {
  const f = fixture();
  try {
    const gate = f.open();
    gate.suspend('restore');
    gate.suspend('restore');
    assert.throws(() => gate.suspend('other'));
    assert.throws(() => gate.resumeAfterVerification('other', 10));
    gate.resumeAfterVerification('restore', 10);
    const write = gate.admit();
    gate.complete(write);
    gate.suspend('undo');
    for (const value of [0, 10, 11, NaN, Infinity, Number.MAX_SAFE_INTEGER])
      assert.throws(() => gate.resumeAfterVerification('undo', value));
    assert.equal(f.open().status().phase, 'suspended');
    gate.resumeAfterVerification('undo', 12);
    assert.equal(gate.admit().revision, 13);
  } finally {
    f.db.close();
  }
});

test('suspending one account does not block another and exhausted revisions fail closed', () => {
  const a = fixture(),
    b = fixture();
  try {
    a.open().suspend('restore');
    assert.equal(b.open().admit().revision, 1);
    a.open().resumeAfterVerification('restore', Number.MAX_SAFE_INTEGER - 1);
    assert.throws(() => a.open().admit(), /exhausted/);
    assert.equal(a.open().status().pending, null);
    assert.equal(a.open().status().highWaterMark, Number.MAX_SAFE_INTEGER - 1);
  } finally {
    a.db.close();
    b.db.close();
  }
});

test('closing and reopening persistent storage preserves uncertain admission and suspension', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zhuole-admission-'));
  const path = join(directory, 'coordinator.sqlite');
  let f = fixture(path);
  try {
    const permit = f.open().admit();
    f.open().suspend('restore-persistent');
    f.db.close();
    f = fixture(path);
    assert.equal(f.open().status().phase, 'draining');
    assert.equal(f.open().status().pending, permit.token);
    assert.throws(() => f.open().admit(), { status: 503 });
    f.open().complete(permit);
    f.db.close();
    f = fixture(path);
    assert.equal(f.open().requireDrained('restore-persistent'), permit.revision);
    assert.equal(f.open().status().phase, 'suspended');
  } finally {
    f.db.close();
    rmSync(directory, { recursive: true });
  }
});

test('a delayed admitted operation keeps recovery draining until its durable outcome is known', async () => {
  const f = fixture();
  try {
    const gate = f.open();
    const permit = gate.admit();
    let resolve!: () => void;
    const parsing = new Promise<void>((done) => {
      resolve = done;
    });
    let committed = false;
    const operation = (async () => {
      await parsing;
      committed = true;
      gate.complete(permit);
    })();
    gate.suspend('during-import');
    assert.equal(committed, false);
    assert.throws(() => gate.requireDrained('during-import'));
    assert.throws(() => gate.admit(), { status: 503 });
    resolve();
    await operation;
    assert.equal(committed, true);
    assert.equal(gate.requireDrained('during-import'), permit.revision);
  } finally {
    f.db.close();
  }
});

test('historical ceiling requires exclusive drained ownership and never reopens admission', () => {
  const f = fixture();
  try {
    const gate = f.open();
    assert.throws(() => gate.registerHistoricalCeiling('migration', 900));
    const pending = gate.admit();
    gate.suspend('migration');
    assert.throws(() => gate.registerHistoricalCeiling('migration', 900));
    assert.equal(gate.status().highWaterMark, pending.revision);
    gate.complete(pending);
    assert.throws(() => gate.registerHistoricalCeiling('other', 900));
    for (const revision of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
      assert.throws(() => gate.registerHistoricalCeiling('migration', revision));
    assert.equal(gate.registerHistoricalCeiling('migration', 900), 900);
    assert.equal(gate.registerHistoricalCeiling('migration', 12), 900);
    assert.equal(gate.registerHistoricalCeiling('migration', 900), 900);
    assert.equal(f.open().status().phase, 'suspended');
    assert.throws(() => f.open().admit(), { status: 503 });
    assert.throws(() => gate.resumeAfterVerification('migration', 900));
    gate.resumeAfterVerification('migration', 901);
    assert.equal(f.open().admit().revision, 902);
  } finally {
    f.db.close();
  }
});

test('historical ceiling survives storage reopen and an exhausted ceiling remains closed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zhuole-history-'));
  const path = join(directory, 'coordinator.sqlite');
  let f = fixture(path);
  try {
    f.open().suspend('migration');
    f.open().registerHistoricalCeiling('migration', 5000);
    f.db.close();
    f = fixture(path);
    assert.equal(f.open().requireDrained('migration'), 5000);
    assert.equal(f.open().registerHistoricalCeiling('migration', 0), 5000);
    f.open().registerHistoricalCeiling('migration', Number.MAX_SAFE_INTEGER - 1);
    assert.throws(() => f.open().resumeAfterVerification('migration', Number.MAX_SAFE_INTEGER));
    assert.throws(() => f.open().admit(), { status: 503 });
    assert.equal(f.open().status().phase, 'suspended');
  } finally {
    f.db.close();
    rmSync(directory, { recursive: true });
  }
});

test('uninitialized admission fails closed and initialization retries preserve later state', () => {
  const f = fixture(':memory:', false);
  try {
    const gate = f.open();
    assert.equal(gate.status().phase, 'uninitialized');
    assert.throws(() => gate.admit(), { status: 503 });
    assert.throws(() => gate.suspend('restore'), { status: 503 });
    assert.throws(() => gate.resumeAfterVerification('restore', 1), { status: 503 });
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
      assert.throws(() => gate.initialize(value));
    assert.equal(gate.status().phase, 'uninitialized');
    gate.initialize(100);
    const permit = gate.admit();
    assert.equal(permit.revision, 101);
    gate.suspend('restore');
    const state = gate.status();
    f.open().initialize(100);
    assert.deepEqual(gate.status(), state);
    assert.throws(() => gate.initialize(0), /conflicts/);
    assert.deepEqual(gate.status(), state);
    gate.complete(permit);
    gate.resumeAfterVerification('restore', 102);
    gate.initialize(100);
    assert.equal(gate.admit().revision, 103);
  } finally {
    f.db.close();
  }
});

test('initialization is atomic and persists across database close and reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zhuole-initialize-'));
  const path = join(directory, 'coordinator.sqlite');
  let f = fixture(path, false);
  try {
    f.open();
    f.db.exec(`CREATE TRIGGER fail_initialization BEFORE INSERT ON write_admission_initialization
      BEGIN SELECT RAISE(ABORT, 'Injected initialization failure'); END`);
    assert.throws(() => f.open().initialize(700), /Injected initialization failure/);
    assert.equal(f.open().status().highWaterMark, 0);
    assert.equal(f.open().status().phase, 'uninitialized');
    f.db.exec('DROP TRIGGER fail_initialization');
    f.open().initialize(700);
    f.db.close();
    f = fixture(path, false);
    f.open().initialize(700);
    assert.equal(f.open().admit().revision, 701);
  } finally {
    f.db.close();
    rmSync(directory, { recursive: true });
  }
});

test('legacy coordinator state cannot be silently adopted by initialization', () => {
  const f = fixture(':memory:', false);
  try {
    f.open();
    f.db.exec(
      "UPDATE write_admission SET revision=9,pending='legacy-permit',recovery='legacy-restore'",
    );
    assert.equal(f.open().status().phase, 'uninitialized');
    assert.throws(() => f.open().initialize(9), /explicit migration/);
    assert.throws(() => f.open().admit(), { status: 503 });
    assert.throws(() => f.open().complete({ token: 'legacy-permit', revision: 9 }), {
      status: 503,
    });
    assert.equal(f.open().status().pending, 'legacy-permit');
  } finally {
    f.db.close();
  }
});
