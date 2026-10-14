import type { SqlDatabase } from './documents';
import { RecoveryJournal } from './recovery-journal';
import { AccountWriteAdmission } from './write-admission';
import { CoordinatorTarget } from './coordinator-target';
import type { VerificationRequest, VerificationReceipt } from './recovery-verifier';

export async function verifyBoundRecovery(
  sql: SqlDatabase,
  atomic: <T>(fn: () => T) => T,
  operation: string,
  transport: {
    verify(objectId: string, request: VerificationRequest): Promise<VerificationReceipt>;
  },
) {
  const checked = () => {
    const record = new RecoveryJournal(sql, (fn) => fn()).get(operation);
    const target = new CoordinatorTarget(sql, (fn) => fn()).require(record.intent.accountId);
    if (target !== record.intent.objectId) throw new Error('Recovery target binding mismatch');
    const ceiling = new AccountWriteAdmission(sql, (fn) => fn()).requireDrained(operation);
    if (ceiling !== record.intent.highWaterMark) throw new Error('Recovery ceiling changed');
    if (record.phase !== 'restored' && record.phase !== 'verified')
      throw new Error('Recovery is not ready for verification');
    return record;
  };
  const record = atomic(checked);
  if (record.phase === 'verified') return record;
  const request = {
    operation,
    highWaterMark: record.intent.highWaterMark,
    expected: record.intent.expected,
  };
  const receipt = await transport.verify(record.intent.objectId, request);
  if (receipt.operation !== operation || receipt.highWaterMark !== request.highWaterMark)
    throw new Error('Recovery verification receipt identity mismatch');
  return atomic(() => {
    checked();
    return new RecoveryJournal(sql, (fn) => fn()).recordVerified(
      operation,
      receipt.expected,
      receipt.revision,
    );
  });
}
