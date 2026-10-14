import { createHash } from 'node:crypto';
import { ApiError } from '../server/errors';
import type { DocumentContent, DocumentSummary } from '../shared/documents';
import { AccountDocuments, type DocumentPatch, type SqlDatabase, type SqlValue } from './documents';
import type { WritePermit } from './write-admission';

export type Mutation =
  | { kind: 'create'; name: string; content: DocumentContent }
  | { kind: 'update'; id: string; revision: number; patch: DocumentPatch }
  | { kind: 'remove'; id: string; revision: number };
export type MutationReceipt = {
  token: string;
  revision: number;
  result:
    | { document: DocumentSummary }
    | { deleted: true }
    | { error: { status: number; message: string } };
};
type ReceiptRow = Record<string, SqlValue> & {
  token: string;
  revision: number;
  fingerprint: string;
  receipt: string;
};

// Private coordinator transport only. A single outstanding admission lets us keep
// one bounded receipt. Older revisions are rejected after that receipt is replaced.
// Do not mix this executor with unfenced writes to the same document storage.
export class AccountMutationExecutor {
  private documents: AccountDocuments;
  constructor(
    private sql: SqlDatabase,
    private atomic: <T>(callback: () => T) => T,
    quota?: number,
  ) {
    // execute owns the transaction; repository operations run inside it.
    this.documents = new AccountDocuments(sql, (fn) => fn(), quota);
    sql.exec(`CREATE TABLE IF NOT EXISTS mutation_receipt (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1), token TEXT NOT NULL,
      revision INTEGER NOT NULL, fingerprint TEXT NOT NULL, receipt TEXT NOT NULL
    )`);
  }

  execute(permit: WritePermit, command: Mutation): MutationReceipt {
    if (
      !permit.token ||
      !Number.isSafeInteger(permit.revision) ||
      permit.revision <= 0 ||
      permit.revision >= Number.MAX_SAFE_INTEGER
    )
      throw new Error('Invalid write permit');
    const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const persist = (receipt: MutationReceipt) => {
      this.sql.exec(
        'INSERT OR REPLACE INTO mutation_receipt VALUES(1,?,?,?,?)',
        permit.token,
        permit.revision,
        fingerprint,
        JSON.stringify(receipt),
      );
      return receipt;
    };
    try {
      return this.atomic(() => {
        const previous = [...this.sql.exec<ReceiptRow>('SELECT * FROM mutation_receipt')][0];
        const maximum = Number(
          [...this.sql.exec('SELECT COALESCE(MAX(revision),0) AS maximum FROM documents')][0]
            .maximum,
        );
        if (permit.revision < maximum) throw new Error('Write permit revision is obsolete');
        if (previous?.token === permit.token) {
          if (previous.revision !== permit.revision || previous.fingerprint !== fingerprint)
            throw new Error('Write permit was reused with different input');
          return JSON.parse(previous.receipt) as MutationReceipt;
        }
        if (permit.revision <= Math.max(previous?.revision ?? 0, maximum))
          throw new Error('Write permit revision is obsolete');
        let result: MutationReceipt['result'];
        if (command.kind === 'remove') {
          this.documents.remove(command.id, command.revision);
          result = { deleted: true };
        } else {
          const doc =
            command.kind === 'create'
              ? this.documents.create(command.name, command.content)
              : this.documents.update(command.id, command.revision, command.patch);
          this.sql.exec('UPDATE documents SET revision=? WHERE id=?', permit.revision, doc.id);
          const { content: _content, ...summary } = doc;
          result = { document: { ...summary, revision: permit.revision } };
        }
        return persist({ ...permit, result });
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      // The mutation transaction has rolled back. No await occurs between rollback
      // and recording this known rejection. Storage/unknown failures get no receipt.
      return this.atomic(() =>
        persist({ ...permit, result: { error: { status: error.status, message: error.message } } }),
      );
    }
  }
}
