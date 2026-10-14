import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { parseDocumentMutation } from '../cloud/document-mutations';
import { bounded } from '../cloud/request-body';
import { blankContent } from '../shared/documents';
import { AccountWriteAdmission } from '../cloud/write-admission';
import { AccountMutationDispatch } from '../cloud/mutation-dispatch';
import type { SqlDatabase, SqlValue } from '../cloud/documents';

const request = (path: string, method: string, value?: unknown) =>
  new Request(`https://fixture.test${path}`, {
    method,
    body: value === undefined ? undefined : JSON.stringify(value),
    headers: { 'x-permit': 'forged', 'x-revision': '999999' },
  });

test('document HTTP mutations normalize all write routes and ignore forged admission headers', async () => {
  for (const kind of ['word', 'sheet', 'slide'] as const) {
    const parsed = await parseDocumentMutation(
      request('/api/documents', 'POST', { name: '  QA  ', kind }),
    );
    assert.equal(parsed?.kind, 'create');
    if (parsed?.kind !== 'create') throw new Error('Missing create');
    assert.equal(parsed.name, 'QA');
    assert.equal(parsed.content.type, kind);
    assert.deepEqual(Object.keys(parsed).sort(), ['content', 'kind', 'name']);
  }
  for (const patch of [
    { name: 'Renamed' },
    { starred: true },
    { deleted: true },
    { deleted: false },
    { content: blankContent('word') },
  ]) {
    assert.deepEqual(
      await parseDocumentMutation(
        request('/api/documents/doc-id', 'PATCH', { revision: 5, ...patch }),
      ),
      { kind: 'update', id: 'doc-id', revision: 5, patch },
    );
  }
  assert.deepEqual(
    await parseDocumentMutation(request('/api/documents/doc-id', 'DELETE', { revision: 5 })),
    { kind: 'remove', id: 'doc-id', revision: 5 },
  );
  assert.equal(
    await parseDocumentMutation(request('/api/documents/doc-id/export', 'PATCH', {})),
    null,
  );
  assert.equal(await parseDocumentMutation(request('/api/documents', 'GET')), null);
  await assert.rejects(
    () =>
      parseDocumentMutation(
        request('/api/documents', 'POST', {
          name: 'Mismatch',
          kind: 'sheet',
          content: blankContent('word'),
        }),
      ),
    { status: 400 },
  );
  await assert.rejects(() =>
    parseDocumentMutation(request('/api/documents/id', 'DELETE', { revision: 0 })),
  );
});

test('bounded request reader cancels oversized streaming bodies without trusting content length', async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      c.enqueue(new Uint8Array(3));
    },
    cancel() {
      canceled = true;
    },
  });
  const req = new Request('https://fixture.test', {
    method: 'POST',
    body: stream,
    duplex: 'half',
    headers: { 'content-length': '1' },
  } as RequestInit);
  await assert.rejects(() => bounded(req, 5), { status: 413 });
  assert.equal(canceled, true);
  assert.equal(
    (await bounded(new Request('https://fixture.test', { method: 'POST', body: '12345' }), 5))
      .length,
    5,
  );
});

test('an import paused in its parser cannot enqueue after suspension', async () => {
  const db = new DatabaseSync(':memory:');
  const sql: SqlDatabase = {
    exec<T extends Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): T[] {
      return db.prepare(query).all(...(bindings as (string | number | null)[])) as T[];
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
  try {
    const gate = new AccountWriteAdmission(sql, atomic);
    gate.initialize(0);
    const dispatch = new AccountMutationDispatch(sql, atomic);
    let started!: () => void, finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const parsing = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = parseDocumentMutation(
      new Request('https://fixture.test/api/documents/import', {
        method: 'POST',
        headers: { 'x-filename': encodeURIComponent('中文.docx') },
        body: 'fixture',
      }),
      async (filename) => {
        assert.equal(filename, '中文.docx');
        started();
        await parsing;
        return blankContent('word');
      },
    );
    await entered;
    gate.suspend('restore-during-parse');
    finish();
    const command = await result;
    assert.ok(command);
    assert.throws(() => dispatch.enqueue(command), { status: 503 });
    assert.equal(dispatch.pending(), null);
    assert.equal(gate.requireDrained('restore-during-parse'), 0);
  } finally {
    db.close();
  }
});

test('native backup import uses the real converter and malformed imports fail before admission', async () => {
  const content = blankContent('word');
  const make = (bytes: string, filename = 'Backup.zdoc') =>
    new Request('https://fixture.test/api/documents/import', {
      method: 'POST',
      headers: { 'x-filename': filename },
      body: bytes,
    });
  assert.deepEqual(await parseDocumentMutation(make(JSON.stringify(content))), {
    kind: 'create',
    name: 'Backup',
    content,
  });
  await assert.rejects(() => parseDocumentMutation(make('')), { status: 400 });
  await assert.rejects(() => parseDocumentMutation(make('invalid')), { status: 400 });
  await assert.rejects(() => parseDocumentMutation(make('x', '%ZZ')), URIError);
});
