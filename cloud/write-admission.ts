import { ApiError } from '../server/errors';
import type { SqlDatabase, SqlValue } from './documents';

type GateRow = Record<string, SqlValue> & {
  revision: number;
  pending: string | null;
  recovery: string | null;
};
export interface WritePermit {
  token: string;
  revision: number;
}

// Store in one account's coordinator, never in its recoverable document storage.
// This is admission bookkeeping only: callers must durably reconcile document
// receipts before completion and verify recovery before reopening admission.
export class AccountWriteAdmission {
  constructor(
    private sql: SqlDatabase,
    private atomic: <T>(callback: () => T) => T,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS write_admission (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      revision INTEGER NOT NULL, pending TEXT, recovery TEXT
    )`);
    sql.exec('INSERT OR IGNORE INTO write_admission VALUES(1,0,NULL,NULL)');
  }

  private row(): GateRow {
    return [...this.sql.exec<GateRow>('SELECT revision,pending,recovery FROM write_admission')][0];
  }

  status() {
    const row = this.row();
    return {
      phase: row.recovery ? (row.pending ? 'draining' : 'suspended') : 'active',
      highWaterMark: row.revision,
      pending: row.pending,
      recovery: row.recovery,
    } as const;
  }

  admit(): WritePermit {
    return this.atomic(() => {
      const row = this.row();
      if (row.recovery || row.pending)
        throw new ApiError(503, '文档写入暂不可用，当前修改尚未保存，请稍后重试');
      const revision = row.revision + 1;
      if (!Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER)
        throw new Error('Write revision range exhausted');
      const token = crypto.randomUUID();
      this.sql.exec('UPDATE write_admission SET revision=?,pending=?', revision, token);
      return { token, revision };
    });
  }

  // An exception or timeout is not a terminal document receipt. Do not call this
  // from an unconditional finally block, and do not add time-based permit expiry.
  complete(permit: WritePermit): void {
    this.atomic(() => {
      const row = this.row();
      if (row.pending !== permit.token || row.revision !== permit.revision)
        throw new Error('Write receipt does not match the pending permit');
      this.sql.exec('UPDATE write_admission SET pending=NULL');
    });
  }

  suspend(recovery: string): void {
    if (!recovery.trim()) throw new Error('Recovery operation ID is required');
    this.atomic(() => {
      const row = this.row();
      if (row.recovery && row.recovery !== recovery)
        throw new Error('Another recovery operation owns admission');
      this.sql.exec('UPDATE write_admission SET recovery=?', recovery);
    });
  }

  requireDrained(recovery: string): number {
    const row = this.row();
    if (row.recovery !== recovery || !recovery || row.pending)
      throw new Error('Recovery admission is not drained');
    return row.revision;
  }

  // Persist the revision assigned by recovery before reopening. The outer
  // coordinator is responsible for verification and authorization, not this API.
  resumeAfterVerification(recovery: string, revision: number): void {
    this.atomic(() => {
      const previous = this.requireDrained(recovery);
      if (
        !Number.isSafeInteger(revision) ||
        revision <= previous ||
        revision >= Number.MAX_SAFE_INTEGER
      )
        throw new Error('Verified recovery revision must advance within the safe range');
      this.sql.exec('UPDATE write_admission SET revision=?,recovery=NULL', revision);
    });
  }
}
