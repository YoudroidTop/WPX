import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import type { Store } from './store';
import type { Account } from '../shared/documents';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'zhuole_session';
export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}
declare global {
  namespace Express {
    interface Request {
      user: UserRow;
    }
  }
}
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString('hex')}`;
}
export async function passwordMatches(password: string, encoded: string): Promise<boolean> {
  const [salt, hash] = encoded.split(':');
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function createSession(store: Store, res: Response, userId: string, secure: boolean) {
  const token = randomBytes(32).toString('hex'),
    maxAge = 7 * 86400 * 1000;
  store.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  store.db
    .prepare('INSERT INTO sessions(hash, user_id, expires_at) VALUES(?,?,?)')
    .run(tokenHash(token), userId, Date.now() + maxAge);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: 'lax', maxAge, path: '/' });
}
export function requireUser(store: Store) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies[SESSION_COOKIE];
    if (typeof token !== 'string') return res.status(401).json({ error: '请先登录' });
    const user = store.db
      .prepare(
        'SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires_at>?',
      )
      .get(tokenHash(token), Date.now()) as unknown as UserRow | undefined;
    if (!user) return res.status(401).json({ error: '登录已过期，请重新登录' });
    req.user = user;
    next();
  };
}
export function account(store: Store, user: UserRow): Account {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    usedBytes: store.used(user.id),
    limitBytes: store.quota,
  };
}
export async function createUser(store: Store, email: string, name: string, password: string) {
  const user = { id: randomUUID(), email, name, password_hash: await passwordHash(password) };
  store.db
    .prepare('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)')
    .run(user.id, user.email, user.name, user.password_hash, Date.now());
  return user;
}
