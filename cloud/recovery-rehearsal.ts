import { DurableObject } from 'cloudflare:workers';
import { AccountDocuments } from './documents';
import { blankContent } from '../shared/documents';
import { ApiError } from '../server/errors';
import { AccountWriteAdmission, type WritePermit } from './write-admission';
import { AccountMutationExecutor } from './mutation-executor';
import { rehearseCoordination } from './recovery-coordination-rehearsal';
import { RecoveryJournal, type RecoveryIntent } from './recovery-journal';

interface RecoveryEnv {
  REHEARSAL: DurableObjectNamespace<RecoveryRehearsal>;
}

// A separate namespace with generated fixtures only; never bind this to customer objects.
export class RecoveryRehearsal extends DurableObject<RecoveryEnv> {
  private documents: AccountDocuments;
  constructor(ctx: DurableObjectState, env: RecoveryEnv) {
    super(ctx, env);
    this.documents = new AccountDocuments(ctx.storage.sql, (fn) => ctx.storage.transactionSync(fn));
  }
  seed() {
    if (this.documents.list().length) throw new Error('Rehearsal object must be empty');
    const word = blankContent('word');
    if (word.type !== 'word') throw new Error('Invalid word fixture');
    word.doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '恢复验证'.repeat(100_000) }] },
      ],
    };
    this.documents.create('Recovery Word', word);
    const sheet = blankContent('sheet');
    if (sheet.type !== 'sheet') throw new Error('Invalid sheet fixture');
    sheet.sheets[0].cells = { A1: '120', A2: '80', B1: '=SUM(A1:A2)' };
    this.documents.create('Recovery Sheet', sheet);
    const slide = this.documents.create('Recovery Slide', blankContent('slide'));
    this.documents.update(slide.id, slide.revision, { deleted: true, starred: true });
  }
  async snapshot() {
    const documents = this.documents
      .list()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((doc) => this.documents.get(doc.id));
    const bytes = new TextEncoder().encode(JSON.stringify(documents));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return {
      sha256: [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      count: documents.length,
      usedBytes: this.documents.used(),
      trashed: documents.filter((doc) => doc.deletedAt !== null).length,
    };
  }
  mutate() {
    for (const doc of this.documents.list()) {
      if (doc.deletedAt !== null) this.documents.remove(doc.id, doc.revision);
      else
        this.documents.update(doc.id, doc.revision, {
          name: 'Changed fixture',
          content: blankContent(doc.kind),
        });
    }
  }
  checkpoint() {
    return this.ctx.storage.getCurrentBookmark();
  }
  private admission() {
    return new AccountWriteAdmission(this.ctx.storage.sql, (fn) =>
      this.ctx.storage.transactionSync(fn),
    );
  }
  private journal() {
    return new RecoveryJournal(this.ctx.storage.sql, (fn) => this.ctx.storage.transactionSync(fn));
  }
  journalBegin(intent: RecoveryIntent) {
    return this.journal().begin(intent);
  }
  journalGet(id: string) {
    return this.journal().get(id);
  }
  journalStart(id: string) {
    return this.journal().startScheduling(id);
  }
  journalScheduled(id: string, undo: string) {
    return this.journal().recordScheduled(id, undo);
  }
  journalRestored(id: string) {
    return this.journal().recordRestored(id);
  }
  journalVerified(id: string, actual: RecoveryIntent['expected'], revision: number) {
    return this.journal().recordVerified(id, actual, revision);
  }
  journalComplete(id: string) {
    return this.journal().complete(id);
  }
  admitMutation() {
    return this.admission().admit();
  }
  completeMutation(permit: WritePermit) {
    this.admission().complete(permit);
  }
  suspendMutations(operation: string) {
    this.admission().suspend(operation);
  }
  admissionStatus() {
    return this.admission().status();
  }
  drainedRevision(operation: string) {
    return this.admission().requireDrained(operation);
  }
  resumeMutations(operation: string, revision: number) {
    this.admission().resumeAfterVerification(operation, revision);
  }
  fixtureMutation(permit: WritePermit, kind: 'word' | 'sheet', loseResponse = false) {
    const executor = new AccountMutationExecutor(this.ctx.storage.sql, (fn) =>
      this.ctx.storage.transactionSync(fn),
    );
    const content = blankContent(kind);
    // A retry must reuse the same command, including generated worksheet IDs.
    if (content.type === 'sheet') content.sheets[0].id = 'coordinated-sheet';
    const receipt = executor.execute(permit, {
      kind: 'create',
      name: `Coordinated ${kind}`,
      content,
    });
    if (loseResponse) throw new Error('Simulated response loss after commit');
    return receipt;
  }
  verifyRevisionFence(highWaterMark: number) {
    const before = this.documents.list().map((doc) => this.documents.get(doc.id));
    this.documents.advanceRevisionsPast(highWaterMark);
    let rejected = 0;
    for (const original of before) {
      const current = this.documents.get(original.id);
      if (current.revision <= highWaterMark) throw new Error('Recovery revision did not advance');
      if (JSON.stringify({ ...current, revision: original.revision }) !== JSON.stringify(original))
        throw new Error('Revision fence changed document data');
      try {
        this.documents.update(original.id, highWaterMark, { starred: !original.starred });
        throw new Error('Stale recovery write was accepted');
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        rejected++;
      }
    }
    return { rejected, highWaterMark, nextRevision: this.documents.list()[0]?.revision };
  }
  scheduleRestore(bookmark: string) {
    return this.ctx.storage.onNextSessionRestoreBookmark(bookmark);
  }
  restart(): void {
    this.ctx.abort('Recovery rehearsal restart');
  }
}

export default {
  async fetch(request: Request, env: RecoveryEnv): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/rehearse')
      return new Response('Not found', { status: 404 });
    // Callers cannot supply an account, object ID, SQL, content or restore bookmark.
    const id = env.REHEARSAL.newUniqueId();
    const stub = env.REHEARSAL.get(id);
    const restart = async () => {
      try {
        await env.REHEARSAL.get(id).restart();
        throw new Error('Object did not abort');
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('Recovery rehearsal restart'))
          throw error;
      }
    };
    await stub.seed();
    const before = await stub.snapshot();
    const bookmark = await stub.checkpoint();
    await stub.mutate();
    const changed = await stub.snapshot();
    if (before.sha256 === changed.sha256 || before.count !== 3 || changed.count !== 2)
      throw new Error('Rehearsal mutation was not exercised');
    const undo = await stub.scheduleRestore(bookmark);
    await restart();
    const restored = await env.REHEARSAL.get(id).snapshot();
    if (JSON.stringify(restored) !== JSON.stringify(before)) throw new Error('Recovery mismatch');
    // This fixture has no concurrent writers and issued only revisions 1 and 2.
    // Production needs a coordinator outside the restored storage, not this constant.
    const restoredFence = await env.REHEARSAL.get(id).verifyRevisionFence(2);
    await env.REHEARSAL.get(id).scheduleRestore(undo);
    await restart();
    const undone = await env.REHEARSAL.get(id).snapshot();
    if (JSON.stringify(undone) !== JSON.stringify(changed)) throw new Error('Undo mismatch');
    const undoFence = await env.REHEARSAL.get(id).verifyRevisionFence(restoredFence.nextRevision!);
    return Response.json({
      passed: true,
      objectId: id.toString(),
      before,
      changed,
      restored,
      undone,
      revisionFencing: { restored: restoredFence, undone: undoFence },
      coordination: await rehearseCoordination(env.REHEARSAL),
    });
  },
} satisfies ExportedHandler<RecoveryEnv>;
