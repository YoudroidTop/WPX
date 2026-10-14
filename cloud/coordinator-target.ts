import type { SqlDatabase } from './documents';

// The trusted account router binds this once, before admitting traffic. Never
// derive either value from request headers, query parameters or request bodies.
export class CoordinatorTarget {
  constructor(
    private sql: SqlDatabase,
    private atomic: <T>(fn: () => T) => T,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS coordinator_target (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      account_id TEXT NOT NULL, document_object_id TEXT NOT NULL
    )`);
  }

  bind(accountId: string, documentObjectId: string): void {
    if (
      !accountId ||
      accountId !== accountId.trim() ||
      accountId.length > 128 ||
      !/^[a-f0-9]{64}$/.test(documentObjectId)
    )
      throw new Error('Invalid coordinator account target');
    this.atomic(() => {
      const current = this.row();
      if (current) {
        if (current.account_id !== accountId || current.document_object_id !== documentObjectId)
          throw new Error('Coordinator account target conflicts');
        return;
      }
      this.sql.exec('INSERT INTO coordinator_target VALUES(1,?,?)', accountId, documentObjectId);
    });
  }

  private row() {
    return [...this.sql.exec('SELECT account_id,document_object_id FROM coordinator_target')][0];
  }

  require(accountId: string): string {
    const current = this.row();
    if (!current || current.account_id !== accountId)
      throw new Error('Coordinator account target is not bound');
    return current.document_object_id as string;
  }
}
