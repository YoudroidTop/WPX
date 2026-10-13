import type { SqlDatabase } from './documents';
import { AccountWriteAdmission } from './write-admission';
import { RecoveryJournal } from './recovery-journal';

// Both components must live in the same per-account coordinator database.
// All mutations below share one outer transaction, including rollback on failure.
export function completeVerifiedRecovery(
  sql: SqlDatabase,
  atomic: <T>(fn: () => T) => T,
  operation: string,
) {
  return atomic(() => {
    const journal = new RecoveryJournal(sql, (fn) => fn());
    const admission = new AccountWriteAdmission(sql, (fn) => fn());
    const record = journal.get(operation);
    // A delayed retry must not reopen a later suspension or disturb a new write.
    if (record.phase === 'complete') return record;
    if (record.phase !== 'verified' || record.verifiedRevision === null)
      throw new Error('Recovery must be verified before reopening admission');
    admission.resumeAfterVerification(operation, record.verifiedRevision);
    return journal.complete(operation);
  });
}
