import { DurableObject } from 'cloudflare:workers';
import { z, ZodError } from 'zod';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  passwordHash,
  passwordMatches,
  tokenHash,
  SESSION_COOKIE,
  type UserRow,
} from '../server/auth';
import { ApiError } from '../server/errors';
import { STORAGE_LIMIT } from '../shared/documents';
import { AccountDocuments } from './documents';
import { desktopDownload } from './desktop-downloads';
import { body } from './request-body';
import { parseDocumentMutation } from './document-mutations';
import { readDocumentRequest } from './document-reads';
import { accountUsageResponse } from './account-usage-response';

interface Env {
  ACCOUNTS: DurableObjectNamespace;
  DOCUMENTS: DurableObjectNamespace;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  RELEASES?: R2Bucket;
}
const name = z.string().trim().min(1).max(100);
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10).max(128);
const json = (body: unknown, status = 200) => Response.json(body, { status });
const token = (request: Request) =>
  (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1) ?? '';
async function guarded(callback: () => Promise<Response>): Promise<Response> {
  try {
    return await callback();
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof URIError)
      return json({ error: '输入内容不符合要求，请检查格式或文档内容' }, 400);
    console.error('Cloud request failed', error);
    return json({ error: '服务暂时不可用，请稍后重试' }, 500);
  }
}

export class Accounts extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL)`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL)`);
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)');
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
    );
  }
  private session(request: Request): UserRow {
    const value = token(request);
    const user =
      value &&
      [
        ...this.ctx.storage.sql.exec(
          `SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id
      WHERE sessions.hash=? AND sessions.expires_at>?`,
          tokenHash(value),
          Date.now(),
        ),
      ][0];
    if (!user) throw new ApiError(401, '请先登录');
    return user as unknown as UserRow;
  }
  private issue(user: UserRow, request: Request, status = 200): Response {
    const value = randomBytes(32).toString('hex');
    this.ctx.storage.sql.exec('DELETE FROM sessions WHERE expires_at<=?', Date.now());
    this.ctx.storage.sql.exec(
      'INSERT INTO sessions VALUES(?,?,?)',
      tokenHash(value),
      user.id,
      Date.now() + 604800000,
    );
    const response = json({ id: user.id, email: user.email, name: user.name }, status);
    response.headers.set(
      'Set-Cookie',
      `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
    );
    return response;
  }
  async fetch(request: Request): Promise<Response> {
    return guarded(async () => {
      const path = new URL(request.url).pathname;
      const sql = this.ctx.storage.sql;
      if (
        request.method === 'POST' &&
        ['/api/auth/register', '/api/auth/login', '/api/me/password'].includes(path)
      ) {
        const now = Date.now();
        sql.exec('DELETE FROM attempts WHERE expires_at<=?', now);
        const key = request.headers.get('CF-Connecting-IP') ?? 'local';
        const row = [
          ...sql.exec(
            `INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
            key,
            now + 900000,
          ),
        ][0];
        if (Number(row.count) > 30) throw new ApiError(429, '尝试次数过多，请稍后再试');
      }
      if (path === '/api/auth/register' && request.method === 'POST') {
        const input = z.object({ email, name, password }).parse(await body(request));
        const encoded = await passwordHash(input.password);
        return this.ctx.storage.transactionSync(() => {
          if ([...sql.exec('SELECT id FROM users WHERE email=?', input.email)].length)
            throw new ApiError(409, '该邮箱已注册');
          const user = {
            id: randomUUID(),
            email: input.email,
            name: input.name,
            password_hash: encoded,
          };
          sql.exec('INSERT INTO users VALUES(?,?,?,?)', user.id, user.email, user.name, encoded);
          return this.issue(user, request, 201);
        });
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        const input = z
          .object({ email, password: z.string().min(1).max(128) })
          .parse(await body(request));
        const user = [
          ...sql.exec('SELECT * FROM users WHERE email=?', input.email),
        ][0] as unknown as UserRow | undefined;
        const valid = await passwordMatches(
          input.password,
          user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
        );
        if (
          !user ||
          !valid ||
          ![
            ...sql.exec(
              'SELECT id FROM users WHERE id=? AND password_hash=?',
              user.id,
              user.password_hash,
            ),
          ].length
        )
          throw new ApiError(401, '邮箱或密码不正确');
        return this.issue(user, request);
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        sql.exec('DELETE FROM sessions WHERE hash=?', tokenHash(token(request)));
        return new Response(null, {
          status: 204,
          headers: {
            'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
          },
        });
      }
      const user = this.session(request);
      if (path === '/api/me/password' && request.method === 'POST') {
        const input = z
          .object({ currentPassword: z.string().max(128), newPassword: password })
          .parse(await body(request));
        if (!(await passwordMatches(input.currentPassword, user.password_hash)))
          throw new ApiError(400, '当前密码不正确');
        const encoded = await passwordHash(input.newPassword);
        return this.ctx.storage.transactionSync(() => {
          const updated = [
            ...sql.exec(
              'UPDATE users SET password_hash=? WHERE id=? AND password_hash=? RETURNING id',
              encoded,
              user.id,
              user.password_hash,
            ),
          ];
          if (!updated.length) throw new ApiError(409, '密码已更新，请重新登录');
          sql.exec('DELETE FROM sessions WHERE user_id=?', user.id);
          const result = this.issue(user, request);
          return new Response(null, { status: 204, headers: result.headers });
        });
      }
      if (path === '/api/me' && request.method === 'PATCH') {
        const input = z.object({ name }).parse(await body(request));
        sql.exec('UPDATE users SET name=? WHERE id=?', input.name, user.id);
        user.name = input.name;
      }
      return json({ id: user.id, email: user.email, name: user.name });
    });
  }
}

export class Documents extends DurableObject<Env> {
  private documents: AccountDocuments;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.documents = new AccountDocuments(ctx.storage.sql, (callback) =>
      ctx.storage.transactionSync(callback),
    );
  }
  async fetch(request: Request): Promise<Response> {
    return guarded(async () => {
      const store = this.documents;
      if (request.method === 'GET') return readDocumentRequest(request, store);
      const url = new URL(request.url);
      if (url.pathname === '/api/folders' && request.method === 'POST') {
        const body = (await request.json()) as { name?: string; parentId?: string | null };
        if (!body.name || !body.name.trim()) throw new ApiError(400, '文件夹名称不能为空');
        return json(store.createFolder(body.name, body.parentId), 201);
      }
      const folderMatch = url.pathname.match(/^\/api\/folders\/([^/]+)$/);
      if (folderMatch) {
        const folderId = folderMatch[1];
        if (request.method === 'PATCH') {
          const body = (await request.json()) as {
            name?: string;
            parentId?: string | null;
            deleted?: boolean;
          };
          return json(store.updateFolder(folderId, body));
        }
        if (request.method === 'DELETE') {
          store.removeFolder(folderId);
          return new Response(null, { status: 204 });
        }
      }
      const mutation = await parseDocumentMutation(request);
      if (mutation?.kind === 'create')
        return json(store.create(mutation.name, mutation.content, mutation.folderId), 201);
      if (mutation?.kind === 'update')
        return json(store.update(mutation.id, mutation.revision, mutation.patch));
      if (mutation?.kind === 'remove') {
        store.remove(mutation.id, mutation.revision);
        return new Response(null, { status: 204 });
      }
      throw new ApiError(404, '接口不存在');
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (
      url.protocol === 'http:' &&
      env.APP_ORIGIN?.startsWith('https://') &&
      url.host === new URL(env.APP_ORIGIN).host
    ) {
      const httpsUrl = new URL(request.url);
      httpsUrl.protocol = 'https:';
      return Response.redirect(httpsUrl.toString(), 308);
    }
    const response = await guarded(async () => {
      if (
        url.pathname === '/api/releases/desktop' ||
        url.pathname.startsWith('/downloads/desktop/')
      )
        return desktopDownload(request, env.RELEASES);
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        request.headers.get('Origin') !== env.APP_ORIGIN
      )
        throw new ApiError(403, '请求来源不受信任');
      if (url.pathname === '/api/health' && request.method === 'GET')
        return json({ status: 'ok', service: 'zhuole-docs' });
      const accounts = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('directory-v1'));
      const isAuth = [
        '/api/auth/register',
        '/api/auth/login',
        '/api/auth/logout',
        '/api/me/password',
      ].includes(url.pathname);
      if (isAuth && request.method !== 'POST') throw new ApiError(404, '接口不存在');
      const accountRequest =
        isAuth || url.pathname === '/api/me'
          ? request
          : new Request(new URL('/session', url), { headers: request.headers });
      const accountResponse = await accounts.fetch(accountRequest);
      if (!accountResponse.ok || accountResponse.status === 204) return accountResponse;
      const account = (await accountResponse.json()) as { id: string; email: string; name: string };
      const documents = env.DOCUMENTS.get(env.DOCUMENTS.idFromName(account.id));
      if (isAuth || url.pathname === '/api/me') {
        return accountUsageResponse(accountResponse, account, () =>
          documents.fetch(new Request(new URL('/usage', url))),
        );
      }
      const result = await documents.fetch(request);
      if (url.pathname === '/api/documents' && request.method === 'GET' && result.ok) {
        const payload = (await result.json()) as {
          documents: unknown;
          folders: unknown;
          usedBytes: number;
        };
        return json({
          documents: payload.documents,
          folders: payload.folders,
          account: { ...account, usedBytes: payload.usedBytes, limitBytes: STORAGE_LIMIT },
        });
      }
      return result;
    });
    const result = new Response(response.body, response);
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('Referrer-Policy', 'same-origin');
    result.headers.set('X-Frame-Options', 'DENY');
    result.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    );
    if (url.protocol === 'https:')
      result.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (url.pathname.startsWith('/api/')) result.headers.set('Cache-Control', 'no-store');
    return result;
  },
};
