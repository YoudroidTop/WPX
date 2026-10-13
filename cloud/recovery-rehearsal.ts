import { DurableObject } from 'cloudflare:workers';
import { AccountDocuments } from './documents';
import { blankContent } from '../shared/documents';

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
    await env.REHEARSAL.get(id).scheduleRestore(undo);
    await restart();
    const undone = await env.REHEARSAL.get(id).snapshot();
    if (JSON.stringify(undone) !== JSON.stringify(changed)) throw new Error('Undo mismatch');
    return Response.json({
      passed: true,
      objectId: id.toString(),
      before,
      changed,
      restored,
      undone,
    });
  },
} satisfies ExportedHandler<RecoveryEnv>;
