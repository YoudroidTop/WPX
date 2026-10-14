import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  await assert.rejects(() => control().admitMutation());
  await restart(controlId);
  assert.equal((await control().admissionStatus()).phase, 'uninitialized');
  await assert.rejects(() => control().admitMutation());
  await control().initializeAdmission();
  await restart(controlId);
  assert.equal((await control().admissionStatus()).phase, 'active');
  assert.equal((await control().admissionStatus()).highWaterMark, 0);
  const first = await control().admitMutation();
  await control().completeMutation(await data().fixtureMutation(first));
  const before = await data().snapshot();
  const bookmark = await data().checkpoint();
  const second = await control().admitMutation('sheet');
  await assert.rejects(
    () => data().fixtureMutation(second, true),
    /Simulated response loss after commit/,
  );
  await control().suspendMutations('restore');
  await restart(controlId);
  const draining = await control().admissionStatus();
  assert.equal(draining.phase, 'draining');
  assert.equal(draining.pending, second.permit.token);
  await control().initializeAdmission();
  assert.deepEqual(await control().admissionStatus(), draining);
  await assert.rejects(() => control().admitMutation());
  await assert.rejects(() => control().drainedRevision('restore'));
  const persisted = await control().pendingMutation();
  assert.deepEqual(persisted, second);
  const receipt = await data().fixtureMutation(persisted!);
  assert.ok('document' in receipt.result);
  const changed = await data().snapshot();
  assert.equal(changed.count, 2, 'Retry must not create a third document');
  const ceiling = draining.highWaterMark;
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
  await assert.rejects(() => control().journalStart('restore'), /not drained/);
  assert.equal((await control().journalGet('restore')).phase, 'prepared');
  await restart(controlId);
  await assert.rejects(() => control().journalStart('restore'), /not drained/);
  assert.equal((await control().pendingMutation())?.permit.token, second.permit.token);
  await control().completeMutation(receipt);
  assert.equal(await control().pendingMutation(), null);
  assert.equal(await control().drainedRevision('restore'), ceiling);
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
  await assert.rejects(() => data().fixtureMutation(second), /obsolete/);
  await control().journalVerified('restore', before, restoredFence.nextRevision!);
  await assert.rejects(
    () => control().finishRecovery('restore', true),
    /Injected journal completion failure/,
  );
  assert.equal((await control().admissionStatus()).phase, 'suspended');
  assert.equal((await control().journalGet('restore')).phase, 'verified');
  await assert.rejects(() => control().admitMutation());
  await control().finishRecovery('restore');
  const fresh = await control().admitMutation('sheet');
  assert.equal(fresh.permit.revision, 4);
  await control().finishRecovery('restore');
  assert.equal((await control().admissionStatus()).pending, fresh.permit.token);
  await control().completeMutation(await data().fixtureMutation(fresh));
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
  await assert.rejects(() => data().fixtureMutation(fresh), /obsolete/);
  await control().journalVerified('undo', changed, undoneFence.nextRevision!);
  await control().finishRecovery('undo');
  await restart(controlId);
  const final = await control().admissionStatus();
  assert.equal(final.phase, 'active');
  assert.equal(final.highWaterMark, 5);
  assert.equal(final.pending, null);
  assert.equal((await control().journalGet('restore')).undoBookmark, undo);
  assert.equal((await control().journalGet('undo')).phase, 'complete');
  return {
    passed: true,
    initializationSurvivedRestart: true,
    initializationRetryPreservedPending: true,
    dataObjectId: dataId.toString(),
    coordinatorObjectId: controlId.toString(),
    responseLossReconciled: true,
    durableCommandSurvivedRestart: true,
    duplicateCreatePrevented: true,
    coordinatorRestartPreservedPending: true,
    coordinatorUnaffectedByRestore: true,
    staleAfterRestoreRejected: true,
    freshWriteRevision: fresh.permit.revision,
    staleAfterUndoRejected: true,
    finalHighWaterMark: final.highWaterMark,
    journalSurvivedRestart: true,
    schedulingRejectedUntilDrained: true,
    originalUndoPreserved: true,
    completionFailureKeptSuspended: true,
    completionRetryPreservedPending: true,
  };
}

export async function rehearseLargeDispatch(namespace: DurableObjectNamespace<RecoveryRehearsal>) {
  const controlId = namespace.newUniqueId(),
    dataId = namespace.newUniqueId();
  const control = () => namespace.get(controlId),
    data = () => namespace.get(dataId);
  await control().initializeAdmission();
  const original = await control().admitLargeMutation();
  await assert.rejects(
    () => data().fixtureMutation(original, true),
    /Simulated response loss after commit/,
  );
  await assert.rejects(() => control().restart(), /Recovery rehearsal restart/);
  const persisted = await control().pendingMutation();
  assert.deepEqual(persisted, original);
  const beforeReplay = await data().snapshot();
  assert.equal(beforeReplay.count, 1);
  assert.equal(beforeReplay.usedBytes, 4_000_000);
  const receipt = await data().fixtureMutation(persisted!);
  assert.ok('document' in receipt.result);
  const expectedContent = JSON.stringify(JSON.parse(original.commandJson).content);
  assert.deepEqual(await data().contentDigest(receipt.result.document.id), {
    bytes: 4_000_000,
    sha256: createHash('sha256').update(expectedContent).digest('hex'),
  });
  assert.deepEqual(await data().snapshot(), beforeReplay);
  await control().completeMutation(receipt);
  assert.equal(await control().pendingMutation(), null);
  const oversized = await control().admitLargeMutation(1);
  const rejected = await data().fixtureMutation(oversized);
  assert.ok('error' in rejected.result);
  assert.equal(rejected.result.error.status, 413);
  assert.deepEqual(await data().fixtureMutation(oversized), rejected);
  await control().completeMutation(rejected);
  assert.deepEqual(await data().snapshot(), beforeReplay);
  assert.equal(await control().pendingMutation(), null);
  return {
    passed: true,
    contentBytes: 4_000_000,
    oversizedRejected: true,
    replayPreservedSnapshot: true,
    commandRecoveredAfterRestart: true,
  };
}
