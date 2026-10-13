import assert from 'node:assert/strict';
import type { RecoveryRehearsal } from './recovery-rehearsal';

// Only generated fixture objects. The coordinator object is never a PITR target.
export async function rehearseCoordination(namespace: DurableObjectNamespace<RecoveryRehearsal>) {
  const dataId = namespace.newUniqueId(),
    controlId = namespace.newUniqueId();
  const data = () => namespace.get(dataId),
    control = () => namespace.get(controlId);
  const restart = async (id: DurableObjectId) => {
    await assert.rejects(() => namespace.get(id).restart(), /Recovery rehearsal restart/);
  };
  const first = await control().admitMutation();
  await control().completeMutation(await data().fixtureMutation(first, 'word'));
  const before = await data().snapshot();
  const bookmark = await data().checkpoint();
  const second = await control().admitMutation();
  await assert.rejects(
    () => data().fixtureMutation(second, 'sheet', true),
    /Simulated response loss after commit/,
  );
  await control().suspendMutations('restore');
  await restart(controlId);
  const draining = await control().admissionStatus();
  assert.equal(draining.phase, 'draining');
  assert.equal(draining.pending, second.token);
  await assert.rejects(() => control().admitMutation());
  await assert.rejects(() => control().drainedRevision('restore'));
  const receipt = await data().fixtureMutation(second, 'sheet');
  assert.ok('document' in receipt.result);
  const changed = await data().snapshot();
  assert.equal(changed.count, 2, 'Retry must not create a third document');
  await control().completeMutation(receipt);
  const ceiling = await control().drainedRevision('restore');
  assert.equal(ceiling, 2);
  const undo = await data().scheduleRestore(bookmark);
  await restart(dataId);
  assert.deepEqual(await data().snapshot(), before);
  assert.equal((await control().admissionStatus()).phase, 'suspended');
  assert.equal(await control().drainedRevision('restore'), ceiling);
  const restoredFence = await data().verifyRevisionFence(ceiling);
  await assert.rejects(() => data().fixtureMutation(second, 'sheet'), /obsolete/);
  await control().resumeMutations('restore', restoredFence.nextRevision!);
  const fresh = await control().admitMutation();
  assert.equal(fresh.revision, 4);
  await control().completeMutation(await data().fixtureMutation(fresh, 'sheet'));
  assert.equal((await data().snapshot()).count, 2);

  await control().suspendMutations('undo');
  const undoCeiling = await control().drainedRevision('undo');
  await data().scheduleRestore(undo);
  await restart(dataId);
  assert.deepEqual(await data().snapshot(), changed);
  assert.equal(await control().drainedRevision('undo'), undoCeiling);
  const undoneFence = await data().verifyRevisionFence(undoCeiling);
  await assert.rejects(() => data().fixtureMutation(fresh, 'sheet'), /obsolete/);
  await control().resumeMutations('undo', undoneFence.nextRevision!);
  await restart(controlId);
  const final = await control().admissionStatus();
  assert.equal(final.phase, 'active');
  assert.equal(final.highWaterMark, 5);
  assert.equal(final.pending, null);
  return {
    passed: true,
    dataObjectId: dataId.toString(),
    coordinatorObjectId: controlId.toString(),
    responseLossReconciled: true,
    duplicateCreatePrevented: true,
    coordinatorRestartPreservedPending: true,
    coordinatorUnaffectedByRestore: true,
    staleAfterRestoreRejected: true,
    freshWriteRevision: fresh.revision,
    staleAfterUndoRejected: true,
    finalHighWaterMark: final.highWaterMark,
  };
}
