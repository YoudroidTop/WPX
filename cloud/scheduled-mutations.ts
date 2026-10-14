import type { SqlDatabase } from './documents';
import { AccountMutationDispatch, type MutationDispatch } from './mutation-dispatch';
import type { Mutation, MutationReceipt } from './mutation-executor';

interface AlarmStorage {
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

// Owns the account coordinator's sole alarm. The supplied async transaction must
// include both SQL and alarm writes; never substitute transactionSync here.
export class ScheduledMutations implements MutationDispatch {
  private dispatch: AccountMutationDispatch;

  constructor(
    private sql: SqlDatabase,
    private transaction: <T>(fn: () => Promise<T>) => Promise<T>,
    private alarms: AlarmStorage,
    private now = Date.now,
    private initialDelay = 5_000,
    private maximumDelay = 60_000,
  ) {
    if (
      !Number.isSafeInteger(initialDelay) ||
      initialDelay < 1_000 ||
      !Number.isSafeInteger(maximumDelay) ||
      maximumDelay < initialDelay ||
      maximumDelay > 3_600_000
    )
      throw new Error('Invalid mutation retry interval');
    this.dispatch = new AccountMutationDispatch(sql, (fn) => fn());
    sql.exec(`CREATE TABLE IF NOT EXISTS mutation_retry (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      token TEXT NOT NULL, attempts INTEGER NOT NULL
    )`);
  }

  pending() {
    return this.dispatch.pending();
  }

  enqueue(command: Mutation) {
    return this.transaction(async () => {
      const pending = this.dispatch.enqueue(command);
      this.sql.exec('INSERT INTO mutation_retry VALUES(1,?,0)', pending.permit.token);
      await this.alarms.setAlarm(this.now() + this.initialDelay);
      return pending;
    });
  }

  acknowledge(receipt: MutationReceipt) {
    return this.transaction(async () => {
      this.dispatch.acknowledge(receipt);
      this.sql.exec('DELETE FROM mutation_retry');
      await this.alarms.deleteAlarm();
    });
  }

  // Arm a durable successor before any network I/O. A crash or transport error
  // then leaves another attempt scheduled, including beyond platform retry caps.
  prepareRetry() {
    return this.transaction(async () => {
      const pending = this.dispatch.pending();
      if (!pending) {
        this.sql.exec('DELETE FROM mutation_retry');
        await this.alarms.deleteAlarm();
        return false;
      }
      const row = [...this.sql.exec('SELECT token,attempts FROM mutation_retry')][0];
      if (!row || row.token !== pending.permit.token)
        throw new Error('Pending mutation has no matching retry schedule');
      const previous = Number(row.attempts);
      if (!Number.isSafeInteger(previous) || previous < 0)
        throw new Error('Invalid mutation retry count');
      const attempts = Math.min(previous + 1, 30);
      this.sql.exec('UPDATE mutation_retry SET attempts=?', attempts);
      const delay = Math.min(this.initialDelay * 2 ** attempts, this.maximumDelay);
      await this.alarms.setAlarm(this.now() + delay);
      return true;
    });
  }
}
