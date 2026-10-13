import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_RETENTION_MS, pruneExportCache } from '../src/export-cache';

const now = 2_000_000_000_000;
const old = now - EXPORT_RETENTION_MS - 1;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('export cleanup preserves recent, unknown, nested, malformed and invalid-time entries', async () => {
  const removed: string[] = [];
  const folders = [
    { name: id(1), type: 'directory', mtime: old },
    { name: id(2), type: 'directory', mtime: now },
    { name: '../drafts', type: 'directory', mtime: old },
    { name: id(3), type: 'directory', mtime: old },
    { name: id(4), type: 'directory', mtime: old },
    { name: id(5), type: 'directory', mtime: old },
    { name: id(6), type: 'directory', mtime: old },
    { name: id(7), type: 'directory', mtime: NaN },
    { name: id(8), type: 'directory', mtime: now - EXPORT_RETENTION_MS },
  ];
  const result = await pruneExportCache(
    {
      async list(path) {
        if (path === 'exports') return folders;
        assert.notEqual(path, `exports/${id(2)}`);
        const name = path.endsWith(id(3)) ? '../draft.docx' : 'Quarterly plan.docx';
        const type = path.endsWith(id(4)) ? 'directory' : 'file';
        const mtime = path.endsWith(id(5)) ? now : old;
        return path.endsWith(id(6)) ? [] : [{ name, type, mtime }];
      },
      async removeFile(path) {
        removed.push(path);
      },
      async removeDirectory(path) {
        removed.push(path);
      },
    },
    now,
  );
  assert.deepEqual(removed, [`exports/${id(1)}/Quarterly plan.docx`, `exports/${id(1)}`]);
  assert.deepEqual(result, { removed: 1, failed: 0 });
});

test('cleanup failures are reported without deleting the directory or blocking later copies', async () => {
  const directories: string[] = [];
  const result = await pruneExportCache(
    {
      async list(path) {
        return path === 'exports'
          ? [1, 2].map((n) => ({ name: id(n), type: 'directory', mtime: old }))
          : [{ name: 'file.xlsx', type: 'file', mtime: old }];
      },
      async removeFile(path) {
        if (path.includes(id(1))) throw new Error('Unavailable');
      },
      async removeDirectory(path) {
        directories.push(path);
      },
    },
    now,
  );
  assert.deepEqual(result, { removed: 1, failed: 1 });
  assert.deepEqual(directories, [`exports/${id(2)}`]);
});
