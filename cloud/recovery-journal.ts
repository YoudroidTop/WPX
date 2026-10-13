import { z } from 'zod';
import type { SqlDatabase } from './documents';

const label = z.string().trim().min(1).max(512);
const snapshot = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    count: z.number().int().nonnegative(),
    usedBytes: z.number().int().nonnegative(),
    trashed: z.number().int().nonnegative(),
  })
  .strict();
const intentSchema = z
  .object({
    id: label,
    accountId: label,
    objectId: label,
    approvalReference: label,
    codeVersion: label,
    schemaVersion: label,
    targetBookmark: label,
    beforeBookmark: label,
    highWaterMark: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 2),
    expected: snapshot,
    before: snapshot,
  })
  .strict();
export type RecoveryIntent = z.infer<typeof intentSchema>;
type Phase = 'prepared' | 'scheduling' | 'scheduled' | 'restored' | 'verified' | 'complete';
export interface RecoveryRecord {
  intent: RecoveryIntent;
  phase: Phase;
  undoBookmark: string | null;
  verifiedRevision: number | null;
}

// Private coordinator storage, outside the restored object. Approval references
// are audit data; the operator adapter must authenticate and authorize separately.
export class RecoveryJournal {
  constructor(
    private sql: SqlDatabase,
    private atomic: <T>(fn: () => T) => T,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS recovery_journal (
      id TEXT PRIMARY KEY, phase TEXT NOT NULL, record TEXT NOT NULL
    )`);
    sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS recovery_journal_active
      ON recovery_journal((1)) WHERE phase != 'complete'`);
  }
  get(id: string): RecoveryRecord {
    const row = [...this.sql.exec('SELECT record FROM recovery_journal WHERE id=?', id)][0];
    if (!row) throw new Error('Recovery operation not found');
    return JSON.parse(String(row.record)) as RecoveryRecord;
  }
  private save(record: RecoveryRecord): RecoveryRecord {
    this.sql.exec(
      'UPDATE recovery_journal SET phase=?,record=? WHERE id=?',
      record.phase,
      JSON.stringify(record),
      record.intent.id,
    );
    return record;
  }
  begin(input: RecoveryIntent): RecoveryRecord {
    const intent = intentSchema.parse(input);
    return this.atomic(() => {
      if ([...this.sql.exec('SELECT id FROM recovery_journal WHERE id=?', intent.id)].length) {
        const existing = this.get(intent.id);
        if (JSON.stringify(existing.intent) !== JSON.stringify(intent))
          throw new Error('Recovery operation identity cannot be changed');
        return existing;
      }
      if ([...this.sql.exec("SELECT id FROM recovery_journal WHERE phase != 'complete'")].length)
        throw new Error('Another recovery operation is unfinished');
      const record: RecoveryRecord = {
        intent,
        phase: 'prepared',
        undoBookmark: null,
        verifiedRevision: null,
      };
      this.sql.exec(
        'INSERT INTO recovery_journal VALUES(?,?,?)',
        intent.id,
        record.phase,
        JSON.stringify(record),
      );
      return record;
    });
  }
  private advance(id: string, from: Phase, to: Phase): RecoveryRecord {
    return this.atomic(() => {
      const record = this.get(id);
      if (record.phase === to) return record;
      if (record.phase !== from) throw new Error('Recovery phase cannot be skipped or rewound');
      return this.save({ ...record, phase: to });
    });
  }
  // Only the caller that successfully starts scheduling may invoke PITR. A
  // persisted scheduling phase after a crash is ambiguous, never permission to retry.
  startScheduling(id: string): RecoveryRecord {
    return this.atomic(() => {
      const record = this.get(id);
      if (record.phase !== 'prepared') throw new Error('Recovery scheduling already started');
      return this.save({ ...record, phase: 'scheduling' });
    });
  }
  recordScheduled(id: string, undoBookmark: string): RecoveryRecord {
    const undo = label.parse(undoBookmark);
    return this.atomic(() => {
      const record = this.get(id);
      if (record.undoBookmark !== null) {
        if (record.undoBookmark !== undo)
          throw new Error('Original undo bookmark cannot be replaced');
        return record;
      }
      if (record.phase !== 'scheduling') throw new Error('Recovery was not scheduled');
      return this.save({ ...record, phase: 'scheduled', undoBookmark: undo });
    });
  }
  recordRestored(id: string) {
    return this.advance(id, 'scheduled', 'restored');
  }
  recordVerified(id: string, actual: z.infer<typeof snapshot>, revision: number): RecoveryRecord {
    const checked = snapshot.parse(actual);
    return this.atomic(() => {
      const record = this.get(id);
      if (JSON.stringify(checked) !== JSON.stringify(record.intent.expected))
        throw new Error('Recovered snapshot does not match the approved target');
      if (
        !Number.isSafeInteger(revision) ||
        revision <= record.intent.highWaterMark ||
        revision >= Number.MAX_SAFE_INTEGER
      )
        throw new Error('Recovered revision is not safely fenced');
      if (record.phase === 'verified' && record.verifiedRevision === revision) return record;
      if (record.phase !== 'restored') throw new Error('Recovery is not ready for verification');
      return this.save({ ...record, phase: 'verified', verifiedRevision: revision });
    });
  }
  complete(id: string) {
    return this.advance(id, 'verified', 'complete');
  }
}
