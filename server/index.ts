import { resolve } from 'node:path';
import { Store } from './store';
import { createApp } from './app';
const secureCookies = process.env.NODE_ENV === 'production';
if (secureCookies && !process.env.APP_ORIGIN)
  throw new Error('APP_ORIGIN is required in production');
const store = new Store(resolve(process.env.DATA_DIR || 'data', 'zhuole.sqlite'));
const app = createApp({
  store,
  secureCookies,
  origins: process.env.APP_ORIGIN?.split(',').map((s) => s.trim()),
});
const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () =>
  console.log(`Zhuole Docs API listening on port ${process.env.PORT || 3001}`),
);
function shutdown() {
  server.close(() => {
    store.db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
