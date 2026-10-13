import { openDB } from 'idb';
import type { Account, CloudDocument, DocumentSummary } from '../shared/documents';
import { isNative } from './platform';

export interface LocalDraft {
  document: CloudDocument;
  baseRevision: number;
  savedAt: number;
  token: string;
}
let databasePromise: ReturnType<typeof openDB> | undefined;
const db = () =>
  (databasePromise ??= openDB('zhuole-client-cache', 1, {
    upgrade(database) {
      database.createObjectStore('entries');
    },
  }));
let origin = '',
  currentAccount: Account | null = null;
let offline = false;
export function configureClientCache(serverOrigin: string) {
  origin = serverOrigin;
  currentAccount = null;
}
export function clientAccount() {
  return currentAccount;
}
export function isOffline() {
  return offline;
}
export function setOffline(value: boolean) {
  if (offline === value) return;
  offline = value;
  window.dispatchEvent(new Event('zhuole-connectivity'));
}
function ownerKey() {
  if (!origin || !currentAccount) throw new Error('Local account unavailable');
  return `${origin}:account:${currentAccount.id}`;
}
export async function rememberAccount(account: Account) {
  currentAccount = account;
  if (isNative && origin) await (await db()).put('entries', account, `${origin}:active-account`);
}
export async function offlineAccount(): Promise<Account | undefined> {
  if (!isNative || !origin) return;
  const account = (await (await db()).get('entries', `${origin}:active-account`)) as
    Account | undefined;
  currentAccount = account ?? null;
  return account;
}
export async function forgetAccount() {
  currentAccount = null;
  if (isNative && origin) await (await db()).delete('entries', `${origin}:active-account`);
}
export async function cacheRead(path: string): Promise<unknown> {
  if (!isNative || !currentAccount) return;
  const database = await db();
  if (path === '/documents') {
    const documents = (await database.get('entries', `${ownerKey()}:library`)) as
      DocumentSummary[] | undefined;
    if (documents) return { documents, account: currentAccount };
  }
  if (/^\/documents\/[^/]+$/.test(path)) return database.get('entries', `${ownerKey()}:${path}`);
}
export async function cacheResponse(path: string, value: any, method: string) {
  if (!isNative || !origin) return;
  if (path === '/me' || path === '/auth/register' || path === '/auth/login') {
    await rememberAccount(value);
    return;
  }
  if (path === '/auth/logout') {
    await forgetAccount();
    return;
  }
  if (!currentAccount) return;
  const database = await db();
  if (path === '/documents' && method === 'GET') {
    await database.put('entries', value.documents, `${ownerKey()}:library`);
    await rememberAccount(value.account);
  }
  if (method === 'DELETE' && /^\/documents\/[^/]+$/.test(path)) {
    const id = path.split('/').pop()!;
    await database.delete('entries', `${ownerKey()}:${path}`);
    await database.delete('entries', `${ownerKey()}:draft:${id}`);
  }
  if (value && typeof value.id === 'string' && value.content) {
    await database.put('entries', value, `${ownerKey()}:/documents/${value.id}`);
    const key = `${ownerKey()}:library`;
    const previous = (await database.get('entries', key)) as DocumentSummary[] | undefined;
    if (previous) {
      const { content: _content, ...summary } = value;
      await database.put(
        'entries',
        [summary, ...previous.filter((doc) => doc.id !== value.id)],
        key,
      );
    }
  }
}
export async function readDraft(id: string): Promise<LocalDraft | undefined> {
  if (!isNative || !currentAccount) return;
  return (await db()).get('entries', `${ownerKey()}:draft:${id}`);
}
export function draftScope() {
  return isNative && currentAccount ? ownerKey() : undefined;
}
export async function persistDraft(draft: LocalDraft, scope = draftScope()): Promise<void> {
  if (!isNative) return;
  if (!scope) throw new Error('Local account unavailable');
  const key = `${scope}:draft:${draft.document.id}`;
  await (await db()).put('entries', draft, key);
}
export async function removeDraft(id: string, token: string, scope = draftScope()): Promise<void> {
  if (!isNative || !scope) return;
  const key = `${scope}:draft:${id}`;
  const transaction = (await db()).transaction('entries', 'readwrite');
  const current = (await transaction.store.get(key)) as LocalDraft | undefined;
  if (current?.token === token) await transaction.store.delete(key);
  await transaction.done;
}
export async function listDrafts(): Promise<LocalDraft[]> {
  if (!isNative || !currentAccount) return [];
  const prefix = `${ownerKey()}:draft:`;
  const database = await db();
  const transaction = database.transaction('entries');
  const drafts: LocalDraft[] = [];
  let cursor = await transaction.store.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
  while (cursor) {
    drafts.push(cursor.value as LocalDraft);
    cursor = await cursor.continue();
  }
  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}

export async function clearSyncedDocumentCache(): Promise<number> {
  if (!isNative || !currentAccount) return 0;
  const scope = ownerKey();
  const prefix = `${scope}:/documents/`;
  const transaction = (await db()).transaction('entries', 'readwrite');
  let removed = 0;
  let cursor = await transaction.store.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
  while (cursor) {
    const id = String(cursor.key).slice(prefix.length);
    // Check and delete in one transaction so a concurrently persisted draft is protected.
    if ((await transaction.store.getKey(`${scope}:draft:${id}`)) === undefined) {
      await cursor.delete();
      removed++;
    }
    cursor = await cursor.continue();
  }
  await transaction.done;
  return removed;
}
