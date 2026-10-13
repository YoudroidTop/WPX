import { api, RequestError } from './api';
import { listDrafts, removeDraft } from './cache';
import type { CloudDocument } from '../shared/documents';

// Only synchronize while the library is open; an active editor owns its own save queue.
export async function synchronizeDrafts(): Promise<{ saved: number; conflicts: number }> {
  let saved = 0,
    conflicts = 0;
  for (const draft of await listDrafts()) {
    try {
      const remote = await api<CloudDocument>(`/documents/${draft.document.id}`);
      if (remote.deletedAt) {
        conflicts++;
        continue;
      }
      if (
        JSON.stringify(remote.content) === JSON.stringify(draft.document.content) &&
        remote.name === draft.document.name
      ) {
        await removeDraft(remote.id, draft.token);
        saved++;
        continue;
      }
      if (remote.revision !== draft.baseRevision) {
        conflicts++;
        continue;
      }
      await api(`/documents/${remote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          revision: draft.baseRevision,
          name: draft.document.name,
          content: draft.document.content,
        }),
      });
      await removeDraft(remote.id, draft.token);
      saved++;
    } catch (error) {
      if (error instanceof RequestError && error.status === 0) break;
      if (error instanceof RequestError && [404, 409, 413].includes(error.status)) {
        conflicts++;
        continue;
      }
      throw error;
    }
  }
  return { saved, conflicts };
}
