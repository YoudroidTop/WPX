import assert from 'node:assert/strict';
import type { RecoveryRehearsal } from './recovery-rehearsal';

export async function rehearseEmptyRecovery(namespace: DurableObjectNamespace<RecoveryRehearsal>) {
  const dataId = namespace.newUniqueId(),
    controlId = namespace.newUniqueId();
  const data = () => namespace.get(dataId),
    control = () => namespace.get(controlId);
  await control().initializeHttpAccount('empty-fixture', dataId.toString());
  const empty = await data().snapshot();
  const bookmark = await data().checkpoint();
  const write = await control().admitMutation();
  await control().completeMutation(await data().fixtureMutation(write));
  await control().suspendMutations('restore-empty');
  const ceiling = await control().drainedRevision('restore-empty');
  await control().journalBegin({
    id: 'restore-empty',
    accountId: 'empty-fixture',
    objectId: dataId.toString(),
    approvalReference: 'generated-empty-fixture-only',
    codeVersion: 'empty-v1',
    schemaVersion: '1',
    targetBookmark: bookmark,
    beforeBookmark: await data().checkpoint(),
    highWaterMark: ceiling,
    expected: empty,
    before: await data().snapshot(),
  });
  await control().scheduleBound('restore-empty');
  await assert.rejects(() => data().restart(), /Recovery rehearsal restart/);
  assert.deepEqual(await data().snapshot(), empty);
  await control().journalRestored('restore-empty');
  const fence = await data().verifyRevisionFence(ceiling);
  assert.deepEqual(fence, { rejected: 0, highWaterMark: 1, nextRevision: 2 });
  await assert.rejects(() => data().fixtureMutation(write), /obsolete/);
  await assert.rejects(() => data().restart(), /Recovery rehearsal restart/);
  await assert.rejects(() => data().fixtureMutation(write), /obsolete/);
  await control().journalVerified('restore-empty', empty, fence.nextRevision);
  await control().finishRecovery('restore-empty');
  await assert.rejects(() => control().restart(), /Recovery rehearsal restart/);
  assert.equal((await control().admissionStatus()).highWaterMark, 2);
  const fresh = await control().admitMutation();
  assert.equal(fresh.permit.revision, 3);
  await control().completeMutation(await data().fixtureMutation(fresh));
  await assert.rejects(() => data().fixtureMutation(write), /obsolete/);
  assert.equal((await data().snapshot()).count, 1);
  return { passed: true, emptyFence: 2, freshRevision: 3, staleWriteRejected: true };
}
