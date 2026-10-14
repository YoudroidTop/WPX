import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AccountDocuments, type SqlDatabase } from './documents';
import { recoverySnapshotSchema } from './recovery-journal';

const requestSchema = z
  .object({
    operation: z.string().min(1).max(512),
    highWaterMark: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 2),
    expected: recoverySnapshotSchema,
  })
  .strict();
export type VerificationRequest = z.infer<typeof requestSchema>;
export interface VerificationReceipt extends VerificationRequest {
  revision: number;
}

export function recoverySnapshot(documents: AccountDocuments) {
  const summaries = documents.list().sort((a, b) => a.id.localeCompare(b.id));
  const hash = createHash('sha256').update('[');
  for (const [index, summary] of summaries.entries()) {
    if (index) hash.update(',');
    hash.update(JSON.stringify(documents.get(summary.id)));
  }
  return {
    sha256: hash.update(']').digest('hex'),
    count: summaries.length,
    usedBytes: documents.used(),
    trashed: summaries.filter((doc) => doc.deletedAt !== null).length,
  };
}

// Private document-object endpoint, invoked only while the external account
// coordinator owns drained admission. The receipt is restored with this object.
export class RecoveryVerifier {
  private documents: AccountDocuments;
  constructor(
    private sql: SqlDatabase,
    private atomic: <T>(fn: () => T) => T,
  ) {
    this.documents = new AccountDocuments(sql, (fn) => fn());
    sql.exec(`CREATE TABLE IF NOT EXISTS recovery_verification (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1), operation TEXT NOT NULL,
      fingerprint TEXT NOT NULL, receipt TEXT NOT NULL
    )`);
  }
  verify(input: VerificationRequest): VerificationReceipt {
    const request = requestSchema.parse(input);
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return this.atomic(() => {
      const previous = [...this.sql.exec('SELECT * FROM recovery_verification')][0];
      if (previous?.operation === request.operation) {
        if (previous.fingerprint !== fingerprint)
          throw new Error('Recovery verification input changed');
        return JSON.parse(String(previous.receipt)) as VerificationReceipt;
      }
      const floor = Number(
        [...this.sql.exec('SELECT revision FROM recovery_revision_floor')][0].revision,
      );
      if (request.highWaterMark < floor)
        throw new Error('Recovery verification ceiling is obsolete');
      const actual = recoverySnapshot(this.documents);
      if (JSON.stringify(actual) !== JSON.stringify(request.expected))
        throw new Error('Recovered snapshot does not match the approved target');
      const revision = this.documents.advanceRevisionsPast(request.highWaterMark);
      if (revision >= Number.MAX_SAFE_INTEGER) throw new Error('Recovery revision range exhausted');
      const receipt = { ...request, revision };
      this.sql.exec(
        'INSERT OR REPLACE INTO recovery_verification VALUES(1,?,?,?)',
        request.operation,
        fingerprint,
        JSON.stringify(receipt),
      );
      return receipt;
    });
  }
}
