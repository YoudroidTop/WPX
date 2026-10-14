import type { CloudDocument } from '../shared/documents';
import { parseDocumentMutation } from './document-mutations';
import type { AccountMutationDispatch, PendingMutation } from './mutation-dispatch';
import type { MutationReceipt } from './mutation-executor';

interface MutationTransport {
  execute(pending: PendingMutation): Promise<MutationReceipt>;
  read(id: string): Promise<CloudDocument>;
}

// One flight holder per account coordinator lifetime, shared by its request and
// reconciliation adapters. Durable dispatch remains authoritative after restart.
export interface MutationFlight {
  current?: { token: string; revision: number; result: Promise<Response> };
}

// Private coordinator adapter. Authentication selects this account before entry;
// transport must address only that account's document object. No public recovery
// or permit headers are interpreted here.
export class CoordinatedMutations {
  constructor(
    private dispatch: AccountMutationDispatch,
    private transport: MutationTransport,
    private flight: MutationFlight = {},
  ) {}

  async handle(request: Request): Promise<Response | null> {
    const command = await parseDocumentMutation(request);
    if (!command) return null;
    const pending = this.dispatch.enqueue(command);
    return this.finish(pending);
  }

  // Recovery of a response-lost transport call uses the persisted command, never
  // a newly parsed client request. The caller owns scheduling and HTTP delivery.
  async reconcile(): Promise<Response | null> {
    const pending = this.dispatch.pending();
    return pending ? this.finish(pending) : null;
  }

  private finish(pending: PendingMutation): Promise<Response> {
    let current = this.flight.current;
    if (current) {
      if (current.token !== pending.permit.token || current.revision !== pending.permit.revision)
        throw new Error('Concurrent execution belongs to a different permit');
    } else {
      const entry = {
        token: pending.permit.token,
        revision: pending.permit.revision,
        // Defer transport entry until the holder is set, including when a
        // transport throws synchronously or triggers another reconciliation.
        result: Promise.resolve()
          .then(() => this.execute(pending))
          .finally(() => {
            if (this.flight.current === entry) delete this.flight.current;
          }),
      };
      this.flight.current = current = entry;
    }
    // A response body is single-use. Each HTTP caller receives its own clone;
    // neither a reconciler nor another caller can consume the shared template.
    return current.result.then((response) => response.clone());
  }

  private async execute(pending: PendingMutation): Promise<Response> {
    const receipt = await this.transport.execute(pending);
    if (receipt.token !== pending.permit.token || receipt.revision !== pending.permit.revision)
      throw new Error('Executor receipt does not match dispatched permit');
    let response: Response;
    if ('error' in receipt.result) {
      response = Response.json(
        { error: receipt.result.error.message },
        { status: receipt.result.error.status },
      );
    } else if ('deleted' in receipt.result) {
      if (pending.command.kind !== 'remove' || receipt.result.deleted !== true)
        throw new Error('Executor returned an unexpected deletion receipt');
      response = new Response(null, { status: 204 });
    } else {
      if (pending.command.kind === 'remove')
        throw new Error('Executor returned an unexpected document receipt');
      const expected = receipt.result.document;
      if (
        expected.revision !== receipt.revision ||
        (pending.command.kind === 'update' && expected.id !== pending.command.id)
      )
        throw new Error('Executor document does not match dispatched command');
      const document = await this.transport.read(expected.id);
      for (const key of Object.keys(expected) as (keyof typeof expected)[])
        if (document[key] !== expected[key])
          throw new Error('Document readback does not match receipt');
      response = Response.json(document, { status: pending.command.kind === 'create' ? 201 : 200 });
    }
    // Read/serialization failures leave the exact command pending. No finally
    // acknowledgement: a timeout is not proof of a durable terminal outcome.
    this.dispatch.acknowledge(receipt);
    return response;
  }
}
