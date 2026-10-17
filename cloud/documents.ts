import { ApiError } from '../server/errors';
import {
  MAX_CONTENT_BYTES,
  STORAGE_LIMIT,
  type CloudDocument,
  type DocumentContent,
  type DocumentSummary,
  type FolderSummary,
} from '../shared/documents';

export type SqlValue = string | number | null | ArrayBuffer;
export interface SqlDatabase {
  exec<T extends Record<string, SqlValue> = Record<string, SqlValue>>(
    query: string,
    ...bindings: SqlValue[]
  ): Iterable<T>;
}
type Metadata = Record<string, SqlValue> & {
  id: string;
  folder_id: string | null;
  name: string;
  kind: DocumentContent['type'];
  size: number;
  revision: number;
  starred: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};
type FolderMetadata = Record<string, SqlValue> & {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};
export type DocumentPatch = {
  name?: string;
  content?: DocumentContent;
  starred?: boolean;
  deleted?: boolean;
  folderId?: string | null;
};

// Each instance belongs to exactly one account. Only the authenticated worker chooses that account.
export class AccountDocuments {
  constructor(
    private sql: SqlDatabase,
    private atomic: <T>(callback: () => T) => T,
    private quota = STORAGE_LIMIT,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY, parent_id TEXT,
      name TEXT NOT NULL, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, deleted_at INTEGER
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, folder_id TEXT, name TEXT NOT NULL, kind TEXT NOT NULL,
      size INTEGER NOT NULL CHECK(size >= 0), revision INTEGER NOT NULL,
      starred INTEGER NOT NULL, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, deleted_at INTEGER
    )`);
    try {
      sql.exec('ALTER TABLE documents ADD COLUMN folder_id TEXT');
    } catch {}
    try {
      sql.exec(`UPDATE documents
        SET folder_id = name, name = kind, kind = size, size = revision, revision = 1, starred = 0, created_at = updated_at, deleted_at = NULL
        WHERE typeof(size) = 'text'`);
    } catch {}
    sql.exec(`CREATE TABLE IF NOT EXISTS content_chunks (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL, bytes BLOB NOT NULL,
      PRIMARY KEY(document_id, ordinal)
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS recovery_revision_floor (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL
    )`);
    sql.exec('INSERT OR IGNORE INTO recovery_revision_floor VALUES(1,0)');
  }
  used(): number {
    return Number(
      [...this.sql.exec('SELECT COALESCE(SUM(size), 0) AS total FROM documents')][0].total,
    );
  }
  list(): DocumentSummary[] {
    return [...this.sql.exec<Metadata>('SELECT * FROM documents ORDER BY updated_at DESC')].map(
      summary,
    );
  }
  // Recovery callers must hold an external write fence and supply a durable high-water
  // mark covering every issued revision, including deleted documents and prior restores.
  // This method alone is not a production recovery protocol.
  advanceRevisionsPast(highWaterMark: number): number {
    if (!Number.isSafeInteger(highWaterMark) || highWaterMark < 0)
      throw new Error('Invalid recovery revision high-water mark');
    return this.atomic(() => {
      const currentMaximum = Number(
        [...this.sql.exec('SELECT COALESCE(MAX(revision), 0) AS maximum FROM documents')][0]
          .maximum,
      );
      const floor = Number(
        [...this.sql.exec('SELECT revision FROM recovery_revision_floor')][0].revision,
      );
      const next = Math.max(currentMaximum, highWaterMark, floor) + 1;
      if (!Number.isSafeInteger(next)) throw new Error('Recovery revision range exhausted');
      this.sql.exec('UPDATE documents SET revision=?', next);
      this.sql.exec('UPDATE recovery_revision_floor SET revision=?', next);
      // Empty restored accounts still need an externally persisted fence before
      // admission reopens; no document row exists from which to read it back.
      return next;
    });
  }
  private metadata(id: string): Metadata {
    const row = [...this.sql.exec<Metadata>('SELECT * FROM documents WHERE id=?', id)][0];
    if (!row) throw new ApiError(404, '文档不存在或无权访问');
    return row;
  }
  get(id: string): CloudDocument {
    const row = this.metadata(id);
    const chunks = [
      ...this.sql.exec<{ bytes: ArrayBuffer }>(
        'SELECT bytes FROM content_chunks WHERE document_id=? ORDER BY ordinal',
        id,
      ),
    ];
    const bytes = new Uint8Array(row.size);
    let offset = 0;
    for (const chunk of chunks) {
      const part = new Uint8Array(chunk.bytes);
      bytes.set(part, offset);
      offset += part.length;
    }
    if (offset !== row.size) throw new Error('Stored document length mismatch');
    return { ...summary(row), content: JSON.parse(new TextDecoder().decode(bytes)) };
  }
  private encode(content: DocumentContent): Uint8Array {
    const bytes = new TextEncoder().encode(JSON.stringify(content));
    if (bytes.length > MAX_CONTENT_BYTES) throw new ApiError(413, '单个文档内容不能超过 4 MB');
    return bytes;
  }
  private write(id: string, bytes: Uint8Array) {
    this.sql.exec('DELETE FROM content_chunks WHERE document_id=?', id);
    // Byte chunks keep multibyte text lossless and stay below Cloudflare's 2 MB row limit.
    for (let offset = 0, ordinal = 0; offset < bytes.length; offset += 512_000, ordinal++) {
      this.sql.exec(
        'INSERT INTO content_chunks VALUES(?,?,?)',
        id,
        ordinal,
        bytes.slice(offset, offset + 512_000).buffer,
      );
    }
  }
  create(name: string, content: DocumentContent, folderId: string | null = null): CloudDocument {
    const bytes = this.encode(content);
    return this.atomic(() => {
      if (folderId) {
        const folder = this.getFolder(folderId);
        if (folder.deletedAt) throw new ApiError(400, '目标文件夹已在回收站中');
      }
      if (this.used() + bytes.length > this.quota)
        throw new ApiError(413, '云空间不足，请清理回收站后重试');
      const id = crypto.randomUUID(),
        now = Date.now();
      this.sql.exec(
        `INSERT INTO documents(
          id, folder_id, name, kind, size, revision, starred, created_at, updated_at, deleted_at
        ) VALUES(?,?,?,?,?,1,0,?,?,NULL)`,
        id,
        folderId ?? null,
        name,
        content.type,
        bytes.length,
        now,
        now,
      );
      this.write(id, bytes);
      return this.get(id);
    });
  }
  update(id: string, revision: number, patch: DocumentPatch): CloudDocument {
    return this.atomic(() => {
      const current = this.metadata(id);
      if (current.revision !== revision)
        throw new ApiError(409, '文档已在其他窗口更新，请先保留本地副本，再重新打开');
      if (!Number.isSafeInteger(current.revision) || current.revision >= Number.MAX_SAFE_INTEGER)
        throw new ApiError(409, '文档版本已达到上限，当前修改尚未保存，请导出备份后联系管理员');
      if (current.deleted_at !== null && (patch.content || patch.name))
        throw new ApiError(409, '请先从回收站恢复此文档');
      if (patch.content && patch.content.type !== current.kind)
        throw new ApiError(400, '文档类型不可修改');
      if (patch.folderId !== undefined && patch.folderId !== null) {
        const folder = this.getFolder(patch.folderId);
        if (folder.deletedAt) throw new ApiError(400, '目标文件夹已在回收站中');
      }
      const bytes = patch.content ? this.encode(patch.content) : undefined;
      const size = bytes?.length ?? current.size;
      if (this.used() - current.size + size > this.quota)
        throw new ApiError(413, '云空间不足，当前修改尚未保存');
      const now = Date.now();
      const nextFolderId =
        patch.folderId === undefined ? (current.folder_id as string | null) : patch.folderId;
      this.sql.exec(
        `UPDATE documents SET name=?, size=?, revision=revision+1,
        starred=?, updated_at=?, deleted_at=?, folder_id=? WHERE id=?`,
        patch.name ?? current.name,
        size,
        patch.starred === undefined ? current.starred : Number(patch.starred),
        now,
        patch.deleted === undefined ? current.deleted_at : patch.deleted ? now : null,
        nextFolderId,
        id,
      );
      if (bytes) this.write(id, bytes);
      return this.get(id);
    });
  }
  remove(id: string, revision: number): void {
    this.atomic(() => {
      const current = this.metadata(id);
      if (current.deleted_at === null) throw new ApiError(409, '请先将文档移入回收站');
      if (current.revision !== revision) throw new ApiError(409, '文档已更新，请刷新后重试');
      this.sql.exec('DELETE FROM content_chunks WHERE document_id=?', id);
      this.sql.exec('DELETE FROM documents WHERE id=?', id);
    });
  }
  listFolders(): FolderSummary[] {
    return [...this.sql.exec<FolderMetadata>('SELECT * FROM folders ORDER BY updated_at DESC')].map(
      folderSummary,
    );
  }
  getFolder(id: string): FolderSummary {
    const row = [...this.sql.exec<FolderMetadata>('SELECT * FROM folders WHERE id=?', id)][0];
    if (!row) throw new ApiError(404, '文件夹不存在或无权访问');
    return folderSummary(row);
  }
  createFolder(name: string, parentId: string | null = null): FolderSummary {
    const trimmed = name.trim();
    if (!trimmed) throw new ApiError(400, '文件夹名称不能为空');
    if (parentId) {
      const parent = this.getFolder(parentId);
      if (parent.deletedAt) throw new ApiError(400, '目标文件夹已在回收站中');
    }
    const id = crypto.randomUUID(),
      now = Date.now();
    this.sql.exec(
      'INSERT INTO folders(id, parent_id, name, created_at, updated_at, deleted_at) VALUES(?,?,?,?,?,NULL)',
      id,
      parentId ?? null,
      trimmed,
      now,
      now,
    );
    return this.getFolder(id);
  }
  updateFolder(
    id: string,
    patch: { name?: string; parentId?: string | null; deleted?: boolean },
  ): FolderSummary {
    return this.atomic(() => {
      const current = this.getFolder(id);
      if (patch.name !== undefined) {
        const trimmed = patch.name.trim();
        if (!trimmed) throw new ApiError(400, '文件夹名称不能为空');
      }
      if (patch.parentId !== undefined && patch.parentId !== null) {
        if (patch.parentId === id) throw new ApiError(400, '无法将文件夹移动到自身内部');
        let check: string | null = patch.parentId;
        while (check) {
          if (check === id) throw new ApiError(400, '无法将文件夹移动到其子文件夹中');
          const nextFolder = this.getFolder(check);
          check = nextFolder.parentId;
        }
      }
      const nextName = patch.name !== undefined ? patch.name.trim() : current.name;
      const nextParentId = patch.parentId === undefined ? current.parentId : patch.parentId;
      const nextDeletedAt =
        patch.deleted === undefined ? current.deletedAt : patch.deleted ? Date.now() : null;
      this.sql.exec(
        'UPDATE folders SET name=?, parent_id=?, updated_at=?, deleted_at=? WHERE id=?',
        nextName,
        nextParentId,
        Date.now(),
        nextDeletedAt,
        id,
      );
      return this.getFolder(id);
    });
  }
  removeFolder(id: string): void {
    this.atomic(() => {
      const current = this.getFolder(id);
      if (!current.deletedAt) throw new ApiError(409, '请先将文件夹移入回收站');
      this.sql.exec(
        'DELETE FROM content_chunks WHERE document_id IN (SELECT id FROM documents WHERE folder_id=?)',
        id,
      );
      this.sql.exec('DELETE FROM documents WHERE folder_id=?', id);
      this.sql.exec('DELETE FROM folders WHERE id=?', id);
    });
  }
}
function summary(row: Metadata): DocumentSummary {
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
    folderId: (row.folder_id as string | null) ?? null,
  };
}
function folderSummary(row: FolderMetadata): FolderSummary {
  return {
    id: row.id,
    parentId: (row.parent_id as string | null) ?? null,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: (row.deleted_at as number | null) ?? null,
  };
}
