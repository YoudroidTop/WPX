import assert from 'node:assert/strict';
import type { RecoveryRehearsal } from './recovery-rehearsal';

export async function rehearseScheduledMutations(
  namespace: DurableObjectNamespace<RecoveryRehearsal>,
) {
  const controlId = namespace.newUniqueId();
  const dataId = namespace.newUniqueId();
  const accountId = crypto.randomUUID();
  const control = () => namespace.get(controlId);
  const data = () => namespace.get(dataId);
  await control().initializeScheduledAccount(accountId, dataId.toString());
  const request = () =>
    new Request('https://fixture.invalid/api/documents', {
      method: 'POST',
      body: JSON.stringify({ kind: 'word', name: 'Scheduled recovery QA' }),
    });
  await assert.rejects(
    () => control().scheduledRequest(request(), accountId, false, true),
    /Injected alarm scheduling failure/,
  );
  const rolledBack = await control().scheduledStatus();
  assert.equal(rolledBack.pending, false);
  assert.equal(rolledBack.alarm, null);
  assert.equal(rolledBack.admission.highWaterMark, 0);
  assert.equal((await data().snapshot()).count, 0);
  await assert.rejects(
    () => control().scheduledRequest(request(), accountId, true),
    /Simulated response loss/,
  );
  const queued = await control().scheduledStatus();
  assert.equal(queued.pending, true);
  assert.equal(typeof queued.alarm, 'number');
  await control().suspendMutations('scheduled-recovery');
  await assert.rejects(() => control().restart(), /Recovery rehearsal restart/);
  const deadline = Date.now() + 40_000;
  let status = await control().scheduledStatus();
  while (status.pending && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Read-only observation; the driver never calls reconcile or alarm directly.
    status = await control().scheduledStatus();
  }
  assert.equal(status.pending, false);
  assert.equal(status.alarm, null);
  assert.equal(status.admission.phase, 'suspended');
  assert.equal(status.fixture.remaining, 0);
  assert.ok(Number(status.fixture.runs) >= 3);
  assert.equal((await data().snapshot()).count, 1);
  return {
    passed: true,
    atomicSchedulingRollback: true,
    automaticReplayAfterRestart: true,
    repeatedFailureRecovered: true,
    noDuplicateDocument: true,
    suspensionPreserved: true,
    idleAlarmCleared: true,
  };
}
