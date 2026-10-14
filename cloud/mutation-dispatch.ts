import type { SqlDatabase, SqlValue } from './documents';
import { ApiError } from '../server/errors';
import type { Mutation, MutationReceipt } from './mutation-executor';
import { AccountWriteAdmission, type WritePermit } from './write-admission';

type DispatchRow = Record<string, SqlValue> & {
  token: string;
  revision: number;
};
export interface PendingMutation {
  permit: WritePermit;
  command: Mutation;
}

// Private per-account coordinator storage; never restore this with documents.
// Dispatch only the persisted command. Transport failures leave it pending so a
// restarted coordinator can reconcile the exact operation with document receipts.
export class AccountMutationDispatch {
  constructor(
    private sql: SqlDatabase,
    private atomic: <T>(callback: () => T) => T,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS mutation_dispatch (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      token TEXT NOT NULL, revision INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS mutation_dispatch_chunks (
      sequence INTEGER PRIMARY KEY, content TEXT NOT NULL
    )`);
  }

  private admission() {
    return new AccountWriteAdmission(this.sql, (fn) => fn());
  }

  pending(): PendingMutation | null {
    const row = [...this.sql.exec<DispatchRow>('SELECT token,revision FROM mutation_dispatch')][0];
    const state = this.admission().status();
    if (!row) {
      if (state.pending) throw new Error('Pending permit has no durable command');
      return null;
    }
    if (row.token !== state.pending || row.revision !== state.highWaterMark)
      throw new Error('Durable command does not match admission');
    return {
      permit: { token: row.token, revision: row.revision },
      command: JSON.parse(
        [...this.sql.exec('SELECT content FROM mutation_dispatch_chunks ORDER BY sequence')]
          .map((chunk) => chunk.content as string)
          .join(''),
      ) as Mutation,
    };
  }

  enqueue(command: Mutation): PendingMutation {
    // Input validation and Office parsing belong before admission. Recheck the
    // gate in the transaction after every asynchronous parsing step completes.
    const serialized = JSON.stringify(command);
    return this.atomic(() => {
      if (this.pending()) throw new ApiError(503, '文档写入暂不可用，当前修改尚未保存，请稍后重试');
      const permit = this.admission().admit();
      this.sql.exec('INSERT INTO mutation_dispatch VALUES(1,?,?)', permit.token, permit.revision);
      // Bound each SQLite row below the Durable Objects row-size limit even for
      // multi-byte content. JSON escapes isolated surrogates; avoid splitting pairs.
      const points = Array.from(serialized);
      for (let offset = 0; offset < points.length; offset += 100_000)
        this.sql.exec(
          'INSERT INTO mutation_dispatch_chunks VALUES(?,?)',
          offset / 100_000,
          points.slice(offset, offset + 100_000).join(''),
        );
      return { permit, command: JSON.parse(serialized) as Mutation };
    });
  }

  acknowledge(receipt: MutationReceipt): void {
    this.atomic(() => {
      const pending = this.pending();
      if (
        !pending ||
        pending.permit.token !== receipt.token ||
        pending.permit.revision !== receipt.revision
      )
        throw new Error('Receipt does not match durable command');
      // Only pass terminal receipts returned by the private document executor.
      // A timeout or locally constructed error is never an acknowledgement.
      this.admission().complete(receipt);
      this.sql.exec('DELETE FROM mutation_dispatch_chunks');
      this.sql.exec('DELETE FROM mutation_dispatch');
    });
  }
}
