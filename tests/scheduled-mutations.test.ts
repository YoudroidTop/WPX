import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SqlDatabase, SqlValue } from '../cloud/documents';
import { AccountWriteAdmission } from '../cloud/write-admission';
import { AccountMutationDispatch } from '../cloud/mutation-dispatch';
import { ScheduledMutations } from '../cloud/scheduled-mutations';
import { blankContent } from '../shared/documents';

function fixture(path = ':memory:') {
  const db = new DatabaseSync(path);
  const sql: SqlDatabase = {
    exec<T extends Record<string, SqlValue>>(query: string, ...values: SqlValue[]): T[] {
      return db.prepare(query).all(...(values as (string | number | null)[])) as T[];
    },
  };
  db.exec('CREATE TABLE IF NOT EXISTS test_alarm (singleton INTEGER PRIMARY KEY, time INTEGER)');
  let failSet = false,
    failDelete = false,
    now = 10_000;
  const alarms = {
    setAlarm: async (time: number) => {
      db.prepare('INSERT OR REPLACE INTO test_alarm VALUES(1,?)').run(time);
      if (failSet) throw new Error('Alarm set failure');
    },
    deleteAlarm: async () => {
      db.exec('DELETE FROM test_alarm');
      if (failDelete) throw new Error('Alarm delete failure');
    },
  };
  const transaction = async <T>(fn: () => Promise<T>) => {
    db.exec('BEGIN');
    try {
      const result = await fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const gate = new AccountWriteAdmission(sql, (fn) => fn());
  gate.initialize(0);
  const scheduler = new ScheduledMutations(sql, transaction, alarms, () => now, 1_000, 4_000);
  return {
    db,
    sql,
    gate,
    scheduler,
    alarm: () => db.prepare('SELECT time FROM test_alarm').get()?.time ?? null,
    now: (value: number) => {
      now = value;
    },
    failSet: (value: boolean) => {
      failSet = value;
    },
    failDelete: (value: boolean) => {
      failDelete = value;
    },
  };
}
const command = () => ({
  kind: 'create' as const,
  name: 'Scheduled QA',
  content: blankContent('word'),
});

test('command admission and initial alarm commit or roll back together', async () => {
  const f = fixture();
  try {
    f.failSet(true);
    await assert.rejects(() => f.scheduler.enqueue(command()), /Alarm set failure/);
    assert.equal(f.scheduler.pending(), null);
    assert.equal(f.gate.status().highWaterMark, 0);
    assert.equal(f.alarm(), null);
    f.failSet(false);
    const pending = await f.scheduler.enqueue(command());
    assert.deepEqual(f.scheduler.pending(), pending);
    assert.equal(f.alarm(), 11_000);
    await assert.rejects(() => f.scheduler.enqueue(command()), { status: 503 });
    assert.deepEqual(f.scheduler.pending(), pending);
    assert.equal(f.alarm(), 11_000);
  } finally {
    f.db.close();
  }
});

test('terminal acknowledgement and alarm cancellation are atomic and preserve suspension', async () => {
  const f = fixture();
  try {
    const pending = await f.scheduler.enqueue(command());
    f.gate.suspend('restore');
    const receipt = { ...pending.permit, result: { error: { status: 409, message: 'Conflict' } } };
    f.failDelete(true);
    await assert.rejects(() => f.scheduler.acknowledge(receipt), /Alarm delete failure/);
    assert.deepEqual(f.scheduler.pending(), pending);
    assert.equal(f.gate.status().phase, 'draining');
    assert.equal(f.alarm(), 11_000);
    f.failDelete(false);
    await f.scheduler.acknowledge(receipt);
    assert.equal(f.scheduler.pending(), null);
    assert.equal(f.gate.status().phase, 'suspended');
    assert.equal(f.alarm(), null);
    assert.equal(await f.scheduler.prepareRetry(), false);
    assert.equal(f.alarm(), null);
  } finally {
    f.db.close();
  }
});

test('retry schedule survives reopen and keeps bounded retries beyond the platform retry cap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhuole-scheduled-'));
  const path = join(dir, 'control.sqlite');
  let f = fixture(path);
  try {
    const pending = await f.scheduler.enqueue(command());
    f.db.close();
    f = fixture(path);
    assert.deepEqual(f.scheduler.pending(), pending);
    assert.equal(f.alarm(), 11_000);
    for (let attempt = 1; attempt <= 10; attempt++) {
      const now = 20_000 + attempt * 10_000;
      f.now(now);
      assert.equal(await f.scheduler.prepareRetry(), true);
      assert.equal(f.alarm(), now + Math.min(1_000 * 2 ** attempt, 4_000));
      assert.deepEqual(f.scheduler.pending(), pending);
    }
    f.failSet(true);
    const alarm = f.alarm();
    const attempts = f.db.prepare('SELECT attempts FROM mutation_retry').get()?.attempts;
    await assert.rejects(() => f.scheduler.prepareRetry(), /Alarm set failure/);
    assert.equal(f.alarm(), alarm);
    assert.equal(f.db.prepare('SELECT attempts FROM mutation_retry').get()?.attempts, attempts);
  } finally {
    f.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing retry ownership fails closed without replaying an unscheduled legacy command', async () => {
  const f = fixture();
  try {
    const legacy = new AccountMutationDispatch(f.sql, (fn) => fn()).enqueue(command());
    await assert.rejects(() => f.scheduler.prepareRetry(), /no matching retry schedule/);
    assert.deepEqual(f.scheduler.pending(), legacy);
    assert.equal(f.alarm(), null);
  } finally {
    f.db.close();
  }
});
