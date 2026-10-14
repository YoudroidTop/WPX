import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { CoordinatorTarget } from '../cloud/coordinator-target';
import type { SqlDatabase, SqlValue } from '../cloud/documents';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(path = ':memory:') {
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
  return { db, open: () => new CoordinatorTarget(sql, atomic) };
}

const objectA = 'a'.repeat(64),
  objectB = 'b'.repeat(64);

test('binding is immutable and account-specific even when object IDs are supplied again', () => {
  const f = fixture();
  try {
    const target = f.open();
    assert.throws(() => target.require('account-a'), /not bound/);
    target.bind('account-a', objectA);
    target.bind('account-a', objectA);
    assert.equal(target.require('account-a'), objectA);
    assert.throws(() => target.bind('account-b', objectA), /conflicts/);
    assert.throws(() => target.bind('account-a', objectB), /conflicts/);
    assert.throws(() => target.require('account-b'), /not bound/);
    assert.equal(target.require('account-a'), objectA);
  } finally {
    f.db.close();
  }
});

test('invalid targets fail before binding and separate coordinators remain independent', () => {
  const a = fixture(),
    b = fixture();
  try {
    for (const [account, object] of [
      ['', objectA],
      [' account', objectA],
      ['a'.repeat(129), objectA],
      ['account-a', 'invalid'],
    ])
      assert.throws(() => a.open().bind(account, object), /Invalid/);
    a.open().bind('account-a', objectA);
    b.open().bind('account-b', objectB);
    assert.equal(a.open().require('account-a'), objectA);
    assert.equal(b.open().require('account-b'), objectB);
  } finally {
    a.db.close();
    b.db.close();
  }
});

test('target binding survives storage close and reopen without accepting a new target', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zhuole-target-'));
  const path = join(directory, 'control.sqlite');
  let f = fixture(path);
  try {
    f.open().bind('account-a', objectA);
    f.db.close();
    f = fixture(path);
    assert.equal(f.open().require('account-a'), objectA);
    assert.throws(() => f.open().bind('account-a', objectB), /conflicts/);
  } finally {
    f.db.close();
    rmSync(directory, { recursive: true });
  }
});
