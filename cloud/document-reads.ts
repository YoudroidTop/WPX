import { ApiError } from '../server/errors';
import { exportOffice } from '../server/office';
import { extensions, STORAGE_LIMIT } from '../shared/documents';
import type { AccountDocuments } from './documents';

export async function readDocumentRequest(
  request: Request,
  store: AccountDocuments,
): Promise<Response> {
  if (request.method !== 'GET') throw new ApiError(404, '接口不存在');
  const url = new URL(request.url),
    path = url.pathname;
  const json = (value: unknown) => Response.json(value);
  if (path === '/usage') return json({ usedBytes: store.used(), limitBytes: STORAGE_LIMIT });
  if (path === '/api/documents') return json({ documents: store.list(), usedBytes: store.used() });
  const match = path.match(/^\/api\/documents\/([^/]+)(\/export)?$/);
  if (!match) throw new ApiError(404, '接口不存在');
  const id = match[1];
  if (match[2] && request.method === 'GET') {
    const doc = store.get(id),
      native = url.searchParams.get('format') === 'zdoc';
    const extension = native ? 'zdoc' : extensions[doc.kind];
    const bytes = native
      ? Buffer.from(JSON.stringify(doc.content, null, 2))
      : await exportOffice(doc.content);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': native
          ? 'application/json'
          : {
              word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              sheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              slide: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            }[doc.kind],
        'Content-Disposition': `attachment; filename="document.${extension}"; filename*=UTF-8''${encodeURIComponent(doc.name)}.${extension}`,
      },
    });
  }
  if (!match[2] && request.method === 'GET') return json(store.get(id));
  throw new ApiError(404, '接口不存在');
}
