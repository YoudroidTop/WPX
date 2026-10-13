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
  await control().journalBegin({
    id: 'restore',
    accountId: 'generated-fixture',
    objectId: dataId.toString(),
    approvalReference: 'isolated-fixture-only',
    codeVersion: 'coordination-journal-v1',
    schemaVersion: '1',
    targetBookmark: bookmark,
    beforeBookmark: await data().checkpoint(),
    highWaterMark: ceiling,
    expected: before,
    before: changed,
  });
  await control().journalStart('restore');
  await restart(controlId);
  assert.equal((await control().journalGet('restore')).phase, 'scheduling');
  await assert.rejects(() => control().journalStart('restore'), /already started/);
  // This live driver knows it has not called PITR yet. A restarted production
  // driver could not infer that and must reconcile the ambiguous scheduling phase.
  const undo = await data().scheduleRestore(bookmark);
  await control().journalScheduled('restore', undo);
  await restart(controlId);
  assert.equal((await control().journalGet('restore')).undoBookmark, undo);
  await restart(dataId);
  assert.deepEqual(await data().snapshot(), before);
  await control().journalRestored('restore');
  assert.equal((await control().admissionStatus()).phase, 'suspended');
  assert.equal(await control().drainedRevision('restore'), ceiling);
  const restoredFence = await data().verifyRevisionFence(ceiling);
  await assert.rejects(() => data().fixtureMutation(second, 'sheet'), /obsolete/);
  await control().journalVerified('restore', before, restoredFence.nextRevision!);
  await control().resumeMutations('restore', restoredFence.nextRevision!);
  await control().journalComplete('restore');
  const fresh = await control().admitMutation();
  assert.equal(fresh.revision, 4);
  await control().completeMutation(await data().fixtureMutation(fresh, 'sheet'));
  assert.equal((await data().snapshot()).count, 2);

  await control().suspendMutations('undo');
  const undoCeiling = await control().drainedRevision('undo');
  const savedUndo = (await control().journalGet('restore')).undoBookmark!;
  await control().journalBegin({
    id: 'undo',
    accountId: 'generated-fixture',
    objectId: dataId.toString(),
    approvalReference: 'isolated-fixture-undo-only',
    codeVersion: 'coordination-journal-v1',
    schemaVersion: '1',
    targetBookmark: savedUndo,
    beforeBookmark: await data().checkpoint(),
    highWaterMark: undoCeiling,
    expected: changed,
    before: await data().snapshot(),
  });
  await control().journalStart('undo');
  const undoOfUndo = await data().scheduleRestore(savedUndo);
  await control().journalScheduled('undo', undoOfUndo);
  await restart(dataId);
  assert.deepEqual(await data().snapshot(), changed);
  await control().journalRestored('undo');
  assert.equal(await control().drainedRevision('undo'), undoCeiling);
  const undoneFence = await data().verifyRevisionFence(undoCeiling);
  await assert.rejects(() => data().fixtureMutation(fresh, 'sheet'), /obsolete/);
  await control().journalVerified('undo', changed, undoneFence.nextRevision!);
  await control().resumeMutations('undo', undoneFence.nextRevision!);
  await control().journalComplete('undo');
  await restart(controlId);
  const final = await control().admissionStatus();
  assert.equal(final.phase, 'active');
  assert.equal(final.highWaterMark, 5);
  assert.equal(final.pending, null);
  assert.equal((await control().journalGet('restore')).undoBookmark, undo);
  assert.equal((await control().journalGet('undo')).phase, 'complete');
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
    journalSurvivedRestart: true,
    originalUndoPreserved: true,
  };
}
