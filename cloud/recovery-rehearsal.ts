import { DurableObject } from 'cloudflare:workers';
import { AccountDocuments, type SqlDatabase } from './documents';
import {
  blankContent,
  contentSchema,
  MAX_CONTENT_BYTES,
  type CloudDocument,
} from '../shared/documents';
import { ApiError } from '../server/errors';
import { AccountWriteAdmission, type WritePermit } from './write-admission';
import { AccountMutationExecutor, type MutationReceipt, type Mutation } from './mutation-executor';
import {
  AccountMutationDispatch,
  type PendingMutation,
  type MutationDispatch,
} from './mutation-dispatch';
import { ScheduledMutations } from './scheduled-mutations';
import { rehearseRecoveryTargets } from './recovery-target-rehearsal';
import { rehearseScheduledMutations } from './recovery-scheduling-rehearsal';
import { rehearseCoordination, rehearseLargeDispatch } from './recovery-coordination-rehearsal';
import { RecoveryJournal, type RecoveryIntent } from './recovery-journal';
import { completeVerifiedRecovery } from './recovery-completion';
import { startDrainedRecovery } from './recovery-start';
import { CoordinatedMutations, type MutationFlight } from './coordinated-mutations';
import { CoordinatedReads } from './coordinated-reads';
import { readDocumentRequest } from './document-reads';
import { CoordinatorTarget } from './coordinator-target';
import { rehearseHttpMutations } from './recovery-http-rehearsal';

interface RecoveryEnv {
  REHEARSAL: DurableObjectNamespace<RecoveryRehearsal>;
}

// A separate namespace with generated fixtures only; never bind this to customer objects.
export class RecoveryRehearsal extends DurableObject<RecoveryEnv> {
  private documents: AccountDocuments;
  private readonly httpMutationFlight: MutationFlight = {};
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
  async contentDigest(id: string) {
    const bytes = new TextEncoder().encode(JSON.stringify(this.documents.get(id).content));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return {
      bytes: bytes.length,
      sha256: [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
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
    return startDrainedRecovery(
      this.ctx.storage.sql,
      (fn) => this.ctx.storage.transactionSync(fn),
      id,
    );
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
  finishRecovery(id: string, failCompletion = false) {
    const sql: SqlDatabase = {
      exec: (query, ...bindings) => {
        if (
          failCompletion &&
          query.startsWith('UPDATE recovery_journal') &&
          bindings[0] === 'complete'
        )
          throw new Error('Injected journal completion failure');
        return this.ctx.storage.sql.exec(query, ...bindings);
      },
    };
    return completeVerifiedRecovery(sql, (fn) => this.ctx.storage.transactionSync(fn), id);
  }
  initializeAdmission() {
    // This RPC is restricted to the isolated generated-fixture namespace.
    this.admission().initialize(0);
  }
  documentResponse(id: string) {
    return Response.json(this.documents.get(id));
  }
  readRequest(request: Request) {
    return readDocumentRequest(request, this.documents);
  }
  initializeHttpAccount(accountId: string, dataId: string) {
    // Generated-account bootstrap only; production needs directory-backed proof.
    this.ctx.storage.transactionSync(() => {
      new CoordinatorTarget(this.ctx.storage.sql, (fn) => fn()).bind(accountId, dataId);
      new AccountWriteAdmission(this.ctx.storage.sql, (fn) => fn()).initialize(0);
    });
  }
  private httpTarget(accountId: string) {
    const dataId = new CoordinatorTarget(this.ctx.storage.sql, (fn) =>
      this.ctx.storage.transactionSync(fn),
    ).require(accountId);
    return this.env.REHEARSAL.get(this.env.REHEARSAL.idFromString(dataId));
  }
  private httpAdapter(
    accountId: string,
    loseResponse = false,
    dispatch: MutationDispatch = this.dispatch(),
  ) {
    const target = this.httpTarget(accountId);
    return new CoordinatedMutations(
      dispatch,
      {
        execute: (pending) => target.fixtureMutation(this.wireMutation(pending), loseResponse),
        read: async (id) => (await target.documentResponse(id)).json<CloudDocument>(),
      },
      this.httpMutationFlight,
    );
  }
  async coordinatedRequest(request: Request, accountId: string, loseResponse = false) {
    try {
      if (request.method === 'GET') {
        const target = this.httpTarget(accountId);
        return await new CoordinatedReads(this.admission()).response(() =>
          target.readRequest(request),
        );
      }
      return (
        (await this.httpAdapter(accountId, loseResponse).handle(request)) ??
        new Response(null, { status: 404 })
      );
    } catch (error) {
      if (error instanceof ApiError)
        return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
  }
  async reconcileRequest(accountId: string) {
    return (await this.httpAdapter(accountId).reconcile()) ?? new Response(null, { status: 204 });
  }
  async reconcileConcurrentRequests(accountId: string) {
    // Enter both adapters before awaiting transport, making overlap deterministic.
    const responses = await Promise.all([
      this.reconcileRequest(accountId),
      this.reconcileRequest(accountId),
    ]);
    return Response.json(
      await Promise.all(
        responses.map(async (response) => ({
          status: response.status,
          document: await response.json<CloudDocument>(),
        })),
      ),
    );
  }
  private scheduledDispatch(failSchedule = false) {
    return new ScheduledMutations(
      this.ctx.storage.sql,
      (fn) => this.ctx.storage.transaction(fn),
      {
        setAlarm: async (time) => {
          await this.ctx.storage.setAlarm(time);
          if (failSchedule) throw new Error('Injected alarm scheduling failure');
        },
        deleteAlarm: () => this.ctx.storage.deleteAlarm(),
      },
      Date.now,
      2_000,
      4_000,
    );
  }
  initializeScheduledAccount(accountId: string, dataId: string) {
    this.initializeHttpAccount(accountId, dataId);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rehearsal_alarm (
      singleton INTEGER PRIMARY KEY, remaining INTEGER, runs INTEGER
    )`);
    this.ctx.storage.sql.exec('INSERT INTO rehearsal_alarm VALUES(1,2,0)');
  }
  scheduledRequest(
    request: Request,
    accountId: string,
    loseResponse = false,
    failSchedule = false,
  ) {
    return this.httpAdapter(accountId, loseResponse, this.scheduledDispatch(failSchedule)).handle(
      request,
    );
  }
  async scheduledStatus() {
    return {
      pending: this.dispatch().pending() !== null,
      admission: this.admission().status(),
      alarm: await this.ctx.storage.getAlarm(),
      fixture: [...this.ctx.storage.sql.exec('SELECT remaining,runs FROM rehearsal_alarm')][0],
    };
  }
  async alarm() {
    const dispatch = this.scheduledDispatch();
    if (!(await dispatch.prepareRetry())) return;
    try {
      const fixture = [...this.ctx.storage.sql.exec('SELECT remaining FROM rehearsal_alarm')][0];
      this.ctx.storage.sql.exec('UPDATE rehearsal_alarm SET runs=runs+1');
      if (Number(fixture.remaining) > 0) {
        this.ctx.storage.sql.exec('UPDATE rehearsal_alarm SET remaining=remaining-1');
        throw new Error('Injected scheduled transport failure');
      }
      const accountId = new CoordinatorTarget(this.ctx.storage.sql, (fn) => fn()).accountId();
      await this.httpAdapter(accountId, false, dispatch).reconcile();
    } catch {
      // The successor alarm is already durable. Keep admission/command intact.
      // The isolated fixture intentionally fails its first two alarm attempts.
    }
  }
  private dispatch() {
    return new AccountMutationDispatch(this.ctx.storage.sql, (fn) =>
      this.ctx.storage.transactionSync(fn),
    );
  }
  admitMutation(kind: 'word' | 'sheet' = 'word') {
    const pending = this.dispatch().enqueue({
      kind: 'create',
      name: `Coordinated ${kind}`,
      content: blankContent(kind),
    });
    return this.wireMutation(pending);
  }
  private wireMutation(pending: PendingMutation) {
    return { permit: pending.permit, commandJson: JSON.stringify(pending.command) };
  }
  admitLargeMutation(extra: 0 | 1 = 0) {
    const paragraphs = Array.from({ length: 4 }, () => ({
      type: 'paragraph',
      content: [{ type: 'text', text: '' }],
    }));
    const content = { type: 'word' as const, doc: { type: 'doc', content: paragraphs } };
    const remaining = MAX_CONTENT_BYTES + extra - Buffer.byteLength(JSON.stringify(content));
    for (const paragraph of paragraphs)
      paragraph.content[0].text = '中文📝'.repeat(Math.floor(remaining / 40));
    paragraphs[0].content[0].text += 'x'.repeat(remaining % 40);
    const validated = contentSchema.parse(content);
    if (Buffer.byteLength(JSON.stringify(validated)) !== MAX_CONTENT_BYTES + extra)
      throw new Error('Large fixture size mismatch');
    return this.wireMutation(
      this.dispatch().enqueue({
        kind: 'create',
        name: 'Large coordinated fixture',
        content: validated,
      }),
    );
  }
  pendingMutation() {
    const pending = this.dispatch().pending();
    return pending ? this.wireMutation(pending) : null;
  }
  completeMutation(receipt: MutationReceipt) {
    this.dispatch().acknowledge(receipt);
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
  fixtureMutation(pending: { permit: WritePermit; commandJson: string }, loseResponse = false) {
    const executor = new AccountMutationExecutor(this.ctx.storage.sql, (fn) =>
      this.ctx.storage.transactionSync(fn),
    );
    const receipt = executor.execute(pending.permit, JSON.parse(pending.commandJson) as Mutation);
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
      recoveryTargets: await rehearseRecoveryTargets(env.REHEARSAL),
      coordination: await rehearseCoordination(env.REHEARSAL),
      largeDispatch: await rehearseLargeDispatch(env.REHEARSAL),
      httpMutations: await rehearseHttpMutations(env.REHEARSAL),
      scheduledMutations: await rehearseScheduledMutations(env.REHEARSAL),
    });
  },
} satisfies ExportedHandler<RecoveryEnv>;
