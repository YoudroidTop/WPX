import type { SqlDatabase } from './documents';
import { AccountWriteAdmission } from './write-admission';
import { RecoveryJournal } from './recovery-journal';
import { CoordinatorTarget } from './coordinator-target';

// The operator adapter must authorize the target separately. This transaction
// prevents scheduling intent from outrunning the account's write fence.
export function startDrainedRecovery(
  sql: SqlDatabase,
  atomic: <T>(fn: () => T) => T,
  operation: string,
) {
  return atomic(() => {
    const journal = new RecoveryJournal(sql, (fn) => fn());
    const admission = new AccountWriteAdmission(sql, (fn) => fn());
    const record = journal.get(operation);
    const target = new CoordinatorTarget(sql, (fn) => fn());
    if (target.require(record.intent.accountId) !== record.intent.objectId)
      throw new Error('Recovery document target does not match the account binding');
    const ceiling = admission.requireDrained(operation);
    if (ceiling !== record.intent.highWaterMark)
      throw new Error('Recovery revision ceiling changed after preparation');
    // A persisted scheduling phase is ambiguous after restart. Never return it
    // as permission to invoke PITR a second time.
    return journal.startScheduling(operation);
  });
}
