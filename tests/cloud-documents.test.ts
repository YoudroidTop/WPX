import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountDocuments, type SqlDatabase, type SqlValue } from '../cloud/documents';
import { blankContent, type DocumentContent } from '../shared/documents';

function fixture(quota?: number) {
  const db = new DatabaseSync(':memory:');
  let failWrites = false;
  const sql: SqlDatabase = {
    exec<T extends Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): T[] {
      if (failWrites && query.startsWith('INSERT INTO content_chunks'))
        throw new Error('Disk unavailable');
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
  const store = new AccountDocuments(
    sql,
    (callback) => {
      db.exec('BEGIN');
      try {
        const result = callback();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    quota,
  );
  return {
    db,
    store,
    fail: () => {
      failWrites = true;
    },
  };
}
const word = (text: string): DocumentContent => ({
  type: 'word',
  doc: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

test('cloud storage chunks large Unicode documents and preserves account isolation', () => {
  const a = fixture(),
    b = fixture();
  try {
    const content = word('卓乐🙂'.repeat(280_000));
    const doc = a.store.create('Large document', content);
    assert.ok(doc.size > 2_000_000);
    assert.deepEqual(a.store.get(doc.id).content, content);
    const sizes = a.db.prepare('SELECT length(bytes) AS size FROM content_chunks').all();
    assert.ok(sizes.length > 1);
    assert.ok(sizes.every((row) => Number(row.size) <= 512_000));
    assert.throws(() => b.store.get(doc.id), { status: 404 });
    assert.equal(b.store.used(), 0);
    assert.throws(() => a.store.create('Too large', word('x'.repeat(4_000_001))), { status: 413 });
  } finally {
    a.db.close();
    b.db.close();
  }
});

test('cloud quota counts trash and rejects stale updates without altering content', () => {
  const content = blankContent('word');
  const size = Buffer.byteLength(JSON.stringify(content));
  const { store, db } = fixture(size * 2);
  try {
    const first = store.create('First', content);
    const second = store.create('Second', content);
    assert.equal(store.used(), size * 2);
    const trash = store.update(first.id, 1, { deleted: true });
    assert.throws(() => store.create('Full', content), { status: 413 });
    assert.throws(() => store.update(first.id, 1, { starred: true }), { status: 409 });
    assert.throws(() => store.update(first.id, trash.revision, { content }), { status: 409 });
    assert.throws(() => store.remove(first.id, 1), { status: 409 });
    store.remove(first.id, trash.revision);
    assert.equal(store.used(), size);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS total FROM content_chunks WHERE document_id=?').get(first.id)!
        .total,
      0,
    );
    const updated = store.update(second.id, second.revision, { name: 'Renamed' });
    assert.equal(updated.revision, 2);
    assert.deepEqual(updated.content, content);
    assert.throws(() => store.update(second.id, 1, { name: 'Stale' }), { status: 409 });
    assert.equal(store.get(second.id).name, 'Renamed');
  } finally {
    db.close();
  }
});

test('cloud chunk write failure rolls back metadata, quota and previous content', () => {
  const { store, db, fail } = fixture();
  try {
    const doc = store.create('Original', word('Original body'));
    fail();
    assert.throws(
      () => store.update(doc.id, 1, { name: 'Changed', content: word('Replacement') }),
      /Disk unavailable/,
    );
    assert.deepEqual(store.get(doc.id), doc);
    assert.equal(store.used(), doc.size);
    assert.throws(() => store.create('Uncommitted', word('New')), /Disk unavailable/);
    assert.equal(store.list().length, 1);
    assert.equal(store.used(), doc.size);
  } finally {
    db.close();
  }
});

test('recovery revision fencing rejects pre-restore edits and trash deletion without changing data', () => {
  const { store, db } = fixture();
  try {
    const active = store.create('Restored', word('Recovered body'));
    const trash = store.create('Trash', blankContent('sheet'));
    store.update(trash.id, trash.revision, { deleted: true });
    const before = store.list().map((doc) => store.get(doc.id));
    const used = store.used();
    // The external coordinator retained 17 even though its document was deleted.
    store.advanceRevisionsPast(17);
    for (const original of before) {
      const restored = store.get(original.id);
      assert.equal(restored.revision, 18);
      assert.deepEqual({ ...restored, revision: original.revision }, original);
      for (const stale of [original.revision, 17]) {
        assert.throws(() => store.update(original.id, stale, { starred: true }), { status: 409 });
      }
    }
    assert.throws(() => store.remove(trash.id, 17), { status: 409 });
    assert.equal(store.used(), used);
    const edited = store.update(active.id, 18, { name: 'New edit' });
    assert.equal(edited.revision, 19);
    store.advanceRevisionsPast(18);
    assert.equal(store.get(active.id).revision, 20);
    assert.throws(() => store.update(active.id, edited.revision, { name: 'Before undo' }), {
      status: 409,
    });
  } finally {
    db.close();
  }
});

test('invalid or exhausted recovery revisions fail without changing documents', () => {
  const { store, db } = fixture();
  try {
    const doc = store.create('Original', word('Unchanged'));
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => store.advanceRevisionsPast(value));
      assert.deepEqual(store.get(doc.id), doc);
    }
  } finally {
    db.close();
  }
});

test('a recovered document at the safe revision limit cannot accept an imprecise update', () => {
  const { store, db } = fixture();
  try {
    const doc = store.create('Recovered', word('Keep this body'));
    store.advanceRevisionsPast(Number.MAX_SAFE_INTEGER - 1);
    const recovered = store.get(doc.id);
    assert.equal(recovered.revision, Number.MAX_SAFE_INTEGER);
    assert.throws(
      () => store.update(doc.id, recovered.revision, { content: word('Must not overwrite') }),
      { status: 409 },
    );
    assert.deepEqual(store.get(doc.id), recovered);
    assert.equal(store.used(), doc.size);
  } finally {
    db.close();
  }
});

test('empty recovery returns an explicit fence without allocating documents or quota', () => {
  const { store, db } = fixture();
  try {
    assert.equal(store.advanceRevisionsPast(17), 18);
    assert.deepEqual(store.list(), []);
    assert.equal(store.used(), 0);
    assert.throws(() => store.advanceRevisionsPast(Number.MAX_SAFE_INTEGER));
    assert.deepEqual(store.list(), []);
    assert.equal(store.advanceRevisionsPast(18), 19);
  } finally {
    db.close();
  }
});
