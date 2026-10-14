import assert from 'node:assert/strict';
import type { RecoveryRehearsal } from './recovery-rehearsal';

export async function rehearseRecoveryTargets(
  namespace: DurableObjectNamespace<RecoveryRehearsal>,
) {
  const dataId = namespace.newUniqueId();
  const data = namespace.get(dataId);
  const before = await data.snapshot();
  const bookmark = await data.checkpoint();
  let rejected = 0;
  for (const scenario of ['unbound', 'wrong-account', 'wrong-object'] as const) {
    const controlId = namespace.newUniqueId();
    const control = () => namespace.get(controlId);
    if (scenario === 'unbound') await control().initializeAdmission();
    else
      await control().initializeHttpAccount(
        scenario === 'wrong-account' ? 'other-fixture' : 'target-fixture',
        scenario === 'wrong-object' ? namespace.newUniqueId().toString() : dataId.toString(),
      );
    await control().suspendMutations('restore');
    const prepared = await control().journalBegin({
      id: 'restore',
      accountId: 'target-fixture',
      objectId: dataId.toString(),
      approvalReference: 'isolated-rejection-only',
      codeVersion: 'target-guard-v1',
      schemaVersion: '1',
      targetBookmark: bookmark,
      beforeBookmark: bookmark,
      highWaterMark: 0,
      expected: before,
      before,
    });
    const admission = await control().admissionStatus();
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(() => control().journalStart('restore'), /not bound|does not match/);
      assert.deepEqual(await control().journalGet('restore'), prepared);
      assert.deepEqual(await control().admissionStatus(), admission);
      rejected++;
      if (attempt === 0)
        await assert.rejects(() => control().restart(), /Recovery rehearsal restart/);
    }
  }
  assert.deepEqual(await data.snapshot(), before);
  return { passed: true, rejected, restartPreservedRejection: true, targetUnchanged: true };
}
