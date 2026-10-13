# Cloudflare deployment

## Target

The public service is `https://wpx.youdroid.top`. WPX-4 tracks deployment and live acceptance. The local Express service remains supported. `cloud/worker.ts` supplies the Cloudflare entry point and two SQLite Durable Object classes.

## Storage design

Use a SQLite-backed Durable Object per account. The authenticated Worker selects the object using the account ID; callers must never select an arbitrary object through a request parameter. The Accounts directory stores credentials, hashed sessions, and per-IP authentication attempt counters separately from document bodies. A document mutation runs its quota check, revision check, metadata change, and body write in one `storage.transactionSync` callback with no asynchronous work inside it.

`cloud/documents.ts` implements the account-local document repository against a minimal synchronous SQL interface. Metadata includes the UTF-8 serialized content size. Bodies are stored as ordered 512,000-byte BLOB chunks and reconstructed before parsing. This preserves the existing 4 MB document limit despite Cloudflare's 2 MB SQLite row limit. The public document JSON and revision protocol are unchanged. Trash counts toward the exact 3,000,000,000-byte quota until permanent deletion.

The [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/) specify 10 GB per SQLite object on Workers Paid and 1 GB on Free. Production must verify a compatible existing account plan before claiming a usable 3 GB allowance. Do not silently lower the product quota to fit an infrastructure limit. Subscription changes require a separate decision if the existing account is insufficient.

The repository accepts only already validated document models. The HTTP boundary must enforce `contentSchema`, names, revisions, bounded request bodies, authentication, origin checks, rate limits, and error handling. The Documents Durable Object supplies the native SQL adapter and transactionSync callback. A local workerd integration suite verifies this path independently from the local SQLite unit tests.

## Verification so far

- Large Unicode documents round-trip across multiple chunks; each chunk stays below the SQLite row limit.
- Account-local stores do not expose each other's document IDs.
- Exact-byte quota includes trash; stale revisions cannot rename or overwrite content.
- Injected chunk insertion failure rolls back both updates and creates, including metadata and quota.
- Existing API/model tests and the production web build pass after extracting a runtime-neutral API error class. Office conversion no longer imports the Node SQLite store indirectly.

## Local runtime checks

```sh
npm run cloud:build
npm run cloud:dev
# In a second terminal, against the local service only:
npm run test:cloud
# This command starts an isolated workerd instance automatically:
npm run test:cloud:browser
```

The HTTP integration suite verifies registration, failed login, account isolation, cross-origin rejection, one-winner concurrent writes, DOCX/XLSX/PPTX export/import, trash accounting and deletion, profile changes, password rotation with prior-session invalidation, logout, and a Unicode document larger than 2 MB. The browser suite reuses the five existing editor/workspace scenarios against workerd and SQLite Durable Objects. Test storage is ignored by Git.

Office ZIP validation uses JSZip's chunk stream rather than its Node-only stream adapter so expansion limits also apply in Workers. Empty spreadsheet exports tolerate ExcelJS's null columns collection.

`wrangler.jsonc` defines bindings, initial SQLite class creation and the target Origin. The verified custom domain is configured as a Worker route. The dry-run bundle is approximately 784 KiB compressed.

The local checks do not constitute deployment evidence. The production deployment and remaining recovery work are recorded below.

## First production deployment — 2026-10-13

- Service: `https://wpx.youdroid.top`.
- Worker version: `ef808837-acc9-40fe-8236-ca260e847641`, 100% traffic confirmed by `wrangler deployments list`.
- Account preflight: the Workers Standard API returned `standard: true`; zone active; no existing target Worker or custom-domain binding. Billing subscriptions and raw DNS record listing were not available to the OAuth scope. No subscription or existing DNS record was manually changed.
- Custom-domain deployment succeeded without an overwrite prompt. Public DNS returned Cloudflare A records; authenticated HTTPS API and browser checks passed on the custom hostname.
- The local resolver initially returned ENOTFOUND. Public DNS and an HTTPS request pinned to the public address independently confirmed the domain; subsequent smoke used the existing local proxy without disabling TLS validation.
- The workers.dev fallback timed out from this network. Its registration is confirmed, but reachability is not claimed.

Run `node scripts/smoke-cloud.mjs` for the named production host only. It creates a random test account, verifies private document access, DOCX/XLSX/PPTX exports, revision rejection, trash/deletion and logout, then removes its test documents. `node scripts/smoke-cloud-browser.mjs` verifies registration, Word persistence, formula evaluation, presentation mode, reload and logout in Chromium, and removes its generated account's documents. Both retain empty test accounts because account deletion is not implemented. Credentials and session tokens are never printed or saved. Browser screenshots go to ignored `releases/cloudflare/`. `SMOKE_PROXY` optionally selects an existing proxy for the browser runner; Node HTTP smoke can use standard proxy environment variables with `--use-env-proxy`.

## Recovery boundary

This is the first deployment, so there is no earlier application version to roll back to. Keep the version above as the known working code baseline. For a later incompatible code-only rollout, inspect `wrangler deployments list`, then use `wrangler rollback <verified-version-id>`; code rollback does not restore document data or reverse SQLite schema changes. Do not delete Durable Object classes, bindings, namespaces, or migrations as a rollback shortcut.

User-level recovery is available through native ZDOC backups and imports; Office exports preserve the supported basic content. SQLite Durable Objects provide point-in-time recovery, but an operator restore workflow and rehearsal have not yet been implemented here. Production data recovery acceptance remains open and must not be inferred from a successful code deployment.
