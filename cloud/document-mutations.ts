import { z } from 'zod';
import { ApiError } from '../server/errors';
import { importOffice } from '../server/office';
import { blankContent, contentSchema, MAX_IMPORT_BYTES } from '../shared/documents';
import { bounded, body } from './request-body';
import type { Mutation } from './mutation-executor';

const name = z.string().trim().min(1).max(100);
const revision = z.number().int().positive();

// Request parsing does not grant admission. The coordinator must enqueue the
// returned command after all awaits; never trust caller-provided permit headers.
export async function parseDocumentMutation(
  request: Request,
  parseOffice: typeof importOffice = importOffice,
): Promise<Mutation | null> {
  const path = new URL(request.url).pathname;
  if (path === '/api/documents' && request.method === 'POST') {
    const input = z
      .object({
        name,
        kind: z.enum(['word', 'sheet', 'slide']),
        content: contentSchema.optional(),
        folderId: z.string().nullable().optional(),
      })
      .parse(await body(request));
    if (input.content && input.content.type !== input.kind)
      throw new ApiError(400, '文档类型不匹配');
    return {
      kind: 'create',
      name: input.name,
      content: input.content ?? blankContent(input.kind),
      ...(input.folderId ? { folderId: input.folderId } : {}),
    };
  }
  if (path === '/api/documents/import' && request.method === 'POST') {
    const filename = decodeURIComponent(
      z.string().min(1).max(500).parse(request.headers.get('x-filename')),
    );
    const folderHeader = request.headers.get('x-folder-id');
    const folderId = folderHeader && folderHeader.trim() ? folderHeader.trim() : null;
    const bytes = await bounded(request, MAX_IMPORT_BYTES);
    if (!bytes.length) throw new ApiError(400, '请选择非空文件');
    let content;
    try {
      content = await parseOffice(filename, Buffer.from(bytes));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, '文件无法导入，请检查格式或使用卓乐备份文件');
    }
    return {
      kind: 'create',
      name:
        filename
          .replace(/\.[^.]+$/, '')
          .slice(0, 100)
          .trim() || '导入的文档',
      content,
      ...(folderId ? { folderId } : {}),
    };
  }
  const match = path.match(/^\/api\/documents\/([^/]+)$/);
  if (!match) return null;
  if (request.method === 'PATCH') {
    const input = z
      .object({
        revision,
        name: name.optional(),
        content: contentSchema.optional(),
        starred: z.boolean().optional(),
        deleted: z.boolean().optional(),
        folderId: z.string().nullable().optional(),
      })
      .parse(await body(request));
    const { revision: expected, ...patch } = input;
    if (patch.folderId === undefined) delete patch.folderId;
    return { kind: 'update', id: match[1], revision: expected, patch };
  }
  if (request.method === 'DELETE')
    return {
      kind: 'remove',
      id: match[1],
      revision: z.object({ revision }).parse(await body(request)).revision,
    };
  return null;
}
