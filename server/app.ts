import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { blankContent, contentSchema, extensions, MAX_IMPORT_BYTES } from '../shared/documents';
import { Store, ApiError } from './store';
import {
  account,
  createSession,
  createUser,
  passwordHash,
  passwordMatches,
  requireUser,
  SESSION_COOKIE,
  tokenHash,
  type UserRow,
} from './auth';
import { exportOffice, importOffice } from './office';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10).max(128);
const name = z.string().trim().min(1).max(100);
const revision = z.number().int().positive();
export interface AppOptions {
  store: Store;
  origins?: string[];
  secureCookies?: boolean;
  staticDir?: string;
  authLimit?: number;
}
export function createApp({
  store,
  origins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ],
  secureCookies = false,
  staticDir = resolve('dist'),
  authLimit = 30,
}: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'upgrade-insecure-requests': secureCookies ? [] : null,
        },
      },
      strictTransportSecurity: secureCookies ? undefined : false,
    }),
  );
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (!req.headers.origin || !origins.includes(req.headers.origin))
    )
      return res.status(403).json({ error: '请求来源不受信任' });
    next();
  });
  app.use(express.json({ limit: '5mb' }));
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '尝试次数过多，请稍后再试' },
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'zhuole-docs' }));
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const input = z.object({ email, password, name }).parse(req.body);
    if (store.db.prepare('SELECT id FROM users WHERE email=?').get(input.email))
      throw new ApiError(409, '该邮箱已注册');
    try {
      const user = await createUser(store, input.email, input.name, input.password);
      createSession(store, res, user.id, secureCookies);
      res.status(201).json(account(store, user));
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE'))
        throw new ApiError(409, '该邮箱已注册');
      throw error;
    }
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const input = z.object({ email, password: z.string().min(1).max(128) }).parse(req.body);
    const user = store.db
      .prepare('SELECT * FROM users WHERE email=?')
      .get(input.email) as unknown as UserRow | undefined;
    const valid = await passwordMatches(
      input.password,
      user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    if (
      !user ||
      !valid ||
      !store.db
        .prepare('SELECT id FROM users WHERE id=? AND password_hash=?')
        .get(user.id, user.password_hash)
    )
      throw new ApiError(401, '邮箱或密码不正确');
    createSession(store, res, user.id, secureCookies);
    res.json(account(store, user));
  });
  app.post('/api/auth/logout', (req, res) => {
    if (typeof req.cookies[SESSION_COOKIE] === 'string')
      store.db
        .prepare('DELETE FROM sessions WHERE hash=?')
        .run(tokenHash(req.cookies[SESSION_COOKIE]));
    res
      .clearCookie(SESSION_COOKIE, {
        path: '/',
        secure: secureCookies,
        sameSite: 'lax',
        httpOnly: true,
      })
      .status(204)
      .end();
  });
  app.use('/api', requireUser(store));
  app.get('/api/me', (req, res) => res.json(account(store, req.user)));
  app.patch('/api/me', (req, res) => {
    const input = z.object({ name }).parse(req.body);
    store.db.prepare('UPDATE users SET name=? WHERE id=?').run(input.name, req.user.id);
    res.json(account(store, { ...req.user, name: input.name }));
  });
  app.post('/api/me/password', authLimiter, async (req, res) => {
    const input = z
      .object({ currentPassword: z.string().max(128), newPassword: password })
      .parse(req.body);
    if (!(await passwordMatches(input.currentPassword, req.user.password_hash)))
      throw new ApiError(400, '当前密码不正确');
    const encoded = await passwordHash(input.newPassword);
    store.transaction(() => {
      // Compare the old hash to prevent a concurrent request from restoring an obsolete credential.
      const result = store.db
        .prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?')
        .run(encoded, req.user.id, req.user.password_hash);
      if (!result.changes) throw new ApiError(409, '密码已更新，请重新登录');
      store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);
    });
    createSession(store, res, req.user.id, secureCookies);
    res.status(204).end();
  });
  app.get('/api/documents', (req, res) =>
    res.json({ documents: store.list(req.user.id), account: account(store, req.user) }),
  );
  app.post('/api/documents', (req, res) => {
    const input = z
      .object({ kind: z.enum(['word', 'sheet', 'slide']), name, content: contentSchema.optional() })
      .parse(req.body);
    if (input.content && input.content.type !== input.kind)
      throw new ApiError(400, '文档类型不匹配');
    res
      .status(201)
      .json(store.create(req.user.id, input.name, input.content ?? blankContent(input.kind)));
  });
  app.post(
    '/api/documents/import',
    express.raw({ type: 'application/octet-stream', limit: MAX_IMPORT_BYTES }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0)
        throw new ApiError(400, '请选择非空文件');
      const filename = z.string().min(1).max(500).parse(req.headers['x-filename']);
      const decoded = decodeURIComponent(filename);
      let content;
      try {
        content = await importOffice(decoded, req.body);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(400, '文件无法导入，请检查格式或使用卓乐备份文件');
      }
      const title =
        decoded
          .replace(/\.[^.]+$/, '')
          .slice(0, 100)
          .trim() || '导入的文档';
      res.status(201).json(store.create(req.user.id, title, content));
    },
  );
  app.get('/api/documents/:id', (req, res) =>
    res.json(store.get(req.user.id, String(req.params.id))),
  );
  app.patch('/api/documents/:id', (req, res) => {
    const input = z
      .object({
        revision,
        name: name.optional(),
        content: contentSchema.optional(),
        starred: z.boolean().optional(),
        deleted: z.boolean().optional(),
      })
      .parse(req.body);
    res.json(store.update(req.user.id, String(req.params.id), input.revision, input));
  });
  app.delete('/api/documents/:id', (req, res) => {
    const input = z.object({ revision }).parse(req.body);
    store.remove(req.user.id, String(req.params.id), input.revision);
    res.status(204).end();
  });
  app.get('/api/documents/:id/export', async (req, res) => {
    const doc = store.get(req.user.id, String(req.params.id));
    const native = req.query.format === 'zdoc';
    const extension = native ? 'zdoc' : extensions[doc.kind];
    const buffer = native
      ? Buffer.from(JSON.stringify(doc.content, null, 2))
      : await exportOffice(doc.content);
    res.set(
      'Content-Disposition',
      `attachment; filename="document.${extension}"; filename*=UTF-8''${encodeURIComponent(doc.name)}.${extension}`,
    );
    res
      .type(
        native
          ? 'application/json'
          : {
              word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              sheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              slide: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            }[doc.kind],
      )
      .send(buffer);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(staticDir, 'index.html')));
  }
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    if (error instanceof ZodError)
      return res.status(400).json({ error: '输入内容不符合要求，请检查长度、格式或文档内容' });
    if (error?.type === 'entity.too.large')
      return res.status(413).json({ error: '文件过大，导入上限为 10 MB，编辑内容上限为 5 MB' });
    if (error instanceof SyntaxError || error instanceof URIError)
      return res.status(400).json({ error: '请求格式无效' });
    console.error('Request failed:', error);
    res.status(500).json({ error: '服务暂时不可用，请稍后重试' });
  };
  app.use(errors);
  return app;
}
