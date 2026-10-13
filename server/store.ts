import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  MAX_CONTENT_BYTES,
  STORAGE_LIMIT,
  type CloudDocument,
  type DocumentContent,
  type DocumentSummary,
} from '../shared/documents';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
interface DocumentRow {
  id: string;
  owner_id: string;
  name: string;
  kind: DocumentContent['type'];
  content: string;
  size: number;
  revision: number;
  starred: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}
export class Store {
  db: DatabaseSync;
  constructor(
    path: string,
    public quota = STORAGE_LIMIT,
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL,
        size INTEGER NOT NULL CHECK(size >= 0), revision INTEGER NOT NULL DEFAULT 1,
        starred INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, deleted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS documents_owner ON documents(owner_id, deleted_at);
      PRAGMA user_version=1;
    `);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  used(owner: string): number {
    return Number(
      this.db
        .prepare('SELECT COALESCE(SUM(size), 0) AS total FROM documents WHERE owner_id=?')
        .get(owner)!.total,
    );
  }
  list(owner: string): DocumentSummary[] {
    return (
      this.db
        .prepare(
          'SELECT id, name, kind, size, revision, starred, created_at, updated_at, deleted_at FROM documents WHERE owner_id=? ORDER BY updated_at DESC',
        )
        .all(owner) as unknown as DocumentRow[]
    ).map(summary);
  }
  get(owner: string, id: string): CloudDocument {
    const row = this.db
      .prepare('SELECT * FROM documents WHERE owner_id=? AND id=?')
      .get(owner, id) as unknown as DocumentRow | undefined;
    if (!row) throw new ApiError(404, '文档不存在或无权访问');
    return { ...summary(row), content: JSON.parse(row.content) as DocumentContent };
  }
  create(owner: string, name: string, content: DocumentContent): CloudDocument {
    const text = JSON.stringify(content),
      size = Buffer.byteLength(text);
    if (size > MAX_CONTENT_BYTES) throw new ApiError(413, '单个文档内容不能超过 4 MB');
    return this.transaction(() => {
      if (this.used(owner) + size > this.quota)
        throw new ApiError(413, '云空间不足，请清理回收站后重试');
      const id = randomUUID(),
        now = Date.now();
      this.db
        .prepare(
          'INSERT INTO documents(id, owner_id, name, kind, content, size, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(id, owner, name, content.type, text, size, now, now);
      return this.get(owner, id);
    });
  }
  update(
    owner: string,
    id: string,
    revision: number,
    patch: { name?: string; content?: DocumentContent; starred?: boolean; deleted?: boolean },
  ): CloudDocument {
    return this.transaction(() => {
      const current = this.get(owner, id);
      if (current.revision !== revision)
        throw new ApiError(409, '文档已在其他窗口更新，请先保留本地副本，再重新打开');
      if (current.deletedAt && (patch.content || patch.name))
        throw new ApiError(409, '请先从回收站恢复此文档');
      if (patch.content && patch.content.type !== current.kind)
        throw new ApiError(400, '文档类型不可修改');
      const text = JSON.stringify(patch.content ?? current.content),
        size = Buffer.byteLength(text);
      if (size > MAX_CONTENT_BYTES) throw new ApiError(413, '单个文档内容不能超过 4 MB');
      if (this.used(owner) - current.size + size > this.quota)
        throw new ApiError(413, '云空间不足，当前修改尚未保存');
      this.db
        .prepare(
          'UPDATE documents SET name=?, content=?, size=?, revision=revision+1, starred=?, updated_at=?, deleted_at=? WHERE id=? AND owner_id=?',
        )
        .run(
          patch.name ?? current.name,
          text,
          size,
          patch.starred === undefined ? Number(current.starred) : Number(patch.starred),
          Date.now(),
          patch.deleted === undefined ? current.deletedAt : patch.deleted ? Date.now() : null,
          id,
          owner,
        );
      return this.get(owner, id);
    });
  }
  remove(owner: string, id: string, revision: number): void {
    this.transaction(() => {
      const current = this.get(owner, id);
      if (!current.deletedAt) throw new ApiError(409, '请先将文档移入回收站');
      if (current.revision !== revision) throw new ApiError(409, '文档已更新，请刷新后重试');
      this.db.prepare('DELETE FROM documents WHERE id=? AND owner_id=?').run(id, owner);
    });
  }
}
function summary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    size: row.size,
    revision: row.revision,
    starred: Boolean(row.starred),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
