# Hosting and operations

## Production Cloudflare deployment

The public service is deployed at `https://wpx.youdroid.top` using Workers and SQLite Durable Objects. See [Cloudflare deployment](cloudflare.md) for bindings, deployed-version evidence, and recovery limits. Document data is account-local; credentials and sessions live in a separate Accounts object. Local filesystem backup commands below apply only to the optional Node.js server, not Cloudflare storage.

## Optional Node.js deployment

Use one Node.js 24+ process behind an HTTPS reverse proxy and a persistent local disk. The MVP uses one SQLite database and is not designed for concurrent app replicas or network-mounted SQLite files. Import and export currently run in the API process; use a bounded worker service before enabling large-scale public uploads.

Build on a development machine or CI, then deploy the repository/build and install locked dependencies. The runtime uses `tsx`, so the current package requires development dependencies as well as production dependencies.

```sh
npm ci
npm run build
NODE_ENV=production APP_ORIGIN=https://docs.example.com HOST=127.0.0.1 PORT=3001 DATA_DIR=/srv/zhuole-data npm start
```

`APP_ORIGIN` is the exact browser-facing origin without a trailing slash. Multiple explicitly trusted origins can be comma-separated. Use HTTPS in production because session cookies are Secure. Do not expose the local HTTP development configuration publicly. `.env.example` documents variables; `.env` files are not automatically loaded.

The reverse proxy must preserve request bodies and cookies and allow up to 10 MB imports plus headers. Keep the API loopback-bound. The application does not trust proxy-forwarded IPs by default, so authentication rate limits behind a proxy may aggregate users under the proxy IP; configure an exact trusted proxy policy before public multi-user deployment.

## Data durability

Keep `DATA_DIR` outside ephemeral release directories. Restrict filesystem access to the service account. SQLite's WAL journal is part of live database state. Do not copy only the main SQLite file while the service is writing; use the SQLite backup API, `VACUUM INTO`, or stop the service and copy the database and journal consistently. Test restoring a backup to a separate directory before considering the backup valid.

Quota counts native document body bytes, including trash. It is a product quota, not a physical disk reservation. The host still needs capacity for database indexes, WAL, backups, and transient Office conversions. Permanent document deletion may not immediately reduce the database file size.

## Preflight and acceptance

- Check disk, memory, swap, load, existing services, reverse proxy, repository changes, backups, and rollback target.
- Build before switching releases; preserve the previous build and a restorable database snapshot.
- Verify `/api/health` at the process, reverse proxy, and public entry separately.
- Verify the actual browser: account sign-in, create/edit/reopen all three document kinds, download, trash/restore, and quota usage.
- Verify Secure/HttpOnly/SameSite cookies and rejected cross-origin writes.
- Roll back to the prior application only if its schema remains compatible. `PRAGMA user_version` is 1 in this release; no destructive data migration is provided.

Cloudflare production deployment, the custom domain and HTTPS have been verified. SMTP email verification/recovery, an independent scheduled backup, and external monitoring remain unconfigured. Password reset and email changes are deliberately not exposed without a verified recovery channel. Code rollback does not restore data. A test-namespace restore rehearsal is not authorization to restore customer accounts or proof of a production recovery procedure.
