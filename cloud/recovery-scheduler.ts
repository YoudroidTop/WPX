import type { SqlDatabase } from './documents';
import { RecoveryJournal } from './recovery-journal';
import { startDrainedRecovery } from './recovery-start';

// Private, account-bound transport. The adapter resolves the supplied object ID
// in its document namespace; it must not accept an alternative caller target.
export interface RecoveryTransport {
  schedule(objectId: string, bookmark: string): Promise<string>;
}

export async function scheduleBoundRecovery(
  sql: SqlDatabase,
  atomic: <T>(fn: () => T) => T,
  operation: string,
  transport: RecoveryTransport,
) {
  const record = startDrainedRecovery(sql, atomic, operation);
  // Persist scheduling before I/O. A lost reply or failed journal write must
  // remain ambiguous and suspended, never cause an automatic second PITR call.
  const undo = await transport.schedule(record.intent.objectId, record.intent.targetBookmark);
  return new RecoveryJournal(sql, atomic).recordScheduled(operation, undo);
}
